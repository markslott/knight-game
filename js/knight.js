import { legalLandings } from "./dungeon.js";

export const BOON_INFO = {
  wind: {
    name: "Second Wind",
    text: "Gain two hearts and heal two.",
  },
  swift: {
    name: "Swift Spur",
    text: "Leaps recover 30% faster.",
  },
  shock: {
    name: "Shock Landing",
    text: "Landing also strikes monsters beside you.",
  },
  plate: {
    name: "Plate",
    text: "Ignore the next two hits.",
  },
  blood: {
    name: "Blood Leap",
    text: "A killing leap restores one heart.",
  },
};

export const BOON_IDS = Object.keys(BOON_INFO);

const LEAP_TIME = 0.18;
export const STAMINA_MAX = 100;
export const LEAP_COST = 33;
const STAMINA_REGEN = 26;
const PIT_STAMINA = 22;

export function createKnight(spawn) {
  return {
    x: spawn.x,
    y: spawn.y,
    fromX: spawn.x,
    fromY: spawn.y,
    toX: spawn.x,
    toY: spawn.y,
    leaping: false,
    leapT: 0,
    stamina: STAMINA_MAX,
    hp: 5,
    maxHp: 5,
    iframes: 0,
    facing: 1,
    flash: 0,
    guard: 0.9,
  };
}

export function canLeap(knight) {
  return Boolean(knight) && !knight.leaping && knight.stamina >= LEAP_COST;
}

export function staminaFill(knight) {
  return Math.max(0, Math.min(1, knight.stamina / STAMINA_MAX));
}

export function drainPitStamina(knight) {
  knight.stamina = Math.max(0, knight.stamina - PIT_STAMINA);
}

export function landingsFrom(level, x, y) {
  return legalLandings(level.tiles, level.width, level.height, x, y);
}

export function knightVisual(knight) {
  if (!knight.leaping) return { x: knight.x, y: knight.y, air: 0 };
  const t = knight.leapT * knight.leapT * (3 - 2 * knight.leapT);
  return {
    x: knight.fromX + (knight.toX - knight.fromX) * t,
    y: knight.fromY + (knight.toY - knight.fromY) * t,
    air: Math.sin(knight.leapT * Math.PI),
  };
}

export function startLeap(knight, landing) {
  knight.stamina = Math.max(0, knight.stamina - LEAP_COST);
  knight.fromX = knight.x;
  knight.fromY = knight.y;
  knight.toX = landing.x;
  knight.toY = landing.y;
  knight.leaping = true;
  knight.leapT = 0;
  if (landing.x !== knight.x) knight.facing = landing.x > knight.x ? 1 : -1;
}

export function updateKnight(knight, dt, boons) {
  if (knight.flash > 0) knight.flash = Math.max(0, knight.flash - dt);
  if (knight.iframes > 0) knight.iframes = Math.max(0, knight.iframes - dt);
  if (knight.guard > 0) knight.guard = Math.max(0, knight.guard - dt);
  if (!knight.leaping) {
    const regen = STAMINA_REGEN * 1.3 ** (boons?.swift || 0);
    knight.stamina = Math.min(STAMINA_MAX, knight.stamina + regen * dt);
    return null;
  }
  knight.leapT += dt / LEAP_TIME;
  if (knight.leapT < 1) return null;
  knight.leapT = 1;
  knight.leaping = false;
  knight.x = knight.toX;
  knight.y = knight.toY;
  knight.fromX = knight.x;
  knight.fromY = knight.y;
  return "landed";
}

export function hurtKnight(knight, amount, boons) {
  if (knight.leaping || knight.iframes > 0 || knight.guard > 0 || amount <= 0) return null;
  if (boons.plate > 0) {
    boons.plate -= 1;
    knight.iframes = 0.4;
    knight.flash = 0.12;
    return "block";
  }
  knight.hp = Math.max(0, knight.hp - amount);
  knight.iframes = 0.55;
  knight.flash = 0.22;
  return "hurt";
}

export function applyBoon(knight, boons, id) {
  if (id === "wind") {
    knight.maxHp += 2;
    knight.hp = Math.min(knight.maxHp, knight.hp + 2);
  } else if (id === "swift") {
    boons.swift += 1;
  } else if (id === "shock") {
    boons.shock = true;
  } else if (id === "plate") {
    boons.plate += 2;
  } else if (id === "blood") {
    boons.blood = true;
  }
}
