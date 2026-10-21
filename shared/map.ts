import {
  PLAYER_HALF_DEPTH,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
} from "./constants";
import type { Vec3 } from "./types";

export interface MapObject {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: number;
}

export const FLOOR_SIZE = 50;
export const FLOOR_Y = 0;
export const FLOOR_COLOR = 0x0a111c;

/*
 * (x, z) is the center and y is the bottom of the box.
 * The four perimeter walls have inner faces at +/-24; the six interior objects
 * provide three tall sight-line breakers and three low cover pieces.
 */
export const MAP_OBJECTS: readonly MapObject[] = [
  {
    id: "wall-north",
    x: 0,
    y: 0,
    z: -24.5,
    width: FLOOR_SIZE,
    height: 8,
    depth: 1,
    color: 0x0a1422,
  },
  {
    id: "wall-south",
    x: 0,
    y: 0,
    z: 24.5,
    width: FLOOR_SIZE,
    height: 8,
    depth: 1,
    color: 0x0a1422,
  },
  {
    id: "wall-west",
    x: -24.5,
    y: 0,
    z: 0,
    width: 1,
    height: 8,
    depth: FLOOR_SIZE - 2,
    color: 0x0a1422,
  },
  {
    id: "wall-east",
    x: 24.5,
    y: 0,
    z: 0,
    width: 1,
    height: 8,
    depth: FLOOR_SIZE - 2,
    color: 0x0a1422,
  },

  {
    id: "tower-north",
    x: 0,
    y: 0,
    z: -14,
    width: 4,
    height: 6,
    depth: 4,
    color: 0x1a2f4a,
  },
  {
    id: "tower-west",
    x: -11,
    y: 0,
    z: 0,
    width: 4,
    height: 5,
    depth: 4,
    color: 0x16283f,
  },
  {
    id: "tower-east",
    x: 11,
    y: 0,
    z: 0,
    width: 4,
    height: 5,
    depth: 4,
    color: 0x182c45,
  },
  {
    id: "cover-south",
    x: 0,
    y: 0,
    z: 6,
    width: 6,
    height: 1,
    depth: 2,
    color: 0x20405a,
  },
  {
    id: "cover-west",
    x: -6,
    y: 0,
    z: -4,
    width: 3,
    height: 1,
    depth: 3,
    color: 0x1c3a52,
  },
  {
    id: "cover-east",
    x: 6,
    y: 0,
    z: -4,
    width: 3,
    height: 1,
    depth: 3,
    color: 0x1e3d56,
  },
];

export function aabbHitsMap(
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
): boolean {
  for (const object of MAP_OBJECTS) {
    const objectMinX = object.x - object.width / 2;
    const objectMaxX = object.x + object.width / 2;
    const objectMinY = object.y;
    const objectMaxY = object.y + object.height;
    const objectMinZ = object.z - object.depth / 2;
    const objectMaxZ = object.z + object.depth / 2;

    if (
      maxX > objectMinX &&
      minX < objectMaxX &&
      maxY > objectMinY &&
      minY < objectMaxY &&
      maxZ > objectMinZ &&
      minZ < objectMaxZ
    ) {
      return true;
    }
  }

  return false;
}

/** Test the player's full AABB at a feet position against the map. */
export function playerHitsMap(x: number, y: number, z: number): boolean {
  return aabbHitsMap(
    x - PLAYER_HALF_WIDTH,
    y,
    z - PLAYER_HALF_DEPTH,
    x + PLAYER_HALF_WIDTH,
    y + PLAYER_HEIGHT,
    z + PLAYER_HALF_DEPTH,
  );
}

export function rayBoxDistance(
  origin: Vec3,
  direction: Vec3,
  box: MapObject,
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
