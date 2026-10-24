import * as THREE from "three";
import type { PickupState } from "../shared/types";

const MEDKIT_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xe8fff8,
  emissive: 0x0a4a35,
  emissiveIntensity: 0.7,
  roughness: 0.55,
  metalness: 0.15,
});

const MEDKIT_CROSS_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x66ffb2,
  emissive: 0x16c97a,
  emissiveIntensity: 1.5,
  roughness: 0.35,
  metalness: 0.1,
});

const ARMOR_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x5ad8ff,
  emissive: 0x0b6c92,
  emissiveIntensity: 1.2,
  roughness: 0.25,
  metalness: 0.7,
  flatShading: true,
});

const GRENADE_BODY_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0xff8a5b,
  emissive: 0x9a3412,
  emissiveIntensity: 1.15,
  roughness: 0.4,
  metalness: 0.55,
  flatShading: true,
});

const GRENADE_CAP_MATERIAL = new THREE.MeshStandardMaterial({
  color: 0x20303c,
  emissive: 0x07141d,
  emissiveIntensity: 0.5,
  roughness: 0.35,
  metalness: 0.75,
});

const RING_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0x66f6ff,
  transparent: true,
  opacity: 0.4,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const GRENADE_RING_MATERIAL = new THREE.MeshBasicMaterial({
  color: 0xff8a5b,
  transparent: true,
  opacity: 0.42,
  side: THREE.DoubleSide,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});

const RING_GEOMETRY = new THREE.RingGeometry(0.38, 0.5, 24);

interface PickupVisual {
  group: THREE.Group;
  baseY: number;
  phase: number;
}

export class PickupManager {
  private readonly scene: THREE.Scene;
  private readonly pickups = new Map<string, PickupVisual>();
  private elapsed = 0;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  sync(states: PickupState[]): void {
    const seen = new Set<string>();
    for (const state of states) {
      seen.add(state.id);
      const visual =
        this.pickups.get(state.id) ?? this.create(state);
      visual.group.visible = state.available;
      visual.baseY = state.position.y;
    }
    for (const id of [...this.pickups.keys()]) {
      if (!seen.has(id)) {
        const visual = this.pickups.get(id);
        if (visual) {
          this.scene.remove(visual.group);
        }
        this.pickups.delete(id);
      }
    }
  }

  update(delta: number): void {
    this.elapsed += delta;
    for (const pickup of this.pickups.values()) {
      if (!pickup.group.visible) {
        continue;
      }
      pickup.group.rotation.y += delta * 1.4;
      pickup.group.position.y =
        pickup.baseY + Math.sin(this.elapsed * 2 + pickup.phase) * 0.1;
    }
  }

  clear(): void {
    for (const pickup of this.pickups.values()) {
      this.scene.remove(pickup.group);
    }
    this.pickups.clear();
  }

  private create(state: PickupState): PickupVisual {
    const group = new THREE.Group();
    if (state.kind === "medkit") {
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.56, 0.3, 0.42),
        MEDKIT_MATERIAL,
      );
      const crossA = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.32, 0.1),
        MEDKIT_CROSS_MATERIAL,
      );
      const crossB = new THREE.Mesh(
        new THREE.BoxGeometry(0.1, 0.32, 0.32),
        MEDKIT_CROSS_MATERIAL,
      );
      crossA.position.z = 0.22;
      crossB.position.z = 0.22;
      group.add(body, crossA, crossB);
    } else if (state.kind === "grenade") {
      const body = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.26, 1),
        GRENADE_BODY_MATERIAL,
      );
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.1, 0.12, 8),
        GRENADE_CAP_MATERIAL,
      );
      const lever = new THREE.Mesh(
        new THREE.BoxGeometry(0.045, 0.21, 0.045),
        GRENADE_CAP_MATERIAL,
      );
      cap.position.y = 0.26;
      lever.position.set(0.14, 0.18, 0);
      lever.rotation.z = -0.35;
      group.add(body, cap, lever);
    } else {
      const shield = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.34, 0),
        ARMOR_MATERIAL,
      );
      shield.scale.set(1, 1.25, 0.55);
      group.add(shield);
    }

    const ring = new THREE.Mesh(
      RING_GEOMETRY,
      state.kind === "grenade"
        ? GRENADE_RING_MATERIAL
        : RING_MATERIAL,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.36;
    group.add(ring);

    group.position.set(state.position.x, state.position.y, state.position.z);
    group.visible = state.available;
    this.scene.add(group);
    const visual = {
      group,
      baseY: state.position.y,
      phase: Math.random() * Math.PI * 2,
    };
    this.pickups.set(state.id, visual);
    return visual;
  }
}
