import {
  ARENA_HALF_EXTENT,
  ARENA_LIMIT,
  BOT_COUNT,
  EYE_HEIGHT,
  MATCH_DURATION_SECONDS,
  MATCH_RESTART_MS,
  MAX_HEALTH,
  MAX_MATCH_PLAYERS,
  MAX_NAME_LENGTH,
  RESPAWN_TIME,
} from "./constants";
import {
  castShot,
  hasLineOfSight,
  spreadDirection,
} from "./combat";
import {
  MAP_OBJECTS,
  MAP_WAYPOINTS,
  playerHitsMap,
  type MapObject,
} from "./map";
import { simulateMovement } from "./movement";
import type {
  GameMode,
  GameRules,
  GameStatePayload,
  MovementInput,
  PlayerState,
  TeamId,
  Vec3,
  WeaponId,
} from "./types";
import {
  WEAPONS,
  isWeaponId,
  type WeaponSpec,
} from "./weapons";

export const DEFAULT_RULES: GameRules = {
  damageMultiplier: 1,
  speedMultiplier: 1,
  gravityMultiplier: 1,
  infiniteAmmo: false,
  friendlyFire: false,
  botCount: BOT_COUNT,
  matchDurationSeconds: MATCH_DURATION_SECONDS,
};

export const MOD_RULES_LIMITS = {
  damageMultiplier: [0.25, 3],
  speedMultiplier: [0.5, 2.5],
  gravityMultiplier: [0.25, 2],
  botCount: [1, 7],
  matchDurationSeconds: [60, 600],
} as const;

interface WeaponAmmo {
  ammo: number;
  reserve: number;
}

interface BotBrain {
  targetId: string | null;
  nextThinkAt: number;
  waypoint: Vec3 | null;
  strafe: number;
  lastX: number;
  lastZ: number;
  stuckSince: number;
  skill: number;
  reloadAt: number;
  nextShotAt: number;
  burstRemaining: number;
}

interface SimPlayer {
  id: string;
  name: string;
  team: TeamId;
  isBot: boolean;
  position: Vec3;
  rotation: Vec3;
  health: number;
  kills: number;
  deaths: number;
  weapon: WeaponId;
  weapons: Record<WeaponId, WeaponAmmo>;
  velocity: Vec3;
  grounded: boolean;
  accumulator: number;
  input: MovementInput;
  lastInputSequence: number;
  lastInputAt: number;
  lastShotAt: number;
  reloadEndsAt: number;
  deadUntil: number | null;
  bot: BotBrain;
}

export interface GameEvents {
  onShot?: (
    shooterId: string,
    origin: Vec3,
    direction: Vec3,
    weapon: WeaponId,
  ) => void;
  onHit?: (
    shooterId: string,
    targetId: string,
    damage: number,
    headshot: boolean,
  ) => void;
  onKilled?: (
    killerId: string | null,
    victimId: string,
    headshot: boolean,
    respawnAt: number,
    killerWeapon: WeaponId | null,
  ) => void;
  onRespawn?: (player: PlayerState) => void;
  onMatchOver?: (
    winner: "alpha" | "bravo" | "draw",
    scores: Record<"alpha" | "bravo", number>,
    restartIn: number,
  ) => void;
}

const BOT_NAMES = [
  "Vex",
  "Nyx",
  "Kilo",
  "Rook",
  "Sable",
  "Echo",
  "Ion",
  "Hex",
  "Rune",
  "Cinder",
  "Talon",
  "Zero",
];

const EMPTY_INPUT: MovementInput = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  jump: false,
  yaw: 0,
  ads: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function readLimit(
  value: unknown,
  fallback: number,
  limits: readonly [number, number],
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return clamp(value, limits[0], limits[1]);
}

export function sanitizeRules(value: unknown): GameRules {
  const source =
    typeof value === "object" && value !== null
      ? (value as Partial<GameRules>)
      : {};

  return {
    damageMultiplier: readLimit(
      source.damageMultiplier,
      DEFAULT_RULES.damageMultiplier,
      MOD_RULES_LIMITS.damageMultiplier,
    ),
    speedMultiplier: readLimit(
      source.speedMultiplier,
      DEFAULT_RULES.speedMultiplier,
      MOD_RULES_LIMITS.speedMultiplier,
    ),
    gravityMultiplier: readLimit(
      source.gravityMultiplier,
      DEFAULT_RULES.gravityMultiplier,
      MOD_RULES_LIMITS.gravityMultiplier,
    ),
    infiniteAmmo: source.infiniteAmmo === true,
    friendlyFire: source.friendlyFire === true,
    botCount: Math.round(
      readLimit(
        source.botCount,
        DEFAULT_RULES.botCount,
        MOD_RULES_LIMITS.botCount,
      ),
    ),
    matchDurationSeconds: Math.round(
      readLimit(
        source.matchDurationSeconds,
        DEFAULT_RULES.matchDurationSeconds,
        MOD_RULES_LIMITS.matchDurationSeconds,
      ),
    ),
  };
}

export function sanitizeName(value: unknown, fallback = "Operator"): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const cleaned = value.replace(/[^\w .-]/g, "").trim().slice(0, MAX_NAME_LENGTH);
  return cleaned.length > 0 ? cleaned : fallback;
}

function createAmmo(): Record<WeaponId, WeaponAmmo> {
  const ammo = {} as Record<WeaponId, WeaponAmmo>;
  for (const weapon of Object.values(WEAPONS)) {
    ammo[weapon.id] = {
      ammo: weapon.magazine,
      reserve: weapon.reserve,
    };
  }
  return ammo;
}

function emptyPlayer(
  id: string,
  name: string,
  team: TeamId,
  isBot: boolean,
  position: Vec3,
  yaw: number,
): SimPlayer {
  return {
    id,
    name,
    team,
    isBot,
    position,
    rotation: { x: 0, y: yaw, z: 0 },
    health: MAX_HEALTH,
    kills: 0,
    deaths: 0,
    weapon: "rifle",
    weapons: createAmmo(),
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    accumulator: 0,
    input: { ...EMPTY_INPUT, yaw },
    lastInputSequence: 0,
    lastInputAt: 0,
    lastShotAt: 0,
    reloadEndsAt: 0,
    deadUntil: null,
    bot: {
      targetId: null,
      nextThinkAt: 0,
      waypoint: null,
      strafe: Math.random() < 0.5 ? -1 : 1,
      lastX: position.x,
      lastZ: position.z,
      stuckSince: 0,
      skill: 0.72 + Math.random() * 0.24,
      reloadAt: 0,
      nextShotAt: 0,
      burstRemaining: 2,
    },
  };
}

export class GameSimulation {
  readonly mode: GameMode;
  readonly rules: GameRules;
  private readonly mapObjects: readonly MapObject[];
  private readonly events: GameEvents;
  private readonly players = new Map<string, SimPlayer>();
  private readonly scores: Record<"alpha" | "bravo", number> = {
    alpha: 0,
    bravo: 0,
  };
  private started = false;
  private endsAt = 0;
  private restartAt = 0;
  private matchOver = false;
  private winner: "alpha" | "bravo" | "draw" | null = null;
  private botCounter = 0;
  private generation = 0;

  constructor(
    mode: GameMode,
    rules: GameRules = DEFAULT_RULES,
    events: GameEvents = {},
    mapObjects: readonly MapObject[] = MAP_OBJECTS,
  ) {
    this.mode = mode;
    this.rules = sanitizeRules(rules);
    this.events = events;
    this.mapObjects = mapObjects;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isOver(): boolean {
    return this.matchOver;
  }

  getPlayer(id: string): PlayerState | null {
    const player = this.players.get(id);
    return player ? this.toState(player, Date.now()) : null;
  }

  addPlayer(
    id: string,
    name: string,
    team?: TeamId,
    isBot = false,
  ): PlayerState {
    const resolvedTeam = team ?? this.pickTeam();
    const spawn = this.pickSpawn(resolvedTeam);
    const player = emptyPlayer(
      id,
      sanitizeName(name, isBot ? "Bot" : "Operator"),
      resolvedTeam,
      isBot,
      spawn.position,
      spawn.yaw,
    );
    this.players.set(id, player);
    return this.toState(player, Date.now());
  }

  addBot(team?: TeamId): PlayerState {
    const resolvedTeam = team ?? this.pickTeam();
    this.botCounter += 1;
    const name = BOT_NAMES[(this.botCounter - 1) % BOT_NAMES.length];
    const id = `bot-${this.botCounter}-${Math.random().toString(36).slice(2, 6)}`;
    return this.addPlayer(id, name, resolvedTeam, true);
  }

  removePlayer(id: string): void {
    this.players.delete(id);
  }

  start(now = Date.now()): void {
    this.started = true;
    this.endsAt = now + this.rules.matchDurationSeconds * 1000;
    this.matchOver = false;
    this.winner = null;
    this.restartAt = 0;
  }

  setInput(
    id: string,
    input: MovementInput,
    sequence = 0,
    now = Date.now(),
  ): void {
    const player = this.players.get(id);
    if (!player || player.health <= 0 || this.matchOver) {
      return;
    }
    if (sequence > 0 && sequence <= player.lastInputSequence) {
      return;
    }
    if (sequence > 0) {
      player.lastInputSequence = sequence;
    }
    player.input.forward = input.forward === true;
    player.input.backward = input.backward === true;
    player.input.left = input.left === true;
    player.input.right = input.right === true;
    player.input.jump = input.jump === true;
    player.input.ads = input.ads === true;
    player.input.yaw = Number.isFinite(input.yaw) ? input.yaw : player.input.yaw;
    player.rotation.y = player.input.yaw;
    player.lastInputAt = now;
  }

  setRotation(id: string, pitch: number, yaw: number): void {
    const player = this.players.get(id);
    if (!player) {
      return;
    }
    player.rotation.x = clamp(pitch, -Math.PI / 2, Math.PI / 2);
    player.rotation.y = yaw;
    player.input.yaw = yaw;
  }

  selectWeapon(id: string, weapon: WeaponId): void {
    const player = this.players.get(id);
    if (!player || player.health <= 0 || !isWeaponId(weapon)) {
      return;
    }
    player.weapon = weapon;
    player.reloadEndsAt = 0;
  }

  reload(id: string, now = Date.now()): void {
    const player = this.players.get(id);
    if (!player || player.health <= 0 || this.matchOver) {
      return;
    }
    const spec = WEAPONS[player.weapon];
    const ammo = player.weapons[player.weapon];
    if (player.reloadEndsAt > 0) {
      return;
    }
    if (ammo.ammo >= spec.magazine || (ammo.reserve <= 0 && !this.rules.infiniteAmmo)) {
      return;
    }
    player.reloadEndsAt = now + spec.reloadTimeMs;
  }

  shoot(
    id: string,
    direction: Vec3,
    weapon: WeaponId,
    now = Date.now(),
  ): void {
    const player = this.players.get(id);
    if (!player || player.health <= 0 || this.matchOver) {
      return;
    }
    if (weapon !== player.weapon) {
      return;
    }

    const spec = WEAPONS[player.weapon];
    if (player.reloadEndsAt > 0) {
      return;
    }
    if (now - player.lastShotAt < spec.fireIntervalMs) {
      return;
    }

    const ammo = player.weapons[player.weapon];
    if (ammo.ammo <= 0) {
      this.reload(id, now);
      return;
    }
    if (!this.rules.infiniteAmmo) {
      ammo.ammo -= 1;
    }
    player.lastShotAt = now;

    const normalized = normalizeDirection(direction);
    if (!normalized) {
      return;
    }

    const origin: Vec3 = {
      x: player.position.x,
      y: player.position.y + EYE_HEIGHT,
      z: player.position.z,
    };

    this.events.onShot?.(player.id, origin, normalized, player.weapon);

    const spread = spec.spreadRad * (player.input.ads ? spec.adsSpreadMultiplier : 1);
    const damageByTarget = new Map<string, { damage: number; headshot: boolean }>();

    for (let pellet = 0; pellet < spec.pellets; pellet += 1) {
      const shotDirection = spreadDirection(normalized, spread);
      const hit = castShot(
        origin,
        shotDirection,
        spec.range,
        player.id,
        player.team,
        this.rules.friendlyFire,
        this.players.values(),
        this.mapObjects,
      );
      if (!hit) {
        continue;
      }

      const falloff = damageFalloff(spec, hit.distance);
      const headshotMultiplier = hit.headshot ? spec.headshotMultiplier : 1;
      const damage =
        spec.damage *
        falloff *
        headshotMultiplier *
        this.rules.damageMultiplier;
      const existing = damageByTarget.get(hit.playerId);
      if (existing) {
        existing.damage += damage;
        existing.headshot ||= hit.headshot;
      } else {
        damageByTarget.set(hit.playerId, {
          damage,
          headshot: hit.headshot,
        });
      }
    }

    for (const [targetId, result] of damageByTarget) {
      const target = this.players.get(targetId);
      if (!target || target.health <= 0) {
        continue;
      }
      const roundedDamage = Math.round(result.damage);
      target.health = Math.max(0, target.health - roundedDamage);
      this.events.onHit?.(
        player.id,
        target.id,
        roundedDamage,
        result.headshot,
      );

      if (target.health <= 0) {
        this.killPlayer(player, target, result.headshot, now);
      }
    }
  }

  update(now = Date.now(), delta = 1 / 20): void {
    if (!this.started) {
      return;
    }

    if (this.matchOver) {
      if (this.restartAt > 0 && now >= this.restartAt) {
        this.resetMatch(now);
      }
      return;
    }

    if (now >= this.endsAt) {
      this.endMatch(now);
      return;
    }

    for (const player of this.players.values()) {
      if (player.isBot) {
        this.updateBot(player, now);
      } else if (now - player.lastInputAt > 700) {
        player.input.forward = false;
        player.input.backward = false;
        player.input.left = false;
        player.input.right = false;
        player.input.jump = false;
        player.input.ads = false;
      }

      if (player.health <= 0) {
        if (player.deadUntil !== null && now >= player.deadUntil) {
          this.respawn(player, now);
        }
        continue;
      }

      if (player.reloadEndsAt > 0 && now >= player.reloadEndsAt) {
        this.finishReload(player);
      }

      simulateMovement(player, player.input, delta, {
        speedMultiplier: this.rules.speedMultiplier,
        gravityMultiplier: this.rules.gravityMultiplier,
      });

      player.position.x = clamp(player.position.x, -ARENA_LIMIT, ARENA_LIMIT);
      player.position.z = clamp(player.position.z, -ARENA_LIMIT, ARENA_LIMIT);
    }
  }

  getState(now = Date.now()): GameStatePayload {
    return {
      players: Array.from(this.players.values(), (player) =>
        this.toState(player, now),
      ),
      matchTime: Math.max(0, Math.ceil((this.endsAt - now) / 1000)),
      mode: this.mode,
      scores: { ...this.scores },
      rules: { ...this.rules },
      matchOver: this.matchOver,
      winner: this.winner,
    };
  }

  private toState(player: SimPlayer, now: number): PlayerState {
    const ammo = player.weapons[player.weapon];
    return {
      id: player.id,
      name: player.name,
      team: player.team,
      isBot: player.isBot,
      position: { ...player.position },
      rotation: { ...player.rotation },
      health: Math.round(player.health),
      kills: player.kills,
      deaths: player.deaths,
      weapon: player.weapon,
      ammo: ammo.ammo,
      reserveAmmo: ammo.reserve,
      reloading: player.reloadEndsAt > 0 && now < player.reloadEndsAt,
    };
  }

  private killPlayer(
    killer: SimPlayer,
    victim: SimPlayer,
    headshot: boolean,
    now: number,
  ): void {
    victim.health = 0;
    victim.deaths += 1;
    victim.velocity = { x: 0, y: 0, z: 0 };
    victim.grounded = true;
    victim.accumulator = 0;
    victim.input = { ...EMPTY_INPUT, yaw: victim.input.yaw };
    victim.reloadEndsAt = 0;
    victim.deadUntil = now + RESPAWN_TIME;

    if (killer.id !== victim.id) {
      killer.kills += 1;
      if (this.mode === "tdm" && killer.team !== "ffa") {
        this.scores[killer.team as "alpha" | "bravo"] += 1;
      }
    }

    const killerWeapon = killer.id === victim.id ? null : killer.weapon;
    this.events.onKilled?.(
      killer.id === victim.id ? null : killer.id,
      victim.id,
      headshot,
      victim.deadUntil,
      killerWeapon,
    );
  }

  private respawn(player: SimPlayer, now: number): void {
    const spawn = this.pickSpawn(player.team);
    player.position = spawn.position;
    player.rotation = { x: 0, y: spawn.yaw, z: 0 };
    player.velocity = { x: 0, y: 0, z: 0 };
    player.grounded = true;
    player.accumulator = 0;
    player.health = MAX_HEALTH;
    player.weapons = createAmmo();
    player.weapon = "rifle";
    player.reloadEndsAt = 0;
    player.deadUntil = null;
    player.input = { ...EMPTY_INPUT, yaw: spawn.yaw };
    player.lastInputAt = now;
    this.events.onRespawn?.(this.toState(player, now));
  }

  private endMatch(now: number): void {
    this.matchOver = true;
    this.winner = this.pickWinner();
    this.restartAt = now + MATCH_RESTART_MS;
    for (const player of this.players.values()) {
      player.input = { ...EMPTY_INPUT, yaw: player.input.yaw };
    }
    this.events.onMatchOver?.(
      this.winner,
      { ...this.scores },
      MATCH_RESTART_MS,
    );
  }

  private resetMatch(now: number): void {
    this.generation += 1;
    this.matchOver = false;
    this.winner = null;
    this.restartAt = 0;
    this.endsAt = now + this.rules.matchDurationSeconds * 1000;
    this.scores.alpha = 0;
    this.scores.bravo = 0;

    for (const player of this.players.values()) {
      player.kills = 0;
      player.deaths = 0;
      player.health = MAX_HEALTH;
      player.weapons = createAmmo();
      player.weapon = "rifle";
      player.reloadEndsAt = 0;
      player.deadUntil = null;
      const spawn = this.pickSpawn(player.team);
      player.position = spawn.position;
      player.rotation = { x: 0, y: spawn.yaw, z: 0 };
      player.velocity = { x: 0, y: 0, z: 0 };
      player.grounded = true;
      player.accumulator = 0;
      player.input = { ...EMPTY_INPUT, yaw: spawn.yaw };
      player.lastInputAt = now;
      this.events.onRespawn?.(this.toState(player, now));
    }
  }

  private pickWinner(): "alpha" | "bravo" | "draw" {
    if (this.mode === "ffa") {
      return "draw";
    }
    if (this.scores.alpha === this.scores.bravo) {
      return "draw";
    }
    return this.scores.alpha > this.scores.bravo ? "alpha" : "bravo";
  }

  private pickTeam(): TeamId {
    if (this.mode === "ffa") {
      return "ffa";
    }
    let alpha = 0;
    let bravo = 0;
    for (const player of this.players.values()) {
      if (player.team === "alpha") {
        alpha += 1;
      } else if (player.team === "bravo") {
        bravo += 1;
      }
    }
    return alpha <= bravo ? "alpha" : "bravo";
  }

  private pickSpawn(team: TeamId): { position: Vec3; yaw: number } {
    const spawnDepth = ARENA_HALF_EXTENT - 3.5;
    const spawnWidth = 4.2;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      let x = 0;
      let z = 0;
      let yaw = Math.random() * Math.PI * 2;
      if (this.mode === "tdm" && team === "alpha") {
        x = (Math.random() * 2 - 1) * spawnWidth;
        z = spawnDepth + Math.random() * 2;
        yaw = 0;
      } else if (this.mode === "tdm" && team === "bravo") {
        x = (Math.random() * 2 - 1) * spawnWidth;
        z = -spawnDepth - Math.random() * 2;
        yaw = Math.PI;
      } else {
        const extent = ARENA_HALF_EXTENT - 3;
        x = (Math.random() * 2 - 1) * extent;
        z = (Math.random() * 2 - 1) * extent;
      }

      if (!playerHitsMap(x, 0, z)) {
        let blocked = false;
        for (const player of this.players.values()) {
          if (player.health <= 0) {
            continue;
          }
          const dx = player.position.x - x;
          const dz = player.position.z - z;
          if (dx * dx + dz * dz < 2.2 * 2.2) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          return { position: { x, y: 0, z }, yaw };
        }
      }
    }
    return { position: { x: 0, y: 0, z: ARENA_HALF_EXTENT - 4 }, yaw: 0 };
  }

  private updateBot(player: SimPlayer, now: number): void {
    if (player.health <= 0) {
      return;
    }

    const eye: Vec3 = {
      x: player.position.x,
      y: player.position.y + EYE_HEIGHT,
      z: player.position.z,
    };
    const target = this.pickBotTarget(player);

    if (!target) {
      player.bot.targetId = null;
      player.input.forward = true;
      player.input.backward = false;
      player.input.left = false;
      player.input.right = false;
      player.input.jump = false;
      player.input.ads = false;
      player.input.yaw = Math.atan2(
        -(player.position.x - 0),
        -(player.position.z - 0),
      );
      return;
    }

    const targetEye: Vec3 = {
      x: target.position.x,
      y: target.position.y + 1.18,
      z: target.position.z,
    };
    if (target.id !== player.bot.targetId) {
      player.bot.targetId = target.id;
      player.bot.burstRemaining = 2 + Math.floor(Math.random() * 3);
      player.bot.nextShotAt = now + 260 + Math.random() * 360;
    }
    const dx = target.position.x - player.position.x;
    const dz = target.position.z - player.position.z;
    const distance = Math.hypot(dx, dz);
    const visible = hasLineOfSight(eye, targetEye, this.mapObjects);

    const aimYaw = Math.atan2(-dx, -dz);
    player.input.yaw = aimYaw;
    player.input.forward = distance > 11 || !visible;
    player.input.backward = false;
    player.input.ads = visible && distance > 14;
    player.input.jump = false;

    if (now >= player.bot.nextThinkAt) {
      player.bot.nextThinkAt = now + 240 + Math.random() * 320;
      player.bot.strafe = Math.random() < 0.5 ? -1 : 1;
      player.input.left = player.bot.strafe < 0;
      player.input.right = player.bot.strafe > 0;
      if (Math.random() < 0.08) {
        player.input.jump = true;
      }
    }

    const stuck =
      Math.abs(player.position.x - player.bot.lastX) +
        Math.abs(player.position.z - player.bot.lastZ) <
      0.03;
    if (stuck) {
      if (player.bot.stuckSince === 0) {
        player.bot.stuckSince = now;
      } else if (now - player.bot.stuckSince > 700) {
        player.bot.stuckSince = 0;
        player.bot.waypoint =
          MAP_WAYPOINTS[Math.floor(Math.random() * MAP_WAYPOINTS.length)];
        player.input.jump = true;
        player.input.left = Math.random() < 0.5;
        player.input.right = !player.input.left;
      }
    } else {
      player.bot.stuckSince = 0;
    }
    player.bot.lastX = player.position.x;
    player.bot.lastZ = player.position.z;

    if (!visible) {
      if (!player.bot.waypoint) {
        player.bot.waypoint =
          MAP_WAYPOINTS[Math.floor(Math.random() * MAP_WAYPOINTS.length)];
      }
      const waypoint = player.bot.waypoint;
      if (waypoint) {
        player.input.yaw = Math.atan2(
          -(waypoint.x - player.position.x),
          -(waypoint.z - player.position.z),
        );
        player.input.forward = true;
      }
      return;
    }

    player.bot.waypoint = null;
    const spec = WEAPONS[player.weapon];
    const ammo = player.weapons[player.weapon];
    if (ammo.ammo <= 0) {
      this.reload(player.id, now);
      return;
    }

    if (now < player.bot.nextShotAt) {
      return;
    }

    const aimError = (1 - player.bot.skill) * 0.075;
    const shotDirection = normalizeDirection({
      x: targetEye.x - eye.x + (Math.random() - 0.5) * aimError * distance,
      y:
        targetEye.y -
        eye.y +
        (Math.random() - 0.5) * aimError * distance -
        (distance > 25 ? distance * 0.012 : 0),
      z: targetEye.z - eye.z + (Math.random() - 0.5) * aimError * distance,
    });
    if (shotDirection && distance <= spec.range) {
      this.shoot(player.id, shotDirection, player.weapon, now);
      player.bot.burstRemaining -= 1;
      if (player.bot.burstRemaining <= 0) {
        player.bot.burstRemaining = 2 + Math.floor(Math.random() * 3);
        player.bot.nextShotAt = now + 550 + Math.random() * 750;
      } else {
        player.bot.nextShotAt =
          now + spec.fireIntervalMs * (1.1 + Math.random() * 0.25);
      }
    }
  }

  private pickBotTarget(player: SimPlayer): SimPlayer | null {
    let best: SimPlayer | null = null;
    let bestScore = Infinity;
    for (const candidate of this.players.values()) {
      if (
        candidate.id === player.id ||
        candidate.health <= 0 ||
        (!this.rules.friendlyFire &&
          this.mode === "tdm" &&
          candidate.team === player.team)
      ) {
        continue;
      }
      const dx = candidate.position.x - player.position.x;
      const dz = candidate.position.z - player.position.z;
      const distance = Math.hypot(dx, dz);
      const eye: Vec3 = {
        x: player.position.x,
        y: player.position.y + EYE_HEIGHT,
        z: player.position.z,
      };
      const targetEye: Vec3 = {
        x: candidate.position.x,
        y: candidate.position.y + EYE_HEIGHT,
        z: candidate.position.z,
      };
      const visible = hasLineOfSight(eye, targetEye, this.mapObjects);
      const score = distance + (visible ? 0 : 18);
      if (score < bestScore) {
        best = candidate;
        bestScore = score;
      }
    }
    return best;
  }

  private finishReload(player: SimPlayer): void {
    const spec = WEAPONS[player.weapon];
    const ammo = player.weapons[player.weapon];
    const needed = spec.magazine - ammo.ammo;
    if (this.rules.infiniteAmmo) {
      ammo.ammo = spec.magazine;
    } else {
      const loaded = Math.min(needed, ammo.reserve);
      ammo.ammo += loaded;
      ammo.reserve -= loaded;
    }
    player.reloadEndsAt = 0;
  }
}

function damageFalloff(spec: WeaponSpec, distance: number): number {
  if (distance <= spec.falloffStart) {
    return 1;
  }
  const span = Math.max(1, spec.range - spec.falloffStart);
  const ratio = clamp((distance - spec.falloffStart) / span, 0, 1);
  return 1 - (1 - spec.minDamageMultiplier) * ratio;
}

function normalizeDirection(direction: Vec3): Vec3 | null {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length < 1e-6) {
    return null;
  }
  return {
    x: direction.x / length,
    y: direction.y / length,
    z: direction.z / length,
  };
}

export function fillPracticeBots(game: GameSimulation): void {
  const target = Math.min(MAX_MATCH_PLAYERS - 1, game.rules.botCount);
  for (let index = 0; index < target; index += 1) {
    game.addBot();
  }
}
