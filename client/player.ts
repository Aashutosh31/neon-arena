import * as THREE from "three";
import {
  ARENA_LIMIT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "../shared/constants";
import { simulateMovement } from "../shared/movement";
import type { MovementInput, MovementState, Vec3 } from "../shared/types";
import type { InputManager } from "./input";

/**
 * Local player prediction wrapper.
 *
 * The actual math lives in shared/movement.ts and is the exact function the
 * server runs. This class only adapts InputManager + camera yaw into that
 * simulation and mirrors the result onto the capsule mesh.
 */
export class Player {
  /** Feet position, not mesh center. y = 0 is the floor. */
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly mesh: THREE.Mesh;

  // Reused each frame; simulateMovement mutates these in place.
  private readonly movementState: MovementState;
  private readonly movementInput: MovementInput;

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
    };

    // Low-poly capsule: 4 cap segments x 8 radial segments keeps the tri count
    // tiny while still reading as a person at arena distances.
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

  /** Last valid horizontal look angle, also sent to the server. */
  get yaw(): number {
    return this.movementInput.yaw;
  }

  /** Snap to an authoritative spawn/respawn without keeping old momentum. */
  reset(position: Vec3): void {
    this.position.set(position.x, position.y, position.z);
    this.velocity.set(0, 0, 0);
    this.movementState.grounded = true;
    this.movementState.accumulator = 0;
    this.syncMesh();
  }

  /**
   * Predicts this frame locally with the shared simulation. The server runs
   * the same function on its fixed tick; game_state corrections snap us back
   * only when prediction diverges beyond the reconciliation threshold.
   *
   * @param delta Seconds since the last frame.
   * @param input Current key state.
   * @param cameraDirection World-space look direction used for yaw.
   */
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

    // Keep the previous yaw when looking straight up/down; atan2(0, 0) is
    // undefined and would make forward movement flip direction.
    const horizontalSq =
      cameraDirection.x * cameraDirection.x +
      cameraDirection.z * cameraDirection.z;
    if (horizontalSq > 1e-8) {
      this.movementInput.yaw = Math.atan2(
        -cameraDirection.x,
        -cameraDirection.z,
      );
    }

    simulateMovement(this.movementState, this.movementInput, delta);

    // Match the server's bounds so prediction does not run off the arena.
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
    // Capsule origin is its center, while `position` is at the feet.
    this.mesh.position.set(
      this.position.x,
      this.position.y + PLAYER_HEIGHT / 2,
      this.position.z,
    );
  }
}

/**
 * First-person viewmodel. Lives in camera space so it always follows the view.
 * Only two boxes and two materials: cheap enough for integrated graphics.
 */
export class Gun {
  readonly object = new THREE.Group();

  private readonly basePosition = new THREE.Vector3(0.26, -0.22, -0.55);
  private readonly flash: THREE.Mesh;
  private recoil = 0;
  private flashRemaining = 0;

  constructor() {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.12, 0.42),
      new THREE.MeshStandardMaterial({
        color: 0x15151f,
        roughness: 0.55,
        metalness: 0.2,
        flatShading: true,
      }),
    );

    const accent = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.05, 0.3),
      new THREE.MeshStandardMaterial({
        color: 0x00ffff,
        emissive: 0x00ffff,
        emissiveIntensity: 1.2,
        roughness: 0.4,
        flatShading: true,
      }),
    );
    accent.position.set(0, 0.075, -0.02);

    this.flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.16, 0.16),
      new THREE.MeshBasicMaterial({
        color: 0xffff88,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    );
    this.flash.position.set(0, 0.01, -0.24);
    this.flash.visible = false;
    this.flash.renderOrder = 10;

    this.object.add(body, accent, this.flash);
    this.object.position.copy(this.basePosition);
    this.object.rotation.y = -0.06;
  }

  /** Trigger the kick; frame-rate independent return happens in update(). */
  fire(): void {
    this.recoil = 1;
    this.flashRemaining = 0.05;
    this.flash.visible = true;
    this.flash.rotation.z = Math.random() * Math.PI;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.45);
  }

  update(delta: number): void {
    this.recoil = THREE.MathUtils.damp(this.recoil, 0, 18, delta);

    if (this.flashRemaining > 0) {
      this.flashRemaining -= delta;
      if (this.flashRemaining <= 0) {
        this.flash.visible = false;
      }
    }

    this.object.position.set(
      this.basePosition.x,
      this.basePosition.y + this.recoil * 0.025,
      this.basePosition.z + this.recoil * 0.1,
    );
    this.object.rotation.x = this.recoil * 0.18;
  }
}
