import type { WeaponId } from "./types";

export interface ScopeLevel {
  fov: number;
  label: string;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  shortName: string;
  slot: number;
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
    damage: 24,
    headshotMultiplier: 1.8,
    fireIntervalMs: 82,
    magazine: 30,
    reserve: 150,
    reloadTimeMs: 2200,
    pellets: 1,
    spreadRad: 0.0095,
    adsSpreadMultiplier: 0.32,
    range: 110,
    falloffStart: 45,
    minDamageMultiplier: 0.62,
    automatic: true,
    adsFov: 58,
    recoil: 0.55,
    accent: 0x00e5ff,
    hudColor: "#00e5ff",
  },
  smg: {
    id: "smg",
    name: "PDW-9",
    shortName: "PDW-9",
    slot: 2,
    damage: 16,
    headshotMultiplier: 1.6,
    fireIntervalMs: 54,
    magazine: 36,
    reserve: 180,
    reloadTimeMs: 1700,
    pellets: 1,
    spreadRad: 0.018,
    adsSpreadMultiplier: 0.42,
    range: 70,
    falloffStart: 24,
    minDamageMultiplier: 0.48,
    automatic: true,
    adsFov: 64,
    recoil: 0.38,
    accent: 0xffd166,
    hudColor: "#ffd166",
  },
  shotgun: {
    id: "shotgun",
    name: "BR-12 Breacher",
    shortName: "BR-12",
    slot: 3,
    damage: 14,
    headshotMultiplier: 1.3,
    fireIntervalMs: 620,
    magazine: 6,
    reserve: 30,
    reloadTimeMs: 2800,
    pellets: 8,
    spreadRad: 0.075,
    adsSpreadMultiplier: 0.68,
    range: 34,
    falloffStart: 9,
    minDamageMultiplier: 0.3,
    automatic: false,
    adsFov: 68,
    recoil: 1,
    accent: 0xff8c42,
    hudColor: "#ff8c42",
  },
  sniper: {
    id: "sniper",
    name: "LR-90 Longshot",
    shortName: "LR-90",
    slot: 4,
    damage: 90,
    headshotMultiplier: 2.4,
    fireIntervalMs: 1120,
    magazine: 5,
    reserve: 25,
    reloadTimeMs: 3000,
    pellets: 1,
    spreadRad: 0.003,
    adsSpreadMultiplier: 0.12,
    range: 220,
    falloffStart: 150,
    minDamageMultiplier: 0.88,
    automatic: false,
    adsFov: 28,
    zoomLevels: [
      { fov: 45, label: "2.5X" },
      { fov: 28, label: "4X" },
      { fov: 16, label: "6X" },
    ],
    scopeOverlay: true,
    recoil: 1.25,
    accent: 0xff3d81,
    hudColor: "#ff3d81",
  },
  dmr: {
    id: "dmr",
    name: "M14 Sentinel",
    shortName: "M14",
    slot: 5,
    damage: 44,
    headshotMultiplier: 2.1,
    fireIntervalMs: 210,
    magazine: 10,
    reserve: 60,
    reloadTimeMs: 2500,
    pellets: 1,
    spreadRad: 0.005,
    adsSpreadMultiplier: 0.18,
    range: 170,
    falloffStart: 95,
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
    damage: 21,
    headshotMultiplier: 1.55,
    fireIntervalMs: 68,
    magazine: 50,
    reserve: 200,
    reloadTimeMs: 4200,
    pellets: 1,
    spreadRad: 0.016,
    adsSpreadMultiplier: 0.44,
    range: 105,
    falloffStart: 38,
    minDamageMultiplier: 0.55,
    automatic: true,
    adsFov: 58,
    zoomLevels: [
      { fov: 58, label: "1.5X" },
      { fov: 44, label: "2X" },
    ],
    recoil: 0.72,
    accent: 0xc084ff,
    hudColor: "#c084ff",
  },
  pistol: {
    id: "pistol",
    name: "P9 Sidearm",
    shortName: "P9",
    slot: 7,
    damage: 30,
    headshotMultiplier: 2,
    fireIntervalMs: 175,
    magazine: 12,
    reserve: 72,
    reloadTimeMs: 1450,
    pellets: 1,
    spreadRad: 0.013,
    adsSpreadMultiplier: 0.38,
    range: 60,
    falloffStart: 22,
    minDamageMultiplier: 0.55,
    automatic: false,
    adsFov: 62,
    recoil: 0.48,
    accent: 0xb6ff5c,
    hudColor: "#b6ff5c",
  },
  revolver: {
    id: "revolver",
    name: "R6 Marshal",
    shortName: "R6",
    slot: 8,
    damage: 55,
    headshotMultiplier: 2.2,
    fireIntervalMs: 380,
    magazine: 6,
    reserve: 36,
    reloadTimeMs: 2300,
    pellets: 1,
    spreadRad: 0.009,
    adsSpreadMultiplier: 0.3,
    range: 85,
    falloffStart: 32,
    minDamageMultiplier: 0.6,
    automatic: false,
    adsFov: 58,
    recoil: 1.15,
    accent: 0xe5f2ff,
    hudColor: "#e5f2ff",
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = [
  "rifle",
  "smg",
  "shotgun",
  "sniper",
  "dmr",
  "lmg",
  "pistol",
  "revolver",
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
