import { PLAYER_HEIGHT } from "./constants";
import type { Vec3 } from "./types";

/** Axis-aligned block; (x, z) is the center and y is the bottom. */
export interface MapBox {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: number;
}

export const CITY_MAP: readonly MapBox[] = [
  { x: -18, y: 0, z: -18, width: 7, height: 14, depth: 7, color: 0x1a2230 },
  { x: 18, y: 0, z: -18, width: 8, height: 18, depth: 6, color: 0x141c28 },
  { x: -18, y: 0, z: 18, width: 6, height: 12, depth: 8, color: 0x1d2636 },
  { x: 18, y: 0, z: 18, width: 7, height: 16, depth: 7, color: 0x17212e },

  { x: -14, y: 0, z: 0, width: 5, height: 7, depth: 9, color: 0x202a3a },
  { x: 14, y: 0, z: 0, width: 5, height: 9, depth: 9, color: 0x1b2432 },
  { x: 0, y: 0, z: -16, width: 12, height: 6, depth: 5, color: 0x1c2635 },
  { x: 0, y: 0, z: 16, width: 9, height: 5, depth: 4, color: 0x232d3f },
  { x: -9, y: 0, z: -14, width: 4, height: 5, depth: 4, color: 0x243042 },
  { x: 9, y: 0, z: -14, width: 4, height: 6, depth: 4, color: 0x1f2a39 },

  { x: -5, y: 0, z: -5, width: 2.5, height: 1.1, depth: 2.5, color: 0x2f3f52 },
  { x: 5, y: 0, z: -5, width: 2.5, height: 1.1, depth: 2.5, color: 0x2f3f52 },
  { x: -5, y: 0, z: 5, width: 2.5, height: 1.1, depth: 2.5, color: 0x2f3f52 },
  { x: 5, y: 0, z: 5, width: 2.5, height: 1.1, depth: 2.5, color: 0x2f3f52 },

  { x: 9, y: 0, z: 10, width: 3, height: 0.5, depth: 1.5, color: 0x0f2b3a },
  { x: 9, y: 0, z: 8.5, width: 3, height: 1, depth: 1.5, color: 0x123344 },
  { x: 9, y: 0, z: 7, width: 3, height: 1.5, depth: 1.5, color: 0x153b4e },
  { x: 9, y: 0, z: 5.5, width: 3, height: 2, depth: 1.5, color: 0x184458 },
  { x: 9, y: 1.5, z: 3.5, width: 3, height: 0.5, depth: 2.5, color: 0x123a4a },
  { x: 9, y: 0, z: 2.5, width: 1, height: 1.5, depth: 1, color: 0x0f2b3a },
];

export function circleHitsMap(
  x: number,
  z: number,
  radius: number,
  feetY = 0,
  height = PLAYER_HEIGHT,
): boolean {
  const maxY = feetY + height;

  for (const box of CITY_MAP) {
    if (box.y >= maxY || box.y + box.height <= feetY) {
      continue;
    }

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
  box: MapBox,
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

  const minY = box.y;
  const maxY = box.y + box.height;
  if (Math.abs(direction.y) < 1e-8) {
    if (origin.y < minY || origin.y > maxY) {
      return null;
    }
  } else {
    let t1 = (minY - origin.y) / direction.y;
    let t2 = (maxY - origin.y) / direction.y;
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
