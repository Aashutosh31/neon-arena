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
 * The arena interior is 92x92. This is the maximum player-center coordinate;
 * the AABB is already stopped by the perimeter wall collision, so this value
 * is only a final safety clamp.
 */
export const ARENA_HALF_EXTENT = 46;
export const ARENA_LIMIT = ARENA_HALF_EXTENT - PLAYER_HALF_WIDTH;

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
export const MAX_ARMOR = 100;
export const SPAWN_ARMOR = 25;
export const ARMOR_ABSORPTION = 0.6;
export const ARMOR_PICKUP_AMOUNT = 50;
export const START_MEDKITS = 1;
export const MAX_MEDKITS = 3;
export const MEDKIT_HEAL = 45;
export const START_GRENADES = 2;
export const MAX_GRENADES = 3;
export const GRENADE_FUSE_MS = 1800;
export const GRENADE_RADIUS = 9;
export const GRENADE_MAX_DAMAGE = 300;
export const GRENADE_THROW_SPEED = 18;
export const GRENADE_UP_SPEED = 3.4;
export const GRENADE_COOLDOWN_MS = 650;
export const PICKUP_RADIUS = 1.5;
export const PICKUP_RESPAWN_MS = 16000;
export const BOT_DAMAGE_MULTIPLIER = 0.6;
export const RESPAWN_TIME = 3000;
export const MATCH_DURATION_SECONDS = 180;
export const MATCH_RESTART_MS = 5000;
export const TEAM_SIZE = 4;
export const MAX_MATCH_PLAYERS = TEAM_SIZE * 2;
export const QUEUE_BOT_FILL_MS = 7000;
export const BOT_COUNT = 7;
export const MAX_NAME_LENGTH = 16;
export const MAX_CHAT_LENGTH = 120;
