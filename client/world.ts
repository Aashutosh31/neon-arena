import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ARENA_HALF_EXTENT, EYE_HEIGHT } from "../shared/constants";
import {
  FLOOR_SIZE,
  FLOOR_Y,
  MAP_OBJECTS,
  MAP_ROOFS,
  MAP_SIDEWALKS,
  MAP_STREETLIGHTS,
  MAP_STREET_LINES,
  MAP_WINDOWS,
} from "../shared/map";

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  staticMeshes: THREE.Object3D[];
  render: () => void;
  resize: (width: number, height: number) => void;
}

export function createWorld(
  canvas: HTMLCanvasElement,
  mobile: boolean,
): World {
  const shadows = !mobile;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: mobile ? "low-power" : "high-performance",
    alpha: false,
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.75),
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const environment = createCityEnvironment();
  const scene = new THREE.Scene();
  scene.background = environment;
  scene.environment = environment;
  scene.environmentIntensity = 0.72;
  scene.fog = new THREE.Fog(0x07121f, 78, 255);

  const camera = new THREE.PerspectiveCamera(
    mobile ? 80 : 75,
    window.innerWidth / window.innerHeight,
    0.1,
    420,
  );
  camera.position.set(0, EYE_HEIGHT, 5);
  scene.add(camera);

  const ambientLight = new THREE.AmbientLight(0x70869e, 0.68);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    0xb3dcff,
    0x071018,
    1.05,
  );
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xffead6, 2.15);
  directionalLight.position.set(72, 96, 54);
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.castShadow = shadows;
  if (shadows) {
    directionalLight.shadow.mapSize.set(2048, 2048);
    directionalLight.shadow.camera.left = -ARENA_HALF_EXTENT - 8;
    directionalLight.shadow.camera.right = ARENA_HALF_EXTENT + 8;
    directionalLight.shadow.camera.top = ARENA_HALF_EXTENT + 8;
    directionalLight.shadow.camera.bottom = -ARENA_HALF_EXTENT - 8;
    directionalLight.shadow.camera.near = 1;
    directionalLight.shadow.camera.far = 280;
    directionalLight.shadow.bias = -0.00035;
    directionalLight.shadow.normalBias = 0.025;
    directionalLight.shadow.camera.updateProjectionMatrix();
  }
  scene.add(directionalLight, directionalLight.target);

  const fillLight = new THREE.DirectionalLight(0x3f7da6, 0.82);
  fillLight.position.set(-58, 26, -48);
  scene.add(fillLight);

  const floorTexture = createGroundTexture();
  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.MeshStandardMaterial({
      color: 0xe8fbff,
      map: floorTexture,
      roughness: 0.52,
      metalness: 0.46,
      envMapIntensity: 0.82,
    }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = FLOOR_Y - 0.01;
  floorMesh.receiveShadow = shadows;
  scene.add(floorMesh);

  const outerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE + 180, FLOOR_SIZE + 180),
    new THREE.MeshStandardMaterial({
      color: 0x03070d,
      roughness: 1,
      metalness: 0,
    }),
  );
  outerFloor.rotation.x = -Math.PI / 2;
  outerFloor.position.y = -0.04;
  scene.add(outerFloor);

  const grid = new THREE.GridHelper(
    FLOOR_SIZE,
    FLOOR_SIZE,
    0x178295,
    0x0a3a46,
  );
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.32;
  grid.position.y = FLOOR_Y + 0.001;
  scene.add(grid);

  const mapGeometry = new THREE.BoxGeometry(1, 1, 1);
  const mapMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.58,
    metalness: 0.32,
    emissive: 0x081b27,
    emissiveIntensity: 0.55,
    envMapIntensity: 0.72,
    flatShading: true,
  });
  const mapMesh = new THREE.InstancedMesh(
    mapGeometry,
    mapMaterial,
    MAP_OBJECTS.length,
  );
  mapMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mapMesh.matrixAutoUpdate = false;
  mapMesh.updateMatrix();

  const instanceMatrix = new THREE.Matrix4();
  const instancePosition = new THREE.Vector3();
  const instanceScale = new THREE.Vector3();
  const instanceQuaternion = new THREE.Quaternion();
  const instanceColor = new THREE.Color();

  MAP_OBJECTS.forEach((object, index) => {
    instancePosition.set(
      object.x,
      object.y + object.height / 2,
      object.z,
    );
    instanceScale.set(object.width, object.height, object.depth);
    instanceMatrix.compose(
      instancePosition,
      instanceQuaternion,
      instanceScale,
    );
    mapMesh.setMatrixAt(index, instanceMatrix);
    mapMesh.setColorAt(index, instanceColor.setHex(object.color));
  });
  mapMesh.instanceMatrix.needsUpdate = true;
  if (mapMesh.instanceColor) {
    mapMesh.instanceColor.needsUpdate = true;
  }
  mapMesh.computeBoundingSphere();
  mapMesh.castShadow = shadows;
  mapMesh.receiveShadow = shadows;
  scene.add(mapMesh);

  const trimMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0b3440,
      emissive: 0x00b8d4,
      emissiveIntensity: 0.95,
      roughness: 0.38,
      metalness: 0.45,
    }),
    MAP_OBJECTS.length,
  );
  MAP_OBJECTS.forEach((object, index) => {
    instancePosition.set(
      object.x,
      object.y + object.height + 0.035,
      object.z,
    );
    instanceScale.set(object.width + 0.06, 0.07, object.depth + 0.06);
    instanceMatrix.compose(
      instancePosition,
      instanceQuaternion,
      instanceScale,
    );
    trimMesh.setMatrixAt(index, instanceMatrix);
  });
  trimMesh.instanceMatrix.needsUpdate = true;
  scene.add(trimMesh);

  const backdropCount = mobile ? 34 : 50;
  const backdropMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0c1b29,
      emissive: 0x06131c,
      emissiveIntensity: 0.65,
      roughness: 0.86,
      metalness: 0.28,
      flatShading: true,
    }),
    backdropCount,
  );
  const backdropLights = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    }),
    backdropCount,
  );
  const skylineAccents = [
    0x59e6ff,
    0xff5a8a,
    0xffc247,
    0x9f7aff,
    0x42f5c5,
  ] as const;
  for (let index = 0; index < backdropCount; index += 1) {
    const angle = (index / backdropCount) * Math.PI * 2 + 0.11;
    const radius =
      ARENA_HALF_EXTENT + 18 + (index % 6) * 8.5;
    const height =
      15 + ((index * 37) % 26) + (index % 7 === 0 ? 11 : 0);
    const width = 8 + ((index * 13) % 10);
    const depth = width * (0.7 + (index % 3) * 0.15);
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    instancePosition.set(x, height / 2 - 0.5, z);
    instanceScale.set(width, height, depth);
    instanceMatrix.compose(
      instancePosition,
      instanceQuaternion,
      instanceScale,
    );
    backdropMesh.setMatrixAt(index, instanceMatrix);
    backdropMesh.setColorAt(
      index,
      instanceColor.setHex(index % 4 === 0 ? 0x102b3a : 0x07131f),
    );

    const accent = skylineAccents[index % skylineAccents.length];
    const facadeOffset = width * 0.42;
    instancePosition.set(
      x - Math.cos(angle) * facadeOffset,
      height * 0.55 - 0.5,
      z - Math.sin(angle) * facadeOffset,
    );
    instanceScale.set(0.32, height * 0.62, 0.32);
    instanceMatrix.compose(
      instancePosition,
      instanceQuaternion,
      instanceScale,
    );
    backdropLights.setMatrixAt(index, instanceMatrix);
    backdropLights.setColorAt(index, instanceColor.setHex(accent));
  }
  backdropMesh.instanceMatrix.needsUpdate = true;
  backdropLights.instanceMatrix.needsUpdate = true;
  if (backdropMesh.instanceColor) {
    backdropMesh.instanceColor.needsUpdate = true;
  }
  if (backdropLights.instanceColor) {
    backdropLights.instanceColor.needsUpdate = true;
  }
  scene.add(backdropMesh, backdropLights);

  addTownDecor(scene, shadows);
  addSpawnPad(scene, 0x22d3ee, ARENA_HALF_EXTENT - 3.5);
  addSpawnPad(scene, 0xff7a45, -ARENA_HALF_EXTENT + 3.5);
  addStreetGuide(scene);
  addStars(scene);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(
    new UnrealBloomPass(
      new THREE.Vector2(window.innerWidth, window.innerHeight),
      mobile ? 0.34 : 0.52,
      0.55,
      mobile ? 0.8 : 0.72,
    ),
  );
  composer.addPass(new OutputPass());

  return {
    renderer,
    scene,
    camera,
    staticMeshes: [floorMesh, mapMesh],
    render: () => composer.render(),
    resize: (width, height) => {
      renderer.setSize(width, height);
      composer.setSize(width, height);
    },
  };
}

function addTownDecor(scene: THREE.Scene, shadows: boolean): void {
  addSidewalks(scene, shadows);
  addWindowPanels(scene);
  addHipRoofs(scene, shadows);
  addStreetLights(scene);
  addFountain(scene);
}

function addSidewalks(scene: THREE.Scene, shadows: boolean): void {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x172731,
      roughness: 0.92,
      metalness: 0.12,
    }),
    MAP_SIDEWALKS.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  MAP_SIDEWALKS.forEach((sidewalk, index) => {
    position.set(sidewalk.x, 0.03, sidewalk.z);
    scale.set(sidewalk.width, 0.06, sidewalk.depth);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  scene.add(mesh);
}

function addWindowPanels(scene: THREE.Scene): void {
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    }),
    MAP_WINDOWS.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  MAP_WINDOWS.forEach((panel, index) => {
    position.set(panel.x, panel.y + panel.height / 2, panel.z);
    scale.set(panel.width, panel.height, panel.depth);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(panel.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
  scene.add(mesh);
}

function addHipRoofs(scene: THREE.Scene, shadows: boolean): void {
  const hipRoofs = MAP_ROOFS.filter((roof) => roof.style === "hip");
  const geometry = new THREE.ConeGeometry(1, 1, 4);
  geometry.rotateY(Math.PI / 4);
  const mesh = new THREE.InstancedMesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.66,
      metalness: 0.24,
      emissive: 0x0e2636,
      emissiveIntensity: 0.45,
      flatShading: true,
    }),
    hipRoofs.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  hipRoofs.forEach((roof, index) => {
    position.set(roof.x, roof.y + roof.height / 2, roof.z);
    scale.set(
      roof.width / Math.SQRT2,
      roof.height,
      roof.depth / Math.SQRT2,
    );
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.setHex(roof.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.needsUpdate = true;
  }
  mesh.computeBoundingSphere();
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  scene.add(mesh);
}

function addStreetLights(scene: THREE.Scene): void {
  const poles = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0d1822,
      roughness: 0.5,
      metalness: 0.7,
    }),
    MAP_STREETLIGHTS.length,
  );
  const lamps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      toneMapped: false,
    }),
    MAP_STREETLIGHTS.length,
  );
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const color = new THREE.Color();
  MAP_STREETLIGHTS.forEach((light, index) => {
    position.set(light.x, light.height / 2, light.z);
    scale.set(0.17, light.height, 0.17);
    matrix.compose(position, quaternion, scale);
    poles.setMatrixAt(index, matrix);

    position.set(light.x, light.height + 0.12, light.z);
    scale.set(0.62, 0.2, 0.4);
    matrix.compose(position, quaternion, scale);
    lamps.setMatrixAt(index, matrix);
    lamps.setColorAt(index, color.setHex(light.color));
  });
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor) {
    lamps.instanceColor.needsUpdate = true;
  }
  poles.computeBoundingSphere();
  lamps.computeBoundingSphere();
  scene.add(poles, lamps);
}

function addFountain(scene: THREE.Scene): void {
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(3.12, 48),
    new THREE.MeshBasicMaterial({
      color: 0x0b8fb0,
      transparent: true,
      opacity: 0.46,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.64;
  scene.add(water);

  const jet = new THREE.Mesh(
    new THREE.CylinderGeometry(0.06, 0.22, 1.5, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x6ee7ff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  jet.position.y = 1.45;
  scene.add(jet);
}

function addStreetGuide(scene: THREE.Scene): void {
  const material = new THREE.MeshBasicMaterial({
    color: 0x00b8d4,
    transparent: true,
    opacity: 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const strip = new THREE.PlaneGeometry(FLOOR_SIZE - 8, 0.14);
  for (const lane of MAP_STREET_LINES) {
    const eastWest = new THREE.Mesh(strip, material);
    eastWest.rotation.x = -Math.PI / 2;
    eastWest.position.y = 0.012;
    eastWest.position.z = lane;
    scene.add(eastWest);
    const northSouth = new THREE.Mesh(strip, material);
    northSouth.rotation.x = -Math.PI / 2;
    northSouth.rotation.z = Math.PI / 2;
    northSouth.position.y = 0.012;
    northSouth.position.x = lane;
    scene.add(northSouth);
  }

  const plaza = new THREE.Mesh(
    new THREE.RingGeometry(5.4, 5.7, 64),
    new THREE.MeshBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.y = 0.014;
  scene.add(plaza);

  const districtRing = new THREE.RingGeometry(3.5, 3.7, 48);
  for (const x of [-45.5, 45.5]) {
    for (const z of [-45.5, 45.5]) {
      const ring = new THREE.Mesh(
        districtRing,
        new THREE.MeshBasicMaterial({
          color: 0xff7a45,
          transparent: true,
          opacity: 0.12,
          side: THREE.DoubleSide,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, 0.014, z);
      scene.add(ring);
    }
  }
}

function addSpawnPad(
  scene: THREE.Scene,
  color: number,
  z: number,
): void {
  const pad = new THREE.Mesh(
    new THREE.RingGeometry(2.6, 2.9, 48),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  pad.rotation.x = -Math.PI / 2;
  pad.position.set(0, 0.02, z);
  scene.add(pad);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function createCityEnvironment(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  const sky = context.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#010208");
  sky.addColorStop(0.36, "#030d18");
  sky.addColorStop(0.48, "#082130");
  sky.addColorStop(0.53, "#0c2d3f");
  sky.addColorStop(0.58, "#06131e");
  sky.addColorStop(0.78, "#02050b");
  sky.addColorStop(1, "#010205");
  context.fillStyle = sky;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const cyanGlow = context.createRadialGradient(
    220,
    270,
    10,
    220,
    270,
    260,
  );
  cyanGlow.addColorStop(0, "rgba(42, 226, 255, 0.22)");
  cyanGlow.addColorStop(1, "rgba(42, 226, 255, 0)");
  context.fillStyle = cyanGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const emberGlow = context.createRadialGradient(
    790,
    266,
    12,
    790,
    266,
    240,
  );
  emberGlow.addColorStop(0, "rgba(255, 104, 64, 0.2)");
  emberGlow.addColorStop(1, "rgba(255, 104, 64, 0)");
  context.fillStyle = emberGlow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const random = seededRandom(0x6e656f6e);
  const horizon = canvas.height * 0.54;
  const accents = [
    "#59e6ff",
    "#ff8a5b",
    "#ffd27a",
    "#b79cff",
    "#58f5c8",
  ];
  let x = -10;
  while (x < canvas.width + 10) {
    const width = 10 + random() * 26;
    const height = 12 + random() * 72;
    context.fillStyle = random() < 0.5 ? "#02070d" : "#030b13";
    context.fillRect(x, horizon - height, width, height);
    const windowCount = Math.floor(2 + random() * 8);
    for (let index = 0; index < windowCount; index += 1) {
      context.fillStyle =
        accents[Math.floor(random() * accents.length)];
      context.globalAlpha = 0.35 + random() * 0.55;
      context.fillRect(
        x + 2 + random() * Math.max(1, width - 5),
        horizon - height + 3 + random() * Math.max(1, height - 6),
        1 + random() * 2.2,
        1 + random() * 2,
      );
    }
    context.globalAlpha = 1;
    x += width + 3 + random() * 12;
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGroundTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) {
    return new THREE.CanvasTexture(canvas);
  }

  context.fillStyle = "#08121c";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const random = seededRandom(0x61737068);
  for (let index = 0; index < 5200; index += 1) {
    const alpha = 0.025 + random() * 0.055;
    context.fillStyle =
      random() < 0.18
        ? `rgba(80, 200, 220, ${alpha})`
        : `rgba(132, 158, 174, ${alpha})`;
    const size = random() < 0.9 ? 1 : 2;
    context.fillRect(
      random() * canvas.width,
      random() * canvas.height,
      size,
      size,
    );
  }

  context.strokeStyle = "rgba(42, 111, 133, 0.28)";
  context.lineWidth = 1;
  for (const value of [0, 64, 128, 192]) {
    context.beginPath();
    context.moveTo(value + 0.5, 0);
    context.lineTo(value + 0.5, canvas.height);
    context.moveTo(0, value + 0.5);
    context.lineTo(canvas.width, value + 0.5);
    context.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(FLOOR_SIZE / 34, FLOOR_SIZE / 34);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function addStars(scene: THREE.Scene): void {
  const count = 460;
  const positions = new Float32Array(count * 3);
  const random = seededRandom(0x73746172);
  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 180 + random() * 130;
    const height = 24 + random() * 170;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = height;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const material = new THREE.PointsMaterial({
    color: 0xa9e8ff,
    size: 0.9,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.frustumCulled = false;
  scene.add(stars);
}
