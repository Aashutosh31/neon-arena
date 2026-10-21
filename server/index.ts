import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { Server, type Socket } from "socket.io";
import {
  MAX_MATCH_PLAYERS,
  NETWORK_TICK_RATE,
  QUEUE_BOT_FILL_MS,
  SERVER_PORT,
} from "../shared/constants";
import { DEFAULT_RULES, GameSimulation, sanitizeName } from "../shared/game";
import type {
  ClientToServerEvents,
  GameMode,
  PlayerInputPayload,
  PlayerShootPayload,
  QueueJoinPayload,
  ServerToClientEvents,
  Vec3,
  WeaponId,
} from "../shared/types";
import { isWeaponId } from "../shared/weapons";

const envFile = resolve(process.cwd(), ".env");
if (existsSync(envFile) && typeof process.loadEnvFile === "function") {
  process.loadEnvFile(envFile);
}

interface QueueEntry {
  socket: Socket<ClientToServerEvents, ServerToClientEvents>;
  mode: GameMode;
  name: string;
  joinedAt: number;
}

interface ServerMatch {
  id: string;
  room: string;
  game: GameSimulation;
  humanIds: Set<string>;
  emptySince: number | null;
}

const app = express();
const currentDir = dirname(fileURLToPath(import.meta.url));
const clientDist = resolve(currentDir, "../client");
const clientIndex = resolve(clientDist, "index.html");
const serveClient =
  process.env.SERVE_CLIENT === "true" && existsSync(clientIndex);

const allowedOrigins = (process.env.CORS_ORIGIN ?? "*")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowAllOrigins = allowedOrigins.includes("*");
if (process.env.NODE_ENV === "production" && allowAllOrigins) {
  console.warn(
    "CORS_ORIGIN is not restricted; set it to your Vercel URL before going live",
  );
}

const originPattern = process.env.CORS_ORIGIN_REGEX?.trim();
let originRegex: RegExp | null = null;
if (originPattern) {
  try {
    originRegex = new RegExp(originPattern);
  } catch (error) {
    console.error("Invalid CORS_ORIGIN_REGEX:", error);
  }
}

function isOriginAllowed(origin: string | undefined): boolean {
  if (!origin || allowAllOrigins) {
    return true;
  }
  return allowedOrigins.includes(origin) || originRegex?.test(origin) === true;
}

const corsOrigin = (
  origin: string | undefined,
  callback: (error: Error | null, allow?: boolean) => void,
): void => {
  if (isOriginAllowed(origin)) {
    callback(null, true);
    return;
  }
  callback(new Error(`Origin not allowed: ${origin}`));
};

app.disable("x-powered-by");

app.get("/health", (_request, response) => {
  response.status(200).json({
    status: "ok",
    uptime: process.uptime(),
    matches: matches.size,
    queued: queue.size,
  });
});

if (serveClient) {
  app.use(express.static(clientDist));
  app.get("/{*splat}", (_request, response) => {
    response.sendFile(clientIndex);
  });
} else {
  app.get("/", (_request, response) => {
    response.status(200).json({ service: "neon-arena-server", status: "ok" });
  });
}

if (process.env.SERVE_CLIENT === "true" && !serveClient) {
  console.warn("SERVE_CLIENT=true but dist/client/index.html was not found");
}

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: corsOrigin,
    methods: ["GET", "POST"],
  },
  allowRequest: (request, callback) => {
    callback(null, isOriginAllowed(request.headers.origin));
  },
});

const matches = new Map<string, ServerMatch>();
const queue = new Map<string, QueueEntry>();
const socketMatches = new Map<string, string>();
let matchCounter = 0;

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

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

function readMode(value: unknown): GameMode | null {
  return value === "tdm" || value === "ffa" ? value : null;
}

function getMatchForSocket(socketId: string): ServerMatch | null {
  const matchId = socketMatches.get(socketId);
  return matchId ? (matches.get(matchId) ?? null) : null;
}

function broadcastQueueStatus(mode: GameMode, now = Date.now()): void {
  const entries = [...queue.values()]
    .filter((entry) => entry.mode === mode)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const oldest = entries[0]?.joinedAt ?? now;
  const fillIn = Math.max(0, QUEUE_BOT_FILL_MS - (now - oldest));
  const payload = {
    mode,
    players: entries.length,
    needed: Math.max(0, MAX_MATCH_PLAYERS - entries.length),
    fillsWithBotsIn: Math.ceil(fillIn / 1000),
  };
  for (const entry of entries) {
    entry.socket.emit("queue_status", payload);
  }
}

function createMatch(mode: GameMode, entries: QueueEntry[], now: number): void {
  matchCounter += 1;
  const id = `match-${matchCounter}`;
  const room = id;
  const humanIds = new Set<string>();

  const game = new GameSimulation(mode, DEFAULT_RULES, {
    onShot: (shooterId, origin, direction, weapon) => {
      io.to(room).emit("player_shoot", {
        shooterId,
        origin,
        direction,
        weapon,
      });
    },
    onHit: (shooterId, targetId, damage, headshot) => {
      if (humanIds.has(shooterId)) {
        io.to(shooterId).emit("player_hit", {
          targetId,
          damage,
          headshot,
        });
      }
    },
    onKilled: (killerId, victimId, headshot, respawnAt, killerWeapon) => {
      io.to(room).emit("player_died", {
        playerId: victimId,
        killerId,
        killerWeapon,
        headshot,
        respawnAt,
      });
    },
    onRespawn: (player) => {
      io.to(room).emit("player_respawned", player);
    },
    onGrenadeThrown: (payload) => {
      io.to(room).emit("grenade_thrown", payload);
    },
    onGrenadeExploded: (payload) => {
      io.to(room).emit("grenade_exploded", payload);
    },
    onPickup: (playerId, kind) => {
      io.to(room).emit("pickup_collected", { playerId, kind });
    },
    onMatchOver: (winner, scores, restartIn) => {
      io.to(room).emit("match_over", { winner, scores, restartIn });
    },
  });

  for (const entry of entries) {
    queue.delete(entry.socket.id);
    entry.socket.join(room);
    humanIds.add(entry.socket.id);
    socketMatches.set(entry.socket.id, id);
    game.addPlayer(entry.socket.id, entry.name);
  }

  while (game.playerCount < MAX_MATCH_PLAYERS) {
    game.addBot();
  }

  game.start(now);
  const match: ServerMatch = {
    id,
    room,
    game,
    humanIds,
    emptySince: null,
  };
  matches.set(id, match);

  io.to(room).emit("game_state", game.getState(now));
  console.log(
    `Match ${id} started (${mode}, ${humanIds.size} humans, ${game.playerCount - humanIds.size} bots)`,
  );
}

function runMatchmaker(now: number): void {
  for (const mode of ["tdm", "ffa"] as const) {
    const entries = [...queue.values()]
      .filter((entry) => entry.mode === mode)
      .sort((a, b) => a.joinedAt - b.joinedAt);

    if (entries.length === 0) {
      continue;
    }

    const oldest = entries[0].joinedAt;
    const full = entries.length >= MAX_MATCH_PLAYERS;
    const fillWithBots = now - oldest >= QUEUE_BOT_FILL_MS;

    if (full || fillWithBots) {
      const selected = entries.slice(0, MAX_MATCH_PLAYERS);
      if (mode === "tdm") {
        for (let index = selected.length - 1; index > 0; index -= 1) {
          const swap = Math.floor(Math.random() * (index + 1));
          [selected[index], selected[swap]] = [selected[swap], selected[index]];
        }
      }
      createMatch(mode, selected, now);
    }

    broadcastQueueStatus(mode, now);
  }
}

function removeFromQueue(socketId: string): void {
  const entry = queue.get(socketId);
  if (!entry) {
    return;
  }
  queue.delete(socketId);
  broadcastQueueStatus(entry.mode);
}

function removeFromMatch(socketId: string): void {
  const match = getMatchForSocket(socketId);
  if (!match) {
    return;
  }

  match.humanIds.delete(socketId);
  match.game.removePlayer(socketId);
  socketMatches.delete(socketId);
  io.to(match.room).emit("player_left", socketId);

  if (match.humanIds.size === 0) {
    match.emptySince = match.emptySince ?? Date.now();
  }
}

io.on("connection", (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  socket.on("queue_join", (payload: QueueJoinPayload) => {
    const mode = readMode(payload?.mode);
    if (!mode || queue.has(socket.id) || socketMatches.has(socket.id)) {
      return;
    }
    queue.set(socket.id, {
      socket,
      mode,
      name: sanitizeName(payload?.name),
      joinedAt: Date.now(),
    });
    broadcastQueueStatus(mode);
  });

  socket.on("queue_leave", () => {
    removeFromQueue(socket.id);
  });

  socket.on("client_ping", (callback) => {
    if (typeof callback === "function") {
      callback();
    }
  });

  socket.on("player_input", (payload: PlayerInputPayload) => {
    const match = getMatchForSocket(socket.id);
    if (!match) {
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
    const ads = readBoolean(payload?.ads);

    if (
      sequence === null ||
      !Number.isInteger(sequence) ||
      sequence <= 0 ||
      delta === null ||
      delta < 0 ||
      yaw === null ||
      pitch === null ||
      forward === null ||
      backward === null ||
      left === null ||
      right === null ||
      jump === null ||
      ads === null
    ) {
      return;
    }

    match.game.setInput(
      socket.id,
      { forward, backward, left, right, jump, yaw, ads },
      sequence,
      Date.now(),
    );
    match.game.setRotation(socket.id, pitch, yaw);
  });

  socket.on("player_shoot", (payload: PlayerShootPayload) => {
    const match = getMatchForSocket(socket.id);
    if (!match || !isWeaponId(payload?.weapon)) {
      return;
    }
    const direction = readVec3(payload?.direction);
    if (!direction) {
      return;
    }
    match.game.shoot(socket.id, direction, payload.weapon, Date.now());
  });

  socket.on("player_reload", () => {
    getMatchForSocket(socket.id)?.game.reload(socket.id, Date.now());
  });

  socket.on("player_throw_grenade", (payload) => {
    const match = getMatchForSocket(socket.id);
    const direction = readVec3(payload?.direction);
    if (!match || !direction) {
      return;
    }
    match.game.throwGrenade(socket.id, direction, Date.now());
  });

  socket.on("player_use_medkit", () => {
    getMatchForSocket(socket.id)?.game.useMedkit(socket.id);
  });

  socket.on("player_switch_weapon", (weapon: WeaponId) => {
    if (!isWeaponId(weapon)) {
      return;
    }
    getMatchForSocket(socket.id)?.game.selectWeapon(socket.id, weapon);
  });

  socket.on("disconnect", (reason) => {
    removeFromQueue(socket.id);
    removeFromMatch(socket.id);
    console.log(`Socket disconnected: ${socket.id} (${reason})`);
  });
});

setInterval(() => {
  runMatchmaker(Date.now());
}, 500);

setInterval(() => {
  const now = Date.now();
  for (const match of [...matches.values()]) {
    match.game.update(now, 1 / NETWORK_TICK_RATE);
    io.to(match.room).emit("game_state", match.game.getState(now));

    if (match.humanIds.size === 0) {
      if (match.emptySince === null) {
        match.emptySince = now;
      } else if (now - match.emptySince > 5000) {
        io.in(match.room).socketsLeave(match.room);
        matches.delete(match.id);
        console.log(`Match ${match.id} closed (empty)`);
      }
    }
  }
}, 1000 / NETWORK_TICK_RATE);

const parsedPort = Number(process.env.PORT);
const port =
  Number.isInteger(parsedPort) && parsedPort > 0 ? parsedPort : SERVER_PORT;

httpServer.listen(port, "0.0.0.0", () => {
  console.log(
    `Neon Arena server listening on http://localhost:${port} (${serveClient ? "client + api" : "api only"})`,
  );
});
