export const SERVER_PORT = 3000;

// Network sync runs at 20hz to keep bandwidth low; rendering stays at 60fps.
export const NETWORK_TICK_RATE = 20;

/*
 * Physics is stepped at a fixed rate inside simulateMovement(), regardless of
 * the client's render fps or the server's 20hz snapshot tick. Without this, a
 * 60fps client and 20hz server slowly diverge during repeated jumps.
 */
export const SIMULATION_STEP = 1 / 120;
export const MAX_SIMULATION_STEPS = 12;

/*
 * Player movement constants live in shared/ so the future server-authoritative
 * simulation uses exactly the same numbers as client-side prediction. Different
 * values on each side would cause constant rubber-banding.
 */
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.35;
export const EYE_HEIGHT = 1.6;

// Half-size of the playable grid area (the floor is 50x50).
export const ARENA_LIMIT = 24.5;

export const GRAVITY = -25;
export const JUMP_STRENGTH = 8;
export const MAX_FALL_SPEED = -40;

export const MAX_MOVE_SPEED = 6;

// Damping rates (1/s) used for acceleration and friction; higher = snappier.
export const GROUND_ACCELERATION = 20;
export const AIR_ACCELERATION = 4;
export const GROUND_FRICTION = 12;
export const AIR_FRICTION = 0.5;

// Combat values. Health is only ever modified by the server.
export const MAX_HEALTH = 100;
export const DAMAGE_PER_HIT = 25;
export const RESPAWN_TIME = 3000;
export const MATCH_DURATION_SECONDS = 120;
