import * as THREE from "three";
import type { WeaponId } from "../shared/types";
import type { GameAudio } from "./audio";
import type { RemoteManager } from "./remotes";

const TRACER_RANGE = 160;
const TRACER_LIFETIME = 0.055;
const SPARK_LIFETIME = 0.2;
const SPARK_SIZE = 0.09;
const SPARK_GRAVITY = -9;

interface Tracer {
  line: THREE.Line;
  remaining: number;
}

export class CombatEffects {
  private readonly staticMeshes: THREE.Object3D[];
  private readonly audio: GameAudio;
  private readonly raycaster = new THREE.Raycaster();
  private readonly tracers: Tracer[] = [];
  private tracerCursor = 0;
  private readonly tracerEnd = new THREE.Vector3();
  private readonly remoteOrigin = new THREE.Vector3();
  private readonly remoteDirection = new THREE.Vector3();
  private readonly remoteEnd = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly sparkPositions: Float32Array;
  private readonly sparkColors: Float32Array;
  private readonly sparkBaseColors: Float32Array;
  private readonly sparkVelocities: Float32Array;
  private readonly sparkRemaining: Float32Array;
  private readonly sparkPositionAttribute: THREE.BufferAttribute;
  private readonly sparkColorAttribute: THREE.BufferAttribute;
  private readonly sparkCount: number;
  private sparkCursor = 0;
  private sparksDirty = false;

  constructor(
    scene: THREE.Scene,
    staticMeshes: THREE.Object3D[],
    audio: GameAudio,
    mobile: boolean,
  ) {
    this.staticMeshes = staticMeshes;
    this.audio = audio;
    this.raycaster.far = TRACER_RANGE;

    const tracerCount = mobile ? 12 : 20;
    const tracerMaterial = new THREE.LineBasicMaterial({
      color: 0x7df9ff,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    for (let index = 0; index < tracerCount; index += 1) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(6), 3),
      );
      const line = new THREE.Line(geometry, tracerMaterial);
      line.visible = false;
      line.frustumCulled = false;
      scene.add(line);
      this.tracers.push({ line, remaining: 0 });
    }

    this.sparkCount = mobile ? 24 : 42;
    this.sparkPositions = new Float32Array(this.sparkCount * 3);
    this.sparkColors = new Float32Array(this.sparkCount * 3);
    this.sparkBaseColors = new Float32Array(this.sparkCount * 3);
    this.sparkVelocities = new Float32Array(this.sparkCount * 3);
    this.sparkRemaining = new Float32Array(this.sparkCount);
    for (let index = 0; index < this.sparkCount; index += 1) {
      this.sparkPositions[index * 3 + 1] = -100;
    }

    const sparkGeometry = new THREE.BufferGeometry();
    this.sparkPositionAttribute = new THREE.BufferAttribute(
      this.sparkPositions,
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    this.sparkColorAttribute = new THREE.BufferAttribute(
      this.sparkColors,
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    sparkGeometry.setAttribute("position", this.sparkPositionAttribute);
    sparkGeometry.setAttribute("color", this.sparkColorAttribute);
    const sparkMaterial = new THREE.PointsMaterial({
      size: SPARK_SIZE,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
    sparks.frustumCulled = false;
    scene.add(sparks);
  }

  aimAtRemote(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    remotes: RemoteManager,
  ): boolean {
    this.raycaster.set(origin, direction);
    const hits = this.raycaster.intersectObjects(
      remotes.hittableTargets,
      true,
    );
    return hits.length > 0 && remotes.isRemoteObject(hits[0].object);
  }

  fireLocal(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    remotes: RemoteManager,
  ): void {
    this.raycaster.set(origin, direction);
    const hits = this.raycaster.intersectObjects(
      remotes.hittableTargets,
      true,
    );
    if (hits.length > 0) {
      const hit = hits[0];
      this.tracerEnd.copy(hit.point);
      this.setImpactNormal(hit, direction);
      this.spawnSparks(hit.point, this.normal);
    } else {
      this.tracerEnd
        .copy(origin)
        .addScaledVector(direction, TRACER_RANGE);
    }
    this.spawnTracer(origin, this.tracerEnd);
  }

  spawnRemoteShot(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    weapon: WeaponId,
  ): void {
    this.remoteOrigin.set(origin.x, origin.y, origin.z);
    this.remoteDirection.set(direction.x, direction.y, direction.z);
    this.remoteEnd
      .copy(this.remoteOrigin)
      .addScaledVector(this.remoteDirection, TRACER_RANGE);
    this.raycaster.set(this.remoteOrigin, this.remoteDirection);
    const hits = this.raycaster.intersectObjects(
      this.staticMeshes,
      false,
    );
    if (hits.length > 0) {
      this.remoteEnd.copy(hits[0].point);
    }
    this.spawnTracer(this.remoteOrigin, this.remoteEnd);
    this.audio.playRemoteShoot(weapon);
  }

  update(delta: number): void {
    for (const tracer of this.tracers) {
      if (!tracer.line.visible) {
        continue;
      }
      tracer.remaining -= delta;
      if (tracer.remaining <= 0) {
        tracer.line.visible = false;
      }
    }

    let changed = false;
    for (let index = 0; index < this.sparkCount; index += 1) {
      if (this.sparkRemaining[index] <= 0) {
        continue;
      }
      const offset = index * 3;
      this.sparkRemaining[index] -= delta;
      if (this.sparkRemaining[index] <= 0) {
        this.sparkColors[offset] = 0;
        this.sparkColors[offset + 1] = 0;
        this.sparkColors[offset + 2] = 0;
        this.sparkPositions[offset + 1] = -100;
        changed = true;
        continue;
      }
      this.sparkVelocities[offset + 1] += SPARK_GRAVITY * delta;
      this.sparkPositions[offset] += this.sparkVelocities[offset] * delta;
      this.sparkPositions[offset + 1] +=
        this.sparkVelocities[offset + 1] * delta;
      this.sparkPositions[offset + 2] +=
        this.sparkVelocities[offset + 2] * delta;
      if (this.sparkPositions[offset + 1] < 0.01) {
        this.sparkPositions[offset + 1] = 0.01;
        this.sparkVelocities[offset + 1] *= -0.35;
        this.sparkVelocities[offset] *= 0.7;
        this.sparkVelocities[offset + 2] *= 0.7;
      }
      const fade = this.sparkRemaining[index] / SPARK_LIFETIME;
      this.sparkColors[offset] = this.sparkBaseColors[offset] * fade;
      this.sparkColors[offset + 1] =
        this.sparkBaseColors[offset + 1] * fade;
      this.sparkColors[offset + 2] =
        this.sparkBaseColors[offset + 2] * fade;
      changed = true;
    }
    if (changed || this.sparksDirty) {
      this.sparkPositionAttribute.needsUpdate = true;
      this.sparkColorAttribute.needsUpdate = true;
      this.sparksDirty = false;
    }
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const tracer = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    const positions = tracer.line.geometry.getAttribute(
      "position",
    ) as THREE.BufferAttribute;
    positions.setXYZ(0, from.x, from.y, from.z);
    positions.setXYZ(1, to.x, to.y, to.z);
    positions.needsUpdate = true;
    tracer.remaining = TRACER_LIFETIME;
    tracer.line.visible = true;
  }

  private setImpactNormal(
    hit: THREE.Intersection,
    direction: THREE.Vector3,
  ): void {
    if (!hit.face) {
      this.normal.copy(direction).negate();
      return;
    }
    this.normal.copy(hit.face.normal);
    if (
      hit.object instanceof THREE.InstancedMesh &&
      hit.instanceId !== undefined
    ) {
      hit.object.getMatrixAt(hit.instanceId, this.instanceMatrix);
      this.normalMatrix.getNormalMatrix(this.instanceMatrix);
      this.normal.applyMatrix3(this.normalMatrix).normalize();
      return;
    }
    this.normal.transformDirection(hit.object.matrixWorld);
  }

  private spawnSparks(
    point: THREE.Vector3,
    normal: THREE.Vector3,
  ): void {
    const count = 2 + Math.floor(Math.random() * 3);
    for (let particle = 0; particle < count; particle += 1) {
      const index = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkCount;
      const offset = index * 3;
      this.sparkPositions[offset] = point.x + normal.x * 0.02;
      this.sparkPositions[offset + 1] = point.y + normal.y * 0.02;
      this.sparkPositions[offset + 2] = point.z + normal.z * 0.02;
      const speed = 1.5 + Math.random() * 2.5;
      this.sparkVelocities[offset] =
        (normal.x * 0.8 + (Math.random() - 0.5) * 1.3) * speed;
      this.sparkVelocities[offset + 1] =
        (normal.y * 0.8 + Math.random() * 1.1) * speed;
      this.sparkVelocities[offset + 2] =
        (normal.z * 0.8 + (Math.random() - 0.5) * 1.3) * speed;
      const yellow = Math.random() < 0.45;
      this.sparkBaseColors[offset] = yellow ? 1 : 0.25;
      this.sparkBaseColors[offset + 1] = 0.9;
      this.sparkBaseColors[offset + 2] = yellow ? 0.35 : 1;
      this.sparkColors[offset] = this.sparkBaseColors[offset];
      this.sparkColors[offset + 1] = this.sparkBaseColors[offset + 1];
      this.sparkColors[offset + 2] = this.sparkBaseColors[offset + 2];
      this.sparkRemaining[index] = SPARK_LIFETIME;
    }
    this.sparksDirty = true;
  }
}
