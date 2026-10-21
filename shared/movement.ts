import {
  AIR_ACCELERATION,
  AIR_FRICTION,
  GRAVITY,
  GROUND_ACCELERATION,
  GROUND_FRICTION,
  JUMP_STRENGTH,
  MAX_FALL_SPEED,
  MAX_MOVE_SPEED,
  MAX_SIMULATION_STEPS,
  PLAYER_HALF_DEPTH,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
  SIMULATION_STEP,
} from "./constants";
import { MAP_OBJECTS, type MapObject } from "./map";
import type { MovementInput, MovementState } from "./types";

function damp(
  current: number,
  target: number,
  lambda: number,
  delta: number,
): number {
  return target + (current - target) * Math.exp(-lambda * delta);
}

/**
 * Deterministic movement shared by client prediction and server authority.
 * Physics runs in fixed steps, while collision is resolved strictly per axis:
 * X, then Z, then Y. Resolving X and Z separately is what produces wall sliding.
 */
export interface MovementModifiers {
  speedMultiplier?: number;
  gravityMultiplier?: number;
}

export function simulateMovement(
  state: MovementState,
  input: MovementInput,
  delta: number,
  modifiers: MovementModifiers = {},
): MovementState {
  const maxFrameDelta = MAX_SIMULATION_STEPS * SIMULATION_STEP;
  const frameDelta = Math.min(Math.max(delta, 0), maxFrameDelta);
  if (frameDelta <= 0) {
    return state;
  }

  state.accumulator += frameDelta;

  let steps = 0;
  while (
    state.accumulator >= SIMULATION_STEP &&
    steps < MAX_SIMULATION_STEPS
  ) {
    stepMovement(state, input, SIMULATION_STEP, modifiers);
    state.accumulator -= SIMULATION_STEP;
    steps += 1;
  }

  return state;
}

function stepMovement(
  state: MovementState,
  input: MovementInput,
  dt: number,
  modifiers: MovementModifiers,
): void {
  const speedMultiplier = modifiers.speedMultiplier ?? 1;
  const gravityMultiplier = modifiers.gravityMultiplier ?? 1;

  if (input.jump && state.grounded) {
    state.velocity.y = JUMP_STRENGTH;
    state.grounded = false;
  }

  state.velocity.y += GRAVITY * gravityMultiplier * dt;
  if (state.velocity.y < MAX_FALL_SPEED) {
    state.velocity.y = MAX_FALL_SPEED;
  }

  // Yaw 0 faces -Z, matching Three.js' camera forward axis.
  const forwardX = -Math.sin(input.yaw);
  const forwardZ = -Math.cos(input.yaw);
  const rightX = -forwardZ;
  const rightZ = forwardX;

  const forwardInput =
    (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
  const rightInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);

  let moveX = forwardX * forwardInput + rightX * rightInput;
  let moveZ = forwardZ * forwardInput + rightZ * rightInput;

  const moveLengthSq = moveX * moveX + moveZ * moveZ;
  const hasInput = moveLengthSq > 1e-8;
  if (hasInput) {
    const inverseLength = 1 / Math.sqrt(moveLengthSq);
    moveX *= inverseLength;
    moveZ *= inverseLength;
  } else {
    moveX = 0;
    moveZ = 0;
  }

  const rate = state.grounded
    ? hasInput
      ? GROUND_ACCELERATION
      : GROUND_FRICTION
    : hasInput
      ? AIR_ACCELERATION
      : AIR_FRICTION;

  const targetSpeed = MAX_MOVE_SPEED * (input.ads ? 0.52 : 1) * speedMultiplier;

  state.velocity.x = damp(
    state.velocity.x,
    moveX * targetSpeed,
    rate,
    dt,
  );
  state.velocity.z = damp(
    state.velocity.z,
    moveZ * targetSpeed,
    rate,
    dt,
  );

  moveAxisX(state, state.velocity.x * dt);
  moveAxisZ(state, state.velocity.z * dt);

  state.grounded = false;
  moveAxisY(state, state.velocity.y * dt);

  if (state.position.y <= 0) {
    state.position.y = 0;
    if (state.velocity.y < 0) {
      state.velocity.y = 0;
    }
    state.grounded = true;
  }
}

function moveAxisX(state: MovementState, amount: number): void {
  if (amount === 0) {
    return;
  }

  state.position.x += amount;

  for (let pass = 0; pass < 4; pass += 1) {
    const hit = findOverlappingObject(state);
    if (!hit) {
      return;
    }

    if (amount > 0) {
      state.position.x = Math.min(
        state.position.x,
        hit.x - hit.width / 2 - PLAYER_HALF_WIDTH,
      );
    } else {
      state.position.x = Math.max(
        state.position.x,
        hit.x + hit.width / 2 + PLAYER_HALF_WIDTH,
      );
    }
    state.velocity.x = 0;
  }
}

function moveAxisZ(state: MovementState, amount: number): void {
  if (amount === 0) {
    return;
  }

  state.position.z += amount;

  for (let pass = 0; pass < 4; pass += 1) {
    const hit = findOverlappingObject(state);
    if (!hit) {
      return;
    }

    if (amount > 0) {
      state.position.z = Math.min(
        state.position.z,
        hit.z - hit.depth / 2 - PLAYER_HALF_DEPTH,
      );
    } else {
      state.position.z = Math.max(
        state.position.z,
        hit.z + hit.depth / 2 + PLAYER_HALF_DEPTH,
      );
    }
    state.velocity.z = 0;
  }
}

function moveAxisY(state: MovementState, amount: number): void {
  if (amount === 0) {
    return;
  }

  const oldMinY = state.position.y;
  const oldMaxY = oldMinY + PLAYER_HEIGHT;
  state.position.y += amount;

  let landingY = -Infinity;
  let ceilingY = Infinity;

  for (const object of MAP_OBJECTS) {
    if (!overlapsHorizontal(state, object)) {
      continue;
    }

    const objectMinY = object.y;
    const objectMaxY = object.y + object.height;

    if (amount < 0) {
      if (
        oldMinY >= objectMaxY - 0.0001 &&
        state.position.y < objectMaxY &&
        state.position.y + PLAYER_HEIGHT > objectMinY
      ) {
        if (objectMaxY > landingY) {
          landingY = objectMaxY;
        }
      }
      continue;
    }

    if (
      oldMaxY <= objectMinY + 0.0001 &&
      state.position.y + PLAYER_HEIGHT > objectMinY &&
      state.position.y < objectMaxY
    ) {
      if (objectMinY < ceilingY) {
        ceilingY = objectMinY;
      }
    }
  }

  if (landingY > -Infinity) {
    state.position.y = landingY;
    state.velocity.y = 0;
    state.grounded = true;
    return;
  }

  if (ceilingY < Infinity) {
    state.position.y = ceilingY - PLAYER_HEIGHT;
    state.velocity.y = 0;
  }
}

function findOverlappingObject(state: MovementState): MapObject | null {
  for (const object of MAP_OBJECTS) {
    if (overlapsObject(state, object)) {
      return object;
    }
  }

  return null;
}

function overlapsObject(
  state: MovementState,
  object: MapObject,
): boolean {
  return (
    state.position.x - PLAYER_HALF_WIDTH <
      object.x + object.width / 2 &&
    state.position.x + PLAYER_HALF_WIDTH >
      object.x - object.width / 2 &&
    state.position.y < object.y + object.height &&
    state.position.y + PLAYER_HEIGHT > object.y &&
    state.position.z - PLAYER_HALF_DEPTH <
      object.z + object.depth / 2 &&
    state.position.z + PLAYER_HALF_DEPTH >
      object.z - object.depth / 2
  );
}

function overlapsHorizontal(
  state: MovementState,
  object: MapObject,
): boolean {
  return (
    state.position.x - PLAYER_HALF_WIDTH <
      object.x + object.width / 2 &&
    state.position.x + PLAYER_HALF_WIDTH >
      object.x - object.width / 2 &&
    state.position.z - PLAYER_HALF_DEPTH <
      object.z + object.depth / 2 &&
    state.position.z + PLAYER_HALF_DEPTH >
      object.z - object.depth / 2
  );
}
