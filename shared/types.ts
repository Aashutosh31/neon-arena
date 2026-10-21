/** Plain serializable vector used for network payloads. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export type GameMode = "tdm" | "ffa";
export type TeamId = "alpha" | "bravo" | "ffa";
export type WeaponId = "rifle" | "smg" | "shotgun" | "sniper" | "pistol";

/** Battlefield mutators. Offline custom matches may import these as a mod. */
export interface GameRules {
  damageMultiplier: number;
  speedMultiplier: number;
  gravityMultiplier: number;
  infiniteAmmo: boolean;
  friendlyFire: boolean;
  botCount: number;
  matchDurationSeconds: number;
}

/** Authoritative state the server keeps for each connected player. */
export interface PlayerState {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  /** Feet position; y = 0 is the floor. */
  position: Vec3;
  /** x = pitch, y = yaw. */
  rotation: Vec3;
  health: number;
  kills: number;
  deaths: number;
  weapon: WeaponId;
  ammo: number;
  reserveAmmo: number;
  reloading: boolean;
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
  /** Aiming down sights reduces weapon spread. */
  ads: boolean;
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
export interface PlayerInputPayload extends Omit<MovementInput, "ads"> {
  sequence: number;
  /** Client frame time in seconds; validated but not trusted for authority. */
  delta: number;
  /** Vertical look angle in radians, used for server-side rotation state. */
  pitch: number;
  ads: boolean;
}

/** Full snapshot broadcast every server tick (20hz). */
export interface GameStatePayload {
  players: PlayerState[];
  matchTime: number;
  mode: GameMode;
  scores: Record<"alpha" | "bravo", number>;
  rules: GameRules;
  matchOver: boolean;
  winner: "alpha" | "bravo" | "draw" | null;
}

/** Client -> server: a single trigger pull. Direction is normalized server-side. */
export interface PlayerShootPayload {
  direction: Vec3;
  weapon: WeaponId;
}

/** Server -> clients: shot plus who fired it, for remote tracers. */
export interface ServerShootPayload {
  shooterId: string;
  origin: Vec3;
  direction: Vec3;
  weapon: WeaponId;
}

/** Server -> shooter: confirms a shot landed, used for the hit marker. */
export interface PlayerHitPayload {
  targetId: string;
  damage: number;
  headshot: boolean;
}

/** Server -> everyone: a player's health reached zero. */
export interface PlayerDiedPayload {
  playerId: string;
  killerId: string | null;
  headshot: boolean;
  /** Server timestamp (ms) when the respawn will happen. */
  respawnAt: number;
}

export interface PlayerRespawnedPayload extends PlayerState {}

export interface QueueStatusPayload {
  mode: GameMode;
  players: number;
  needed: number;
  fillsWithBotsIn: number;
}

export interface MatchOverPayload {
  winner: "alpha" | "bravo" | "draw";
  scores: Record<"alpha" | "bravo", number>;
  restartIn: number;
}

export interface QueueJoinPayload {
  mode: GameMode;
  name: string;
}

export interface ServerToClientEvents {
  game_state: (payload: GameStatePayload) => void;
  player_joined: (player: PlayerState) => void;
  player_left: (playerId: string) => void;
  player_shoot: (payload: ServerShootPayload) => void;
  player_hit: (payload: PlayerHitPayload) => void;
  player_died: (payload: PlayerDiedPayload) => void;
  player_respawned: (player: PlayerRespawnedPayload) => void;
  queue_status: (payload: QueueStatusPayload) => void;
  match_over: (payload: MatchOverPayload) => void;
}

export interface ClientToServerEvents {
  queue_join: (payload: QueueJoinPayload) => void;
  queue_leave: () => void;
  player_input: (payload: PlayerInputPayload) => void;
  player_shoot: (payload: PlayerShootPayload) => void;
  player_reload: () => void;
  player_switch_weapon: (weapon: WeaponId) => void;
  client_ping: (callback: () => void) => void;
}
