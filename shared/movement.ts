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
  PLAYER_RADIUS,
  SIMULATION_STEP,
} from "./constants";
import { ARENA_COVER } from "./map";
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

  resolveCoverCollision(state);

  // Simple floor collision; the arena is flat.
  if (state.position.y <= 0) {
    state.position.y = 0;
    if (state.velocity.y < 0) {
      state.velocity.y = 0;
    }
    state.grounded = true;
  } else {
    state.grounded = false;
  }
}

function resolveCoverCollision(state: MovementState): void {
  for (const box of ARENA_COVER) {
    if (state.position.y >= box.height) {
      continue;
    }

    const halfX = box.width / 2 + PLAYER_RADIUS;
    const halfZ = box.depth / 2 + PLAYER_RADIUS;
    const dx = state.position.x - box.x;
    const dz = state.position.z - box.z;
    const penetrationX = halfX - Math.abs(dx);
    const penetrationZ = halfZ - Math.abs(dz);

    if (penetrationX <= 0 || penetrationZ <= 0) {
      continue;
    }

    if (penetrationX < penetrationZ) {
      state.position.x = box.x + (dx >= 0 ? halfX : -halfX);
      state.velocity.x = 0;
    } else {
      state.position.z = box.z + (dz >= 0 ? halfZ : -halfZ);
      state.velocity.z = 0;
    }
  }
}
