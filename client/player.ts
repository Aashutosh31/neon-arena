import * as THREE from "three";
import {
  ARENA_LIMIT,
  MAX_MOVE_SPEED,
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
      height: PLAYER_HEIGHT,
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
      sprint: false,
      crouch: false,
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

interface GunPart {
  object: THREE.Object3D;
  restPosition: THREE.Vector3;
  restRotation: THREE.Euler;
  positionKick: THREE.Vector3;
  rotationKick: THREE.Vector3;
  amount: number;
}

interface GunModel {
  group: THREE.Group;
  flash: THREE.Group;
  flashMaterials: THREE.SpriteMaterial[];
  basePosition: THREE.Vector3;
  adsPosition: THREE.Vector3;
  accentMaterial: THREE.MeshStandardMaterial;
  parts: GunPart[];
  flashScale: number;
  flashDuration: number;
}

let flashStarTexture: THREE.CanvasTexture | null = null;
let flashGlowTexture: THREE.CanvasTexture | null = null;

function getFlashStarTexture(): THREE.CanvasTexture {
  if (flashStarTexture) {
    return flashStarTexture;
  }
  const size = 128;
  const center = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const glow = context.createRadialGradient(
      center,
      center,
      1,
      center,
      center,
      center,
    );
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.22, "rgba(255,255,255,0.92)");
    glow.addColorStop(0.5, "rgba(255,255,255,0.26)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);

    context.translate(center, center);
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 + Math.random() * 0.3;
      const length = center * (0.55 + Math.random() * 0.45);
      const width = 3 + Math.random() * 4;
      context.save();
      context.rotate(angle);
      const spike = context.createLinearGradient(0, 0, length, 0);
      spike.addColorStop(0, "rgba(255,255,255,0.95)");
      spike.addColorStop(0.55, "rgba(255,255,255,0.35)");
      spike.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = spike;
      context.beginPath();
      context.moveTo(0, -width);
      context.lineTo(length, 0);
      context.lineTo(0, width);
      context.closePath();
      context.fill();
      context.restore();
    }
  }
  flashStarTexture = new THREE.CanvasTexture(canvas);
  flashStarTexture.colorSpace = THREE.SRGBColorSpace;
  return flashStarTexture;
}

function getFlashGlowTexture(): THREE.CanvasTexture {
  if (flashGlowTexture) {
    return flashGlowTexture;
  }
  const size = 64;
  const center = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const glow = context.createRadialGradient(
      center,
      center,
      1,
      center,
      center,
      center,
    );
    glow.addColorStop(0, "rgba(255,255,255,1)");
    glow.addColorStop(0.35, "rgba(255,255,255,0.6)");
    glow.addColorStop(0.7, "rgba(255,255,255,0.16)");
    glow.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = glow;
    context.fillRect(0, 0, size, size);
  }
  flashGlowTexture = new THREE.CanvasTexture(canvas);
  flashGlowTexture.colorSpace = THREE.SRGBColorSpace;
  return flashGlowTexture;
}

export class Gun {
  readonly object = new THREE.Group();

  private readonly models = new Map<WeaponId, GunModel>();
  private current: WeaponId = "rifle";
  private aiming = false;
  private recoil = 0;
  private swayX = 0;
  private swayY = 0;
  private swayTargetX = 0;
  private swayTargetY = 0;
  private bobPhase = 0;
  private motionAmount = 0;
  private motionTarget = 0;
  private motionGrounded = true;
  private motionSprinting = false;
  private flashRemaining = 0;
  private reloadRemaining = 0;
  private reloadDuration = 0;
  private switchRemaining = 0;
  private readonly euler = new THREE.Euler();
  private readonly compact: boolean;
  private readonly muzzleLight = new THREE.PointLight(0xffc089, 0, 5.5, 2);
  private readonly darkMaterial = new THREE.MeshStandardMaterial({
    color: 0x3a4350,
    emissive: 0x0e1a26,
    emissiveIntensity: 0.85,
    roughness: 0.5,
    metalness: 0.45,
    envMapIntensity: 1.15,
    flatShading: true,
  });
  private readonly metalMaterial = new THREE.MeshStandardMaterial({
    color: 0x98a3b4,
    emissive: 0x0d1621,
    emissiveIntensity: 0.45,
    roughness: 0.37,
    metalness: 0.72,
    envMapIntensity: 1.25,
    flatShading: true,
  });
  private readonly polymerMaterial = new THREE.MeshStandardMaterial({
    color: 0x252e3a,
    emissive: 0x0a1219,
    emissiveIntensity: 0.75,
    roughness: 0.9,
    metalness: 0.1,
    flatShading: true,
  });
  private readonly brassMaterial = new THREE.MeshStandardMaterial({
    color: 0xd8ad55,
    emissive: 0x2f2006,
    emissiveIntensity: 0.9,
    roughness: 0.34,
    metalness: 0.86,
    flatShading: true,
  });
  private readonly gripMaterial = new THREE.MeshStandardMaterial({
    color: 0x424b59,
    emissive: 0x0b141d,
    emissiveIntensity: 0.7,
    roughness: 0.82,
    metalness: 0.1,
    flatShading: true,
  });
  private readonly gloveMaterial = new THREE.MeshStandardMaterial({
    color: 0x4a5361,
    emissive: 0x0a1219,
    emissiveIntensity: 0.6,
    roughness: 0.76,
    metalness: 0.08,
    flatShading: true,
  });

  constructor(compact = false) {
    this.compact = compact;
    this.object.scale.setScalar(compact ? 0.85 : 0.94);
    this.muzzleLight.position.set(0, 0, -0.9);
    this.object.add(this.muzzleLight);
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

  setMotion(
    lookX: number,
    lookY: number,
    speed: number,
    grounded: boolean,
    sprinting: boolean,
    crouching: boolean,
  ): void {
    const scale = crouching ? 0.55 : 1;
    this.motionTarget =
      Math.min(1.45, speed / MAX_MOVE_SPEED) *
      (sprinting ? 1.25 : 1) *
      scale;
    this.motionGrounded = grounded;
    this.motionSprinting = sprinting;
    this.swayTargetX = Math.min(
      0.035,
      Math.max(-0.035, -lookX * 0.00042),
    );
    this.swayTargetY = Math.min(
      0.025,
      Math.max(-0.025, -lookY * 0.00034),
    );
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
    const model = this.models.get(this.current);
    if (!model) {
      return;
    }
    this.flashRemaining = model.flashDuration;
    model.flash.visible = true;
    model.flash.rotation.z = Math.random() * Math.PI * 2;
    model.flash.scale.setScalar(
      model.flashScale * (0.82 + Math.random() * 0.5),
    );
    for (const material of model.flashMaterials) {
      material.rotation = Math.random() * Math.PI * 2;
    }
    this.muzzleLight.position.copy(model.flash.position);
    this.muzzleLight.intensity = 2.2 + spec.recoil * 3.4;
    for (const part of model.parts) {
      part.amount = 1;
    }
  }

  muzzleWorldPosition(out: THREE.Vector3): THREE.Vector3 {
    const model = this.models.get(this.current);
    this.object.updateWorldMatrix(true, true);
    if (!model) {
      return this.object.getWorldPosition(out);
    }
    return model.flash.getWorldPosition(out);
  }


  update(delta: number): void {
    const model = this.models.get(this.current);
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 22, delta);
    this.motionAmount = THREE.MathUtils.damp(
      this.motionAmount,
      this.motionTarget,
      9,
      delta,
    );
    this.motionTarget = 0;
    this.swayX = THREE.MathUtils.damp(this.swayX, this.swayTargetX, 11, delta);
    this.swayY = THREE.MathUtils.damp(this.swayY, this.swayTargetY, 11, delta);
    this.swayTargetX = 0;
    this.swayTargetY = 0;
    const bobRate = this.motionSprinting ? 12.5 : 8.5;
    if (this.motionAmount > 0.02 && this.motionGrounded) {
      this.bobPhase += delta * bobRate;
    }
    if (this.flashRemaining > 0) {
      this.flashRemaining -= delta;
      if (this.flashRemaining <= 0 && model) {
        model.flash.visible = false;
      }
    }
    this.muzzleLight.intensity = THREE.MathUtils.damp(
      this.muzzleLight.intensity,
      0,
      20,
      delta,
    );
    if (model) {
      for (const part of model.parts) {
        if (part.amount <= 0) {
          continue;
        }
        part.amount = THREE.MathUtils.damp(part.amount, 0, 30, delta);
        part.object.position
          .copy(part.restPosition)
          .addScaledVector(part.positionKick, part.amount);
        part.object.rotation.set(
          part.restRotation.x + part.rotationKick.x * part.amount,
          part.restRotation.y + part.rotationKick.y * part.amount,
          part.restRotation.z + part.rotationKick.z * part.amount,
        );
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

    const swayScale = this.aiming ? 0.28 : 1;
    const groundedScale = this.motionGrounded ? 1 : 0.35;
    const bobX =
      Math.cos(this.bobPhase) * 0.012 * this.motionAmount * groundedScale;
    const bobY =
      Math.sin(this.bobPhase * 2) * 0.011 * this.motionAmount * groundedScale;

    const blend = this.aiming ? 0.24 : 0.18;
    this.object.position.x = THREE.MathUtils.lerp(
      this.object.position.x,
      targetX,
      blend,
    ) + this.swayX * swayScale + bobX;
    this.object.position.y = THREE.MathUtils.lerp(
      this.object.position.y,
      target.y - reloadDip - switchDip,
      blend,
    ) + this.swayY * swayScale + bobY;
    this.object.position.z = THREE.MathUtils.lerp(
      this.object.position.z,
      targetZ + this.recoil * 0.15,
      blend,
    );

    this.euler.set(
      this.recoil * 0.21 - reloadDip * 0.8 + this.swayY * 0.9,
      (this.aiming ? 0 : -0.1) + this.swayX * 0.9,
      (this.aiming ? 0 : -0.045) -
        this.recoil * 0.025 -
        this.swayX * 1.2,
    );
    this.object.quaternion.setFromEuler(this.euler);
  }

  private buildModel(weapon: WeaponId): GunModel {
    const spec = WEAPONS[weapon];
    const group = new THREE.Group();
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: spec.accent,
      emissive: spec.accent,
      emissiveIntensity: 1.15,
      roughness: 0.35,
      metalness: 0.3,
      flatShading: true,
    });
    const lensMaterial = new THREE.MeshBasicMaterial({
      color: spec.accent,
      toneMapped: false,
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

    const addCylinder = (
      radius: number,
      length: number,
      x: number,
      y: number,
      z: number,
      material: THREE.Material,
      segments = 10,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, length, segments, 1),
        material,
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.set(x, y, z);
      group.add(mesh);
      return mesh;
    };

    const addLens = (
      radius: number,
      x: number,
      y: number,
      z: number,
      faceForward: boolean,
    ): THREE.Mesh => {
      const lens = new THREE.Mesh(
        new THREE.CircleGeometry(radius, 18),
        lensMaterial,
      );
      lens.position.set(x, y, z);
      lens.rotation.y = faceForward ? Math.PI : 0;
      group.add(lens);
      return lens;
    };

    const addRail = (
      y: number,
      zCenter: number,
      length: number,
      material: THREE.Material,
    ): void => {
      addBox(0.06, 0.014, length, 0, y, zCenter, material);
      const teeth = Math.max(4, Math.round(length / 0.052));
      for (let index = 0; index < teeth; index += 1) {
        addBox(
          0.07,
          0.011,
          0.014,
          0,
          y + 0.012,
          zCenter - length / 2 + ((index + 0.5) * length) / teeth,
          this.darkMaterial,
        );
      }
    };

    const parts: GunPart[] = [];
    const addPart = (
      object: THREE.Object3D,
      positionKick = new THREE.Vector3(),
      rotationKick = new THREE.Vector3(),
    ): void => {
      parts.push({
        object,
        restPosition: object.position.clone(),
        restRotation: object.rotation.clone(),
        positionKick,
        rotationKick,
        amount: 0,
      });
    };

    let flashZ = -0.8;
    let supportY = -0.12;
    let supportZ = -0.4;

    if (weapon === "pistol") {
      flashZ = -0.42;
      supportY = -0.2;
      supportZ = -0.02;
      addBox(0.1, 0.13, 0.36, 0, 0, -0.14, this.darkMaterial);
      addBox(0.062, 0.032, 0.24, 0, -0.058, -0.16, this.metalMaterial);
      const slide = addBox(
        0.112,
        0.078,
        0.34,
        0,
        0.074,
        -0.15,
        this.metalMaterial,
      );
      addPart(slide, new THREE.Vector3(0, 0, 0.06));
      for (const side of [-1, 1]) {
        addBox(
          0.008,
          0.018,
          0.24,
          side * 0.057,
          0.076,
          -0.16,
          accentMaterial,
        );
      }
      addCylinder(0.016, 0.1, 0, 0.062, -0.33, this.metalMaterial);
      addCylinder(0.024, 0.04, 0, 0.062, -0.385, this.darkMaterial);
      addBox(0.014, 0.022, 0.018, 0, 0.122, -0.285, accentMaterial);
      addBox(0.05, 0.02, 0.022, 0, 0.12, -0.02, this.darkMaterial);
      const grip = addBox(
        0.088,
        0.22,
        0.13,
        0,
        -0.155,
        0.02,
        this.gripMaterial,
      );
      grip.rotation.x = 0.3;
      addBox(0.092, 0.05, 0.14, 0, -0.262, 0.055, this.darkMaterial);
      addBox(0.02, 0.016, 0.1, 0, -0.095, -0.03, this.darkMaterial);
      addBox(0.02, 0.055, 0.016, 0, -0.068, -0.075, this.darkMaterial);
      addBox(0.014, 0.036, 0.014, 0, -0.072, -0.02, this.metalMaterial);
      addBox(0.06, 0.014, 0.058, 0, -0.282, 0.062, accentMaterial);
    } else if (weapon === "revolver") {
      flashZ = -0.56;
      supportY = -0.21;
      supportZ = 0.02;
      addBox(0.12, 0.13, 0.36, 0, 0, -0.12, this.darkMaterial);
      addCylinder(0.022, 0.34, 0, 0.035, -0.34, this.metalMaterial);
      addBox(0.05, 0.035, 0.3, 0, -0.005, -0.33, this.darkMaterial);
      addBox(0.034, 0.018, 0.32, 0, 0.064, -0.34, this.darkMaterial);
      addBox(0.014, 0.03, 0.02, 0, 0.082, -0.5, accentMaterial);
      addCylinder(0.056, 0.17, 0, 0.005, -0.05, this.metalMaterial, 10);
      addCylinder(0.06, 0.012, 0, 0.005, -0.14, accentMaterial, 10);
      addCylinder(0.06, 0.012, 0, 0.005, 0.04, this.darkMaterial, 10);
      addBox(0.03, 0.05, 0.16, 0.062, 0, -0.05, this.darkMaterial);
      const grip = addBox(
        0.088,
        0.24,
        0.12,
        0,
        -0.175,
        0.055,
        this.gripMaterial,
      );
      grip.rotation.x = 0.42;
      addBox(0.09, 0.024, 0.1, 0, -0.29, 0.11, this.metalMaterial);
      addBox(0.02, 0.016, 0.1, 0, -0.09, -0.01, this.darkMaterial);
      addBox(0.02, 0.05, 0.016, 0, -0.062, -0.055, this.darkMaterial);
      addBox(0.014, 0.036, 0.014, 0, -0.066, -0.005, this.metalMaterial);
      const hammer = addBox(
        0.032,
        0.06,
        0.035,
        0,
        0.065,
        0.075,
        this.metalMaterial,
      );
      hammer.rotation.x = -0.2;
      addPart(hammer, new THREE.Vector3(), new THREE.Vector3(-0.55, 0, 0));
    } else if (weapon === "rifle" || weapon === "smg") {
      const smg = weapon === "smg";
      const receiverZ = smg ? -0.1 : -0.12;
      const receiverLength = smg ? 0.42 : 0.5;
      const handguardZ = smg ? -0.42 : -0.52;
      const handguardLength = smg ? 0.26 : 0.36;
      const barrelZ = smg ? -0.6 : -0.82;
      const barrelLength = smg ? 0.28 : 0.26;
      const muzzleZ = smg ? -0.78 : -1.02;
      flashZ = muzzleZ - 0.05;
      supportY = -0.11;
      supportZ = handguardZ - 0.02;

      addBox(
        0.12,
        0.15,
        receiverLength,
        0,
        0,
        receiverZ,
        this.darkMaterial,
      );
      addBox(0.1, 0.04, 0.3, 0, 0.06, receiverZ, this.metalMaterial);
      addRail(0.088, receiverZ - 0.02, 0.3, this.darkMaterial);
      addBox(
        0.105,
        0.11,
        handguardLength,
        0,
        0.005,
        handguardZ,
        this.darkMaterial,
      );
      for (const side of [-1, 1]) {
        for (let index = 0; index < 3; index += 1) {
          addBox(
            0.006,
            0.026,
            0.055,
            side * 0.054,
            0.015,
            handguardZ - handguardLength / 2 + 0.08 + index * 0.085,
            this.polymerMaterial,
          );
        }
      }
      addBox(
        0.022,
        0.022,
        handguardLength * 0.85,
        0,
        -0.052,
        handguardZ,
        this.metalMaterial,
      );
      addCylinder(0.015, barrelLength, 0, 0.02, barrelZ, this.metalMaterial);
      addCylinder(0.027, 0.07, 0, 0.02, muzzleZ, this.darkMaterial);
      if (smg) {
        addCylinder(0.033, 0.16, 0, 0.02, muzzleZ + 0.05, this.metalMaterial);
        addCylinder(0.035, 0.014, 0, 0.02, muzzleZ + 0.13, accentMaterial);
      } else {
        addCylinder(0.031, 0.014, 0, 0.02, muzzleZ + 0.045, accentMaterial);
      }

      addBox(0.1, 0.13, 0.26, 0, -0.005, 0.3, this.darkMaterial);
      addBox(0.09, 0.045, 0.18, 0, 0.068, 0.24, this.darkMaterial);
      addBox(0.104, 0.15, 0.028, 0, -0.005, 0.44, this.gripMaterial);
      for (const side of [-1, 1]) {
        addBox(
          0.006,
          0.03,
          0.26,
          side * 0.051,
          0.0,
          receiverZ,
          accentMaterial,
        );
      }

      const grip = addBox(
        0.08,
        0.2,
        0.11,
        0,
        -0.16,
        0.08,
        this.gripMaterial,
      );
      grip.rotation.x = 0.2;
      addBox(0.02, 0.016, 0.11, 0, -0.1, -0.02, this.darkMaterial);
      addBox(0.02, 0.05, 0.016, 0, -0.075, -0.07, this.darkMaterial);
      addBox(0.014, 0.036, 0.014, 0, -0.078, -0.02, this.metalMaterial);
      const magazine = addBox(
        0.072,
        0.24,
        0.13,
        0,
        -0.2,
        -0.17,
        this.darkMaterial,
      );
      magazine.rotation.x = -0.16;
      addBox(0.078, 0.03, 0.145, 0, -0.32, -0.155, accentMaterial);

      addBox(0.055, 0.075, 0.13, 0, 0.15, -0.06, this.darkMaterial);
      addBox(0.05, 0.03, 0.032, 0, 0.11, -0.01, this.darkMaterial);
      addBox(0.05, 0.03, 0.032, 0, 0.11, -0.12, this.darkMaterial);
      addLens(0.021, 0, 0.15, -0.128, true);
      addLens(0.018, 0, 0.15, 0.007, false);

      addBox(0.012, 0.045, 0.018, 0, 0.11, 0.05, this.darkMaterial);
      addBox(
        0.012,
        0.04,
        0.016,
        0,
        0.085,
        handguardZ - handguardLength / 2 + 0.02,
        accentMaterial,
      );
      const chargingHandle = addBox(
        0.03,
        0.045,
        0.11,
        0.078,
        0.025,
        -0.03,
        accentMaterial,
      );
      addPart(
        chargingHandle,
        new THREE.Vector3(0, 0, 0.065),
        new THREE.Vector3(0, 0, 0.16),
      );
    } else if (weapon === "dmr") {
      flashZ = -1.18;
      supportY = -0.11;
      supportZ = -0.52;
      addBox(0.13, 0.15, 0.62, 0, 0, -0.14, this.darkMaterial);
      addBox(0.11, 0.12, 0.3, 0, 0.005, -0.5, this.darkMaterial);
      addRail(0.088, -0.12, 0.4, this.darkMaterial);
      addCylinder(0.018, 0.4, 0, 0.02, -0.9, this.metalMaterial);
      addCylinder(0.028, 0.08, 0, 0.02, -1.12, this.darkMaterial);
      addCylinder(0.031, 0.014, 0, 0.02, -1.075, accentMaterial);
      addBox(0.1, 0.045, 0.26, 0, -0.05, -0.52, this.metalMaterial);

      addCylinder(0.045, 0.34, 0, 0.21, -0.16, this.darkMaterial, 12);
      addCylinder(0.058, 0.09, 0, 0.21, -0.36, this.darkMaterial, 12);
      addCylinder(0.055, 0.07, 0, 0.21, 0.03, this.darkMaterial, 12);
      addLens(0.045, 0, 0.21, -0.406, true);
      addLens(0.04, 0, 0.21, 0.066, false);
      addBox(0.06, 0.05, 0.035, 0, 0.16, -0.27, this.darkMaterial);
      addBox(0.06, 0.05, 0.035, 0, 0.16, -0.05, this.darkMaterial);

      addBox(0.11, 0.15, 0.3, 0, -0.005, 0.34, this.darkMaterial);
      addBox(0.1, 0.05, 0.16, 0, 0.07, 0.3, this.darkMaterial);
      addBox(0.114, 0.17, 0.03, 0, -0.005, 0.5, this.gripMaterial);
      for (const side of [-1, 1]) {
        addBox(0.006, 0.03, 0.32, side * 0.066, 0.0, -0.14, accentMaterial);
      }
      const grip = addBox(
        0.082,
        0.2,
        0.11,
        0,
        -0.165,
        0.1,
        this.gripMaterial,
      );
      grip.rotation.x = 0.28;
      addBox(0.02, 0.016, 0.11, 0, -0.1, 0.0, this.darkMaterial);
      addBox(0.02, 0.05, 0.016, 0, -0.075, -0.05, this.darkMaterial);
      addBox(0.014, 0.036, 0.014, 0, -0.078, 0.0, this.metalMaterial);
      const magazine = addBox(
        0.074,
        0.24,
        0.13,
        0,
        -0.2,
        -0.12,
        this.darkMaterial,
      );
      magazine.rotation.x = -0.14;
      addBox(0.08, 0.03, 0.145, 0, -0.32, -0.105, accentMaterial);
      const bolt = addBox(
        0.035,
        0.04,
        0.16,
        0.09,
        0.035,
        0.02,
        accentMaterial,
      );
      addPart(
        bolt,
        new THREE.Vector3(0, 0, 0.07),
        new THREE.Vector3(0, 0, 0.24),
      );
    } else if (weapon === "lmg") {
      flashZ = -1.27;
      supportY = -0.12;
      supportZ = -0.68;
      addBox(0.18, 0.18, 0.66, 0, 0, -0.16, this.darkMaterial);
      addBox(0.15, 0.15, 0.46, 0, 0.005, -0.68, this.darkMaterial);
      addCylinder(0.078, 0.02, 0, 0.005, -0.5, accentMaterial);
      addCylinder(0.078, 0.02, 0, 0.005, -0.72, accentMaterial);
      addCylinder(0.017, 0.28, 0, 0.02, -1.02, this.metalMaterial);
      addCylinder(0.03, 0.09, 0, 0.02, -1.2, this.darkMaterial);
      addBox(0.1, 0.05, 0.26, 0, -0.06, -0.68, this.metalMaterial);
      addCylinder(0.017, 0.12, 0, 0.02, -0.47, this.metalMaterial);

      addBox(0.2, 0.24, 0.28, 0, -0.2, -0.02, this.gripMaterial);
      addBox(0.208, 0.05, 0.29, 0, -0.31, -0.02, this.darkMaterial);
      addBox(0.05, 0.03, 0.02, 0.08, -0.12, -0.16, accentMaterial);
      for (let index = 0; index < 4; index += 1) {
        addBox(
          0.026,
          0.02,
          0.032,
          0.02,
          -0.1 + index * 0.022,
          -0.16 + index * 0.012,
          this.brassMaterial,
        );
      }

      addBox(0.09, 0.2, 0.12, 0, -0.15, 0.12, this.gripMaterial);
      addBox(0.11, 0.16, 0.24, 0, -0.005, 0.32, this.darkMaterial);
      addBox(0.115, 0.19, 0.03, 0, -0.005, 0.45, this.gripMaterial);
      addBox(0.02, 0.016, 0.11, 0, -0.09, 0.02, this.darkMaterial);
      const topRail = addBox(
        0.07,
        0.035,
        0.4,
        0,
        0.11,
        -0.16,
        accentMaterial,
      );
      addPart(
        topRail,
        new THREE.Vector3(0, 0.02, 0),
        new THREE.Vector3(-0.2, 0, 0),
      );
      addBox(0.05, 0.06, 0.3, 0.095, 0.04, -0.16, this.darkMaterial);
      for (const side of [-1, 1]) {
        const leg = addBox(
          0.025,
          0.025,
          0.24,
          side * 0.06,
          -0.07,
          -0.52,
          this.metalMaterial,
        );
        leg.rotation.x = -0.35;
      }
    } else if (weapon === "shotgun") {
      flashZ = -1.04;
      supportY = -0.12;
      supportZ = -0.56;
      addBox(0.14, 0.15, 0.52, 0, 0, -0.15, this.darkMaterial);
      addCylinder(0.028, 0.55, 0, 0.045, -0.72, this.metalMaterial);
      addCylinder(0.02, 0.48, 0, -0.02, -0.65, this.metalMaterial);
      addBox(0.05, 0.05, 0.1, 0, -0.02, -0.36, this.darkMaterial);
      addBox(0.014, 0.03, 0.016, 0, 0.088, -0.97, accentMaterial);

      const pump = new THREE.Group();
      pump.position.set(0, -0.025, -0.56);
      const pumpBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.105, 0.1, 0.26),
        this.gripMaterial,
      );
      pump.add(pumpBody);
      for (let index = 0; index < 5; index += 1) {
        const rib = new THREE.Mesh(
          new THREE.BoxGeometry(0.108, 0.012, 0.014),
          this.darkMaterial,
        );
        rib.position.set(0, 0, -0.1 + index * 0.048);
        pump.add(rib);
      }
      group.add(pump);
      addPart(pump, new THREE.Vector3(0, 0, 0.11));

      addBox(0.11, 0.14, 0.28, 0, -0.005, 0.28, this.darkMaterial);
      addBox(0.11, 0.05, 0.16, 0, 0.07, 0.24, this.darkMaterial);
      addBox(0.114, 0.16, 0.03, 0, -0.005, 0.44, this.gripMaterial);
      const grip = addBox(
        0.08,
        0.19,
        0.11,
        0,
        -0.15,
        0.12,
        this.gripMaterial,
      );
      grip.rotation.x = 0.24;
      addBox(0.02, 0.016, 0.1, 0, -0.09, 0.02, this.darkMaterial);
      addBox(0.02, 0.05, 0.016, 0, -0.068, -0.03, this.darkMaterial);
      addBox(0.014, 0.036, 0.014, 0, -0.07, 0.02, this.metalMaterial);
      addBox(0.012, 0.03, 0.34, 0.072, 0.005, -0.35, accentMaterial);
      for (let index = 0; index < 3; index += 1) {
        addBox(
          0.026,
          0.026,
          0.052,
          -0.078,
          -0.02,
          0.0 + index * 0.062,
          this.brassMaterial,
        );
      }
    } else if (weapon === "sniper") {
      flashZ = -1.36;
      supportY = -0.12;
      supportZ = -0.64;
      addBox(0.12, 0.15, 0.7, 0, 0, -0.2, this.darkMaterial);
      addBox(0.1, 0.03, 0.4, 0, 0.085, -0.2, this.metalMaterial);
      addCylinder(0.018, 0.52, 0, 0.02, -0.95, this.metalMaterial);
      addCylinder(0.033, 0.12, 0, 0.02, -1.27, this.darkMaterial);
      addCylinder(0.036, 0.014, 0, 0.02, -1.21, accentMaterial);
      for (const side of [-1, 1]) {
        addBox(0.026, 0.014, 0.05, side * 0.03, 0.02, -1.26, this.darkMaterial);
      }

      addCylinder(0.048, 0.36, 0, 0.21, -0.2, this.darkMaterial, 14);
      addCylinder(0.066, 0.1, 0, 0.21, -0.42, this.darkMaterial, 14);
      addCylinder(0.06, 0.08, 0, 0.21, 0.02, this.darkMaterial, 14);
      addLens(0.052, 0, 0.21, -0.472, true);
      addLens(0.045, 0, 0.21, 0.062, false);
      addBox(0.065, 0.05, 0.04, 0, 0.155, -0.32, this.darkMaterial);
      addBox(0.065, 0.05, 0.04, 0, 0.155, -0.05, this.darkMaterial);
      addCylinder(0.012, 0.03, 0, 0.258, -0.18, accentMaterial);

      addBox(0.1, 0.16, 0.34, 0, -0.01, 0.38, this.darkMaterial);
      addBox(0.09, 0.05, 0.2, 0, 0.08, 0.32, this.darkMaterial);
      addBox(0.105, 0.18, 0.03, 0, -0.01, 0.56, this.gripMaterial);
      for (const side of [-1, 1]) {
        addBox(0.006, 0.03, 0.4, side * 0.061, 0.0, -0.2, accentMaterial);
      }
      const grip = addBox(
        0.082,
        0.2,
        0.11,
        0,
        -0.17,
        0.1,
        this.gripMaterial,
      );
      grip.rotation.x = 0.3;
      addBox(0.02, 0.016, 0.11, 0, -0.1, 0.0, this.darkMaterial);
      addBox(0.02, 0.05, 0.016, 0, -0.075, -0.05, this.darkMaterial);
      addBox(0.014, 0.036, 0.014, 0, -0.078, 0.0, this.metalMaterial);
      const magazine = addBox(
        0.072,
        0.22,
        0.13,
        0,
        -0.19,
        -0.16,
        this.darkMaterial,
      );
      magazine.rotation.x = -0.12;
      addBox(0.078, 0.03, 0.145, 0, -0.3, -0.15, accentMaterial);
      const bolt = addBox(
        0.035,
        0.04,
        0.16,
        0.088,
        0.03,
        0.05,
        accentMaterial,
      );
      addPart(
        bolt,
        new THREE.Vector3(0, 0, 0.085),
        new THREE.Vector3(0, 0, 0.38),
      );
      for (const side of [-1, 1]) {
        const leg = addBox(
          0.022,
          0.022,
          0.28,
          side * 0.05,
          -0.11,
          -0.58,
          this.metalMaterial,
        );
        leg.rotation.x = -0.25;
      }
    }

    const supportHand = new THREE.Mesh(
      new THREE.BoxGeometry(0.078, 0.07, 0.14),
      this.gloveMaterial,
    );
    supportHand.position.set(0.035, supportY, supportZ);
    supportHand.rotation.x = 0.42;
    group.add(supportHand);

    const flashColor = new THREE.Color(spec.accent).lerp(
      new THREE.Color(0xffd59a),
      0.55,
    );
    const flashMaterials: THREE.SpriteMaterial[] = [];
    const flash = new THREE.Group();
    const starMaterial = new THREE.SpriteMaterial({
      map: getFlashStarTexture(),
      color: flashColor,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
    const star = new THREE.Sprite(starMaterial);
    star.scale.setScalar(0.26);
    star.renderOrder = 10;
    flash.add(star);
    flashMaterials.push(starMaterial);
    const glowMaterial = new THREE.SpriteMaterial({
      map: getFlashGlowTexture(),
      color: flashColor,
      transparent: true,
      opacity: 0.7,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
      fog: false,
    });
    const glow = new THREE.Sprite(glowMaterial);
    glow.scale.setScalar(0.38);
    glow.renderOrder = 9;
    flash.add(glow);
    flashMaterials.push(glowMaterial);
    flash.position.set(0, 0.015, flashZ);
    flash.visible = false;
    group.add(flash);

    const basePosition =
      weapon === "pistol"
        ? new THREE.Vector3(0.27, -0.19, -0.46)
        : weapon === "revolver"
          ? new THREE.Vector3(0.26, -0.19, -0.48)
          : weapon === "shotgun"
            ? new THREE.Vector3(0.25, -0.2, -0.52)
            : weapon === "lmg"
              ? new THREE.Vector3(0.26, -0.2, -0.55)
              : weapon === "sniper"
                ? new THREE.Vector3(0.23, -0.18, -0.54)
                : weapon === "smg"
                  ? new THREE.Vector3(0.24, -0.19, -0.52)
                  : new THREE.Vector3(0.24, -0.19, -0.54);
    const adsPosition =
      weapon === "sniper"
        ? new THREE.Vector3(0, -0.21, -0.3)
        : weapon === "dmr"
          ? new THREE.Vector3(0, -0.21, -0.34)
          : weapon === "rifle" || weapon === "smg"
            ? new THREE.Vector3(0, -0.155, -0.4)
            : new THREE.Vector3(0, -0.17, -0.42);
    const flashScale =
      weapon === "shotgun"
        ? 1.5
        : weapon === "sniper"
          ? 1.3
          : weapon === "lmg"
            ? 1.18
            : weapon === "dmr"
              ? 1.1
              : weapon === "revolver"
                ? 0.78
                : weapon === "pistol"
                  ? 0.64
                  : weapon === "smg"
                    ? 0.82
                    : 1;
    const flashDuration =
      weapon === "sniper"
        ? 0.095
        : weapon === "shotgun"
          ? 0.085
          : weapon === "revolver"
            ? 0.075
            : weapon === "dmr"
              ? 0.07
              : weapon === "lmg"
                ? 0.06
                : weapon === "pistol"
                  ? 0.045
                  : weapon === "smg"
                    ? 0.04
                    : 0.055;

    group.position.copy(basePosition);
    return {
      group,
      flash,
      flashMaterials,
      basePosition,
      adsPosition,
      accentMaterial,
      parts,
      flashScale,
      flashDuration,
    };
  }
}
