import * as THREE from "three";
import type { PlayerState, TeamId } from "../shared/types";

interface RemotePlayer {
  group: THREE.Group;
  targetPosition: THREE.Vector3;
  targetQuaternion: THREE.Quaternion;
}

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const BODY_GEOMETRY = new THREE.CapsuleGeometry(0.34, 1.12, 4, 8);
const HEAD_GEOMETRY = new THREE.SphereGeometry(0.18, 8, 6);
const VISOR_GEOMETRY = new THREE.BoxGeometry(0.26, 0.08, 0.07);
const GUN_GEOMETRY = new THREE.BoxGeometry(0.09, 0.09, 0.44);
const RING_GEOMETRY = new THREE.RingGeometry(0.39, 0.48, 24);
const VISOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x081018,
  emissive: 0x66f6ff,
  emissiveIntensity: 1.4,
  roughness: 0.2,
  metalness: 0.6,
  flatShading: true,
});

const TEAM_MATERIALS: Record<TeamId, THREE.MeshStandardMaterial> = {
  alpha: new THREE.MeshStandardMaterial({
    color: 0x22d3ee,
    emissive: 0x0b6b7a,
    emissiveIntensity: 0.7,
    roughness: 0.55,
    metalness: 0.15,
    flatShading: true,
  }),
  bravo: new THREE.MeshStandardMaterial({
    color: 0xff7a45,
    emissive: 0x7a2d0c,
    emissiveIntensity: 0.7,
    roughness: 0.55,
    metalness: 0.15,
    flatShading: true,
  }),
  ffa: new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0x4c1d95,
    emissiveIntensity: 0.7,
    roughness: 0.55,
    metalness: 0.15,
    flatShading: true,
  }),
};

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

    const body = new THREE.Mesh(BODY_GEOMETRY, material);
    body.position.y = 0.9;
    const head = new THREE.Mesh(HEAD_GEOMETRY, material);
    head.position.y = 1.57;
    const visor = new THREE.Mesh(VISOR_GEOMETRY, VISOR_MATERIAL);
    visor.position.set(0, 1.61, -0.16);
    const weapon = new THREE.Mesh(GUN_GEOMETRY, material);
    weapon.position.set(0.27, 1.08, -0.32);
    const ring = new THREE.Mesh(
      RING_GEOMETRY,
      new THREE.MeshBasicMaterial({
        color: material.color,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;

    group.add(body, head, visor, weapon, ring);
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
