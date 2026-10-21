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
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  SIMULATION_STEP,
} from "./constants";
import { CITY_MAP } from "./map";
import type { MovementInput, MovementState } from "./types";

/**
 * Frame-rate independent damping: after `delta` seconds, the remaining gap to
 * the target is e^-lambda*delta. Matches THREE.MathUtils.damp without importing
 * Three.js, so the server stays lightweight.
 */
function damp(
  current: number,
  target: number,
  lambda: number,
  delta: number,
): number {
  return target + (current - target) * Math.exp(-lambda * delta);
}

/**
 * Deterministic player movement. Mutates and returns `state` to avoid per-frame
 * allocations on both the client and server.
 *
 * Real time is accumulated and consumed in fixed SIMULATION_STEP increments, so
 * a 60fps client and the 20hz server execute the same sequence of physics steps.
 * `delta` may be any frame/tick time; huge deltas are capped to prevent tunneling.
 *
 * Everything here depends only on the state, input flags, yaw and fixed step,
 * which is why client prediction and server authority produce the same result.
 */
export function simulateMovement(
  state: MovementState,
  input: MovementInput,
  delta: number,
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
    stepMovement(state, input, SIMULATION_STEP);
    state.accumulator -= SIMULATION_STEP;
    steps += 1;
  }

  return state;
}

function stepMovement(
  state: MovementState,
  input: MovementInput,
  dt: number,
): void {
  if (input.jump && state.grounded) {
    state.velocity.y = JUMP_STRENGTH;
    state.grounded = false;
  }

  state.velocity.y += GRAVITY * dt;
  if (state.velocity.y < MAX_FALL_SPEED) {
    state.velocity.y = MAX_FALL_SPEED;
  }

  // Yaw 0 faces -Z, matching Three.js' camera forward axis.
  const forwardX = -Math.sin(input.yaw);
  const forwardZ = -Math.cos(input.yaw);
  // forward x worldUp = right-hand side of the view.
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
    // Normalizing keeps diagonal movement the same speed as straight lines.
    const inverseLength = 1 / Math.sqrt(moveLengthSq);
    moveX *= inverseLength;
    moveZ *= inverseLength;
  } else {
    moveX = 0;
    moveZ = 0;
  }

  /*
   * Strong ground acceleration/friction, weak air control. Damping is
   * exponential, so the same real time produces the same velocity at any
   * render/tick rate.
   */
  const rate = state.grounded
    ? hasInput
      ? GROUND_ACCELERATION
      : GROUND_FRICTION
    : hasInput
      ? AIR_ACCELERATION
      : AIR_FRICTION;

  state.velocity.x = damp(
    state.velocity.x,
    moveX * MAX_MOVE_SPEED,
    rate,
    dt,
  );
  state.velocity.z = damp(
    state.velocity.z,
    moveZ * MAX_MOVE_SPEED,
    rate,
    dt,
  );

  state.position.x += state.velocity.x * dt;
  // Exact constant-acceleration integration: v*dt - 0.5*g*dt^2. This keeps
  // jump arcs nearly identical at 60fps client and 20hz server tick rates.
  state.position.y += state.velocity.y * dt - 0.5 * GRAVITY * dt * dt;
  state.position.z += state.velocity.z * dt;

  state.grounded = false;
  resolveMapCollision(state);

  if (state.position.y <= 0) {
    state.position.y = 0;
    if (state.velocity.y < 0) {
      state.velocity.y = 0;
    }
  }

  state.grounded = state.position.y <= 0.001 || isStandingOnMap(state);
}

function resolveMapCollision(state: MovementState): void {
  for (let pass = 0; pass < 2; pass += 1) {
    let collided = false;

    for (const box of CITY_MAP) {
      const playerMinX = state.position.x - PLAYER_RADIUS;
      const playerMaxX = state.position.x + PLAYER_RADIUS;
      const playerMinY = state.position.y;
      const playerMaxY = state.position.y + PLAYER_HEIGHT;
      const playerMinZ = state.position.z - PLAYER_RADIUS;
      const playerMaxZ = state.position.z + PLAYER_RADIUS;

      const boxMinX = box.x - box.width / 2;
      const boxMaxX = box.x + box.width / 2;
      const boxMinY = box.y;
      const boxMaxY = box.y + box.height;
      const boxMinZ = box.z - box.depth / 2;
      const boxMaxZ = box.z + box.depth / 2;

      const overlapX =
        Math.min(playerMaxX, boxMaxX) - Math.max(playerMinX, boxMinX);
      if (overlapX <= 0) {
        continue;
      }

      const overlapY =
        Math.min(playerMaxY, boxMaxY) - Math.max(playerMinY, boxMinY);
      if (overlapY <= 0) {
        continue;
      }

      const overlapZ =
        Math.min(playerMaxZ, boxMaxZ) - Math.max(playerMinZ, boxMinZ);
      if (overlapZ <= 0) {
        continue;
      }

      collided = true;

      if (overlapX <= overlapY && overlapX <= overlapZ) {
        state.position.x =
          box.x +
          (state.position.x >= box.x ? 1 : -1) *
            (box.width / 2 + PLAYER_RADIUS);
        state.velocity.x = 0;
        continue;
      }

      if (overlapZ <= overlapX && overlapZ <= overlapY) {
        state.position.z =
          box.z +
          (state.position.z >= box.z ? 1 : -1) *
            (box.depth / 2 + PLAYER_RADIUS);
        state.velocity.z = 0;
        continue;
      }

      const playerCenterY = state.position.y + PLAYER_HEIGHT / 2;
      const boxCenterY = box.y + box.height / 2;

      if (playerCenterY >= boxCenterY) {
        state.position.y = box.y + box.height;
        if (state.velocity.y < 0) {
          state.velocity.y = 0;
        }
      } else if (box.y > 0.001) {
        state.position.y = box.y - PLAYER_HEIGHT;
        if (state.velocity.y > 0) {
          state.velocity.y = 0;
        }
      } else if (overlapX < overlapZ) {
        state.position.x =
          box.x +
          (state.position.x >= box.x ? 1 : -1) *
            (box.width / 2 + PLAYER_RADIUS);
        state.velocity.x = 0;
      } else {
        state.position.z =
          box.z +
          (state.position.z >= box.z ? 1 : -1) *
            (box.depth / 2 + PLAYER_RADIUS);
        state.velocity.z = 0;
      }
    }

    if (!collided) {
      break;
    }
  }
}

function isStandingOnMap(state: MovementState): boolean {
  const feetY = state.position.y;
  const epsilon = 0.04;

  for (const box of CITY_MAP) {
    const topY = box.y + box.height;
    if (Math.abs(feetY - topY) > epsilon) {
      continue;
    }

    if (
      Math.abs(state.position.x - box.x) <
        box.width / 2 + PLAYER_RADIUS &&
      Math.abs(state.position.z - box.z) <
        box.depth / 2 + PLAYER_RADIUS
    ) {
      return true;
    }
  }

  return false;
}
