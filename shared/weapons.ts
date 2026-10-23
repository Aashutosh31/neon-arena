import type { WeaponId } from "./types";

export type WeaponCategory =
  | "short"
  | "assault"
  | "machine"
  | "sniper"
  | "shotgun";

export const WEAPON_CATEGORIES: Record<
  WeaponCategory,
  { label: string; order: number }
> = {
  short: { label: "SHORT RANGE", order: 0 },
  assault: { label: "LONG-RANGE AR", order: 1 },
  machine: { label: "MACHINE GUN", order: 2 },
  sniper: { label: "SNIPER", order: 3 },
  shotgun: { label: "SHOTGUN", order: 4 },
};

export interface ScopeLevel {
  fov: number;
  label: string;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  slot: number;
  category: WeaponCategory;
  damage: number;
  headshotMultiplier: number;
  fireIntervalMs: number;
  magazine: number;
  reserve: number;
  reloadTimeMs: number;
  pellets: number;
  spreadRad: number;
  adsSpreadMultiplier: number;
  range: number;
  falloffStart: number;
  minDamageMultiplier: number;
  automatic: boolean;
  adsFov: number;
  /** Optional variable-zoom levels, cycled with V / mouse wheel / touch ZOOM. */
  zoomLevels?: readonly ScopeLevel[];
  /** Full-screen optic overlay when aiming. */
  scopeOverlay?: boolean;
  recoil: number;
  accent: number;
  hudColor: string;
}

export const WEAPONS: Record<WeaponId, WeaponSpec> = {
  rifle: {
    id: "rifle",
    name: "VK-7 Rifle",
    shortName: "VK-7",
    slot: 1,
    category: "assault",
    damage: 28,
    headshotMultiplier: 1.9,
    fireIntervalMs: 75,
    magazine: 32,
    reserve: 160,
    reloadTimeMs: 2050,
    pellets: 1,
    spreadRad: 0.0085,
    adsSpreadMultiplier: 0.3,
    range: 125,
    falloffStart: 50,
    minDamageMultiplier: 0.6,
    automatic: true,
    adsFov: 58,
    recoil: 0.58,
    accent: 0x00e5ff,
    hudColor: "#00e5ff",
  },
  smg: {
    id: "smg",
    name: "PDW-9",
    shortName: "PDW-9",
    slot: 3,
    category: "short",
    damage: 19,
    headshotMultiplier: 1.6,
    fireIntervalMs: 47,
    magazine: 42,
    reserve: 210,
    reloadTimeMs: 1600,
    pellets: 1,
    spreadRad: 0.017,
    adsSpreadMultiplier: 0.44,
    range: 78,
    falloffStart: 25,
    minDamageMultiplier: 0.42,
    automatic: true,
    adsFov: 64,
    recoil: 0.34,
    accent: 0xffd166,
    hudColor: "#ffd166",
  },
  shotgun: {
    id: "shotgun",
    name: "BR-12 Breacher",
    shortName: "BR-12",
    slot: 8,
    category: "shotgun",
    damage: 15,
    headshotMultiplier: 1.35,
    fireIntervalMs: 540,
    magazine: 7,
    reserve: 35,
    reloadTimeMs: 2500,
    pellets: 9,
    spreadRad: 0.082,
    adsSpreadMultiplier: 0.65,
    range: 36,
    falloffStart: 10,
    minDamageMultiplier: 0.28,
    automatic: false,
    adsFov: 68,
    recoil: 1.05,
    accent: 0xff8c42,
    hudColor: "#ff8c42",
  },
  sniper: {
    id: "sniper",
    name: "LR-90 Longshot",
    shortName: "LR-90",
    slot: 7,
    category: "sniper",
    damage: 112,
    headshotMultiplier: 2.5,
    fireIntervalMs: 960,
    magazine: 6,
    reserve: 30,
    reloadTimeMs: 2700,
    pellets: 1,
    spreadRad: 0.003,
    adsSpreadMultiplier: 0.12,
    range: 260,
    falloffStart: 180,
    minDamageMultiplier: 0.9,
    automatic: false,
    adsFov: 28,
    zoomLevels: [
      { fov: 45, label: "2.5X" },
      { fov: 28, label: "4X" },
      { fov: 16, label: "6X" },
    ],
    scopeOverlay: true,
    recoil: 1.35,
    accent: 0xff3d81,
    hudColor: "#ff3d81",
  },
  dmr: {
    id: "dmr",
    name: "M14 Sentinel",
    shortName: "M14",
    slot: 2,
    category: "assault",
    damage: 52,
    headshotMultiplier: 2.15,
    fireIntervalMs: 175,
    magazine: 12,
    reserve: 72,
    reloadTimeMs: 2300,
    pellets: 1,
    spreadRad: 0.0045,
    adsSpreadMultiplier: 0.16,
    range: 195,
    falloffStart: 100,
    minDamageMultiplier: 0.8,
    automatic: false,
    adsFov: 48,
    zoomLevels: [
      { fov: 48, label: "2X" },
      { fov: 32, label: "3X" },
    ],
    scopeOverlay: true,
    recoil: 0.9,
    accent: 0x7dffc4,
    hudColor: "#7dffc4",
  },
  lmg: {
    id: "lmg",
    name: "MK-8 Bastion",
    shortName: "MK-8",
    slot: 6,
    category: "machine",
    damage: 25,
    headshotMultiplier: 1.55,
    fireIntervalMs: 60,
    magazine: 75,
    reserve: 225,
    reloadTimeMs: 3800,
    pellets: 1,
    spreadRad: 0.018,
    adsSpreadMultiplier: 0.48,
    range: 120,
    falloffStart: 45,
    minDamageMultiplier: 0.55,
    automatic: true,
    adsFov: 58,
    zoomLevels: [
      { fov: 58, label: "1.5X" },
      { fov: 44, label: "2X" },
    ],
    recoil: 0.8,
    accent: 0xc084fc,
    hudColor: "#c084fc",
  },
  pistol: {
    id: "pistol",
    name: "P9 Sidearm",
    shortName: "P9",
    slot: 4,
    category: "short",
    damage: 34,
    headshotMultiplier: 2,
    fireIntervalMs: 145,
    magazine: 15,
    reserve: 90,
    reloadTimeMs: 1250,
    pellets: 1,
    spreadRad: 0.013,
    adsSpreadMultiplier: 0.38,
    range: 62,
    falloffStart: 20,
    minDamageMultiplier: 0.5,
    automatic: false,
    adsFov: 62,
    recoil: 0.45,
    accent: 0xb6ff5c,
    hudColor: "#b6ff5c",
  },
  revolver: {
    id: "revolver",
    name: "R6 Marshal",
    shortName: "R6",
    slot: 5,
    category: "short",
    damage: 64,
    headshotMultiplier: 2.25,
    fireIntervalMs: 315,
    magazine: 6,
    reserve: 42,
    reloadTimeMs: 2050,
    pellets: 1,
    spreadRad: 0.009,
    adsSpreadMultiplier: 0.3,
    range: 92,
    falloffStart: 35,
    minDamageMultiplier: 0.55,
    automatic: false,
    adsFov: 58,
    recoil: 1.2,
    accent: 0xe5f2ff,
    hudColor: "#e5f2ff",
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = [
  "rifle",
  "dmr",
  "smg",
  "pistol",
  "revolver",
  "lmg",
  "sniper",
  "shotgun",
];

export function isWeaponId(value: unknown): value is WeaponId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(WEAPONS, value)
  );
}

export function weaponForSlot(slot: number): WeaponId | null {
  return WEAPON_ORDER[slot - 1] ?? null;
}

export function nextWeapon(current: WeaponId, direction = 1): WeaponId {
  const index = WEAPON_ORDER.indexOf(current);
  const next =
    (index + direction + WEAPON_ORDER.length) % WEAPON_ORDER.length;
  return WEAPON_ORDER[next];
}
