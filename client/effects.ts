import * as THREE from "three";
import { spreadDirection } from "../shared/combat";
import type { GameMode, TeamId, WeaponId } from "../shared/types";
import { WEAPONS } from "../shared/weapons";
import type { GameAudio } from "./audio";
import type { RemoteManager } from "./remotes";

const TRACER_RANGE = 260;
const TRACER_SPEED = 340;
const TRACER_TAIL = 8.5;
const TRACER_FADE = 0.075;
const SNIPER_BEAM_LIFETIME = 0.26;
const SPARK_LIFETIME = 0.24;
const SPARK_SIZE = 0.1;
const SPARK_GRAVITY = -9;
const SHELL_LIFETIME = 1.7;
const DECAL_LIFETIME = 7;
const DECAL_FADE = 1.3;

const UP = new THREE.Vector3(0, 1, 0);
const PLANE_FORWARD = new THREE.Vector3(0, 0, 1);

interface Tracer {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  from: THREE.Vector3;
  direction: THREE.Vector3;
  length: number;
  traveled: number;
  remaining: number;
  active: boolean;
}

interface SniperBeam {
  mesh: THREE.Mesh<THREE.CylinderGeometry, THREE.MeshBasicMaterial>;
  remaining: number;
}

interface FlashParticle {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  remaining: number;
  life: number;
  baseScale: number;
  grow: number;
}

interface SmokePuff {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  velocity: THREE.Vector3;
  remaining: number;
  life: number;
  baseScale: number;
  grow: number;
  spin: number;
}

interface Decal {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  remaining: number;
}

interface Shell {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  spin: THREE.Vector3;
  remaining: number;
}

function createSoftTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      1,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.32, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.62, "rgba(255,255,255,0.28)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createScorchTexture(): THREE.CanvasTexture {
  const size = 128;
  const center = size / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(
      center,
      center,
      2,
      center,
      center,
      center,
    );
    gradient.addColorStop(0, "rgba(4,6,10,0.95)");
    gradient.addColorStop(0.28, "rgba(9,12,17,0.8)");
    gradient.addColorStop(0.58, "rgba(14,18,24,0.36)");
    gradient.addColorStop(0.82, "rgba(20,26,34,0.12)");
    gradient.addColorStop(1, "rgba(20,26,34,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);

    for (let index = 0; index < 22; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 10 + Math.random() * 46;
      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;
      const speck = 0.8 + Math.random() * 2.4;
      context.fillStyle = `rgba(10,13,18,${0.18 + Math.random() * 0.3})`;
      context.beginPath();
      context.arc(x, y, speck, 0, Math.PI * 2);
      context.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class CombatEffects {
  private readonly staticMeshes: THREE.Object3D[];
  private readonly audio: GameAudio;
  private readonly raycaster = new THREE.Raycaster();
  private readonly tracers: Tracer[] = [];
  private tracerCursor = 0;
  private readonly sniperBeams: SniperBeam[] = [];
  private sniperCursor = 0;
  private readonly flashes: FlashParticle[] = [];
  private flashCursor = 0;
  private readonly puffs: SmokePuff[] = [];
  private puffCursor = 0;
  private readonly decals: Decal[] = [];
  private decalCursor = 0;
  private readonly shells: Shell[] = [];
  private shellCursor = 0;
  private smokeGate = 0;
  private readonly beamDirection = new THREE.Vector3();
  private readonly beamUp = new THREE.Vector3(0, 1, 0);
  private readonly shotRight = new THREE.Vector3();
  private readonly tracerEnd = new THREE.Vector3();
  private readonly pelletDirection = new THREE.Vector3();
  private readonly remoteOrigin = new THREE.Vector3();
  private readonly remoteDirection = new THREE.Vector3();
  private readonly remoteEnd = new THREE.Vector3();
  private readonly normal = new THREE.Vector3();
  private readonly instanceMatrix = new THREE.Matrix4();
  private readonly normalMatrix = new THREE.Matrix3();
  private readonly effectPoint = new THREE.Vector3();
  private readonly effectVelocity = new THREE.Vector3();
  private readonly sparkTint = new THREE.Color();
  private readonly puffTint = new THREE.Color();
  private readonly flashTint = new THREE.Color();
  private readonly softTexture: THREE.CanvasTexture;
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
    this.softTexture = createSoftTexture();
    this.raycaster.far = TRACER_RANGE;

    const tracerCount = mobile ? 10 : 18;
    const tracerGeometry = new THREE.CylinderGeometry(
      1,
      0.16,
      1,
      6,
      1,
      true,
    );
    for (let index = 0; index < tracerCount; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xbdf6ff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(tracerGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.tracers.push({
        mesh,
        material,
        from: new THREE.Vector3(),
        direction: new THREE.Vector3(),
        length: 0,
        traveled: 0,
        remaining: 0,
        active: false,
      });
    }

    const beamGeometry = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    const beamCount = mobile ? 4 : 7;
    for (let index = 0; index < beamCount; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffd0e8,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
        fog: false,
      });
      const mesh = new THREE.Mesh(beamGeometry, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      this.sniperBeams.push({ mesh, remaining: 0 });
    }

    const flashCount = mobile ? 8 : 14;
    for (let index = 0; index < flashCount; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.softTexture,
        color: 0xffd9a1,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
        fog: false,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      sprite.renderOrder = 8;
      scene.add(sprite);
      this.flashes.push({
        sprite,
        material,
        remaining: 0,
        life: 0.1,
        baseScale: 0.3,
        grow: 2,
      });
    }

    const puffCount = mobile ? 12 : 22;
    for (let index = 0; index < puffCount; index += 1) {
      const material = new THREE.SpriteMaterial({
        map: this.softTexture,
        color: 0x9aa8b6,
        transparent: true,
        opacity: 0,
        blending: THREE.NormalBlending,
        depthWrite: false,
        toneMapped: false,
        fog: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.visible = false;
      scene.add(sprite);
      this.puffs.push({
        sprite,
        material,
        velocity: new THREE.Vector3(),
        remaining: 0,
        life: 0.4,
        baseScale: 0.18,
        grow: 2,
        spin: 0,
      });
    }

    const decalCount = mobile ? 20 : 40;
    const decalTexture = createScorchTexture();
    const decalGeometry = new THREE.PlaneGeometry(1, 1);
    for (let index = 0; index < decalCount; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        map: decalTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        toneMapped: false,
      });
      const mesh = new THREE.Mesh(decalGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 1;
      scene.add(mesh);
      this.decals.push({ mesh, material, remaining: 0 });
    }

    const shellCount = mobile ? 8 : 14;
    const shellGeometry = new THREE.BoxGeometry(0.022, 0.022, 0.058);
    const shellMaterial = new THREE.MeshStandardMaterial({
      color: 0xd8a546,
      emissive: 0x2a1a04,
      emissiveIntensity: 0.8,
      roughness: 0.32,
      metalness: 0.9,
      flatShading: true,
    });
    for (let index = 0; index < shellCount; index += 1) {
      const mesh = new THREE.Mesh(shellGeometry, shellMaterial);
      mesh.visible = false;
      scene.add(mesh);
      this.shells.push({
        mesh,
        velocity: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        remaining: 0,
      });
    }

    this.sparkCount = mobile ? 32 : 56;
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
      map: this.softTexture,
      alphaTest: 0.02,
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

  enemyUnderAim(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    remotes: RemoteManager,
    localTeam: TeamId,
    mode: GameMode,
  ): boolean {
    this.raycaster.set(origin, direction);
    this.raycaster.far = TRACER_RANGE;
    const hits = this.raycaster.intersectObjects(
      [...remotes.hittableTargets, ...this.staticMeshes],
      true,
    );
    return (
      hits.length > 0 &&
      remotes.isRemoteObject(hits[0].object) &&
      remotes.isEnemyObject(hits[0].object, localTeam, mode)
    );
  }

  fireLocal(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    remotes: RemoteManager,
    weapon: WeaponId,
    muzzle?: THREE.Vector3,
  ): void {
    const spec = WEAPONS[weapon];
    const visualOrigin = muzzle ?? origin;
    const maxRange = Math.min(spec.range, TRACER_RANGE);

    if (muzzle) {
      this.spawnMuzzleBurst(muzzle, direction, spec.accent, weapon);
    }

    if (spec.pellets > 1) {
      const count = Math.min(spec.pellets, 6);
      for (let pellet = 0; pellet < count; pellet += 1) {
        const spread = spreadDirection(
          { x: direction.x, y: direction.y, z: direction.z },
          spec.spreadRad * 0.75,
        );
        this.pelletDirection.set(spread.x, spread.y, spread.z);
        this.raycaster.set(origin, this.pelletDirection);
        this.raycaster.far = maxRange;
        const hits = this.raycaster.intersectObjects(
          remotes.hittableTargets,
          true,
        );
        if (hits.length > 0) {
          const hit = hits[0];
          this.tracerEnd.copy(hit.point);
          this.spawnImpact(hit, this.pelletDirection, remotes, spec.accent, 1);
        } else {
          this.tracerEnd
            .copy(origin)
            .addScaledVector(this.pelletDirection, maxRange);
        }
        this.spawnTracer(visualOrigin, this.tracerEnd);
      }
      return;
    }

    this.raycaster.set(origin, direction);
    this.raycaster.far = maxRange;
    const hits = this.raycaster.intersectObjects(
      remotes.hittableTargets,
      true,
    );
    if (hits.length > 0) {
      const hit = hits[0];
      this.tracerEnd.copy(hit.point);
      this.spawnImpact(
        hit,
        direction,
        remotes,
        spec.accent,
        weapon === "sniper" ? 2 : 1,
      );
    } else {
      this.tracerEnd.copy(origin).addScaledVector(direction, maxRange);
    }

    if (weapon === "sniper") {
      this.spawnSniperBeam(visualOrigin, this.tracerEnd);
    } else {
      this.spawnTracer(visualOrigin, this.tracerEnd);
    }
  }

  spawnRemoteShot(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    weapon: WeaponId,
  ): void {
    this.remoteDirection.set(direction.x, direction.y, direction.z);
    this.remoteOrigin
      .set(origin.x, origin.y - 0.22, origin.z)
      .addScaledVector(this.remoteDirection, 0.34);
    this.remoteEnd
      .copy(this.remoteOrigin)
      .addScaledVector(this.remoteDirection, TRACER_RANGE);
    this.spawnFlash(this.remoteOrigin, 0xffcf8f, 0.2, 0.08);
    this.raycaster.set(this.remoteOrigin, this.remoteDirection);
    this.raycaster.far = TRACER_RANGE;
    const hits = this.raycaster.intersectObjects(this.staticMeshes, false);
    if (hits.length > 0) {
      this.remoteEnd.copy(hits[0].point);
      this.setImpactNormal(hits[0], this.remoteDirection);
      this.spawnSparks(hits[0].point, this.normal, 1, 0xffd9a0);
      this.spawnFlash(hits[0].point, 0xffc27a, 0.22, 0.09);
    }
    if (weapon === "sniper") {
      this.spawnSniperBeam(this.remoteOrigin, this.remoteEnd);
    } else {
      this.spawnTracer(this.remoteOrigin, this.remoteEnd);
    }
    this.audio.playRemoteShoot(weapon);
  }

  update(delta: number): void {
    this.smokeGate = Math.max(0, this.smokeGate - delta);

    for (const tracer of this.tracers) {
      if (!tracer.active) {
        continue;
      }
      tracer.traveled = Math.min(
        tracer.length,
        tracer.traveled + TRACER_SPEED * delta,
      );
      const head = tracer.traveled;
      const tail = Math.max(0, head - TRACER_TAIL);
      const segment = Math.max(0, head - tail);
      if (segment > 0.001) {
        tracer.mesh.position.set(
          tracer.from.x + tracer.direction.x * (tail + segment / 2),
          tracer.from.y + tracer.direction.y * (tail + segment / 2),
          tracer.from.z + tracer.direction.z * (tail + segment / 2),
        );
        tracer.mesh.scale.set(0.02, segment, 0.02);
        tracer.mesh.visible = true;
      } else {
        tracer.mesh.visible = false;
      }

      if (tracer.traveled >= tracer.length) {
        tracer.remaining -= delta;
        tracer.material.opacity = Math.max(
          0,
          tracer.remaining / TRACER_FADE,
        ) * 0.85;
        if (tracer.remaining <= 0) {
          tracer.active = false;
          tracer.mesh.visible = false;
        }
      }
    }

    for (const beam of this.sniperBeams) {
      if (!beam.mesh.visible) {
        continue;
      }
      beam.remaining -= delta;
      if (beam.remaining <= 0) {
        beam.mesh.visible = false;
        continue;
      }
      beam.mesh.material.opacity =
        0.92 * (beam.remaining / SNIPER_BEAM_LIFETIME);
    }

    for (const flash of this.flashes) {
      if (flash.remaining <= 0) {
        continue;
      }
      flash.remaining -= delta;
      if (flash.remaining <= 0) {
        flash.sprite.visible = false;
        flash.material.opacity = 0;
        continue;
      }
      const fade = flash.remaining / flash.life;
      flash.sprite.scale.setScalar(
        flash.baseScale * (1 + (1 - fade) * flash.grow),
      );
      flash.material.opacity = fade * fade;
    }

    for (const puff of this.puffs) {
      if (puff.remaining <= 0) {
        continue;
      }
      puff.remaining -= delta;
      if (puff.remaining <= 0) {
        puff.sprite.visible = false;
        puff.material.opacity = 0;
        continue;
      }
      const fade = puff.remaining / puff.life;
      puff.sprite.position.addScaledVector(puff.velocity, delta);
      puff.velocity.multiplyScalar(Math.max(0, 1 - 1.8 * delta));
      puff.velocity.y += 0.32 * delta;
      puff.material.rotation += puff.spin * delta;
      puff.sprite.scale.setScalar(
        puff.baseScale * (1 + (1 - fade) * puff.grow),
      );
      puff.material.opacity = fade * fade * 0.5;
    }

    for (const decal of this.decals) {
      if (decal.remaining <= 0) {
        continue;
      }
      decal.remaining -= delta;
      if (decal.remaining <= 0) {
        decal.mesh.visible = false;
        decal.material.opacity = 0;
        continue;
      }
      decal.material.opacity = Math.min(1, decal.remaining / DECAL_FADE);
    }

    for (const shell of this.shells) {
      if (shell.remaining <= 0) {
        continue;
      }
      shell.remaining -= delta;
      const position = shell.mesh.position;
      shell.velocity.y += SPARK_GRAVITY * delta;
      position.addScaledVector(shell.velocity, delta);
      shell.mesh.rotation.x += shell.spin.x * delta;
      shell.mesh.rotation.y += shell.spin.y * delta;
      shell.mesh.rotation.z += shell.spin.z * delta;
      if (position.y < 0.02) {
        position.y = 0.02;
        shell.velocity.y *= -0.32;
        shell.velocity.x *= 0.62;
        shell.velocity.z *= 0.62;
        shell.spin.multiplyScalar(0.6);
      }
      if (shell.remaining <= 0) {
        shell.mesh.visible = false;
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

  private spawnImpact(
    hit: THREE.Intersection,
    direction: THREE.Vector3,
    remotes: RemoteManager,
    accent: number,
    power: number,
  ): void {
    this.setImpactNormal(hit, direction);
    const onPlayer = remotes.isRemoteObject(hit.object);
    this.spawnSparks(
      hit.point,
      this.normal,
      power,
      onPlayer ? accent : 0xffd9a0,
    );
    this.spawnFlash(
      hit.point,
      onPlayer ? accent : 0xffc27a,
      onPlayer ? 0.32 : 0.24,
      0.09,
    );
    if (!onPlayer) {
      if (hit.distance < 90) {
        this.spawnDecal(hit.point, this.normal);
      }
      this.spawnDust(hit.point, this.normal);
    }
  }

  private spawnMuzzleBurst(
    muzzle: THREE.Vector3,
    direction: THREE.Vector3,
    accent: number,
    weapon: WeaponId,
  ): void {
    const power =
      weapon === "shotgun" ? 1.45 : weapon === "sniper" ? 1.3 : 1;
    this.spawnFlash(
      muzzle,
      this.flashTint
        .setHex(accent)
        .lerp(new THREE.Color(0xffe0ae), 0.62)
        .getHex(),
      0.19 * power,
      0.075,
    );
    this.spawnShell(muzzle, direction);

    if (this.smokeGate > 0) {
      return;
    }
    this.smokeGate = 0.07;
    this.shotRight.crossVectors(direction, UP);
    if (this.shotRight.lengthSq() < 1e-6) {
      this.shotRight.set(1, 0, 0);
    } else {
      this.shotRight.normalize();
    }
    this.effectPoint.copy(muzzle).addScaledVector(direction, 0.06);
    this.effectVelocity
      .copy(direction)
      .multiplyScalar(1.2 + Math.random() * 0.5)
      .addScaledVector(
        this.shotRight,
        (Math.random() - 0.5) * 0.9,
      );
    this.effectVelocity.y += 0.35 + Math.random() * 0.4;
    this.puffTint.setHex(0xc8d4de);
    this.spawnPuff(
      this.effectPoint,
      this.effectVelocity,
      this.puffTint,
      0.13 * power,
      0.42 + Math.random() * 0.22,
      2.6,
    );
  }

  private spawnFlash(
    point: THREE.Vector3,
    color: number,
    scale: number,
    life: number,
  ): void {
    const flash = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % this.flashes.length;
    flash.material.color.setHex(color);
    flash.material.opacity = 0.95;
    flash.sprite.position.copy(point);
    flash.sprite.scale.setScalar(scale);
    flash.baseScale = scale;
    flash.life = life;
    flash.remaining = life;
    flash.sprite.visible = true;
  }

  private spawnDust(point: THREE.Vector3, normal: THREE.Vector3): void {
    this.effectPoint.copy(point).addScaledVector(normal, 0.05);
    this.effectVelocity
      .copy(normal)
      .multiplyScalar(0.55 + Math.random() * 0.5);
    this.effectVelocity.y += 0.3 + Math.random() * 0.35;
    this.puffTint.setHex(0x8d9dac);
    this.spawnPuff(
      this.effectPoint,
      this.effectVelocity,
      this.puffTint,
      0.1 + Math.random() * 0.05,
      0.28 + Math.random() * 0.14,
      2.2,
    );
  }

  private spawnPuff(
    point: THREE.Vector3,
    velocity: THREE.Vector3,
    color: THREE.Color,
    baseScale: number,
    life: number,
    grow: number,
  ): void {
    const puff = this.puffs[this.puffCursor];
    this.puffCursor = (this.puffCursor + 1) % this.puffs.length;
    puff.sprite.position.copy(point);
    puff.velocity.copy(velocity);
    puff.material.color.copy(color);
    puff.material.rotation = Math.random() * Math.PI * 2;
    puff.baseScale = baseScale;
    puff.life = life;
    puff.remaining = life;
    puff.grow = grow;
    puff.spin = (Math.random() - 0.5) * 1.4;
    puff.material.opacity = 0.5;
    puff.sprite.scale.setScalar(baseScale);
    puff.sprite.visible = true;
  }

  private spawnDecal(point: THREE.Vector3, normal: THREE.Vector3): void {
    const decal = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % this.decals.length;
    decal.mesh.position.copy(point).addScaledVector(normal, 0.012);
    decal.mesh.quaternion.setFromUnitVectors(PLANE_FORWARD, normal);
    decal.mesh.rotateZ(Math.random() * Math.PI * 2);
    decal.mesh.scale.setScalar(0.16 + Math.random() * 0.16);
    decal.material.opacity = 1;
    decal.remaining = DECAL_LIFETIME;
    decal.mesh.visible = true;
  }

  private spawnShell(
    muzzle: THREE.Vector3,
    direction: THREE.Vector3,
  ): void {
    const shell = this.shells[this.shellCursor];
    this.shellCursor = (this.shellCursor + 1) % this.shells.length;
    this.shotRight.crossVectors(direction, UP);
    if (this.shotRight.lengthSq() < 1e-6) {
      this.shotRight.set(1, 0, 0);
    } else {
      this.shotRight.normalize();
    }
    shell.mesh.position
      .copy(muzzle)
      .addScaledVector(direction, -0.34)
      .addScaledVector(this.shotRight, 0.1 + Math.random() * 0.04);
    shell.mesh.position.y -= 0.02;
    shell.mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );
    shell.velocity
      .copy(this.shotRight)
      .multiplyScalar(2.1 + Math.random() * 1.2);
    shell.velocity.y += 1.35 + Math.random() * 0.7;
    shell.velocity.addScaledVector(direction, -0.15);
    shell.spin.set(
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 16,
      (Math.random() - 0.5) * 16,
    );
    shell.remaining = SHELL_LIFETIME;
    shell.mesh.visible = true;
  }

  private spawnSniperBeam(from: THREE.Vector3, to: THREE.Vector3): void {
    const beam = this.sniperBeams[this.sniperCursor];
    this.sniperCursor = (this.sniperCursor + 1) % this.sniperBeams.length;
    this.beamDirection.copy(to).sub(from);
    const length = this.beamDirection.length();
    if (length < 0.001) {
      return;
    }
    this.beamDirection.multiplyScalar(1 / length);
    beam.mesh.position
      .copy(from)
      .addScaledVector(this.beamDirection, length / 2);
    beam.mesh.quaternion.setFromUnitVectors(
      this.beamUp,
      this.beamDirection,
    );
    beam.mesh.scale.set(0.032, length, 0.032);
    beam.mesh.material.opacity = 0.92;
    beam.mesh.visible = true;
    beam.remaining = SNIPER_BEAM_LIFETIME;
  }

  private spawnTracer(from: THREE.Vector3, to: THREE.Vector3): void {
    const tracer = this.tracers[this.tracerCursor];
    this.tracerCursor = (this.tracerCursor + 1) % this.tracers.length;
    tracer.from.copy(from);
    tracer.direction.copy(to).sub(from);
    tracer.length = tracer.direction.length();
    if (tracer.length < 0.001) {
      return;
    }
    tracer.direction.multiplyScalar(1 / tracer.length);
    tracer.traveled = 0;
    tracer.remaining = TRACER_FADE;
    tracer.material.opacity = 0.85;
    tracer.active = true;
    tracer.mesh.quaternion.setFromUnitVectors(
      this.beamUp,
      tracer.direction,
    );
    tracer.mesh.scale.set(0.02, 0.001, 0.02);
    tracer.mesh.position.copy(from);
    tracer.mesh.visible = true;
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
    power = 1,
    tint?: number,
  ): void {
    if (tint !== undefined) {
      this.sparkTint.setHex(tint);
    }
    const count = Math.round((4 + Math.random() * 5) * power);
    for (let particle = 0; particle < count; particle += 1) {
      const index = this.sparkCursor;
      this.sparkCursor = (this.sparkCursor + 1) % this.sparkCount;
      const offset = index * 3;
      this.sparkPositions[offset] = point.x + normal.x * 0.02;
      this.sparkPositions[offset + 1] = point.y + normal.y * 0.02;
      this.sparkPositions[offset + 2] = point.z + normal.z * 0.02;
      const speed = 1.8 + Math.random() * 3.2;
      this.sparkVelocities[offset] =
        (normal.x * 0.8 + (Math.random() - 0.5) * 1.4) * speed;
      this.sparkVelocities[offset + 1] =
        (normal.y * 0.8 + Math.random() * 1.2) * speed;
      this.sparkVelocities[offset + 2] =
        (normal.z * 0.8 + (Math.random() - 0.5) * 1.4) * speed;

      const useTint = tint !== undefined && Math.random() < 0.55;
      if (useTint) {
        this.sparkBaseColors[offset] = this.sparkTint.r;
        this.sparkBaseColors[offset + 1] = this.sparkTint.g;
        this.sparkBaseColors[offset + 2] = this.sparkTint.b;
      } else {
        const yellow = Math.random() < 0.45;
        this.sparkBaseColors[offset] = yellow ? 1 : 0.28;
        this.sparkBaseColors[offset + 1] = 0.92;
        this.sparkBaseColors[offset + 2] = yellow ? 0.38 : 1;
      }
      this.sparkColors[offset] = this.sparkBaseColors[offset];
      this.sparkColors[offset + 1] = this.sparkBaseColors[offset + 1];
      this.sparkColors[offset + 2] = this.sparkBaseColors[offset + 2];
      this.sparkRemaining[index] = SPARK_LIFETIME;
    }
    this.sparksDirty = true;
  }
}
