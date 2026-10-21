import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server } from "socket.io";
import {
  ARENA_LIMIT,
  DAMAGE_PER_HIT,
  EYE_HEIGHT,
  MATCH_DURATION_SECONDS,
  MAX_HEALTH,
  NETWORK_TICK_RATE,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  RESPAWN_TIME,
  SERVER_PORT,
} from "../shared/constants";
import {
  ARENA_COVER,
  circleHitsCover,
  rayBoxDistance,
} from "../shared/map";
import { simulateMovement } from "../shared/movement";
import type {
  ClientToServerEvents,
  MovementInput,
  PlayerInputPayload,
  PlayerShootPayload,
  PlayerState,
  ServerToClientEvents,
  Vec3,
} from "../shared/types";

/**
 * Server-only fields. They are deliberately excluded from game_state via
 * toPlayerState() so clients only receive what they need.
 */
interface ServerPlayer extends PlayerState {
  velocity: Vec3;
  grounded: boolean;
  accumulator: number;
  input: MovementInput;
  lastInputSequence: number;
  lastInputAt: number;
}

const app = express();
const currentDir = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(currentDir, "../client");

const configuredOrigins = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const corsOrigin =
  configuredOrigins.length > 1 ? configuredOrigins : (configuredOrigins[0] ?? "*");

app.disable("x-powered-by");
app.use(express.static(clientDist));
app.get("/{*splat}", (_request, response) => {
  response.sendFile(resolve(clientDist, "index.html"));
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
});

/*
 * Authoritative player state, including velocity and the latest input sample.
 * The client never sends a position; it only sends keys + yaw for the server to
 * feed into the same shared simulation.
 */
const players = new Map<string, ServerPlayer>();

const durationOverride = Number(process.env.MATCH_DURATION_SECONDS);
const MATCH_DURATION_MS =
  (Number.isFinite(durationOverride) && durationOverride > 0
    ? durationOverride
    : MATCH_DURATION_SECONDS) * 1000;
let matchEndsAt = Date.now() + MATCH_DURATION_MS;
let matchGeneration = 0;

// Slightly larger than the visual capsule to be forgiving of 20hz movement.
const HIT_RADIUS = PLAYER_RADIUS + 0.05;
const SERVER_TICK_DELTA = 1 / NETWORK_TICK_RATE;

// If a client stops sending (hidden tab, network loss), stop ghost movement.
const INPUT_TIMEOUT_MS = 500;

function createSpawn(): Vec3 {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const x = (Math.random() * 2 - 1) * 8;
    const z = (Math.random() * 2 - 1) * 8;
    if (!circleHitsCover(x, z, PLAYER_RADIUS + 0.5)) {
      return { x, y: 0, z };
    }
  }

  return { x: -20, y: 0, z: -20 };
}

function createEmptyInput(): MovementInput {
  return {
    forward: false,
    backward: false,
    left: false,
    right: false,
    jump: false,
    yaw: 0,
  };
}

/** Runtime validation: never trust a payload just because TypeScript says so. */
function readVec3(value: unknown): Vec3 | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }

  const { x, y, z } = value as Partial<Vec3>;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof z !== "number" ||
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(z)
  ) {
    return null;
  }

  return { x, y, z };
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function toPlayerState(player: ServerPlayer): PlayerState {
  return {
    id: player.id,
    position: player.position,
    rotation: player.rotation,
    health: player.health,
    kills: player.kills,
    deaths: player.deaths,
  };
}

function getMatchTime(now = Date.now()): number {
  return Math.max(0, Math.ceil((matchEndsAt - now) / 1000));
}

function broadcastState(now = Date.now()): void {
  io.emit("game_state", {
    players: Array.from(players.values(), toPlayerState),
    matchTime: getMatchTime(now),
  });
}

function resetMatch(now: number): void {
  matchGeneration += 1;
  matchEndsAt = now + MATCH_DURATION_MS;

  for (const player of players.values()) {
    player.health = MAX_HEALTH;
    player.kills = 0;
    player.deaths = 0;
    player.position = createSpawn();
    player.rotation = { x: 0, y: 0, z: 0 };
    player.velocity = { x: 0, y: 0, z: 0 };
    player.grounded = true;
    player.accumulator = 0;
    player.input = createEmptyInput();
    player.lastInputAt = now;
    io.emit("player_respawned", toPlayerState(player));
  }
}

/**
 * Ray vs. vertical bounding cylinder (no physics engine). Returns the distance
 * along the ray to the closest hit, or null. `direction` must be normalized.
 *
 * The side is an infinite XZ cylinder clipped to the player's height; the top
 * and bottom caps catch shots that enter through the head or feet.
 */
function rayCylinderDistance(
  origin: Vec3,
  direction: Vec3,
  position: Vec3,
): number | null {
  const offsetX = origin.x - position.x;
  const offsetZ = origin.z - position.z;
  const yMin = position.y;
  const yMax = position.y + PLAYER_HEIGHT;

  const a = direction.x * direction.x + direction.z * direction.z;
  const b = 2 * (offsetX * direction.x + offsetZ * direction.z);
  const c = offsetX * offsetX + offsetZ * offsetZ - HIT_RADIUS * HIT_RADIUS;

  // Starting inside the volume (e.g. overlapping spawns) counts as a hit.
  if (c <= 0 && origin.y >= yMin && origin.y <= yMax) {
    return 0;
  }

  let nearest: number | null = null;

  if (a > 1e-8) {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const sqrtDisc = Math.sqrt(discriminant);
      const inverse = 1 / (2 * a);

      const tNear = (-b - sqrtDisc) * inverse;
      if (tNear >= 0) {
        const y = origin.y + tNear * direction.y;
        if (y >= yMin && y <= yMax) {
          nearest = tNear;
        }
      }

      const tFar = (-b + sqrtDisc) * inverse;
      if (tFar >= 0 && (nearest === null || tFar < nearest)) {
        const y = origin.y + tFar * direction.y;
        if (y >= yMin && y <= yMax) {
          nearest = tFar;
        }
      }
    }
  }

  if (Math.abs(direction.y) > 1e-8) {
    const tTop = (yMax - origin.y) / direction.y;
    if (tTop >= 0 && (nearest === null || tTop < nearest)) {
      const dx = origin.x + tTop * direction.x - position.x;
      const dz = origin.z + tTop * direction.z - position.z;
      if (dx * dx + dz * dz <= HIT_RADIUS * HIT_RADIUS) {
        nearest = tTop;
      }
    }

    const tBottom = (yMin - origin.y) / direction.y;
    if (tBottom >= 0 && (nearest === null || tBottom < nearest)) {
      const dx = origin.x + tBottom * direction.x - position.x;
      const dz = origin.z + tBottom * direction.z - position.z;
      if (dx * dx + dz * dz <= HIT_RADIUS * HIT_RADIUS) {
        nearest = tBottom;
      }
    }
  }

  return nearest;
}

io.on("connection", (socket) => {
  const player: ServerPlayer = {
    id: socket.id,
    position: createSpawn(),
    rotation: { x: 0, y: 0, z: 0 },
    health: MAX_HEALTH,
    kills: 0,
    deaths: 0,
    velocity: { x: 0, y: 0, z: 0 },
    grounded: true,
    accumulator: 0,
    input: createEmptyInput(),
    lastInputSequence: 0,
    lastInputAt: Date.now(),
  };
  players.set(socket.id, player);

  console.log(`Player connected: ${socket.id} (${players.size} online)`);

  let lastShotAt = 0;

  // Send the full current world to the newcomer so it can spawn everyone.
  socket.emit("game_state", {
    players: Array.from(players.values(), toPlayerState),
    matchTime: getMatchTime(),
  });

  // Existing clients only need the new capsule, not another full snapshot.
  socket.broadcast.emit("player_joined", toPlayerState(player));

  socket.on("player_input", (payload: PlayerInputPayload) => {
    const state = players.get(socket.id);
    if (!state || state.health <= 0) {
      return;
    }

    const sequence = readNumber(payload?.sequence);
    const delta = readNumber(payload?.delta);
    const yaw = readNumber(payload?.yaw);
    const pitch = readNumber(payload?.pitch);
    const forward = readBoolean(payload?.forward);
    const backward = readBoolean(payload?.backward);
    const left = readBoolean(payload?.left);
    const right = readBoolean(payload?.right);
    const jump = readBoolean(payload?.jump);

    if (
      sequence === null ||
      !Number.isInteger(sequence) ||
      sequence <= state.lastInputSequence ||
      delta === null ||
      delta < 0 ||
      yaw === null ||
      pitch === null ||
      forward === null ||
      backward === null ||
      left === null ||
      right === null ||
      jump === null
    ) {
      return;
    }

    /*
     * The client delta is validated but never used for authority: a cheater
     * could send huge deltas. Movement advances only on the fixed server tick,
     * which also makes rapid-fire input packets unable to grant extra speed.
     */
    state.lastInputSequence = sequence;
    state.lastInputAt = Date.now();
    state.input.forward = forward;
    state.input.backward = backward;
    state.input.left = left;
    state.input.right = right;
    state.input.jump = jump;
    state.input.yaw = yaw;

    // Rotation is server state too; pitch is clamped to a sane range.
    state.rotation = {
      x: clamp(pitch, -Math.PI / 2, Math.PI / 2),
      y: yaw,
      z: 0,
    };
  });

  socket.on("client_ping", (callback) => {
    if (typeof callback === "function") {
      callback();
    }
  });

  socket.on("player_shoot", (payload: PlayerShootPayload) => {
    const shooter = players.get(socket.id);
    if (!shooter || shooter.health <= 0) {
      return;
    }

    // Loose server-side rate limit: clients fire at 200ms, but network jitter
    // can bunch packets; 100ms only rejects obvious spam.
    const now = Date.now();
    if (now - lastShotAt < 100) {
      return;
    }

    const direction = readVec3(payload?.direction);
    if (!direction) {
      return;
    }

    const length = Math.hypot(direction.x, direction.y, direction.z);
    if (length < 1e-6) {
      return;
    }
    lastShotAt = now;

    const normalizedDirection: Vec3 = {
      x: direction.x / length,
      y: direction.y / length,
      z: direction.z / length,
    };

    /*
     * The origin comes from server state, never from the client payload. A
     * cheater cannot teleport a ray next to another player; the client only
     * controls where it aims.
     */
    const origin: Vec3 = {
      x: shooter.position.x,
      y: shooter.position.y + EYE_HEIGHT,
      z: shooter.position.z,
    };

    let target: ServerPlayer | null = null;
    let nearestDistance = Infinity;
    let nearestCover = Infinity;

    for (const box of ARENA_COVER) {
      const distance = rayBoxDistance(origin, normalizedDirection, box);
      if (distance !== null && distance < nearestCover) {
        nearestCover = distance;
      }
    }

    for (const candidate of players.values()) {
      if (candidate.id === shooter.id || candidate.health <= 0) {
        continue;
      }

      const distance = rayCylinderDistance(
        origin,
        normalizedDirection,
        candidate.position,
      );
      if (distance !== null && distance < nearestDistance) {
        nearestDistance = distance;
        target = candidate;
      }
    }

    if (target && nearestDistance > nearestCover) {
      target = null;
    }

    // Everyone else still needs the tracer, even on a miss.
    socket.broadcast.emit("player_shoot", {
      shooterId: shooter.id,
      origin,
      direction: normalizedDirection,
    });

    if (!target) {
      return;
    }

    // Damage is applied only here; the client never reports health or hits.
    target.health = Math.max(0, target.health - DAMAGE_PER_HIT);
    socket.emit("player_hit", {
      targetId: target.id,
      damage: DAMAGE_PER_HIT,
    });

    if (target.health > 0) {
      return;
    }

    shooter.kills += 1;
    target.deaths += 1;
    target.velocity.x = 0;
    target.velocity.y = 0;
    target.velocity.z = 0;
    target.grounded = true;
    target.accumulator = 0;

    const generation = matchGeneration;
    const respawnAt = Date.now() + RESPAWN_TIME;
    io.emit("player_died", {
      playerId: target.id,
      respawnAt,
    });

    setTimeout(() => {
      if (generation !== matchGeneration) {
        return;
      }

      const respawned = players.get(target.id);
      if (!respawned) {
        return;
      }

      respawned.health = MAX_HEALTH;
      respawned.position = createSpawn();
      respawned.rotation = { x: 0, y: 0, z: 0 };
      respawned.velocity = { x: 0, y: 0, z: 0 };
      respawned.grounded = true;
      respawned.accumulator = 0;
      respawned.input = createEmptyInput();
      respawned.lastInputAt = Date.now();
      io.emit("player_respawned", toPlayerState(respawned));
    }, RESPAWN_TIME);
  });

  socket.on("disconnect", (reason) => {
    players.delete(socket.id);

    // Use io.emit, not socket.broadcast: by the time "disconnect" fires the
    // socket has left its rooms, so broadcast can silently reach nobody.
    io.emit("player_left", socket.id);

    console.log(
      `Player disconnected: ${socket.id} (${reason}) (${players.size} online)`,
    );
  });
});

/*
 * Fixed 20hz network tick: inputs only change the latest flags, physics runs
 * in 120hz substeps inside simulateMovement, and one snapshot is broadcast.
 */
setInterval(() => {
  const now = Date.now();

  if (now >= matchEndsAt) {
    resetMatch(now);
  }

  for (const player of players.values()) {
    if (player.health <= 0) {
      continue;
    }

    if (now - player.lastInputAt > INPUT_TIMEOUT_MS) {
      player.input.forward = false;
      player.input.backward = false;
      player.input.left = false;
      player.input.right = false;
      player.input.jump = false;
    }

    simulateMovement(player, player.input, SERVER_TICK_DELTA);

    // Bounds clamp is a backstop; normal prediction respects the same limit.
    if (player.position.x < -ARENA_LIMIT) {
      player.position.x = -ARENA_LIMIT;
      player.velocity.x = 0;
    } else if (player.position.x > ARENA_LIMIT) {
      player.position.x = ARENA_LIMIT;
      player.velocity.x = 0;
    }

    if (player.position.z < -ARENA_LIMIT) {
      player.position.z = -ARENA_LIMIT;
      player.velocity.z = 0;
    } else if (player.position.z > ARENA_LIMIT) {
      player.position.z = ARENA_LIMIT;
      player.velocity.z = 0;
    }
  }

  broadcastState(now);
}, 1000 / NETWORK_TICK_RATE);

const parsedPort = Number(process.env.PORT);
const port =
  Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : SERVER_PORT;

httpServer.listen(port, "0.0.0.0", () => {
  console.log(`Neon Arena server listening on http://localhost:${port}`);
});
