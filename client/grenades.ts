import * as THREE from "three";
import type {
  GrenadeExplodedPayload,
  GrenadeState,
  GrenadeThrownPayload,
} from "../shared/types";
import type { GameAudio } from "./audio";

const GRENADE_GEOMETRY = new THREE.IcosahedronGeometry(0.16, 1);
const GRENADE_RING_GEOMETRY = new THREE.RingGeometry(0.15, 0.23, 18);
const EXPLOSION_GEOMETRY = new THREE.IcosahedronGeometry(1, 2);

const GRENADE_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x342014,
  emissive: 0xff7a2f,
  emissiveIntensity: 1.6,
  roughness: 0.4,
  metalness: 0.5,
  flatShading: true,
});

const RING_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xff7a2f,
  transparent: true,
  opacity: 0.65,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

interface LiveGrenade {
  group: THREE.Group;
  target: THREE.Vector3;
  fuseRemaining: number;
}

interface Explosion {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  light: THREE.PointLight;
  radius: number;
  age: number;
  lifetime: number;
}

export class GrenadeManager {
  private readonly scene: THREE.Scene;
  private readonly audio: GameAudio;
  private readonly live = new Map<string, LiveGrenade>();
  private readonly explosions: Explosion[] = [];
  private elapsed = 0;

  constructor(scene: THREE.Scene, audio: GameAudio) {
    this.scene = scene;
    this.audio = audio;
  }

  spawn(payload: GrenadeThrownPayload): void {
    const grenade = this.ensure(payload.id, payload.position);
    grenade.target.set(
      payload.position.x,
      payload.position.y,
      payload.position.z,
    );
    grenade.fuseRemaining = 1800;
    this.audio.playGrenadeThrow();
  }

  sync(states: GrenadeState[]): void {
    const seen = new Set<string>();
    for (const state of states) {
      seen.add(state.id);
      const grenade = this.ensure(state.id, state.position);
      grenade.target.set(
        state.position.x,
        state.position.y,
        state.position.z,
      );
      grenade.fuseRemaining = state.fuseRemaining;
    }
    for (const id of [...this.live.keys()]) {
      if (!seen.has(id)) {
        this.removeGrenade(id);
      }
    }
  }

  explode(payload: GrenadeExplodedPayload): void {
    this.removeGrenade(payload.id);
    this.audio.playExplosion();

    const material = new THREE.MeshBasicMaterial({
      color: 0xffb35c,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(EXPLOSION_GEOMETRY, material);
    mesh.position.set(
      payload.position.x,
      payload.position.y,
      payload.position.z,
    );
    mesh.scale.setScalar(0.4);
    mesh.renderOrder = 4;

    const light = new THREE.PointLight(
      0xff7a2f,
      9,
      Math.max(16, payload.radius * 2.8),
      2,
    );
    light.position.copy(mesh.position);
    this.scene.add(mesh, light);
    this.explosions.push({
      mesh,
      material,
      light,
      radius: payload.radius,
      age: 0,
      lifetime: 0.42,
    });
  }

  update(delta: number): void {
    this.elapsed += delta;
    const blend = 1 - Math.exp(-22 * Math.max(delta, 1 / 240));

    for (const grenade of this.live.values()) {
      grenade.group.position.lerp(grenade.target, blend);
      const urgent = grenade.fuseRemaining < 700;
      const pulse =
        1 + Math.sin(this.elapsed * (urgent ? 38 : 18)) * (urgent ? 0.2 : 0.08);
      grenade.group.scale.setScalar(pulse);
      grenade.group.rotation.y += delta * 8;
      grenade.fuseRemaining = Math.max(0, grenade.fuseRemaining - delta * 1000);
    }

    for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = this.explosions[index];
      explosion.age += delta;
      const progress = Math.min(1, explosion.age / explosion.lifetime);
      explosion.mesh.scale.setScalar(
        0.4 + explosion.radius * 0.92 * Math.sin(progress * Math.PI * 0.5),
      );
      explosion.material.opacity = (1 - progress) ** 1.6 * 0.85;
      explosion.light.intensity = (1 - progress) * 9;
      if (progress < 1) {
        continue;
      }
      this.scene.remove(explosion.mesh, explosion.light);
      explosion.material.dispose();
      this.explosions.splice(index, 1);
    }
  }

  clear(): void {
    for (const id of [...this.live.keys()]) {
      this.removeGrenade(id);
    }
    for (const explosion of this.explosions) {
      this.scene.remove(explosion.mesh, explosion.light);
      explosion.material.dispose();
    }
    this.explosions.length = 0;
  }

  private ensure(
    id: string,
    position: { x: number; y: number; z: number },
  ): LiveGrenade {
    const existing = this.live.get(id);
    if (existing) {
      return existing;
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(GRENADE_GEOMETRY, GRENADE_MATERIAL);
    const ring = new THREE.Mesh(GRENADE_RING_GEOMETRY, RING_MATERIAL);
    ring.rotation.x = -Math.PI / 2;
    group.add(body, ring);
    group.position.set(position.x, position.y, position.z);
    this.scene.add(group);
    const grenade = {
      group,
      target: group.position.clone(),
      fuseRemaining: 1800,
    };
    this.live.set(id, grenade);
    return grenade;
  }

  private removeGrenade(id: string): void {
    const grenade = this.live.get(id);
    if (!grenade) {
      return;
    }
    this.scene.remove(grenade.group);
    this.live.delete(id);
  }
}
