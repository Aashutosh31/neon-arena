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
 * The player is a strict AABB. Width/depth are equal so the visual capsule and
 * the collision box share the same footprint.
 */
export const PLAYER_WIDTH = 0.8;
export const PLAYER_HEIGHT = 1.8;
export const PLAYER_DEPTH = 0.8;
export const PLAYER_HALF_WIDTH = PLAYER_WIDTH / 2;
export const PLAYER_HALF_DEPTH = PLAYER_DEPTH / 2;
export const PLAYER_RADIUS = PLAYER_WIDTH / 2;
export const EYE_HEIGHT = 1.6;
export const HEAD_HEIGHT = PLAYER_HEIGHT - 0.34;

/*
 * Perimeter walls have their inner faces at x/z = +/-24. This is the maximum
 * player-center coordinate; the AABB is already stopped by the wall collision,
 * so this value is only a final safety clamp.
 */
export const ARENA_LIMIT = 24 - PLAYER_HALF_WIDTH;

export const GRAVITY = -25;
export const JUMP_STRENGTH = 8;
export const MAX_FALL_SPEED = -40;

export const MAX_MOVE_SPEED = 6;

// Damping rates (1/s) used for acceleration and friction; higher = snappier.
export const GROUND_ACCELERATION = 20;
export const AIR_ACCELERATION = 4;
export const GROUND_FRICTION = 12;
export const AIR_FRICTION = 0.5;

export const MAX_HEALTH = 100;
export const RESPAWN_TIME = 3000;
export const MATCH_DURATION_SECONDS = 180;
export const MATCH_RESTART_MS = 5000;
export const TEAM_SIZE = 4;
export const MAX_MATCH_PLAYERS = TEAM_SIZE * 2;
export const QUEUE_BOT_FILL_MS = 7000;
export const BOT_COUNT = 7;
export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 120;
