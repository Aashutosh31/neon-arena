import type { WeaponId } from "./types";

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
    damage: 23,
    headshotMultiplier: 1.8,
    fireIntervalMs: 115,
    magazine: 30,
    reserve: 150,
    reloadTimeMs: 2200,
    pellets: 1,
    spreadRad: 0.012,
    adsSpreadMultiplier: 0.35,
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
    damage: 15,
    headshotMultiplier: 1.6,
    fireIntervalMs: 72,
    magazine: 36,
    reserve: 180,
    reloadTimeMs: 1700,
    pellets: 1,
    spreadRad: 0.024,
    adsSpreadMultiplier: 0.45,
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
    damage: 13,
    headshotMultiplier: 1.3,
    fireIntervalMs: 850,
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
    damage: 88,
    headshotMultiplier: 2.4,
    fireIntervalMs: 1450,
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
    recoil: 1.25,
    accent: 0xff3d81,
    hudColor: "#ff3d81",
  },
  pistol: {
    id: "pistol",
    name: "P9 Sidearm",
    shortName: "P9",
    slot: 5,
    damage: 27,
    headshotMultiplier: 2,
    fireIntervalMs: 280,
    magazine: 12,
    reserve: 72,
    reloadTimeMs: 1450,
    pellets: 1,
    spreadRad: 0.016,
    adsSpreadMultiplier: 0.4,
    range: 60,
    falloffStart: 22,
    minDamageMultiplier: 0.55,
    automatic: false,
    adsFov: 62,
    recoil: 0.48,
    accent: 0xb6ff5c,
    hudColor: "#b6ff5c",
  },
};

export const WEAPON_ORDER: readonly WeaponId[] = [
  "rifle",
  "smg",
  "shotgun",
  "sniper",
  "pistol",
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
