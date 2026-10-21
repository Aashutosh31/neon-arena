import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import { io, type Socket } from "socket.io-client";
import {
  EYE_HEIGHT,
  MAX_HEALTH,
  NETWORK_TICK_RATE,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "../shared/constants";
import { ARENA_COVER } from "../shared/map";
import type {
  ClientToServerEvents,
  PlayerState,
  ServerToClientEvents,
} from "../shared/types";
import { GameAudio } from "./audio";
import { InputManager } from "./input";
import { Gun, Player } from "./player";

/*
 * ---------------------------------------------------------------------------
 * Renderer
 * ---------------------------------------------------------------------------
 * - antialias: false  -> cheapest option on Intel HD 620. Turn on only if the
 *   jagged edges bother you; MSAA is one of the first things to eat GPU time.
 * - powerPreference: "low-power" -> hints the browser to use the integrated GPU
 *   efficiently rather than forcing a high-performance profile.
 * - The pixel ratio is clamped to 2 because rendering at 3x or 4x on a HiDPI
 *   display quadruples fragment work for almost no visible benefit.
 * - `alpha: false` lets the renderer skip compositing with the page background.
 */
const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
if (!canvas) {
  throw new Error("Canvas #game-canvas not found");
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "low-power",
  alpha: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);

/*
 * ---------------------------------------------------------------------------
 * Scene
 * ---------------------------------------------------------------------------
 * A near-black background keeps the neon grid as the main light source and
 * avoids drawing a skybox/background texture.
 */
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a0a);

// Eye-level camera (1.6m) looking down -Z toward the arena.
const camera = new THREE.PerspectiveCamera(
  75,
  window.innerWidth / window.innerHeight,
  0.1,
  1000,
);
camera.position.set(0, EYE_HEIGHT, 5);

/*
 * The camera must be part of the scene graph for its children (the gun) to be
 * rendered. The gun lives in camera space so it follows the view for free.
 */
scene.add(camera);

const gun = new Gun();
camera.add(gun.object);

/*
 * ---------------------------------------------------------------------------
 * Floor
 * ---------------------------------------------------------------------------
 * GridHelper is a single line-segment object, so it costs one draw call and no
 * textures. 50x50 divisions gives 1m cells across a 50m arena.
 */
const grid = new THREE.GridHelper(50, 50, 0x00ffff, 0x00ffff);
scene.add(grid);

/*
 * ---------------------------------------------------------------------------
 * Lights
 * ---------------------------------------------------------------------------
 * One ambient light for base visibility and one directional light for shape.
 * No shadow maps: shadows are a major cost on low-end GPUs and the art style
 * can fake them later with blob shadows.
 */
const ambientLight = new THREE.AmbientLight(0x404040, 1);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 7);
scene.add(directionalLight);

const floorMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 50),
  new THREE.MeshBasicMaterial({ color: 0x050508 }),
);
floorMesh.rotation.x = -Math.PI / 2;
floorMesh.position.y = -0.01;
scene.add(floorMesh);

const staticMeshes: THREE.Object3D[] = [floorMesh];
const coverGeometry = new THREE.BoxGeometry(1, 1, 1);
const coverEdgeGeometry = new THREE.EdgesGeometry(coverGeometry);
const coverMaterial = new THREE.MeshStandardMaterial({
  color: 0x0a1020,
  emissive: 0x003344,
  emissiveIntensity: 0.9,
  roughness: 0.55,
  metalness: 0.2,
  flatShading: true,
});
const coverEdgeMaterial = new THREE.LineBasicMaterial({
  color: 0x00ffff,
  transparent: true,
  opacity: 0.55,
});

for (const box of ARENA_COVER) {
  const mesh = new THREE.Mesh(coverGeometry, coverMaterial);
  mesh.position.set(box.x, box.height / 2, box.z);
  mesh.scale.set(box.width, box.height, box.depth);

  const edges = new THREE.LineSegments(coverEdgeGeometry, coverEdgeMaterial);
  mesh.add(edges);

  scene.add(mesh);
  staticMeshes.push(mesh);
}

const audio = new GameAudio();

/*
 * ---------------------------------------------------------------------------
 * Player + input
 * ---------------------------------------------------------------------------
 * The local mesh is hidden locally: the camera is inside the capsule and other
 * clients render their own copy of us from network snapshots. That also saves
 * one draw call.
 */
const input = new InputManager();
const player = new Player(new THREE.Vector3(0, 0, 5));
scene.add(player.mesh);
player.mesh.visible = false;

/*
 * ---------------------------------------------------------------------------
 * Mouse look
 * ---------------------------------------------------------------------------
 * PointerLockControls only rotates the camera; positioning is driven by the
 * simulated player below. Click the canvas to capture the mouse, Esc to release.
 */
const controls = new PointerLockControls(camera, renderer.domElement);
const lockHint = document.querySelector<HTMLDivElement>("#lock-hint");

renderer.domElement.addEventListener("click", () => {
  // While locked, clicks are shots; requesting the lock again is pointless.
  if (!controls.isLocked) {
    controls.lock();
  }
});

controls.addEventListener("lock", () => {
  if (lockHint) {
    lockHint.style.display = "none";
  }
});

controls.addEventListener("unlock", () => {
  // Prevent keys held during Esc from staying "pressed" after unlock.
  input.clear();
  if (lockHint) {
    lockHint.style.display = "block";
  }
});

/*
 * ---------------------------------------------------------------------------
 * Networking
 * ---------------------------------------------------------------------------
 * The socket receives authoritative snapshots and only sends the local pose at
 * 20hz. Remote capsules interpolate toward their latest server target so 20hz
 * data still looks smooth at 60fps.
 */
interface RemotePlayer {
  mesh: THREE.Mesh;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
}

const REMOTE_LERP_RATE = 15;
const SEND_INTERVAL_MS = 1000 / NETWORK_TICK_RATE;
// Small prediction errors are ignored; large ones indicate a real desync.
const RECONCILE_DISTANCE_SQ = 0.5 * 0.5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

// One geometry/material shared by every remote capsule to keep RAM and draw
// state changes low. Never dispose these when a single player leaves.
const remoteGeometry = new THREE.CapsuleGeometry(
  PLAYER_RADIUS,
  PLAYER_HEIGHT - PLAYER_RADIUS * 2,
  4,
  8,
);
const remoteMaterial = new THREE.MeshStandardMaterial({
  color: 0xff5500,
  emissive: 0xff3300,
  emissiveIntensity: 0.8,
  flatShading: true,
  roughness: 0.6,
  metalness: 0,
});

const remotePlayers = new Map<string, RemotePlayer>();
const remoteMeshes: THREE.Mesh[] = [];
const hittableTargets: THREE.Object3D[] = [...staticMeshes];
const connectionStatus =
  document.querySelector<HTMLDivElement>("#connection-status");
const crosshair = document.querySelector<HTMLDivElement>("#crosshair");
const healthBar = document.querySelector<HTMLDivElement>("#health-bar");
const healthFill = document.querySelector<HTMLDivElement>("#health-fill");
const healthLabel = document.querySelector<HTMLDivElement>("#health-label");
const hitMarker = document.querySelector<HTMLDivElement>("#hit-marker");
const deathOverlay = document.querySelector<HTMLDivElement>("#death-overlay");
const matchTimer = document.querySelector<HTMLDivElement>("#match-timer");
const scoreboardRows =
  document.querySelector<HTMLDivElement>("#scoreboard-rows");

let localHealth = MAX_HEALTH;
let localDead = false;
let hitMarkerTimeout = 0;
let lastTimerText = "";
let lastTimerLow = false;
let scoreboardSignature = "";

function setLocalHealth(health: number): void {
  const clamped = Math.max(0, Math.min(MAX_HEALTH, Math.round(health)));
  if (clamped === localHealth) {
    return;
  }

  localHealth = clamped;
  if (healthFill) {
    healthFill.style.width = `${(clamped / MAX_HEALTH) * 100}%`;
  }
  if (healthLabel) {
    healthLabel.textContent = `HP ${clamped}`;
  }
  healthBar?.classList.toggle("low", clamped <= 25);
}

function flashHitMarker(): void {
  if (!hitMarker) {
    return;
  }

  hitMarker.style.opacity = "1";
  window.clearTimeout(hitMarkerTimeout);
  hitMarkerTimeout = window.setTimeout(() => {
    hitMarker.style.opacity = "0";
  }, 100);
}

function formatMatchTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${minutes}:${remainder.toString().padStart(2, "0")}`;
}

function updateMatchTimer(matchTime: number): void {
  const text = formatMatchTime(matchTime);
  if (text !== lastTimerText) {
    lastTimerText = text;
    if (matchTimer) {
      matchTimer.textContent = text;
    }
  }

  const low = matchTime <= 10;
  if (low !== lastTimerLow) {
    lastTimerLow = low;
    matchTimer?.classList.toggle("low", low);
  }
}

function updateScoreboard(players: PlayerState[]): void {
  let signature = "";
  for (const player of players) {
    signature += `${player.id}:${player.kills}:${player.deaths}|`;
  }

  if (signature === scoreboardSignature || !scoreboardRows) {
    return;
  }
  scoreboardSignature = signature;

  const sorted = [...players].sort(
    (a, b) =>
      b.kills - a.kills ||
      a.deaths - b.deaths ||
      a.id.localeCompare(b.id),
  );
  const fragment = document.createDocumentFragment();

  for (const player of sorted) {
    const row = document.createElement("div");
    row.className = "score-row";

    const name = document.createElement("span");
    const isLocal = player.id === socket.id;
    name.className = isLocal ? "score-name local" : "score-name";
    name.textContent = isLocal
      ? "YOU"
      : player.id.slice(-4).toUpperCase();

    const score = document.createElement("span");
    score.className = "score-kd";
    score.textContent = `${player.kills} / ${player.deaths}`;

    row.append(name, score);
    fragment.append(row);
  }

  scoreboardRows.replaceChildren(fragment);
}

function setRemoteAlive(remote: RemotePlayer, alive: boolean): void {
  remote.mesh.visible = alive;

  const meshIndex = remoteMeshes.indexOf(remote.mesh);
  const targetIndex = hittableTargets.indexOf(remote.mesh);

  if (alive) {
    if (meshIndex === -1) {
      remoteMeshes.push(remote.mesh);
    }
    if (targetIndex === -1) {
      hittableTargets.push(remote.mesh);
    }
    return;
  }

  if (meshIndex !== -1) {
    remoteMeshes.splice(meshIndex, 1);
  }
  if (targetIndex !== -1) {
    hittableTargets.splice(targetIndex, 1);
  }
}

/*
 * ---------------------------------------------------------------------------
 * Shooting visuals
 * ---------------------------------------------------------------------------
 * One Raycaster is reused for aim feedback and firing. Tracers come from a
 * fixed-size pool so firing never allocates geometry or materials at runtime.
 */
const SHOOT_COOLDOWN_MS = 200;
const TRACER_RANGE = 100;
const TRACER_LIFETIME = 0.05;
const TRACER_POOL_SIZE = 16;

const raycaster = new THREE.Raycaster();
raycaster.far = TRACER_RANGE;

// Reused scratch vectors; no per-frame Vector3 construction.
const tracerEnd = new THREE.Vector3();
const remoteShotOrigin = new THREE.Vector3();
const remoteShotDirection = new THREE.Vector3();
const remoteTracerEnd = new THREE.Vector3();
const impactNormal = new THREE.Vector3();

const tracerMaterial = new THREE.LineBasicMaterial({
  color: 0x66ffff,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});

interface Tracer {
  line: THREE.Line;
  remaining: number;
}

const tracers: Tracer[] = [];

for (let i = 0; i < TRACER_POOL_SIZE; i += 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(6), 3),
  );

  const line = new THREE.Line(geometry, tracerMaterial);
  line.visible = false;
  line.frustumCulled = false;
  scene.add(line);

  tracers.push({ line, remaining: 0 });
}

let nextTracerIndex = 0;

function spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
  const tracer = tracers[nextTracerIndex];
  nextTracerIndex = (nextTracerIndex + 1) % tracers.length;

  const positions = tracer.line.geometry.getAttribute(
    "position",
  ) as THREE.BufferAttribute;
  positions.setXYZ(0, from.x, from.y, from.z);
  positions.setXYZ(1, to.x, to.y, to.z);
  positions.needsUpdate = true;

  tracer.remaining = TRACER_LIFETIME;
  tracer.line.visible = true;
}

function updateTracers(delta: number): void {
  for (const tracer of tracers) {
    if (!tracer.line.visible) {
      continue;
    }

    tracer.remaining -= delta;
    if (tracer.remaining <= 0) {
      tracer.line.visible = false;
    }
  }
}

const SPARK_POOL_SIZE = 36;
const SPARK_LIFETIME = 0.2;
const SPARK_SIZE = 0.09;
const SPARK_GRAVITY = -9;

const sparkPositions = new Float32Array(SPARK_POOL_SIZE * 3);
const sparkColors = new Float32Array(SPARK_POOL_SIZE * 3);
const sparkBaseColors = new Float32Array(SPARK_POOL_SIZE * 3);
const sparkVelocities = new Float32Array(SPARK_POOL_SIZE * 3);
const sparkRemaining = new Float32Array(SPARK_POOL_SIZE);

for (let i = 0; i < SPARK_POOL_SIZE; i += 1) {
  sparkPositions[i * 3 + 1] = -100;
}

const sparkGeometry = new THREE.BufferGeometry();
const sparkPositionAttribute = new THREE.BufferAttribute(
  sparkPositions,
  3,
).setUsage(THREE.DynamicDrawUsage);
const sparkColorAttribute = new THREE.BufferAttribute(
  sparkColors,
  3,
).setUsage(THREE.DynamicDrawUsage);
sparkGeometry.setAttribute("position", sparkPositionAttribute);
sparkGeometry.setAttribute("color", sparkColorAttribute);

const sparkMaterial = new THREE.PointsMaterial({
  size: SPARK_SIZE,
  sizeAttenuation: true,
  vertexColors: true,
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  toneMapped: false,
});

const impactSparks = new THREE.Points(sparkGeometry, sparkMaterial);
impactSparks.frustumCulled = false;
scene.add(impactSparks);

let sparkCursor = 0;
let sparksDirty = false;

function spawnImpactSparks(point: THREE.Vector3, normal: THREE.Vector3): void {
  const count = 3 + Math.floor(Math.random() * 3);

  for (let particle = 0; particle < count; particle += 1) {
    const index = sparkCursor;
    sparkCursor = (sparkCursor + 1) % SPARK_POOL_SIZE;
    const offset = index * 3;

    sparkPositions[offset] = point.x + normal.x * 0.02;
    sparkPositions[offset + 1] = point.y + normal.y * 0.02;
    sparkPositions[offset + 2] = point.z + normal.z * 0.02;

    const speed = 1.5 + Math.random() * 2.5;
    sparkVelocities[offset] =
      (normal.x * 0.8 + (Math.random() - 0.5) * 1.3) * speed;
    sparkVelocities[offset + 1] =
      (normal.y * 0.8 + Math.random() * 1.1) * speed;
    sparkVelocities[offset + 2] =
      (normal.z * 0.8 + (Math.random() - 0.5) * 1.3) * speed;

    const yellow = Math.random() < 0.45;
    sparkBaseColors[offset] = yellow ? 1 : 0.2;
    sparkBaseColors[offset + 1] = 1;
    sparkBaseColors[offset + 2] = yellow ? 0.3 : 1;
    sparkColors[offset] = sparkBaseColors[offset];
    sparkColors[offset + 1] = sparkBaseColors[offset + 1];
    sparkColors[offset + 2] = sparkBaseColors[offset + 2];

    sparkRemaining[index] = SPARK_LIFETIME;
  }

  sparksDirty = true;
}

function updateImpactSparks(delta: number): void {
  let changed = false;

  for (let index = 0; index < SPARK_POOL_SIZE; index += 1) {
    if (sparkRemaining[index] <= 0) {
      continue;
    }

    const offset = index * 3;
    sparkRemaining[index] -= delta;

    if (sparkRemaining[index] <= 0) {
      sparkColors[offset] = 0;
      sparkColors[offset + 1] = 0;
      sparkColors[offset + 2] = 0;
      sparkPositions[offset + 1] = -100;
      changed = true;
      continue;
    }

    sparkVelocities[offset + 1] += SPARK_GRAVITY * delta;
    sparkPositions[offset] += sparkVelocities[offset] * delta;
    sparkPositions[offset + 1] += sparkVelocities[offset + 1] * delta;
    sparkPositions[offset + 2] += sparkVelocities[offset + 2] * delta;

    if (sparkPositions[offset + 1] < 0.01) {
      sparkPositions[offset + 1] = 0.01;
      sparkVelocities[offset + 1] *= -0.35;
      sparkVelocities[offset] *= 0.7;
      sparkVelocities[offset + 2] *= 0.7;
    }

    const fade = sparkRemaining[index] / SPARK_LIFETIME;
    sparkColors[offset] = sparkBaseColors[offset] * fade;
    sparkColors[offset + 1] = sparkBaseColors[offset + 1] * fade;
    sparkColors[offset + 2] = sparkBaseColors[offset + 2] * fade;
    changed = true;
  }

  if (changed || sparksDirty) {
    sparkPositionAttribute.needsUpdate = true;
    sparkColorAttribute.needsUpdate = true;
    sparksDirty = false;
  }
}

const socketUrl = import.meta.env.VITE_SERVER_URL || window.location.origin;
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(
  socketUrl,
  { autoConnect: false },
);

function setConnectionStatus(text: string): void {
  if (connectionStatus) {
    connectionStatus.textContent = text;
  }
}

function spawnRemotePlayer(state: PlayerState): RemotePlayer {
  const existing = remotePlayers.get(state.id);
  if (existing) {
    return existing;
  }

  const mesh = new THREE.Mesh(remoteGeometry, remoteMaterial);
  mesh.position.set(
    state.position.x,
    state.position.y + PLAYER_HEIGHT / 2,
    state.position.z,
  );

  const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
    WORLD_UP,
    state.rotation.y,
  );
  mesh.quaternion.copy(targetQuaternion);

  const alive = state.health > 0;
  mesh.visible = alive;

  scene.add(mesh);

  const remote: RemotePlayer = {
    mesh,
    targetPosition: mesh.position.clone(),
    targetQuaternion,
  };
  remotePlayers.set(state.id, remote);
  setRemoteAlive(remote, alive);
  return remote;
}

function updateRemoteTarget(state: PlayerState): void {
  const remote = remotePlayers.get(state.id) ?? spawnRemotePlayer(state);

  remote.targetPosition.set(
    state.position.x,
    state.position.y + PLAYER_HEIGHT / 2,
    state.position.z,
  );
  remote.targetQuaternion.setFromAxisAngle(WORLD_UP, state.rotation.y);

  // Death events hide instantly; snapshots also enforce it for late joiners.
  if (state.health <= 0) {
    setRemoteAlive(remote, false);
  }
}

function removeRemotePlayer(id: string): void {
  const remote = remotePlayers.get(id);
  if (!remote) {
    return;
  }

  scene.remove(remote.mesh);
  remotePlayers.delete(id);

  const meshIndex = remoteMeshes.indexOf(remote.mesh);
  if (meshIndex !== -1) {
    remoteMeshes.splice(meshIndex, 1);
  }

  const targetIndex = hittableTargets.indexOf(remote.mesh);
  if (targetIndex !== -1) {
    hittableTargets.splice(targetIndex, 1);
  }
  // Geometry/material are shared, so they stay alive for future players.
}

function clearRemotePlayers(): void {
  for (const id of [...remotePlayers.keys()]) {
    removeRemotePlayer(id);
  }
}

let receivedInitialState = false;

socket.on("connect", () => {
  setConnectionStatus("ONLINE");

  // A new socket means the server created a fresh, full-health player.
  localDead = false;
  deathOverlay?.classList.remove("visible");
  gun.object.visible = true;
  setLocalHealth(MAX_HEALTH);
});

socket.on("disconnect", () => {
  setConnectionStatus("OFFLINE");
  clearRemotePlayers();
  receivedInitialState = false;

  lastTimerText = "--:--";
  lastTimerLow = false;
  if (matchTimer) {
    matchTimer.textContent = lastTimerText;
    matchTimer.classList.remove("low");
  }
  scoreboardSignature = "";
  scoreboardRows?.replaceChildren();
});

socket.on("connect_error", () => {
  setConnectionStatus("SERVER OFFLINE");
});

socket.on("game_state", ({ players, matchTime }) => {
  const seen = new Set<string>();

  for (const state of players) {
    if (state.id === socket.id) {
      // The server assigns the spawn point, so adopt it once on join/rejoin.
      if (!receivedInitialState) {
        player.reset(state.position);
      } else if (!localDead) {
        /*
         * Reconciliation: the client already simulated this input locally, so
         * the server position normally lags slightly. Only snap when the gap is
         * large enough to be a real desync (or a hacked client position).
         */
        const dx = state.position.x - player.position.x;
        const dy = state.position.y - player.position.y;
        const dz = state.position.z - player.position.z;
        if (dx * dx + dy * dy + dz * dz > RECONCILE_DISTANCE_SQ) {
          player.position.set(
            state.position.x,
            state.position.y,
            state.position.z,
          );
        }
      }

      setLocalHealth(state.health);
      continue;
    }

    seen.add(state.id);
    updateRemoteTarget(state);
  }

  // Snapshots are authoritative: remove capsules the server no longer knows.
  for (const id of [...remotePlayers.keys()]) {
    if (!seen.has(id)) {
      removeRemotePlayer(id);
    }
  }

  updateMatchTimer(matchTime);
  updateScoreboard(players);
  receivedInitialState = true;
});

socket.on("player_joined", (state) => {
  if (state.id === socket.id) {
    return;
  }
  spawnRemotePlayer(state);
});

socket.on("player_left", (id) => {
  removeRemotePlayer(id);
});

socket.on("player_shoot", (payload) => {
  if (payload.shooterId === socket.id) {
    return;
  }

  // Remote clients only need the tracer; damage is resolved on the server.
  remoteShotOrigin.set(
    payload.origin.x,
    payload.origin.y,
    payload.origin.z,
  );
  remoteShotDirection.set(
    payload.direction.x,
    payload.direction.y,
    payload.direction.z,
  );
  remoteTracerEnd
    .copy(remoteShotOrigin)
    .addScaledVector(remoteShotDirection, TRACER_RANGE);

  raycaster.set(remoteShotOrigin, remoteShotDirection);
  const worldHits = raycaster.intersectObjects(staticMeshes, false);
  if (worldHits.length > 0) {
    remoteTracerEnd.copy(worldHits[0].point);
  }

  spawnTracer(remoteShotOrigin, remoteTracerEnd);
  audio.playRemoteShoot();
});

socket.on("player_hit", () => {
  // The server only sends this to the shooter after confirming a hit.
  flashHitMarker();
  audio.playHit();
});

socket.on("player_died", ({ playerId }) => {
  audio.playDeath();

  if (playerId === socket.id) {
    localDead = true;
    setLocalHealth(0);
    player.velocity.set(0, 0, 0);
    input.clear();
    gun.object.visible = false;
    deathOverlay?.classList.add("visible");
    return;
  }

  const remote = remotePlayers.get(playerId);
  if (remote) {
    setRemoteAlive(remote, false);
  }
});

socket.on("player_respawned", (state) => {
  if (state.id === socket.id) {
    localDead = false;
    player.reset(state.position);
    setLocalHealth(state.health);
    deathOverlay?.classList.remove("visible");
    gun.object.visible = true;
    return;
  }

  const remote = remotePlayers.get(state.id) ?? spawnRemotePlayer(state);
  remote.mesh.position.set(
    state.position.x,
    state.position.y + PLAYER_HEIGHT / 2,
    state.position.z,
  );
  remote.targetPosition.copy(remote.mesh.position);
  remote.targetQuaternion.setFromAxisAngle(WORLD_UP, state.rotation.y);
  remote.mesh.quaternion.copy(remote.targetQuaternion);
  setRemoteAlive(remote, true);
});

socket.connect();

/*
 * ---------------------------------------------------------------------------
 * Resize handling
 * ---------------------------------------------------------------------------
 * Keep the camera aspect and drawing buffer in sync with the viewport. The
 * pixel-ratio clamp is reapplied in case the window moves to another display.
 */
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/*
 * ---------------------------------------------------------------------------
 * Animation loop
 * ---------------------------------------------------------------------------
 * The clock supplies frame-rate independent delta time. `player.update` is the
 * client-prediction step: it runs immediately on local input. The server sends
 * authoritative snapshots at 20hz, and remote capsules interpolate toward them.
 */
const clock = new THREE.Clock();
const cameraDirection = new THREE.Vector3();
let lastInputSentAt = 0;
let inputSequence = 0;
let lastShotAt = 0;
let aimingAtPlayer = false;

function sendPlayerInput(now: number): void {
  if (localDead || !socket.connected || now - lastInputSentAt < SEND_INTERVAL_MS) {
    return;
  }

  const elapsedMs =
    lastInputSentAt === 0 ? SEND_INTERVAL_MS : now - lastInputSentAt;
  lastInputSentAt = now;
  inputSequence += 1;

  // Yaw drives shared movement; pitch is stored server-side for rotation.
  const yaw = player.yaw;
  const pitch = Math.asin(
    Math.max(-1, Math.min(1, cameraDirection.y)),
  );

  // Position is intentionally absent: the server owns it via simulation.
  socket.emit("player_input", {
    sequence: inputSequence,
    forward: input.isMovingForward(),
    backward: input.isMovingBackward(),
    left: input.isMovingLeft(),
    right: input.isMovingRight(),
    jump: input.isJumping(),
    delta: Math.min(elapsedMs, 100) / 1000,
    yaw,
    pitch,
  });
}

renderer.setAnimationLoop(() => {
  const delta = clock.getDelta();

  camera.getWorldDirection(cameraDirection);
  if (!localDead) {
    player.update(delta, input, cameraDirection);
  }

  // Lock the camera to the player's eye position. Look rotation is untouched.
  camera.position.set(
    player.position.x,
    player.position.y + EYE_HEIGHT,
    player.position.z,
  );

  /*
   * Single aim ray per frame, shared by the crosshair feedback and firing.
   * Raycaster.set copies into its internal ray, so this does not allocate.
   */
  raycaster.set(camera.position, cameraDirection);
  const hits = raycaster.intersectObjects(hittableTargets, false);
  const hitsPlayer =
    hits.length > 0 &&
    remoteMeshes.includes(hits[0].object as THREE.Mesh);

  // Only touch the DOM when the hover state actually changes.
  if (hitsPlayer !== aimingAtPlayer) {
    aimingAtPlayer = hitsPlayer;
    crosshair?.classList.toggle("hit", aimingAtPlayer);
  }

  const now = performance.now();
  sendPlayerInput(now);

  if (
    !localDead &&
    input.isShooting() &&
    controls.isLocked &&
    now - lastShotAt >= SHOOT_COOLDOWN_MS
  ) {
    lastShotAt = now;
    gun.fire();
    audio.playShoot();

    if (hits.length > 0) {
      const impact = hits[0];
      tracerEnd.copy(impact.point);

      if (impact.face) {
        impactNormal
          .copy(impact.face.normal)
          .transformDirection(impact.object.matrixWorld);
      } else {
        impactNormal.copy(cameraDirection).negate();
      }

      spawnImpactSparks(impact.point, impactNormal);
    } else {
      tracerEnd
        .copy(camera.position)
        .addScaledVector(cameraDirection, TRACER_RANGE);
    }
    spawnTracer(camera.position, tracerEnd);

    socket.emit("player_shoot", {
      origin: {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      },
      direction: {
        x: cameraDirection.x,
        y: cameraDirection.y,
        z: cameraDirection.z,
      },
    });
  }

  gun.update(delta);
  updateTracers(delta);
  updateImpactSparks(delta);

  // Frame-rate independent smoothing; at 20hz updates this removes the steps.
  const lerpFactor = 1 - Math.exp(-REMOTE_LERP_RATE * delta);
  for (const remote of remotePlayers.values()) {
    remote.mesh.position.lerp(remote.targetPosition, lerpFactor);
    remote.mesh.quaternion.slerp(remote.targetQuaternion, lerpFactor);
  }

  renderer.render(scene, camera);
});
