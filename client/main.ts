import * as THREE from "three";
import { io, type Socket } from "socket.io-client";
import "./style.css";
import {
  EYE_HEIGHT,
  MATCH_RESTART_MS,
  MAX_HEALTH,
  MAX_MATCH_PLAYERS,
  NETWORK_TICK_RATE,
} from "../shared/constants";
import {
  DEFAULT_RULES,
  GameSimulation,
  fillPracticeBots,
  type GameEvents,
} from "../shared/game";
import type {
  ClientToServerEvents,
  GameMode,
  GameRules,
  GameStatePayload,
  PlayerInputPayload,
  PlayerState,
  ServerToClientEvents,
  WeaponId,
} from "../shared/types";
import { WEAPONS, nextWeapon } from "../shared/weapons";
import { GameAudio } from "./audio";
import { CombatEffects } from "./effects";
import { GrenadeManager } from "./grenades";
import { Hud } from "./hud";
import { InputManager, IS_TOUCH_DEVICE } from "./input";
import { PickupManager } from "./pickups";
import { Gun, Player } from "./player";
import { RemoteManager } from "./remotes";
import { createWorld } from "./world";

type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) {
  throw new Error("Canvas #game-canvas not found");
}

const world = createWorld(canvas, IS_TOUCH_DEVICE);
const { renderer, scene, camera } = world;
camera.rotation.order = "YXZ";

const audio = new GameAudio();
const effects = new CombatEffects(
  scene,
  world.staticMeshes,
  audio,
  IS_TOUCH_DEVICE,
);
const remotes = new RemoteManager(scene, world.staticMeshes);
const grenades = new GrenadeManager(scene, audio);
const pickups = new PickupManager(scene);
const localPlayer = new Player(new THREE.Vector3(0, 0, 10), 0x66f6ff);
localPlayer.mesh.visible = false;
scene.add(localPlayer.mesh);
const gun = new Gun(IS_TOUCH_DEVICE);
camera.add(gun.object);
gun.object.visible = false;

const hud = new Hud();
const input = new InputManager();

const SERVER_URL =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? "";

let active = false;
let online = false;
let paused = false;
let matchOver = false;
let dead = false;
let respawnAt = 0;
let playerId = "";
let mode: GameMode = "tdm";
let rules: GameRules = DEFAULT_RULES;
let offlineGame: GameSimulation | null = null;
let socket: GameSocket | null = null;
let searchMode: GameMode | null = null;
let currentState: GameStatePayload | null = null;
let yaw = 0;
let pitch = 0;
let lastWeapon: WeaponId = "rifle";
let scopeIndex = 0;
let lastShotAt = 0;
let triggerWasDown = false;
let lastInputSentAt = 0;
let inputSequence = 0;
let lastPingAt = 0;
let pingInFlight = false;
let hasLockedOnce = false;
let lastDelta = 1 / 60;

const targetVector = new THREE.Vector3();
const lookDirection = new THREE.Vector3();

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function localState(): PlayerState | null {
  if (!currentState) {
    return null;
  }
  return (
    currentState.players.find((player) => player.id === playerId) ?? null
  );
}

function resetScopeIndex(weapon: WeaponId): void {
  const spec = WEAPONS[weapon];
  if (!spec.zoomLevels || spec.zoomLevels.length === 0) {
    scopeIndex = 0;
    return;
  }
  const base = spec.zoomLevels.findIndex(
    (level) => Math.abs(level.fov - spec.adsFov) < 0.01,
  );
  scopeIndex = base >= 0 ? base : 0;
}

function cycleScope(): void {
  const levels = WEAPONS[lastWeapon].zoomLevels;
  if (!levels || levels.length < 2 || !input.isAiming()) {
    return;
  }
  scopeIndex = (scopeIndex + 1) % levels.length;
}

function createOfflineEvents(): GameEvents {
  return {
    onShot: (shooterId, origin, direction, weapon) => {
      if (shooterId === playerId) {
        return;
      }
      effects.spawnRemoteShot(origin, direction, weapon);
    },
    onHit: (shooterId, _targetId, _damage, headshot) => {
      if (shooterId !== playerId) {
        return;
      }
      hud.flashHit(headshot);
      audio.playHit(headshot);
    },
    onKilled: (killerId, victimId, headshot, nextRespawnAt, killerWeapon) => {
      const killer = killerId
        ? (offlineGame?.getPlayer(killerId) ?? null)
        : null;
      const victim = offlineGame?.getPlayer(victimId) ?? null;
      hud.addKillFeed(
        killer?.name ?? "WORLD",
        victim?.name ?? "OPERATOR",
        headshot,
        killerWeapon,
      );
      if (victimId === playerId) {
        dead = true;
        respawnAt = nextRespawnAt;
        hud.showDeath({
          killerName: killer?.name ?? null,
          killerWeapon,
          headshot,
        });
        hud.updateDeathCountdown(respawnAt);
        audio.playDeath();
      }
    },
    onRespawn: (player) => {
      if (player.id === playerId) {
        handleLocalRespawn(player);
      }
    },
    onGrenadeThrown: (payload) => {
      grenades.spawn(payload);
    },
    onGrenadeExploded: (payload) => {
      grenades.explode(payload);
    },
    onPickup: (collectorId) => {
      if (collectorId === playerId) {
        audio.playPickup();
      }
    },
    onMatchOver: (winner, scores, restartIn) => {
      handleMatchOver(
        winner,
        scores,
        restartIn,
        offlineGame?.getState() ?? null,
      );
    },
  };
}

function startOffline(nextMode: GameMode): void {
  if (active) {
    return;
  }

  searchMode = null;
  if (socket) {
    const previous = socket;
    socket = null;
    previous.disconnect();
  }

  mode = nextMode;
  rules = hud.readModRules();
  playerId = "local";
  online = false;
  paused = false;
  matchOver = false;
  dead = false;
  respawnAt = 0;
  currentState = null;
  lastShotAt = 0;
  triggerWasDown = false;
  lastWeapon = "rifle";

  offlineGame = new GameSimulation(mode, rules, createOfflineEvents());
  const spawn = offlineGame.addPlayer(
    playerId,
    hud.getPlayerName(),
    mode === "tdm" ? "alpha" : "ffa",
    false,
  );
  fillPracticeBots(offlineGame);
  offlineGame.start();

  localPlayer.setRules(rules);
  localPlayer.reset(spawn.position);
  yaw = spawn.rotation.y;
  pitch = 0;
  gun.setWeapon(spawn.weapon);
  gun.object.visible = true;
  lastWeapon = spawn.weapon;
  resetScopeIndex(spawn.weapon);

  active = true;
  remotes.clear();
  grenades.clear();
  pickups.clear();
  hud.startMatch();
  hud.setConnection("LOCAL MATCH");
  hud.setPing("--");
  document.body.classList.add("playing");
  input.clear();
  input.setEnabled(true);
  syncState(offlineGame.getState(), true, 0);
  requestPointerLock();
}

function startOnline(nextMode: GameMode): void {
  if (active) {
    return;
  }
  searchMode = nextMode;
  hud.showSearching(nextMode);
  hud.setConnection("CONNECTING");
  hud.setPing("--");
  const client = ensureSocket();
  if (client.connected) {
    joinQueue(nextMode);
  }
}

function joinQueue(nextMode: GameMode): void {
  if (!socket?.connected || active) {
    return;
  }
  socket.emit("queue_join", {
    mode: nextMode,
    name: hud.getPlayerName(),
  });
}

function ensureSocket(): GameSocket {
  if (socket) {
    if (!socket.connected) {
      socket.connect();
    }
    return socket;
  }
  const client = io(SERVER_URL, {
    transports: ["websocket", "polling"],
  }) as GameSocket;
  socket = client;
  bindSocket(client);
  return client;
}

function bindSocket(client: GameSocket): void {
  client.on("connect", () => {
    if (socket !== client) {
      return;
    }
    hud.setConnection("ONLINE");
    if (searchMode && !active) {
      joinQueue(searchMode);
    }
  });

  client.on("connect_error", () => {
    if (socket !== client) {
      return;
    }
    hud.setConnection("OFFLINE");
    if (searchMode && !active) {
      hud.updateSearching("SERVER UNREACHABLE — RETRYING...");
    }
  });

  client.on("disconnect", () => {
    if (socket !== client) {
      return;
    }
    hud.setConnection("OFFLINE");
    if (online && active) {
      leaveToMenu();
      hud.setConnection("CONNECTION LOST");
      return;
    }
    if (searchMode) {
      hud.updateSearching("DISCONNECTED — RECONNECTING...");
    }
  });

  client.on("queue_status", (payload) => {
    if (socket !== client || active || !searchMode) {
      return;
    }
    const humans = Math.min(payload.players, MAX_MATCH_PLAYERS);
    hud.updateSearching(
      `${humans}/${MAX_MATCH_PLAYERS} IN QUEUE  ·  BOTS FILL IN ${payload.fillsWithBotsIn}s`,
    );
  });

  client.on("game_state", (payload) => {
    if (socket !== client) {
      return;
    }
    if (!active || !online) {
      if (searchMode) {
        startOnlineMatch(payload);
      }
      return;
    }
    syncState(payload, false, lastDelta);
  });

  client.on("player_shoot", (payload) => {
    if (socket !== client || payload.shooterId === playerId) {
      return;
    }
    effects.spawnRemoteShot(
      payload.origin,
      payload.direction,
      payload.weapon,
    );
  });

  client.on("player_hit", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    hud.flashHit(payload.headshot);
    audio.playHit(payload.headshot);
  });

  client.on("player_died", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    const killer = payload.killerId
      ? (currentState?.players.find(
          (player) => player.id === payload.killerId,
        ) ?? null)
      : null;
    const victim =
      currentState?.players.find(
        (player) => player.id === payload.playerId,
      ) ?? null;
    hud.addKillFeed(
      killer?.name ?? "WORLD",
      victim?.name ?? "OPERATOR",
      payload.headshot,
      payload.killerWeapon,
    );
    if (payload.playerId === playerId) {
      dead = true;
      respawnAt = payload.respawnAt;
      hud.showDeath({
        killerName: killer?.name ?? null,
        killerWeapon: payload.killerWeapon,
        headshot: payload.headshot,
      });
      hud.updateDeathCountdown(respawnAt);
      audio.playDeath();
    }
  });

  client.on("player_respawned", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    if (payload.id === playerId) {
      handleLocalRespawn(payload);
    } else {
      remotes.respawn(payload);
    }
  });

  client.on("player_left", (payload) => {
    if (socket !== client || payload === playerId) {
      return;
    }
    remotes.remove(payload);
  });

  client.on("grenade_thrown", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    grenades.spawn(payload);
  });

  client.on("grenade_exploded", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    grenades.explode(payload);
  });

  client.on("pickup_collected", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    if (payload.playerId === playerId) {
      audio.playPickup();
    }
  });

  client.on("match_over", (payload) => {
    if (socket !== client || !active) {
      return;
    }
    handleMatchOver(
      payload.winner,
      payload.scores,
      payload.restartIn,
      currentState,
    );
  });
}

function startOnlineMatch(payload: GameStatePayload): void {
  if (active) {
    return;
  }
  const local = payload.players.find(
    (player) => player.id === socket?.id,
  );
  if (!local) {
    return;
  }

  searchMode = null;
  active = true;
  online = true;
  paused = false;
  matchOver = false;
  dead = false;
  respawnAt = 0;
  playerId = local.id;
  mode = payload.mode;
  rules = payload.rules;
  currentState = payload;
  lastShotAt = 0;
  triggerWasDown = false;
  lastWeapon = local.weapon;

  localPlayer.setRules(rules);
  localPlayer.reset(local.position);
  yaw = local.rotation.y;
  pitch = 0;
  gun.setWeapon(local.weapon);
  gun.object.visible = true;
  resetScopeIndex(local.weapon);
  remotes.clear();
  grenades.clear();
  pickups.clear();
  hud.startMatch();
  hud.setConnection("ONLINE");
  document.body.classList.add("playing");
  input.clear();
  input.setEnabled(true);
  syncState(payload, false, 1 / 60);
  requestPointerLock();
}

function syncState(
  payload: GameStatePayload,
  authoritative: boolean,
  delta: number,
): void {
  const wasMatchOver = matchOver;
  currentState = payload;
  mode = payload.mode;
  rules = payload.rules;
  localPlayer.setRules(rules);
  grenades.sync(payload.grenades);
  pickups.sync(payload.pickups);
  hud.updateMinimap(payload, playerId);

  if (payload.matchOver) {
    if (!matchOver) {
      matchOver = true;
      paused = false;
      dead = false;
      hud.hidePause();
      hud.hideDeath();
      hud.showMatchOver(
        payload.winner ?? "draw",
        payload.scores,
        MATCH_RESTART_MS,
        payload,
      );
      input.setEnabled(false);
      input.clear();
      triggerWasDown = false;
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    }
  } else if (wasMatchOver) {
    matchOver = false;
    dead = false;
    respawnAt = 0;
    hud.hideMatchOver();
    hud.hideDeath();
    input.setEnabled(true);
    audio.playSpawn();
    requestPointerLock();
  }

  const local = payload.players.find((player) => player.id === playerId);
  if (!local) {
    remotes.sync(payload.players, playerId);
    return;
  }

  if (local.health <= 0) {
    if (!dead && !matchOver) {
      dead = true;
      respawnAt = Date.now() + 3000;
      hud.showDeath();
      audio.playDeath();
    }
  } else if (dead) {
    handleLocalRespawn(local);
  }

  targetVector.set(
    local.position.x,
    local.position.y,
    local.position.z,
  );
  if (authoritative) {
    localPlayer.snapTo(local.position);
  } else {
    const distance = localPlayer.position.distanceTo(targetVector);
    if (distance > 3 || local.health <= 0) {
      localPlayer.snapTo(local.position);
    } else {
      const blend = 1 - Math.exp(-18 * Math.max(delta, 1 / 120));
      localPlayer.smoothTo(targetVector, blend);
    }
  }

  if (local.weapon !== lastWeapon) {
    lastWeapon = local.weapon;
    gun.setWeapon(local.weapon);
    resetScopeIndex(local.weapon);
    lastShotAt = 0;
  }

  hud.setHealth(local.health);
  hud.setArmor(local.armor);
  hud.updateUtilities(local.medkits, local.grenades);
  hud.updateWeapon(
    local.weapon,
    local.ammo,
    local.reserveAmmo,
    local.reloading,
  );
  hud.updateTimer(payload.matchTime);
  hud.updateTeam(payload);
  hud.updateScoreboard(payload.players, playerId);
  remotes.sync(payload.players, playerId);
}

function handleLocalRespawn(player: PlayerState): void {
  dead = false;
  respawnAt = 0;
  hud.hideDeath();
  localPlayer.reset(player.position);
  yaw = player.rotation.y;
  pitch = 0;
  lastWeapon = player.weapon;
  gun.setWeapon(player.weapon);
  resetScopeIndex(player.weapon);
  if (!matchOver) {
    audio.playSpawn();
    input.setEnabled(true);
  }
}

function handleMatchOver(
  winner: "alpha" | "bravo" | "draw",
  scores: Record<"alpha" | "bravo", number>,
  restartIn: number,
  state: GameStatePayload | null,
): void {
  if (!active) {
    return;
  }
  if (!state) {
    state = {
      players: [],
      grenades: [],
      pickups: [],
      matchTime: 0,
      mode,
      scores,
      rules,
      matchOver: true,
      winner,
    };
  }
  matchOver = true;
  paused = false;
  dead = false;
  hud.hidePause();
  hud.hideDeath();
  hud.showMatchOver(winner, scores, restartIn, state);
  input.setEnabled(false);
  input.clear();
  triggerWasDown = false;
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

function requestReload(): void {
  const local = localState();
  if (!local || local.health <= 0 || local.reloading) {
    return;
  }
  const spec = WEAPONS[local.weapon];
  if (local.ammo >= spec.magazine) {
    return;
  }
  if (local.reserveAmmo <= 0 && !rules.infiniteAmmo) {
    return;
  }
  gun.reload(spec.reloadTimeMs);
  audio.playReload();
  if (offlineGame) {
    offlineGame.reload(playerId, Date.now());
  } else {
    socket?.emit("player_reload");
  }
}

function requestWeapon(weapon: WeaponId): void {
  if (weapon === lastWeapon) {
    return;
  }
  lastWeapon = weapon;
  lastShotAt = 0;
  gun.setWeapon(weapon);
  resetScopeIndex(weapon);
  if (offlineGame) {
    offlineGame.selectWeapon(playerId, weapon);
  } else {
    socket?.emit("player_switch_weapon", weapon);
  }
}

function handleInputActions(): void {
  if (input.consumeReload()) {
    requestReload();
  }
  if (input.consumeSwitch()) {
    requestWeapon(nextWeapon(lastWeapon));
  }
  if (input.consumeScope()) {
    cycleScope();
  }
  if (input.consumeGrenade()) {
    requestGrenade();
  }
  if (input.consumeMedkit()) {
    requestMedkit();
  }
  const slot = input.consumeWeaponSlot();
  if (slot) {
    requestWeapon(slot);
  }
}

function requestGrenade(): void {
  const local = localState();
  if (!local || local.health <= 0 || matchOver || dead) {
    return;
  }
  if (local.grenades <= 0) {
    audio.playEmpty();
    return;
  }
  camera.getWorldDirection(lookDirection);
  if (offlineGame) {
    offlineGame.throwGrenade(
      playerId,
      lookDirection,
      Date.now(),
    );
  } else {
    socket?.emit("player_throw_grenade", {
      direction: {
        x: lookDirection.x,
        y: lookDirection.y,
        z: lookDirection.z,
      },
    });
  }
}

function requestMedkit(): void {
  const local = localState();
  if (
    !local ||
    local.health <= 0 ||
    local.health >= MAX_HEALTH ||
    local.medkits <= 0 ||
    matchOver ||
    dead
  ) {
    return;
  }
  if (offlineGame) {
    offlineGame.useMedkit(playerId);
  } else {
    socket?.emit("player_use_medkit");
  }
  audio.playPickup();
}

function attemptShoot(): void {
  const local = localState();
  if (!local || local.health <= 0 || matchOver || dead) {
    return;
  }
  if (local.reloading) {
    return;
  }
  if (local.ammo <= 0) {
    audio.playEmpty();
    requestReload();
    return;
  }

  camera.getWorldDirection(lookDirection);
  gun.fire();
  audio.playShoot(local.weapon);
  effects.fireLocal(camera.position, lookDirection, remotes, local.weapon);

  if (offlineGame) {
    offlineGame.shoot(
      playerId,
      lookDirection,
      local.weapon,
      Date.now(),
    );
  } else {
    socket?.emit("player_shoot", {
      direction: {
        x: lookDirection.x,
        y: lookDirection.y,
        z: lookDirection.z,
      },
      weapon: local.weapon,
    });
  }
}

function sendInput(now: number): void {
  if (!socket?.connected) {
    return;
  }
  const elapsed = Math.max(
    1 / 120,
    Math.min(0.1, (now - lastInputSentAt) / 1000),
  );
  const payload: PlayerInputPayload = {
    forward: input.isMovingForward(),
    backward: input.isMovingBackward(),
    left: input.isMovingLeft(),
    right: input.isMovingRight(),
    jump: input.isJumping(),
    yaw,
    pitch,
    ads: input.isAiming(),
    sequence: inputSequence + 1,
    delta: elapsed,
  };
  inputSequence += 1;
  lastInputSentAt = now;
  socket.emit("player_input", payload);
}

function requestPointerLock(): void {
  const target = canvas;
  if (!target || IS_TOUCH_DEVICE || document.pointerLockElement === target) {
    return;
  }
  try {
    const result = target.requestPointerLock() as unknown as
      | Promise<void>
      | undefined;
    if (result && typeof result.catch === "function") {
      result.catch(() => undefined);
    }
  } catch {
    return;
  }
}

function pauseGame(): void {
  if (!active || paused || matchOver) {
    return;
  }
  paused = true;
  triggerWasDown = false;
  input.setEnabled(false);
  input.clear();
  hud.showPause();
  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
}

function resumeGame(): void {
  if (!active) {
    return;
  }
  paused = false;
  hud.hidePause();
  if (!matchOver) {
    input.setEnabled(true);
    requestPointerLock();
  }
}

function cancelSearch(): void {
  if (active) {
    return;
  }
  searchMode = null;
  socket?.emit("queue_leave");
  hud.showMenu();
  hud.setConnection(socket?.connected ? "ONLINE" : "LOCAL");
}

function leaveToMenu(): void {
  const previous = socket;
  socket = null;
  searchMode = null;
  active = false;
  online = false;
  paused = false;
  matchOver = false;
  dead = false;
  respawnAt = 0;
  playerId = "";
  currentState = null;
  offlineGame = null;
  triggerWasDown = false;
  lastShotAt = 0;
  lastWeapon = "rifle";
  hasLockedOnce = false;

  if (previous) {
    previous.emit("queue_leave");
    previous.disconnect();
  }

  if (document.pointerLockElement) {
    document.exitPointerLock();
  }
  input.setEnabled(false);
  input.clear();
  remotes.clear();
  grenades.clear();
  pickups.clear();
  gun.object.visible = false;
  localPlayer.mesh.visible = false;
  localPlayer.reset({ x: 0, y: 0, z: 10 });
  yaw = 0;
  pitch = 0;
  document.body.classList.remove("playing");
  hud.showMenu();
  hud.hideDeath();
  hud.hidePause();
  hud.hideMatchOver();
  hud.setConnection("LOCAL");
  hud.setPing("--");
  hud.setLockHint(false);
}

function updateCamera(delta: number): void {
  if (!active) {
    gun.object.visible = false;
    camera.position.set(0, 2.5, 14);
    camera.lookAt(0, 1.4, 0);
    hud.setEnemyTarget(false);
    hud.setAiming(false, false);
    if (camera.fov !== 75) {
      camera.fov = 75;
      camera.updateProjectionMatrix();
    }
    return;
  }

  const local = localState();
  if (local) {
    camera.position.set(
      localPlayer.position.x,
      localPlayer.position.y + EYE_HEIGHT,
      localPlayer.position.z,
    );
  }
  camera.rotation.set(pitch, yaw, 0, "YXZ");

  if (local) {
    camera.getWorldDirection(lookDirection);
    hud.setEnemyTarget(
      effects.enemyUnderAim(
        camera.position,
        lookDirection,
        remotes,
        local.team,
        mode,
      ),
    );
  } else {
    hud.setEnemyTarget(false);
  }

  const aiming =
    !paused && !matchOver && !dead && input.isAiming();
  const spec = WEAPONS[lastWeapon];
  const zoomLevel = spec.zoomLevels?.[scopeIndex];
  const adsFov = zoomLevel?.fov ?? spec.adsFov;
  const scoped = aiming && spec.scopeOverlay === true;
  const targetFov = aiming ? adsFov : 75;
  const nextFov = THREE.MathUtils.damp(camera.fov, targetFov, 14, delta);
  if (Math.abs(nextFov - camera.fov) > 0.02) {
    camera.fov = nextFov;
    camera.updateProjectionMatrix();
  }

  hud.setAiming(
    aiming,
    scoped,
    zoomLevel?.label ?? "",
    (spec.zoomLevels?.length ?? 0) > 1,
  );
  gun.setAiming(aiming);
  gun.update(delta);
  gun.object.visible = !matchOver && !dead;
}

function animate(): void {
  window.requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  lastDelta = delta;
  const now = performance.now();
  const canControl =
    active && !paused && !matchOver && !dead && !searchMode;

  if (canControl) {
    const look = input.consumeLookDelta();
    if (look.x !== 0 || look.y !== 0) {
      const zoomScale = THREE.MathUtils.clamp(camera.fov / 75, 0.25, 1);
      const sensitivity =
        (IS_TOUCH_DEVICE ? 0.0032 : 0.0022) * zoomScale;
      yaw -= look.x * sensitivity;
      pitch = clamp(
        pitch - look.y * sensitivity,
        -Math.PI / 2 + 0.02,
        Math.PI / 2 - 0.02,
      );
    }

    handleInputActions();

    if (online && socket?.connected) {
      if (now - lastInputSentAt >= 1000 / NETWORK_TICK_RATE) {
        sendInput(now);
      }
    }

    const shooting = input.isShooting();
    const local = localState();
    const spec = WEAPONS[lastWeapon];
    const canFire =
      shooting &&
      local !== null &&
      local.health > 0 &&
      !local.reloading &&
      (document.pointerLockElement === canvas || IS_TOUCH_DEVICE);
    if (
      canFire &&
      now - lastShotAt >= spec.fireIntervalMs &&
      (spec.automatic || !triggerWasDown)
    ) {
      attemptShoot();
      lastShotAt = now;
    }
    triggerWasDown = shooting;
  } else {
    input.consumeLookDelta();
    triggerWasDown = false;
  }

  if (offlineGame && active && !paused) {
    if (canControl) {
      offlineGame.setInput(
        playerId,
        {
          forward: input.isMovingForward(),
          backward: input.isMovingBackward(),
          left: input.isMovingLeft(),
          right: input.isMovingRight(),
          jump: input.isJumping(),
          yaw,
          ads: input.isAiming(),
        },
        0,
        Date.now(),
      );
      offlineGame.setRotation(playerId, pitch, yaw);
    }
    offlineGame.update(Date.now(), delta);
    syncState(offlineGame.getState(), true, delta);
  }

  if (dead && respawnAt > 0) {
    hud.updateDeathCountdown(respawnAt);
  }
  if (matchOver) {
    hud.updateMatchRestart();
  }

  if (
    online &&
    socket?.connected &&
    now - lastPingAt > 2000 &&
    !pingInFlight
  ) {
    lastPingAt = now;
    pingInFlight = true;
    const sentAt = performance.now();
    socket.emit("client_ping", () => {
      pingInFlight = false;
      hud.setPing(`${Math.round(performance.now() - sentAt)} MS`);
    });
    window.setTimeout(() => {
      pingInFlight = false;
    }, 4000);
  }

  hud.setLockHint(
    active &&
      !paused &&
      !matchOver &&
      !searchMode &&
      !IS_TOUCH_DEVICE &&
      document.pointerLockElement === null,
  );

  updateCamera(delta);
  effects.update(delta);
  remotes.updateVisuals(delta);
  grenades.update(delta);
  pickups.update(delta);
  renderer.render(scene, camera);
}

function onResize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

const clock = new THREE.Clock();

hud.bindMenu({
  offlineTdm: () => startOffline("tdm"),
  offlineFfa: () => startOffline("ffa"),
  onlineTdm: () => startOnline("tdm"),
  onlineFfa: () => startOnline("ffa"),
});

hud.bindGame({
  resume: resumeGame,
  leave: leaveToMenu,
  cancelSearch,
  pause: pauseGame,
  selectWeapon: requestWeapon,
});

document.body.classList.toggle("touch", IS_TOUCH_DEVICE);
localPlayer.reset({ x: 0, y: 0, z: 10 });
resetScopeIndex("rifle");
hud.showMenu();
hud.setConnection("LOCAL");
hud.setPing("--");
input.setEnabled(false);

canvas.addEventListener("click", () => {
  if (active && !paused && !matchOver && !IS_TOUCH_DEVICE) {
    requestPointerLock();
  }
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas) {
    hasLockedOnce = true;
    hud.setLockHint(false);
    if (active && !paused && !matchOver) {
      input.setEnabled(true);
    }
    return;
  }

  hud.setLockHint(active && !paused && !matchOver);
  if (hasLockedOnce && active && !paused && !matchOver) {
    pauseGame();
  }
});

document.addEventListener("pointerlockerror", () => {
  hud.setLockHint(active && !paused && !matchOver);
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden && active && !paused && !matchOver) {
    pauseGame();
  }
});

window.addEventListener("resize", onResize);
window.requestAnimationFrame(animate);
