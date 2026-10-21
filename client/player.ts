import * as THREE from "three";
import {
  ARENA_LIMIT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "../shared/constants";
import { simulateMovement, type MovementModifiers } from "../shared/movement";
import type {
  GameRules,
  MovementInput,
  MovementState,
  Vec3,
  WeaponId,
} from "../shared/types";
import { WEAPONS, WEAPON_ORDER } from "../shared/weapons";
import type { InputManager } from "./input";

export class Player {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly mesh: THREE.Mesh;

  private readonly movementState: MovementState;
  private readonly movementInput: MovementInput;
  private modifiers: MovementModifiers = {};

  constructor(position = new THREE.Vector3(), color = 0xff00ff) {
    this.position.copy(position);

    this.movementState = {
      position: this.position,
      velocity: this.velocity,
      grounded: true,
      accumulator: 0,
    };
    this.movementInput = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      jump: false,
      yaw: 0,
      ads: false,
    };

    const geometry = new THREE.CapsuleGeometry(
      PLAYER_RADIUS,
      PLAYER_HEIGHT - PLAYER_RADIUS * 2,
      4,
      8,
    );
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      flatShading: true,
      roughness: 0.6,
      metalness: 0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.syncMesh();
  }

  get isGrounded(): boolean {
    return this.movementState.grounded;
  }

  get yaw(): number {
    return this.movementInput.yaw;
  }

  setRules(rules: GameRules): void {
    this.modifiers = {
      speedMultiplier: rules.speedMultiplier,
      gravityMultiplier: rules.gravityMultiplier,
    };
  }

  reset(position: Vec3): void {
    this.position.set(position.x, position.y, position.z);
    this.velocity.set(0, 0, 0);
    this.movementState.grounded = true;
    this.movementState.accumulator = 0;
    this.syncMesh();
  }

  snapTo(position: Vec3): void {
    this.position.set(position.x, position.y, position.z);
    this.syncMesh();
  }

  smoothTo(target: THREE.Vector3, blend: number): void {
    this.position.lerp(target, blend);
    this.syncMesh();
  }

  update(
    delta: number,
    input: InputManager,
    cameraDirection: THREE.Vector3,
  ): void {
    this.movementInput.forward = input.isMovingForward();
    this.movementInput.backward = input.isMovingBackward();
    this.movementInput.left = input.isMovingLeft();
    this.movementInput.right = input.isMovingRight();
    this.movementInput.jump = input.isJumping();
    this.movementInput.ads = input.isAiming();

    const horizontalSq =
      cameraDirection.x * cameraDirection.x +
      cameraDirection.z * cameraDirection.z;
    if (horizontalSq > 1e-8) {
      this.movementInput.yaw = Math.atan2(
        -cameraDirection.x,
        -cameraDirection.z,
      );
    }

    simulateMovement(
      this.movementState,
      this.movementInput,
      delta,
      this.modifiers,
    );

    if (this.position.x < -ARENA_LIMIT) {
      this.position.x = -ARENA_LIMIT;
      this.velocity.x = 0;
    } else if (this.position.x > ARENA_LIMIT) {
      this.position.x = ARENA_LIMIT;
      this.velocity.x = 0;
    }

    if (this.position.z < -ARENA_LIMIT) {
      this.position.z = -ARENA_LIMIT;
      this.velocity.z = 0;
    } else if (this.position.z > ARENA_LIMIT) {
      this.position.z = ARENA_LIMIT;
      this.velocity.z = 0;
    }

    this.syncMesh();
  }

  private syncMesh(): void {
    this.mesh.position.set(
      this.position.x,
      this.position.y + PLAYER_HEIGHT / 2,
      this.position.z,
    );
  }
}

interface GunModel {
  group: THREE.Group;
  flash: THREE.Mesh;
  basePosition: THREE.Vector3;
  adsPosition: THREE.Vector3;
  accentMaterial: THREE.MeshStandardMaterial;
}

export class Gun {
  readonly object = new THREE.Group();

  private readonly models = new Map<WeaponId, GunModel>();
  private current: WeaponId = "rifle";
  private aiming = false;
  private recoil = 0;
  private flashRemaining = 0;
  private reloadRemaining = 0;
  private reloadDuration = 0;
  private switchRemaining = 0;
  private readonly euler = new THREE.Euler();
  private readonly compact: boolean;
  private readonly darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x232833,
    emissive: 0x0a1520,
    emissiveIntensity: 0.55,
    roughness: 0.48,
    metalness: 0.55,
    flatShading: true,
  });
  private readonly gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x2d313b,
    emissive: 0x05080c,
    emissiveIntensity: 0.5,
    roughness: 0.85,
    metalness: 0.08,
    flatShading: true,
  });
  private readonly gloveMaterial = new THREE.MeshStandardMaterial({
    color: 0x343943,
    emissive: 0x05080c,
    emissiveIntensity: 0.4,
    roughness: 0.78,
    metalness: 0.05,
    flatShading: true,
  });

  constructor(compact = false) {
    this.compact = compact;
    this.object.scale.setScalar(compact ? 0.85 : 0.94);
    for (const weapon of WEAPON_ORDER) {
      const model = this.buildModel(weapon);
      this.models.set(weapon, model);
      this.object.add(model.group);
      model.group.visible = weapon === this.current;
    }
    this.applyTransform();
  }

  setWeapon(weapon: WeaponId): void {
    if (weapon === this.current) {
      return;
    }
    this.current = weapon;
    this.reloadRemaining = 0;
    this.reloadDuration = 0;
    this.switchRemaining = 0.22;
    for (const [id, model] of this.models) {
      model.group.visible = id === weapon;
    }
  }

  get weapon(): WeaponId {
    return this.current;
  }

  setAiming(aiming: boolean): void {
    this.aiming = aiming;
  }

  reload(durationMs: number): void {
    if (this.reloadRemaining > 0) {
      return;
    }
    this.reloadDuration = durationMs / 1000;
    this.reloadRemaining = this.reloadDuration;
  }

  fire(): void {
    if (this.reloadRemaining > 0) {
      return;
    }
    const spec = WEAPONS[this.current];
    this.recoil = Math.max(this.recoil, spec.recoil);
    this.flashRemaining = 0.055;
    const model = this.models.get(this.current);
    if (model) {
      model.flash.visible = true;
      model.flash.rotation.z = Math.random() * Math.PI;
      model.flash.scale.setScalar(0.8 + Math.random() * 0.55);
    }
  }

  update(delta: number): void {
    const model = this.models.get(this.current);
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 18, delta);
    if (this.flashRemaining > 0) {
      this.flashRemaining -= delta;
      if (this.flashRemaining <= 0 && model) {
        model.flash.visible = false;
      }
    }

    if (this.reloadRemaining > 0) {
      this.reloadRemaining = Math.max(0, this.reloadRemaining - delta);
    }
    if (this.switchRemaining > 0) {
      this.switchRemaining = Math.max(0, this.switchRemaining - delta);
    }

    this.applyTransform();
  }

  private applyTransform(): void {
    const model = this.models.get(this.current);
    if (!model) {
      return;
    }

    const target = this.aiming ? model.adsPosition : model.basePosition;
    const targetX = target.x * (this.compact ? 0.48 : 1);
    const targetZ = target.z * (this.compact ? 1.06 : 1);
    const reloadRatio =
      this.reloadDuration > 0 ? this.reloadRemaining / this.reloadDuration : 0;
    const reloadDip = Math.sin(reloadRatio * Math.PI) * 0.16;
    const switchDip = this.switchRemaining * 0.9;

    const blend = this.aiming ? 0.24 : 0.18;
    this.object.position.x = THREE.MathUtils.lerp(
      this.object.position.x,
      targetX,
      blend,
    );
    this.object.position.y = THREE.MathUtils.lerp(
      this.object.position.y,
      target.y - reloadDip - switchDip,
      blend,
    );
    this.object.position.z = THREE.MathUtils.lerp(
      this.object.position.z,
      targetZ + this.recoil * 0.11,
      blend,
    );

    this.euler.set(
      this.recoil * 0.16 - reloadDip * 0.8,
      this.aiming ? 0 : -0.055,
      this.aiming ? 0 : -0.02,
    );
    this.object.quaternion.setFromEuler(this.euler);
  }

  private buildModel(weapon: WeaponId): GunModel {
    const spec = WEAPONS[weapon];
    const group = new THREE.Group();
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: spec.accent,
      emissive: spec.accent,
      emissiveIntensity: 0.85,
      roughness: 0.35,
      metalness: 0.3,
      flatShading: true,
    });

    const addBox = (
      width: number,
      height: number,
      depth: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    if (weapon === "pistol") {
      addBox(0.1, 0.13, 0.34, 0, 0, -0.12, this.darkMaterial);
      addBox(0.085, 0.24, 0.12, 0, -0.16, 0.03, this.gripMaterial);
      addBox(0.06, 0.035, 0.18, 0, 0.09, -0.14, accentMaterial);
      addBox(0.04, 0.04, 0.08, 0, 0.02, -0.31, this.darkMaterial);
    } else if (weapon === "shotgun") {
      addBox(0.14, 0.15, 0.7, 0, 0, -0.18, this.darkMaterial);
      addBox(0.09, 0.09, 0.5, 0, 0.01, -0.65, this.gripMaterial);
      addBox(0.11, 0.2, 0.16, 0, -0.15, -0.05, this.gripMaterial);
      addBox(0.07, 0.12, 0.26, 0, -0.13, 0.22, this.darkMaterial);
      addBox(0.05, 0.04, 0.28, 0, 0.1, -0.3, accentMaterial);
    } else if (weapon === "sniper") {
      addBox(0.12, 0.14, 0.8, 0, 0, -0.26, this.darkMaterial);
      addBox(0.055, 0.055, 0.62, 0, 0.01, -0.83, this.gripMaterial);
      addBox(0.11, 0.16, 0.28, 0, -0.02, 0.22, this.gripMaterial);
      addBox(0.09, 0.26, 0.13, 0, -0.16, 0.02, this.gripMaterial);
      addBox(0.07, 0.07, 0.3, 0, 0.13, -0.25, this.darkMaterial);
      addBox(0.045, 0.045, 0.16, 0, 0.13, -0.45, accentMaterial);
      addBox(0.1, 0.03, 0.2, 0, 0.1, -0.1, accentMaterial);
    } else {
      const long = weapon === "rifle" ? 0.62 : 0.48;
      addBox(0.12, 0.15, long, 0, 0, -0.2, this.darkMaterial);
      addBox(0.05, 0.05, long * 0.66, 0, 0.012, -0.2 - long * 0.66, this.gripMaterial);
      addBox(0.1, 0.19, 0.15, 0, -0.15, -0.03, this.gripMaterial);
      addBox(0.08, 0.12, 0.24, 0, -0.08, 0.26, this.darkMaterial);
      addBox(0.055, 0.035, long * 0.42, 0, 0.1, -0.24, accentMaterial);
      addBox(0.04, 0.06, 0.06, 0, 0.13, -0.1, this.darkMaterial);
      if (weapon === "smg") {
        addBox(0.03, 0.03, 0.18, 0.075, 0.02, -0.2, accentMaterial);
      }
    }

    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.18, 0.18),
      new THREE.MeshBasicMaterial({
        color: 0xffd27a,
        transparent: true,
        opacity: 0.92,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    flash.position.set(0, 0.01, weapon === "pistol" ? -0.35 : -0.78);
    flash.visible = false;
    flash.renderOrder = 10;
    group.add(flash);

    const glove = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.1, 0.18),
      this.gloveMaterial,
    );
    glove.position.set(0.02, -0.16, 0.08);
    group.add(glove);

    const basePosition =
      weapon === "pistol"
        ? new THREE.Vector3(0.28, -0.23, -0.48)
        : new THREE.Vector3(0.25, -0.22, -0.56);
    const adsPosition =
      weapon === "sniper"
        ? new THREE.Vector3(0, -0.145, -0.34)
        : new THREE.Vector3(0, -0.17, -0.42);

    group.position.copy(basePosition);
    return { group, flash, basePosition, adsPosition, accentMaterial };
  }
}
