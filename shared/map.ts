import {
  ARENA_HALF_EXTENT,
  PLAYER_HALF_DEPTH,
  PLAYER_HALF_WIDTH,
  PLAYER_HEIGHT,
} from "./constants";
import type { PickupKind, Vec3 } from "./types";

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

export interface RoofSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
  y: number;
  height: number;
  color: number;
  style: "flat" | "hip";
}

export interface PanelSpec {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  color: number;
}

export interface SidewalkSpec {
  x: number;
  z: number;
  width: number;
  depth: number;
}

export interface StreetLightSpec {
  x: number;
  z: number;
  height: number;
  color: number;
}

export interface PickupSpawn {
  id: string;
  kind: PickupKind;
  x: number;
  z: number;
}

export interface StairSpec {
  id: string;
  buildingId: string;
  startX: number;
  startZ: number;
  endX: number;
  endZ: number;
  alongX: boolean;
  width: number;
  depth: number;
  topY: number;
  steps: number;
}

export const FLOOR_SIZE = ARENA_HALF_EXTENT * 2 + 2;
export const FLOOR_Y = 0;
export const FLOOR_COLOR = 0x0a111c;

interface WallOpening {
  /** Offset from the center of the wall. */
  center: number;
  width: number;
  bottom: number;
  top: number;
}

type Side = "north" | "south" | "east" | "west";

interface BuildingSpec {
  id: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  height: number;
  wallColor: number;
  roofColor: number;
  accentColor: number;
  front: Side;
  roofStyle: "flat" | "hip";
}

const objects: MapObject[] = [];
const roofs: RoofSpec[] = [];
const panels: PanelSpec[] = [];
const stairs: StairSpec[] = [];
const sidewalks: SidewalkSpec[] = [];
const streetLights: StreetLightSpec[] = [];
let objectSerial = 0;

function addBox(
  id: string,
  x: number,
  y: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: number,
): void {
  objects.push({ id, x, y, z, width, height, depth, color });
}

function addWall(
  id: string,
  axis: "x" | "z",
  fixed: number,
  from: number,
  to: number,
  height: number,
  thickness: number,
  color: number,
  openings: readonly WallOpening[] = [],
): void {
  const wallCenter = (from + to) / 2;
  const sorted = [...openings].sort((a, b) => a.center - b.center);
  let cursor = from;

  const addPiece = (
    start: number,
    end: number,
    bottom: number,
    top: number,
    kind: string,
  ): void => {
    if (end - start < 0.02 || top - bottom < 0.02) {
      return;
    }
    objectSerial += 1;
    const center = (start + end) / 2;
    const pieceHeight = top - bottom;
    if (axis === "x") {
      addBox(
        `${id}-${kind}-${objectSerial}`,
        center,
        bottom,
        fixed,
        end - start,
        pieceHeight,
        thickness,
        color,
      );
    } else {
      addBox(
        `${id}-${kind}-${objectSerial}`,
        fixed,
        bottom,
        center,
        thickness,
        pieceHeight,
        end - start,
        color,
      );
    }
  };

  for (const opening of sorted) {
    const start = wallCenter + opening.center - opening.width / 2;
    const end = wallCenter + opening.center + opening.width / 2;
    if (start > cursor) {
      addPiece(cursor, start, 0, height, "wall");
    }
    if (opening.bottom > 0) {
      addPiece(start, end, 0, opening.bottom, "sill");
    }
    if (opening.top < height) {
      addPiece(start, end, opening.top, height, "header");
    }
    cursor = Math.max(cursor, end);
  }
  if (cursor < to) {
    addPiece(cursor, to, 0, height, "wall");
  }
}

function door(center = 0): WallOpening {
  return { center, width: 2.6, bottom: 0, top: 2.95 };
}

function window(center: number, width = 2.2): WallOpening {
  return { center, width, bottom: 0.9, top: 3.3 };
}

function opposite(side: Side): Side {
  switch (side) {
    case "north":
      return "south";
    case "south":
      return "north";
    case "east":
      return "west";
    case "west":
      return "east";
  }
}

function openingsFor(
  side: Side,
  spec: BuildingSpec,
): readonly WallOpening[] {
  const span = side === "north" || side === "south" ? spec.width : spec.depth;
  const offset = Math.min(span * 0.29, 4.7);
  if (side === spec.front || side === opposite(spec.front)) {
    return [
      window(-offset, 2.1),
      door(0),
      window(offset, 2.1),
    ];
  }
  return [
    window(-offset, 2.35),
    window(offset, 2.35),
  ];
}

const BUILDING_X = [-34, -12.75, 12.75, 34] as const;
const BUILDING_Z = [-34, -12.75, 12.75, 34] as const;
const BUILDING_NAMES = [
  "northline",
  "arcade",
  "foundry",
  "relay",
  "metro",
  "hotel",
  "market",
  "atrium",
  "villa",
  "depot",
  "workshop",
  "cafe",
  "garage",
  "loft",
  "cinema",
  "terminal",
] as const;
const WALL_COLORS = [
  0x315570,
  0x2e516b,
  0x34566d,
  0x2b4f69,
  0x3a5a72,
  0x2a4a62,
  0x385c73,
  0x2f536c,
] as const;
const ROOF_COLORS = [
  0x162a3d,
  0x14283a,
  0x172d40,
  0x132638,
  0x1a3042,
] as const;
const ACCENT_COLORS = [
  0x00e5ff,
  0xff5a8a,
  0xffc247,
  0x8b5cf6,
  0x2dd4bf,
  0xff7a45,
] as const;
const WINDOW_COLORS = [
  0xffd88a,
  0x9be7ff,
  0xff9ec4,
  0xc4b5fd,
  0xfff0c2,
] as const;

const BUILDINGS: readonly BuildingSpec[] = BUILDING_Z.flatMap(
  (z, zIndex) =>
    BUILDING_X.map((x, xIndex) => {
      const index = zIndex * BUILDING_X.length + xIndex;
      const width = 13.8 + ((index * 7) % 5) * 0.65;
      const depth = 13.2 + ((index * 11) % 5) * 0.6;
      const height = 7.1 + ((index * 13) % 6) * 1.15;
      const front: Side =
        Math.abs(x) >= Math.abs(z)
          ? x <= 0
            ? "east"
            : "west"
          : z <= 0
            ? "south"
            : "north";
      return {
        id: BUILDING_NAMES[index],
        x,
        z,
        width,
        depth,
        height,
        wallColor: WALL_COLORS[index % WALL_COLORS.length],
        roofColor: ROOF_COLORS[index % ROOF_COLORS.length],
        accentColor: ACCENT_COLORS[index % ACCENT_COLORS.length],
        front,
        roofStyle: index % 4 === 1 ? "hip" : "flat",
      };
    }),
);

const WALL_THICKNESS = 0.45;

function sideEdges(
  spec: BuildingSpec,
): Record<Side, { fixed: number; from: number; to: number }> {
  const x0 = spec.x - spec.width / 2;
  const x1 = spec.x + spec.width / 2;
  const z0 = spec.z - spec.depth / 2;
  const z1 = spec.z + spec.depth / 2;
  return {
    north: { fixed: z0, from: x0, to: x1 },
    south: { fixed: z1, from: x0, to: x1 },
    east: { fixed: x1, from: z0, to: z1 },
    west: { fixed: x0, from: z0, to: z1 },
  };
}

function addPanel(
  side: Side,
  spec: BuildingSpec,
  offset: number,
  y: number,
  color: number,
  width: number,
  height: number,
): void {
  const edges = sideEdges(spec)[side];
  const thickness = 0.07;
  const faceOffset = WALL_THICKNESS / 2 + thickness / 2;
  if (side === "north" || side === "south") {
    panels.push({
      x: spec.x + offset,
      y,
      z: edges.fixed + (side === "north" ? -faceOffset : faceOffset),
      width,
      height,
      depth: thickness,
      color,
    });
  } else {
    panels.push({
      x: edges.fixed + (side === "west" ? -faceOffset : faceOffset),
      y,
      z: spec.z + offset,
      width: thickness,
      height,
      depth: width,
      color,
    });
  }
}

function addBuilding(spec: BuildingSpec, index: number): void {
  const x0 = spec.x - spec.width / 2;
  const x1 = spec.x + spec.width / 2;
  const z0 = spec.z - spec.depth / 2;
  const z1 = spec.z + spec.depth / 2;

  addWall(
    `${spec.id}-north`,
    "x",
    z0,
    x0,
    x1,
    spec.height,
    WALL_THICKNESS,
    spec.wallColor,
    openingsFor("north", spec),
  );
  addWall(
    `${spec.id}-south`,
    "x",
    z1,
    x0,
    x1,
    spec.height,
    WALL_THICKNESS,
    spec.wallColor,
    openingsFor("south", spec),
  );
  addWall(
    `${spec.id}-west`,
    "z",
    x0,
    z0,
    z1,
    spec.height,
    WALL_THICKNESS,
    spec.wallColor,
    openingsFor("west", spec),
  );
  addWall(
    `${spec.id}-east`,
    "z",
    x1,
    z0,
    z1,
    spec.height,
    WALL_THICKNESS,
    spec.wallColor,
    openingsFor("east", spec),
  );

  const roofHeight = 0.34;
  addBox(
    `${spec.id}-roof`,
    spec.x,
    spec.height,
    spec.z,
    spec.width + 0.3,
    roofHeight,
    spec.depth + 0.3,
    spec.roofColor,
  );
  roofs.push({
    x: spec.x,
    z: spec.z,
    width: spec.width + 0.3,
    depth: spec.depth + 0.3,
    y: spec.height + roofHeight,
    height: 2.1 + (index % 3) * 0.35,
    color: spec.roofColor,
    style: spec.roofStyle,
  });

  const partitionX = spec.x + (index % 2 === 0 ? -3.1 : 3.1);
  addWall(
    `${spec.id}-partition`,
    "z",
    partitionX,
    z0 + 0.45,
    z1 - 0.45,
    3.2,
    0.3,
    spec.wallColor,
    [door(0)],
  );

  const deskX = spec.x + (index % 2 === 0 ? 1 : -1) * spec.width * 0.2;
  const deskZ = spec.z + (index % 2 === 0 ? -1 : 1) * spec.depth * 0.18;
  addBox(
    `${spec.id}-desk`,
    deskX,
    0,
    deskZ,
    2.8,
    1.05,
    1.1,
    spec.accentColor,
  );
  addBox(
    `${spec.id}-crate`,
    spec.x + (index % 2 === 0 ? -1 : 1) * spec.width * 0.25,
    0,
    spec.z + (index % 2 === 0 ? 1 : -1) * spec.depth * 0.26,
    1.25,
    1.25,
    1.25,
    0x315a75,
  );

  sidewalks.push({
    x: spec.x,
    z: spec.z,
    width: spec.width + 3.2,
    depth: spec.depth + 3.2,
  });

  const signWidth = Math.min(spec.width * 0.36, 4.6);
  addPanel(
    spec.front,
    spec,
    0,
    Math.min(3.55, spec.height - 1.4),
    spec.accentColor,
    signWidth,
    0.72,
  );

  const levelSpacing = 2.45;
  let level = 3.95;
  let levelIndex = 0;
  while (level + 0.8 < spec.height - 0.6) {
    for (const side of ["north", "south", "east", "west"] as const) {
      const span = side === "north" || side === "south"
        ? spec.width
        : spec.depth;
      const offset = span * 0.27;
      for (const direction of [-1, 1]) {
        const color =
          WINDOW_COLORS[(index + levelIndex + (side === "east" ? 1 : 0)) %
            WINDOW_COLORS.length];
        addPanel(
          side,
          spec,
          direction * offset,
          level,
          color,
          1.65,
          0.85,
        );
      }
    }
    level += levelSpacing;
    levelIndex += 1;
  }
}

const STAIR_RISE = 0.36;
const STAIR_RUN = 0.34;
const STAIR_WIDTH = 1.7;
const STAIR_LANDING = 0.8;
const STAIR_MARGIN = 0.3;
const STAIR_COLOR = 0x2a5f78;

function stairSide(spec: BuildingSpec): Side {
  if (spec.front === "north" || spec.front === "south") {
    return spec.x < 0 ? "west" : "east";
  }
  return spec.z < 0 ? "north" : "south";
}

function addRoofStairs(spec: BuildingSpec): void {
  const side = stairSide(spec);
  const edge = sideEdges(spec)[side];
  const alongX = side === "north" || side === "south";
  const outward =
    side === "east"
      ? 1
      : side === "west"
        ? -1
        : side === "south"
          ? 1
          : -1;
  const span = edge.to - edge.from;
  const topY = spec.height + 0.34;
  const steps = Math.ceil(topY / STAIR_RISE);
  const runLength = steps * STAIR_RUN;
  const landing = Math.min(
    STAIR_LANDING,
    span - runLength - STAIR_MARGIN * 2,
  );
  if (landing < 0.3) {
    return;
  }

  const crossCenter =
    edge.fixed + outward * (STAIR_WIDTH / 2 + 0.03);
  const startAlong = edge.from + STAIR_MARGIN;
  const stepTop = topY / steps;

  for (let step = 0; step < steps; step += 1) {
    const center = startAlong + (step + 0.5) * STAIR_RUN;
    addBox(
      `${spec.id}-stairs-${step}`,
      alongX ? center : crossCenter,
      0,
      alongX ? crossCenter : center,
      alongX ? STAIR_RUN : STAIR_WIDTH,
      (step + 1) * stepTop,
      alongX ? STAIR_WIDTH : STAIR_RUN,
      STAIR_COLOR,
    );
  }

  const landingCenter = startAlong + runLength + landing / 2;
  addBox(
    `${spec.id}-stairs-landing`,
    alongX ? landingCenter : crossCenter,
    0,
    alongX ? crossCenter : landingCenter,
    alongX ? landing : STAIR_WIDTH,
    topY,
    alongX ? STAIR_WIDTH : landing,
    STAIR_COLOR,
  );

  stairs.push({
    id: `${spec.id}-stairs`,
    buildingId: spec.id,
    startX: alongX ? startAlong : crossCenter,
    startZ: alongX ? crossCenter : startAlong,
    endX: alongX ? landingCenter : crossCenter,
    endZ: alongX ? crossCenter : landingCenter,
    alongX,
    width: alongX ? runLength + landing : STAIR_WIDTH,
    depth: alongX ? STAIR_WIDTH : runLength + landing,
    topY,
    steps,
  });
}

function addFountain(): void {
  addBox("fountain-north", 0, 0, -3.35, 7.2, 0.82, 0.45, 0x23506b);
  addBox("fountain-south", 0, 0, 3.35, 7.2, 0.82, 0.45, 0x23506b);
  addBox("fountain-west", -3.35, 0, 0, 0.45, 0.82, 6.25, 0x23506b);
  addBox("fountain-east", 3.35, 0, 0, 0.45, 0.82, 6.25, 0x23506b);
  addBox("fountain-core", 0, 0, 0, 1.35, 1.55, 1.35, 0x2c5a79);
}

function addPlazaCover(): void {
  const positions = [
    [-7.2, -7.2],
    [7.2, -7.2],
    [-7.2, 7.2],
    [7.2, 7.2],
  ] as const;
  positions.forEach(([x, z], index) => {
    addBox(
      `plaza-planter-${index}`,
      x,
      0,
      z,
      1.55,
      0.95,
      1.55,
      0x284c64,
    );
  });

  const barrierSpots = [
    [-23.4, -10, true],
    [-23.4, 10, true],
    [23.4, -10, true],
    [23.4, 10, true],
    [-10, -23.4, false],
    [10, -23.4, false],
    [-10, 23.4, false],
    [10, 23.4, false],
  ] as const;
  barrierSpots.forEach(([x, z, vertical], index) => {
    addBox(
      `street-barrier-${index}`,
      x,
      0,
      z,
      vertical ? 0.75 : 4.2,
      1.05,
      vertical ? 4.2 : 0.75,
      0x2a4f68,
    );
  });
}

function addStreetLights(): void {
  const spots: readonly [number, number][] = [
    [-3.9, -36],
    [3.9, -36],
    [-3.9, -18],
    [3.9, -18],
    [-3.9, 18],
    [3.9, 18],
    [-3.9, 36],
    [3.9, 36],
    [-36, -3.9],
    [-36, 3.9],
    [-18, -3.9],
    [-18, 3.9],
    [18, -3.9],
    [18, 3.9],
    [36, -3.9],
    [36, 3.9],
  ];
  for (const [x, z] of spots) {
    streetLights.push({ x, z, height: 5.8, color: 0xffb35c });
  }
}

const waypoints: Vec3[] = [];
for (const z of [-38, -24, -11, 11, 24, 38]) {
  waypoints.push({ x: 0, y: 0, z });
  waypoints.push({ x: -23.4, y: 0, z });
  waypoints.push({ x: 23.4, y: 0, z });
}
for (const x of [-38, -24, -11, 11, 24, 38]) {
  waypoints.push({ x, y: 0, z: 0 });
  waypoints.push({ x, y: 0, z: -23.4 });
  waypoints.push({ x, y: 0, z: 23.4 });
}
for (const x of [-43, 43]) {
  waypoints.push({ x, y: 0, z: -23.4 });
  waypoints.push({ x, y: 0, z: 23.4 });
}
for (const z of [-43, 43]) {
  waypoints.push({ x: -23.4, y: 0, z });
  waypoints.push({ x: 23.4, y: 0, z });
}

addBox(
  "wall-north",
  0,
  0,
  -ARENA_HALF_EXTENT - 0.5,
  FLOOR_SIZE,
  8,
  1,
  0x0a1422,
);
addBox(
  "wall-south",
  0,
  0,
  ARENA_HALF_EXTENT + 0.5,
  FLOOR_SIZE,
  8,
  1,
  0x0a1422,
);
addBox(
  "wall-west",
  -ARENA_HALF_EXTENT - 0.5,
  0,
  0,
  1,
  8,
  FLOOR_SIZE - 2,
  0x0a1422,
);
addBox(
  "wall-east",
  ARENA_HALF_EXTENT + 0.5,
  0,
  0,
  1,
  8,
  FLOOR_SIZE - 2,
  0x0a1422,
);

BUILDINGS.forEach(addBuilding);
BUILDINGS.forEach((building) => {
  if (building.roofStyle === "flat") {
    addRoofStairs(building);
  }
});
addFountain();
addPlazaCover();
addStreetLights();

export const MAP_PICKUPS: readonly PickupSpawn[] = [
  { id: "medkit-plaza-north", kind: "medkit", x: 0, z: 10 },
  { id: "medkit-plaza-south", kind: "medkit", x: 0, z: -10 },
  { id: "medkit-plaza-east", kind: "medkit", x: 10, z: 0 },
  { id: "medkit-plaza-west", kind: "medkit", x: -10, z: 0 },
  { id: "medkit-avenue-north", kind: "medkit", x: 0, z: 36 },
  { id: "medkit-avenue-south", kind: "medkit", x: 0, z: -36 },
  { id: "medkit-street-ne", kind: "medkit", x: 23.4, z: 23.4 },
  { id: "medkit-street-sw", kind: "medkit", x: -23.4, z: -23.4 },
  { id: "armor-street-se", kind: "armor", x: 23.4, z: -23.4 },
  { id: "armor-street-nw", kind: "armor", x: -23.4, z: 23.4 },
  { id: "armor-street-e1", kind: "armor", x: 23.4, z: -30 },
  { id: "armor-street-w1", kind: "armor", x: -23.4, z: 30 },
  { id: "armor-street-s1", kind: "armor", x: 30, z: -23.4 },
  { id: "armor-street-n1", kind: "armor", x: -30, z: 23.4 },
];

export const MAP_OBJECTS: readonly MapObject[] = objects;
export const MAP_STAIRS: readonly StairSpec[] = stairs;
export const MAP_ROOFS: readonly RoofSpec[] = roofs;
export const MAP_WINDOWS: readonly PanelSpec[] = panels;
export const MAP_SIDEWALKS: readonly SidewalkSpec[] = sidewalks;
export const MAP_STREETLIGHTS: readonly StreetLightSpec[] = streetLights;
export const MAP_WAYPOINTS: readonly Vec3[] = waypoints;

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

export function sphereHitsMap(
  x: number,
  y: number,
  z: number,
  radius: number,
): boolean {
  return aabbHitsMap(
    x - radius,
    y - radius,
    z - radius,
    x + radius,
    y + radius,
    z + radius,
  );
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
