import * as THREE from "three";
import { EYE_HEIGHT } from "../shared/constants";
import {
  FLOOR_COLOR,
  FLOOR_SIZE,
  FLOOR_Y,
  MAP_OBJECTS,
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
  scene.fog = new THREE.Fog(0x060a12, 30, 96);

  const camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    220,
  );
  camera.position.set(0, EYE_HEIGHT, 5);
  scene.add(camera);

  const ambientLight = new THREE.AmbientLight(0x62748c, 0.82);
  scene.add(ambientLight);

  const hemisphereLight = new THREE.HemisphereLight(
    0xa8d4ff,
    0x0a1018,
    1.0,
  );
  scene.add(hemisphereLight);

  const directionalLight = new THREE.DirectionalLight(0xfff0dd, 1.6);
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
    emissive: 0x0b1c28,
    emissiveIntensity: 0.9,
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

  const backdropCount = 22;
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
    const radius = 38 + (index % 4) * 6;
    const height = 8 + ((index * 37) % 17);
    const width = 5 + ((index * 13) % 8);
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

  addSpawnPad(scene, 0x22d3ee, 18);
  addSpawnPad(scene, 0xff7a45, -18);

  return {
    renderer,
    scene,
    camera,
    staticMeshes: [floorMesh, mapMesh],
  };
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
