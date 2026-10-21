/** Plain serializable vector used for network payloads. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Authoritative state the server keeps for each connected player. */
export interface PlayerState {
  id: string;
  /** Feet position; y = 0 is the floor. */
  position: Vec3;
  /** Only yaw is meaningful for the capsule today. */
  rotation: Vec3;
  /** Server-owned; clients only read this value. */
  health: number;
  kills: number;
  deaths: number;
}

/**
 * The only movement information the client controls. Position is never part of
 * an input packet, so teleport cheating is impossible by construction.
 */
export interface MovementInput {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  jump: boolean;
  /** Horizontal look angle in radians. */
  yaw: number;
}

/** Mutable movement state shared by client prediction and server simulation. */
export interface MovementState {
  position: Vec3;
  velocity: Vec3;
  grounded: boolean;
  /**
   * Carries unused time between calls so physics always advances in fixed
   * SIMULATION_STEP increments. Local only; never sent over the network.
   */
  accumulator: number;
}

/** Client -> server input sample, throttled to 20hz. */
export interface PlayerInputPayload extends MovementInput {
  /** Increments per packet so the server can discard stale/duplicate input. */
  sequence: number;
  /** Client frame time in seconds; validated but not trusted for authority. */
  delta: number;
  /** Vertical look angle in radians, used for server-side rotation state. */
  pitch: number;
}

/** Full snapshot broadcast every server tick (20hz). */
export interface GameStatePayload {
  players: PlayerState[];
  matchTime: number;
}

/** Client -> server: a single hitscan shot. Direction is normalized server-side. */
export interface PlayerShootPayload {
  origin: Vec3;
  direction: Vec3;
}

/** Server -> other clients: shot plus who fired it, for remote tracers. */
export interface ServerShootPayload extends PlayerShootPayload {
  shooterId: string;
}

/** Server -> shooter: confirms a shot landed, used for the hit marker. */
export interface PlayerHitPayload {
  targetId: string;
  damage: number;
}

/** Server -> everyone: a player's health reached zero. */
export interface PlayerDiedPayload {
  playerId: string;
  /** Server timestamp (ms) when the respawn will happen. */
  respawnAt: number;
}

export interface ClientToServerEvents {
  player_input: (payload: PlayerInputPayload) => void;
  player_shoot: (payload: PlayerShootPayload) => void;
  client_ping: (callback: () => void) => void;
}

export interface ServerToClientEvents {
  game_state: (payload: GameStatePayload) => void;
  player_joined: (player: PlayerState) => void;
  player_left: (playerId: string) => void;
  player_shoot: (payload: ServerShootPayload) => void;
  player_hit: (payload: PlayerHitPayload) => void;
  player_died: (payload: PlayerDiedPayload) => void;
  player_respawned: (player: PlayerState) => void;
}
