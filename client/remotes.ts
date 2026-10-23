import * as THREE from "three";
import type { PlayerState, TeamId } from "../shared/types";

interface RemotePlayer {
  group: THREE.Group;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const BOX_GEOMETRY = new THREE.BoxGeometry(1, 1, 1);
const HEAD_GEOMETRY = new THREE.SphereGeometry(0.185, 10, 8);
const HELMET_GEOMETRY = new THREE.SphereGeometry(
  0.205,
  10,
  6,
  0,
  Math.PI * 2,
  0,
  Math.PI * 0.58,
);
const NECK_GEOMETRY = new THREE.CylinderGeometry(0.085, 0.1, 0.1, 8);
const RING_GEOMETRY = new THREE.RingGeometry(0.46, 0.57, 28);
const SUIT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x1a2633,
  emissive: 0x050c13,
  emissiveIntensity: 0.42,
  roughness: 0.72,
  metalness: 0.28,
  flatShading: true,
});
const VISOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x061016,
  emissive: 0x72f3ff,
  emissiveIntensity: 1.7,
  roughness: 0.18,
  metalness: 0.72,
  flatShading: true,
});
const RIFLE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x202833,
  emissive: 0x080f18,
  emissiveIntensity: 0.5,
  roughness: 0.42,
  metalness: 0.62,
  flatShading: true,
});

const TEAM_MATERIALS: Record<TeamId, THREE.MeshStandardMaterial> = {
  alpha: new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0b6b7a,
    emissiveIntensity: 0.55,
    roughness: 0.46,
    metalness: 0.34,
    flatShading: true,
  }),
  bravo: new THREE.MeshStandardMaterial({
    color: 0xff7a45,
    emissive: 0x7a2d0c,
    emissiveIntensity: 0.55,
    roughness: 0.46,
    metalness: 0.34,
    flatShading: true,
  }),
  ffa: new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.55,
    roughness: 0.46,
    metalness: 0.34,
    flatShading: true,
  }),
};

function addBox(
  parent: THREE.Object3D,
  material: THREE.Material,
  width: number,
  height: number,
  depth: number,
  x: number,
  y: number,
  z: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(BOX_GEOMETRY, material);
  mesh.scale.set(width, height, depth);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function addArm(
  parent: THREE.Object3D,
  material: THREE.Material,
  x: number,
  forward: number,
  inward: number,
): void {
  const arm = new THREE.Group();
  arm.position.set(x, 1.4, 0);
  arm.rotation.set(forward, 0, inward);
  addBox(arm, material, 0.16, 0.32, 0.18, 0, -0.17, 0);
  addBox(arm, SUIT_MATERIAL, 0.14, 0.28, 0.16, 0, -0.45, 0);
  addBox(arm, SUIT_MATERIAL, 0.15, 0.14, 0.16, 0, -0.64, -0.01);
  parent.add(arm);
}

function addLeg(
  parent: THREE.Object3D,
  material: THREE.Material,
  x: number,
): THREE.Group {
  const leg = new THREE.Group();
  leg.position.set(x, 0.86, 0);
  addBox(leg, material, 0.21, 0.37, 0.24, 0, -0.19, 0);
  addBox(leg, SUIT_MATERIAL, 0.17, 0.32, 0.2, 0, -0.52, 0.01);
  addBox(leg, SUIT_MATERIAL, 0.22, 0.14, 0.31, 0, -0.73, -0.045);
  addBox(leg, VISOR_MATERIAL, 0.15, 0.07, 0.04, 0, -0.37, -0.13);
  parent.add(leg);
  return leg;
}

export class RemoteManager {
  private readonly scene: THREE.Scene;
  private readonly players = new Map<string, RemotePlayer>();
  private readonly groups = new Set<THREE.Group>();
  private readonly teams = new Map<THREE.Group, TeamId>();
  private readonly targets: THREE.Object3D[];

  constructor(scene: THREE.Scene, staticTargets: THREE.Object3D[]) {
    this.scene = scene;
    this.targets = [...staticTargets];
  }

  get hittableTargets(): THREE.Object3D[] {
    return this.targets;
  }

  isRemoteObject(object: THREE.Object3D): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (this.groups.has(current as THREE.Group)) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  isEnemyObject(
    object: THREE.Object3D,
    localTeam: TeamId,
    mode: "tdm" | "ffa",
  ): boolean {
    let current: THREE.Object3D | null = object;
    while (current) {
      if (this.groups.has(current as THREE.Group)) {
        const team = this.teams.get(current as THREE.Group);
        return (
          team !== undefined && (mode === "ffa" || team !== localTeam)
        );
      }
      current = current.parent;
    }
    return false;
  }

  get(id: string): RemotePlayer | undefined {
    return this.players.get(id);
  }

  sync(players: PlayerState[], localId: string): void {
    const seen = new Set<string>();
    for (const player of players) {
      if (player.id === localId) {
        continue;
      }
      seen.add(player.id);
      this.update(player);
    }
    for (const id of [...this.players.keys()]) {
      if (!seen.has(id)) {
        this.remove(id);
      }
    }
  }

  update(state: PlayerState): void {
    const remote = this.players.get(state.id) ?? this.spawn(state);
    remote.targetPosition.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    remote.targetQuaternion.setFromAxisAngle(
      WORLD_UP,
      state.rotation.y,
    );
    this.setAlive(remote, state.health > 0);
  }

  respawn(state: PlayerState): void {
    const remote = this.players.get(state.id) ?? this.spawn(state);
    remote.targetPosition.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    remote.targetQuaternion.setFromAxisAngle(
      WORLD_UP,
      state.rotation.y,
    );
    remote.group.position.copy(remote.targetPosition);
    remote.group.quaternion.copy(remote.targetQuaternion);
    this.setAlive(remote, true);
  }

  hide(id: string): void {
    const remote = this.players.get(id);
    if (remote) {
      this.setAlive(remote, false);
    }
  }

  remove(id: string): void {
    const remote = this.players.get(id);
    if (!remote) {
      return;
    }
    this.scene.remove(remote.group);
    this.players.delete(id);
    this.groups.delete(remote.group);
    this.teams.delete(remote.group);
    const index = this.targets.indexOf(remote.group);
    if (index !== -1) {
      this.targets.splice(index, 1);
    }
  }

  clear(): void {
    for (const id of [...this.players.keys()]) {
      this.remove(id);
    }
  }

  updateVisuals(delta: number): void {
    const blend = 1 - Math.exp(-15 * delta);
    for (const remote of this.players.values()) {
      remote.group.position.lerp(remote.targetPosition, blend);
      remote.group.quaternion.slerp(remote.targetQuaternion, blend);
    }
  }

  private spawn(state: PlayerState): RemotePlayer {
    const group = new THREE.Group();
    const material = TEAM_MATERIALS[state.team];

    addBox(group, material, 0.48, 0.22, 0.3, 0, 0.86, 0);
    addBox(group, SUIT_MATERIAL, 0.52, 0.24, 0.31, 0, 1.05, 0);
    addBox(group, material, 0.66, 0.42, 0.34, 0, 1.29, 0);
    addBox(group, SUIT_MATERIAL, 0.08, 0.36, 0.05, -0.2, 1.29, -0.18);
    addBox(group, SUIT_MATERIAL, 0.08, 0.36, 0.05, 0.2, 1.29, -0.18);
    addBox(group, VISOR_MATERIAL, 0.16, 0.055, 0.035, 0, 1.36, -0.2);
    addBox(group, SUIT_MATERIAL, 0.42, 0.4, 0.16, 0, 1.24, 0.24);
    addBox(group, material, 0.2, 0.18, 0.3, -0.35, 1.42, 0);
    addBox(group, material, 0.2, 0.18, 0.3, 0.35, 1.42, 0);

    const neck = new THREE.Mesh(NECK_GEOMETRY, SUIT_MATERIAL);
    neck.position.y = 1.54;
    group.add(neck);

    const head = new THREE.Mesh(HEAD_GEOMETRY, SUIT_MATERIAL);
    head.position.y = 1.67;
    group.add(head);

    const helmet = new THREE.Mesh(HELMET_GEOMETRY, material);
    helmet.position.y = 1.68;
    group.add(helmet);

    addBox(group, VISOR_MATERIAL, 0.27, 0.09, 0.055, 0, 1.68, -0.16);
    addBox(group, SUIT_MATERIAL, 0.18, 0.08, 0.07, 0, 1.59, -0.15);

    addArm(group, material, -0.34, 0.82, 0.42);
    addArm(group, material, 0.34, 0.78, -0.05);
    addLeg(group, material, -0.14);
    addLeg(group, material, 0.14);

    const weapon = new THREE.Group();
    weapon.position.set(0.22, 1.0, -0.37);
    addBox(weapon, RIFLE_MATERIAL, 0.13, 0.14, 0.62, 0, -0.02, -0.18);
    addBox(weapon, RIFLE_MATERIAL, 0.055, 0.055, 0.38, 0, 0.01, -0.66);
    addBox(weapon, RIFLE_MATERIAL, 0.1, 0.16, 0.22, 0, -0.03, 0.2);
    addBox(weapon, RIFLE_MATERIAL, 0.09, 0.2, 0.13, 0, -0.17, -0.17);
    addBox(weapon, material, 0.055, 0.035, 0.38, 0, 0.075, -0.24);
    group.add(weapon);

    addBox(group, SUIT_MATERIAL, 0.15, 0.14, 0.16, 0.29, 0.94, -0.34);
    addBox(group, SUIT_MATERIAL, 0.15, 0.14, 0.16, -0.08, 0.98, -0.48);

    const ring = new THREE.Mesh(
      RING_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: material.color,
        transparent: true,
        opacity: 0.36,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    group.add(ring);
    group.scale.setScalar(1.04);

    group.position.set(
      state.position.x,
      state.position.y,
      state.position.z,
    );
    const targetQuaternion = new THREE.Quaternion().setFromAxisAngle(
      WORLD_UP,
      state.rotation.y,
    );
    group.quaternion.copy(targetQuaternion);
    this.scene.add(group);

    const remote: RemotePlayer = {
      group,
      targetPosition: group.position.clone(),
      targetQuaternion,
    };
    this.players.set(state.id, remote);
    this.groups.add(group);
    this.teams.set(group, state.team);
    this.setAlive(remote, state.health > 0);
    return remote;
  }

  private setAlive(remote: RemotePlayer, alive: boolean): void {
    remote.group.visible = alive;
    const index = this.targets.indexOf(remote.group);
    if (alive) {
      if (index === -1) {
        this.targets.push(remote.group);
      }
      return;
    }
    if (index !== -1) {
      this.targets.splice(index, 1);
    }
  }
}
