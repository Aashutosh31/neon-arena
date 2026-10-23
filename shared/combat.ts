import {
  HEAD_HEIGHT,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
} from "./constants";
import { MAP_OBJECTS, rayBoxDistance, type MapObject } from "./map";
import type { TeamId, Vec3 } from "./types";

export interface CombatTarget {
  id: string;
  team: TeamId;
  health: number;
  position: Vec3;
}

export interface PlayerRayHit {
  playerId: string;
  distance: number;
  headshot: boolean;
}

export function rayPlayerDistance(
  origin: Vec3,
  direction: Vec3,
  player: CombatTarget,
): PlayerRayHit | null {
  const hitRadius = PLAYER_RADIUS + 0.14;
  const offsetX = origin.x - player.position.x;
  const offsetZ = origin.z - player.position.z;
  const yMin = player.position.y;
  const yMax = player.position.y + PLAYER_HEIGHT;

  const a = direction.x * direction.x + direction.z * direction.z;
  const b = 2 * (offsetX * direction.x + offsetZ * direction.z);
  const c = offsetX * offsetX + offsetZ * offsetZ - hitRadius * hitRadius;

  let nearest: number | null = null;

  if (c <= 0 && origin.y >= yMin && origin.y <= yMax) {
    nearest = 0;
  }

  if (a > 1e-8) {
    const discriminant = b * b - 4 * a * c;
    if (discriminant >= 0) {
      const sqrtDisc = Math.sqrt(discriminant);
      const inverse = 1 / (2 * a);
      const tNear = (-b - sqrtDisc) * inverse;
      if (tNear >= 0) {
        const y = origin.y + tNear * direction.y;
        if (y >= yMin && y <= yMax) {
          nearest = tNear;
        }
      }

      const tFar = (-b + sqrtDisc) * inverse;
      if (tFar >= 0 && (nearest === null || tFar < nearest)) {
        const y = origin.y + tFar * direction.y;
        if (y >= yMin && y <= yMax) {
          nearest = tFar;
        }
      }
    }
  }

  if (Math.abs(direction.y) > 1e-8) {
    const tTop = (yMax - origin.y) / direction.y;
    if (tTop >= 0 && (nearest === null || tTop < nearest)) {
      const dx = origin.x + tTop * direction.x - player.position.x;
      const dz = origin.z + tTop * direction.z - player.position.z;
      if (dx * dx + dz * dz <= hitRadius * hitRadius) {
        nearest = tTop;
      }
    }

    const tBottom = (yMin - origin.y) / direction.y;
    if (tBottom >= 0 && (nearest === null || tBottom < nearest)) {
      const dx = origin.x + tBottom * direction.x - player.position.x;
      const dz = origin.z + tBottom * direction.z - player.position.z;
      if (dx * dx + dz * dz <= hitRadius * hitRadius) {
        nearest = tBottom;
      }
    }
  }

  if (nearest === null) {
    return null;
  }

  const hitY = origin.y + nearest * direction.y;
  return {
    playerId: player.id,
    distance: nearest,
    headshot: hitY >= player.position.y + HEAD_HEIGHT,
  };
}

export function nearestCoverDistance(
  origin: Vec3,
  direction: Vec3,
  maxRange: number,
  mapObjects: readonly MapObject[] = MAP_OBJECTS,
): number {
  let nearest = maxRange;
  for (const box of mapObjects) {
    const distance = rayBoxDistance(origin, direction, box);
    if (distance !== null && distance < nearest) {
      nearest = distance;
    }
  }
  return nearest;
}

export function hasLineOfSight(
  from: Vec3,
  to: Vec3,
  mapObjects: readonly MapObject[] = MAP_OBJECTS,
): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6) {
    return true;
  }

  const direction = { x: dx / distance, y: dy / distance, z: dz / distance };
  return nearestCoverDistance(from, direction, distance, mapObjects) >= distance;
}

export function castShot(
  origin: Vec3,
  direction: Vec3,
  range: number,
  shooterId: string,
  shooterTeam: TeamId,
  friendlyFire: boolean,
  players: Iterable<CombatTarget>,
  mapObjects: readonly MapObject[] = MAP_OBJECTS,
): PlayerRayHit | null {
  const coverDistance = nearestCoverDistance(
    origin,
    direction,
    range,
    mapObjects,
  );

  let target: PlayerRayHit | null = null;
  for (const player of players) {
    if (player.id === shooterId || player.health <= 0) {
      continue;
    }
    if (
      !friendlyFire &&
      shooterTeam !== "ffa" &&
      player.team === shooterTeam
    ) {
      continue;
    }

    const hit = rayPlayerDistance(origin, direction, player);
    if (
      hit &&
      hit.distance <= range &&
      hit.distance <= coverDistance &&
      (target === null || hit.distance < target.distance)
    ) {
      target = hit;
    }
  }

  return target;
}

export function spreadDirection(
  direction: Vec3,
  spreadRad: number,
): Vec3 {
  if (spreadRad <= 0) {
    return direction;
  }

  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random()) * spreadRad;
  const cos = Math.cos(angle) * radius;
  const sin = Math.sin(angle) * radius;

  const up =
    Math.abs(direction.y) > 0.95
      ? { x: 1, y: 0, z: 0 }
      : { x: 0, y: 1, z: 0 };
  const right = normalize({
    x: up.y * direction.z - up.z * direction.y,
    y: up.z * direction.x - up.x * direction.z,
    z: up.x * direction.y - up.y * direction.x,
  });
  const trueUp = normalize({
    x: direction.y * right.z - direction.z * right.y,
    y: direction.z * right.x - direction.x * right.z,
    z: direction.x * right.y - direction.y * right.x,
  });

  return normalize({
    x: direction.x + right.x * cos + trueUp.x * sin,
    y: direction.y + right.y * cos + trueUp.y * sin,
    z: direction.z + right.z * cos + trueUp.z * sin,
  });
}

function normalize(vector: Vec3): Vec3 {
  const length = Math.hypot(vector.x, vector.y, vector.z) || 1;
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}
