import type { Vec3 } from "./types";

export interface CoverBox {
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
}

export const ARENA_COVER: readonly CoverBox[] = [
  { x: 0, z: -12, width: 12, depth: 1.5, height: 2.6 },
  { x: 0, z: 12, width: 12, depth: 1.5, height: 2.6 },
  { x: -12, z: 0, width: 3, depth: 3, height: 3 },
  { x: 12, z: 0, width: 3, depth: 3, height: 3 },
];

export function circleHitsCover(
  x: number,
  z: number,
  radius: number,
): boolean {
  for (const box of ARENA_COVER) {
    if (
      Math.abs(x - box.x) < box.width / 2 + radius &&
      Math.abs(z - box.z) < box.depth / 2 + radius
    ) {
      return true;
    }
  }
  return false;
}

export function rayBoxDistance(
  origin: Vec3,
  direction: Vec3,
  box: CoverBox,
): number | null {
  let tMin = 0;
  let tMax = Infinity;

  const minX = box.x - box.width / 2;
  const maxX = box.x + box.width / 2;
  if (Math.abs(direction.x) < 1e-8) {
    if (origin.x < minX || origin.x > maxX) {
      return null;
    }
  } else {
    let t1 = (minX - origin.x) / direction.x;
    let t2 = (maxX - origin.x) / direction.x;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return null;
    }
  }

  if (Math.abs(direction.y) < 1e-8) {
    if (origin.y < 0 || origin.y > box.height) {
      return null;
    }
  } else {
    let t1 = (0 - origin.y) / direction.y;
    let t2 = (box.height - origin.y) / direction.y;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return null;
    }
  }

  const minZ = box.z - box.depth / 2;
  const maxZ = box.z + box.depth / 2;
  if (Math.abs(direction.z) < 1e-8) {
    if (origin.z < minZ || origin.z > maxZ) {
      return null;
    }
  } else {
    let t1 = (minZ - origin.z) / direction.z;
    let t2 = (maxZ - origin.z) / direction.z;
    if (t1 > t2) {
      const swap = t1;
      t1 = t2;
      t2 = swap;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) {
      return null;
    }
  }

  return tMin >= 0 ? tMin : null;
}
