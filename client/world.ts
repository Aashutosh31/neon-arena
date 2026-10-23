import * as THREE from "three";
import { ARENA_HALF_EXTENT, EYE_HEIGHT } from "../shared/constants";
import {
  FLOOR_COLOR,
  FLOOR_SIZE,
  FLOOR_Y,
  MAP_OBJECTS,
  MAP_ROOFS,
  MAP_SIDEWALKS,
  MAP_STREETLIGHTS,
  MAP_WINDOWS,
} from "../shared/map";

export interface World {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  staticMeshes: THREE.Object3D[];
}

export function createWorld(
  canvas: HTMLCanvasElement,
  mobile: boolean,
): World {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "low-power",
    alpha: false,
  });
  renderer.setPixelRatio(
    Math.min(window.devicePixelRatio, mobile ? 1.25 : 1.65),
  );
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.16;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060a12);
  scene.fog = new THREE.Fog(0x060a12, 55, 180);

  const camera = new THREE.PerspectiveCamera(
    mobile ? 80 : 75,
    window.innerWidth / window.innerHeight,
    0.1,
    260,
  );
  camera.position.set(0, EYE_HEIGHT, 5);
  scene.add(camera);

  const ambientLight = new THREE.AmbientLight(0x62748c, 0.92);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    0xa8d4ff,
    0x0a1018,
    1.0,
  );
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xfff0dd, 1.72);
  directionalLight.position.set(14, 22, 10);
  scene.add(directionalLight);

  const fillLight = new THREE.DirectionalLight(0x356a8c, 0.68);
  fillLight.position.set(-16, 8, -12);
  scene.add(fillLight);

  const floorMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR_SIZE, FLOOR_SIZE),
    new THREE.MeshStandardMaterial({
      color: FLOOR_COLOR,
      roughness: 0.82,
      metalness: 0.2,
    }),
  );
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = FLOOR_Y - 0.01;
  scene.add(floorMesh);

  const outerFloor = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({
      color: 0x040810,
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
    0x0f6677,
    0x08303d,
  );
  const gridMaterial = grid.material as THREE.LineBasicMaterial;
  gridMaterial.transparent = true;
  gridMaterial.opacity = 0.7;
  grid.position.y = FLOOR_Y + 0.001;
  scene.add(grid);

  const mapGeometry = new THREE.BoxGeometry(1, 1, 1);
  const mapMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.66,
    metalness: 0.22,
    emissive: 0x0e2636,
    emissiveIntensity: 0.8,
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

  const backdropCount = 26;
  const backdropMesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0e1c2a,
      roughness: 0.9,
      metalness: 0.12,
      flatShading: true,
    }),
    backdropCount,
  );
  for (let index = 0; index < backdropCount; index += 1) {
    const angle = (index / backdropCount) * Math.PI * 2 + 0.15;
    const radius = 48 + (index % 4) * 7;
    const height = 9 + ((index * 37) % 20);
    const width = 6 + ((index * 13) % 9);
    instancePosition.set(
      Math.cos(angle) * radius,
      height / 2 - 0.5,
      Math.sin(angle) * radius,
    );
    instanceScale.set(width, height, width * 0.8);
    instanceMatrix.compose(
      instancePosition,
      instanceQuaternion,
      instanceScale,
    );
    backdropMesh.setMatrixAt(index, instanceMatrix);
    backdropMesh.setColorAt(
      index,
      instanceColor.setHex(index % 3 === 0 ? 0x0e2431 : 0x08131e),
    );
  }
  backdropMesh.instanceMatrix.needsUpdate = true;
  if (backdropMesh.instanceColor) {
    backdropMesh.instanceColor.needsUpdate = true;
  }
  scene.add(backdropMesh);

  addTownDecor(scene);
  addSpawnPad(scene, 0x22d3ee, ARENA_HALF_EXTENT - 3.5);
  addSpawnPad(scene, 0xff7a45, -ARENA_HALF_EXTENT + 3.5);
  addStreetGuide(scene);

  return {
    renderer,
    scene,
    camera,
    staticMeshes: [floorMesh, mapMesh],
  };
}

function addTownDecor(scene: THREE.Scene): void {
  addSidewalks(scene);
  addWindowPanels(scene);
  addHipRoofs(scene);
  addStreetLights(scene);
  addFountain(scene);
}

function addSidewalks(scene: THREE.Scene): void {
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

function addHipRoofs(scene: THREE.Scene): void {
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
  for (const lane of [-23.4, 0, 23.4]) {
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
    new THREE.RingGeometry(9.2, 9.5, 64),
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
