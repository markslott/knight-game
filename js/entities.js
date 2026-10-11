import { TILE_FLOOR, TILE_SPIKE, isLandable } from "./dungeon.js";

const STATS = {
  grunt: { hp: 1, period: 0.9, telegraph: 0.4, damage: 1 },
  brute: { hp: 3, period: 1.4, telegraph: 0.5, damage: 2 },
  spitter: { hp: 1, period: 2, telegraph: 0.45, damage: 1 },
};

const ORTHO = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export function createEnemy(spec) {
  const stats = STATS[spec.type];
  return {
    type: spec.type,
    x: spec.x,
    y: spec.y,
    hp: stats.hp,
    maxHp: stats.hp,
    period: stats.period,
    telegraphWindow: stats.telegraph,
    damage: stats.damage,
    timer: stats.period * (0.65 + Math.random() * 0.35),
    telegraph: null,
    action: null,
    stagger: 0,
    flash: 0,
    counted: false,
  };
}

export function createDragon(spec) {
  return {
    x: spec.x,
    y: spec.y,
    hp: 8,
    maxHp: 8,
    phase: "breath",
    timer: 1.55,
    windup: 0.75,
    telegraph: null,
    scorch: null,
    scorchLife: 0,
    stagger: 0,
    flash: 0,
    counted: false,
  };
}

export function spikePhase(x, y, time) {
  const cycle = 2.85;
  const offset = ((x * 13 + y * 7) % 100) / 100;
  const t = (offset * cycle + time) % cycle;
  if (t < 2) return "idle";
  if (t < 2.45) return "telegraph";
  return "up";
}

export function updateEnemies(enemies, ctx) {
  const shots = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0) continue;
    if (enemy.flash > 0) enemy.flash -= ctx.dt;
    if (enemy.stagger > 0) {
      enemy.stagger -= ctx.dt;
      enemy.telegraph = null;
      enemy.action = null;
      continue;
    }
    if (sameTile(enemy, ctx.knight) && !ctx.knight.leaping) {
      ctx.speak?.(enemy.type, enemy.x, enemy.y, "talk", enemy);
      enemy.telegraph = null;
      enemy.action = null;
      enemy.timer = enemy.period;
      continue;
    }
    enemy.timer -= ctx.dt;
    if (!enemy.telegraph && !enemy.action && enemy.timer <= enemy.telegraphWindow) {
      commitIntent(enemy, ctx);
    }
    if (enemy.timer > 0) continue;
    const shot = resolveIntent(enemy, ctx);
    if (shot) shots.push(shot);
    enemy.timer += enemy.period;
    enemy.telegraph = null;
    enemy.action = null;
  }
  return shots;
}

export function updateDragon(dragon, ctx) {
  if (!dragon || dragon.hp <= 0) return;
  if (dragon.flash > 0) dragon.flash -= ctx.dt;
  if (dragon.stagger > 0) dragon.stagger -= ctx.dt;
  if (dragon.scorchLife > 0) dragon.scorchLife -= ctx.dt;
  dragon.timer -= ctx.dt;
  if (!dragon.telegraph && dragon.timer <= dragon.windup) {
    if (dragon.phase === "breath") {
      dragon.telegraph = { type: "line", tiles: breathTiles(dragon, ctx) };
      ctx.speak?.("dragon", dragon.x, dragon.y, "breath", dragon);
    } else {
      dragon.telegraph = { type: "step", tile: dragonStep(dragon, ctx) };
      ctx.speak?.("dragon", dragon.x, dragon.y, "step", dragon);
    }
  }
  if (dragon.timer > 0) return;
  if (dragon.telegraph?.type === "line") {
    const tiles = dragon.telegraph.tiles;
    dragon.scorch = tiles;
    dragon.scorchLife = 0.28;
    const struck = tiles.some((tile) => tile.x === ctx.knight.x && tile.y === ctx.knight.y);
    if (struck && !ctx.knight.leaping) ctx.onBreath();
  } else if (dragon.telegraph?.type === "step" && dragon.telegraph.tile) {
    const tile = dragon.telegraph.tile;
    if (footRoom(tile.x, tile.y, ctx, null, true)) {
      dragon.x = tile.x;
      dragon.y = tile.y;
    }
  }
  dragon.telegraph = null;
  dragon.phase = dragon.phase === "breath" ? "step" : "breath";
  dragon.timer = dragon.phase === "breath" ? 1.7 : 1.3;
  dragon.windup = dragon.phase === "breath" ? 0.75 : 0.5;
}

export function updateProjectiles(projectiles, ctx) {
  for (const shot of projectiles) {
    shot.life -= ctx.dt;
    shot.x += shot.vx * ctx.dt;
    shot.y += shot.vy * ctx.dt;
    const tx = Math.round(shot.x);
    const ty = Math.round(shot.y);
    if (!inside(ctx, tx, ty)) {
      shot.life = 0;
      continue;
    }
    if (!isLandable(tileAt(ctx, tx, ty))) {
      shot.life = 0;
      continue;
    }
    if (
      !ctx.knight.leaping &&
      tx === ctx.knight.x &&
      ty === ctx.knight.y &&
      ctx.knight.iframes <= 0
    ) {
      shot.life = 0;
      ctx.onShot();
    }
  }
  return projectiles.filter((shot) => shot.life > 0);
}

export function strikeTile(enemies, dragon, x, y, amount) {
  const slain = [];
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.x !== x || enemy.y !== y) continue;
    enemy.hp -= amount;
    enemy.flash = 0.16;
    enemy.stagger = 0.45;
    if (enemy.hp <= 0) slain.push(enemy);
  }
  if (dragon && dragon.hp > 0 && dragon.x === x && dragon.y === y) {
    dragon.hp -= amount;
    dragon.flash = 0.16;
    dragon.stagger = 0.45;
    if (dragon.hp <= 0) slain.push(dragon);
  }
  return slain;
}

export function contactAmount(enemies, dragon, knight) {
  if (knight.leaping) return 0;
  let amount = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || enemy.stagger > 0) continue;
    if (enemy.x === knight.x && enemy.y === knight.y) amount = Math.max(amount, enemy.damage);
  }
  if (dragon && dragon.hp > 0 && dragon.stagger <= 0 && dragon.x === knight.x && dragon.y === knight.y) {
    amount = Math.max(amount, 2);
  }
  return amount;
}

function commitIntent(enemy, ctx) {
  const target = aimPoint(ctx.knight);
  if (enemy.type === "spitter") {
    const dist = Math.abs(enemy.x - target.x) + Math.abs(enemy.y - target.y);
    const shot = dist >= 3 ? aimShot(enemy, target, ctx) : null;
    if (shot) {
      enemy.action = { type: "shoot", shot, tiles: shot.tiles };
      ctx.speak?.("spitter", enemy.x, enemy.y, "talk", enemy);
      return;
    }
    enemy.telegraph = chooseStep(enemy, target, ctx, dist < 3);
    return;
  }
  enemy.telegraph = chooseStep(enemy, target, ctx, false);
  if (enemy.telegraph) ctx.speak?.(enemy.type, enemy.x, enemy.y, "talk", enemy);
}

function resolveIntent(enemy, ctx) {
  if (enemy.action?.type === "shoot") return enemy.action.shot;
  const next = enemy.telegraph;
  if (!next || !footRoom(next.x, next.y, ctx, enemy, false)) return null;
  enemy.x = next.x;
  enemy.y = next.y;
  return null;
}

function chooseStep(enemy, target, ctx, away) {
  let best = null;
  for (const [dx, dy] of ORTHO) {
    const x = enemy.x + dx;
    const y = enemy.y + dy;
    if (!footRoom(x, y, ctx, enemy, false)) continue;
    const dist = Math.abs(x - target.x) + Math.abs(y - target.y);
    if (!best || (away ? dist > best.dist : dist < best.dist)) best = { x, y, dist };
  }
  return best ? { x: best.x, y: best.y } : null;
}

function aimShot(enemy, target, ctx) {
  const dx = target.x - enemy.x;
  const dy = target.y - enemy.y;
  if (dx !== 0 && dy !== 0) return null;
  const dist = Math.abs(dx) + Math.abs(dy);
  if (dist < 2 || dist > 9) return null;
  const stepx = Math.sign(dx);
  const stepy = Math.sign(dy);
  const tiles = [];
  for (let step = 1; step <= dist; step++) {
    const x = enemy.x + stepx * step;
    const y = enemy.y + stepy * step;
    if (!isLandable(tileAt(ctx, x, y))) return null;
    tiles.push({ x, y });
  }
  return {
    x: enemy.x,
    y: enemy.y,
    vx: stepx * 6,
    vy: stepy * 6,
    life: 2.6,
    tiles,
  };
}

function breathTiles(dragon, ctx) {
  const target = aimPoint(ctx.knight);
  const dx = target.x - dragon.x;
  const dy = target.y - dragon.y;
  let stepx = 0;
  let stepy = 0;
  if (Math.abs(dx) >= Math.abs(dy)) stepx = Math.sign(dx) || 1;
  else stepy = Math.sign(dy) || 1;
  const tiles = [];
  for (let step = 1; step < 14; step++) {
    const x = dragon.x + stepx * step;
    const y = dragon.y + stepy * step;
    if (!inside(ctx, x, y) || !isLandable(tileAt(ctx, x, y))) break;
    tiles.push({ x, y });
  }
  return tiles;
}

function dragonStep(dragon, ctx) {
  const target = aimPoint(ctx.knight);
  const sx = Math.sign(target.x - dragon.x);
  const sy = Math.sign(target.y - dragon.y);
  const options = [
    { x: dragon.x + sx, y: dragon.y + sy },
    { x: dragon.x + sx, y: dragon.y },
    { x: dragon.x, y: dragon.y + sy },
  ];
  for (const option of options) {
    if (option.x === dragon.x && option.y === dragon.y) continue;
    if (footRoom(option.x, option.y, ctx, null, true)) return option;
  }
  return null;
}

function footRoom(x, y, ctx, self, dragonMove) {
  if (!inside(ctx, x, y)) return false;
  const tile = tileAt(ctx, x, y);
  if (tile !== TILE_FLOOR && tile !== TILE_SPIKE) return false;
  if (ctx.level.princess && ctx.level.princess.x === x && ctx.level.princess.y === y) return false;
  if (!dragonMove && ctx.dragon && ctx.dragon.hp > 0 && ctx.dragon.x === x && ctx.dragon.y === y) return false;
  for (const other of ctx.enemies) {
    if (other === self || other.hp <= 0) continue;
    if (other.x === x && other.y === y) return false;
    if (other.telegraph && other.telegraph.x === x && other.telegraph.y === y) return false;
  }
  return true;
}

function aimPoint(knight) {
  if (knight.leaping) return { x: knight.toX, y: knight.toY };
  return { x: knight.x, y: knight.y };
}

function sameTile(enemy, knight) {
  return enemy.x === knight.x && enemy.y === knight.y;
}

function inside(ctx, x, y) {
  return x >= 0 && y >= 0 && x < ctx.level.width && y < ctx.level.height;
}

function tileAt(ctx, x, y) {
  return ctx.level.tiles[y * ctx.level.width + x];
}
