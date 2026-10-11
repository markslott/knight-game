export const TILE_WALL = 0;
export const TILE_FLOOR = 1;
export const TILE_PIT = 2;
export const TILE_SPIKE = 3;
export const TILE_STAIRS = 4;
export const TILE_GATE = 5;
export const TILE_PILLAR = 6;

export const WIDTH = 21;
export const HEIGHT = 21;

export const KNIGHT_OFFSETS = [
  { dx: -2, dy: -1, key: "Q", code: "KeyQ", numpad: "Numpad7" },
  { dx: -1, dy: -2, key: "2", code: "Digit2", numpad: "Numpad8" },
  { dx: 1, dy: -2, key: "3", code: "Digit3", numpad: "Numpad9" },
  { dx: 2, dy: -1, key: "E", code: "KeyE", numpad: "Numpad6" },
  { dx: 2, dy: 1, key: "D", code: "KeyD", numpad: "Numpad3" },
  { dx: 1, dy: 2, key: "X", code: "KeyX", numpad: "Numpad2" },
  { dx: -1, dy: 2, key: "Z", code: "KeyZ", numpad: "Numpad1" },
  { dx: -2, dy: 1, key: "A", code: "KeyA", numpad: "Numpad4" },
];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function isLandable(tile) {
  return (
    tile === TILE_FLOOR ||
    tile === TILE_PIT ||
    tile === TILE_SPIKE ||
    tile === TILE_STAIRS
  );
}

export function inBounds(x, y, width = WIDTH, height = HEIGHT) {
  return x >= 0 && y >= 0 && x < width && y < height;
}

export function idx(x, y, width = WIDTH) {
  return y * width + x;
}

export function knightDistanceMap(tiles, width, height, start) {
  const dist = new Int16Array(width * height);
  dist.fill(-1);
  if (!inBounds(start.x, start.y, width, height)) return dist;
  const startIndex = idx(start.x, start.y, width);
  if (!isLandable(tiles[startIndex])) return dist;
  dist[startIndex] = 0;
  const queue = [start.x, start.y];
  for (let head = 0; head < queue.length; head += 2) {
    const x = queue[head];
    const y = queue[head + 1];
    const base = dist[idx(x, y, width)];
    for (const move of KNIGHT_OFFSETS) {
      const nx = x + move.dx;
      const ny = y + move.dy;
      if (!inBounds(nx, ny, width, height)) continue;
      const ni = idx(nx, ny, width);
      if (dist[ni] !== -1) continue;
      if (!isLandable(tiles[ni])) continue;
      dist[ni] = base + 1;
      queue.push(nx, ny);
    }
  }
  return dist;
}

export function knightDistance(level, from, to) {
  if (!from || !to) return Infinity;
  const dist = knightDistanceMap(level.tiles, level.width, level.height, from);
  const value = dist[idx(to.x, to.y, level.width)];
  return value < 0 ? Infinity : value;
}

export function generateFloor(floorIndex, seed) {
  const rng = mulberry32((seed ^ Math.imul(floorIndex, 0x9e3779b9)) >>> 0);
  if (floorIndex >= 4) return generateBoss(rng, seed);
  for (let attempt = 0; attempt < 80; attempt++) {
    const level = tryFloor(floorIndex, rng, seed, false);
    if (level) return level;
  }
  return tryFloor(floorIndex, rng, seed, true);
}

function tryFloor(floorIndex, rng, seed, fallback) {
  const tiles = new Array(WIDTH * HEIGHT).fill(TILE_WALL);
  if (fallback) {
    carveRect(tiles, 2, 2, 17, 17);
  } else {
    const rooms = placeRooms(tiles, rng);
    if (rooms.length < 4) return null;
    linkRooms(tiles, rooms, rng);
  }

  const spawn = pickSpawn(tiles, rng);
  if (!spawn) return null;
  let dist = knightDistanceMap(tiles, WIDTH, HEIGHT, spawn);
  if (countReached(dist) < 18) return null;

  sprinklePillars(tiles, rng, spawn, dist);

  dist = knightDistanceMap(tiles, WIDTH, HEIGHT, spawn);
  const stairs = pickStairs(tiles, dist, spawn, rng);
  if (!stairs) return null;
  tiles[idx(stairs.x, stairs.y)] = TILE_STAIRS;
  dist = knightDistanceMap(tiles, WIDTH, HEIGHT, spawn);
  if (dist[idx(stairs.x, stairs.y)] < 4) return null;

  const safe = landingSet(spawn);
  safe.add(keyOf(spawn.x, spawn.y));
  safe.add(keyOf(stairs.x, stairs.y));

  const spikeCount = fallback ? 2 : 1 + floorIndex;
  const pitCount = fallback ? 1 : floorIndex === 1 ? 1 : floorIndex;
  placeHazards(tiles, dist, safe, spikeCount, pitCount, rng);

  const enemies = placeEnemies(tiles, dist, safe, enemyRoster(floorIndex), rng, stairs, spawn);

  return {
    width: WIDTH,
    height: HEIGHT,
    tiles,
    spawn: { x: spawn.x, y: spawn.y },
    stairs: { x: stairs.x, y: stairs.y },
    princess: null,
    dragon: null,
    gateTiles: [],
    enemies,
    floorIndex,
    seed,
    boss: false,
    fallback,
  };
}

function generateBoss(rng, seed) {
  const tiles = new Array(WIDTH * HEIGHT).fill(TILE_WALL);
  carveRect(tiles, 2, 2, 17, 11);
  carveRect(tiles, 8, 16, 5, 3);
  const gateTiles = [];
  for (let y = 13; y <= 15; y++) {
    for (let x = 8; x <= 12; x++) {
      tiles[idx(x, y)] = TILE_GATE;
      gateTiles.push({ x, y });
    }
  }

  const pillars = [
    [5, 7],
    [15, 7],
    [10, 4],
  ];
  for (const [x, y] of pillars) tiles[idx(x, y)] = TILE_PILLAR;

  const spawn = { x: 4, y: 4 };
  const dist = knightDistanceMap(tiles, WIDTH, HEIGHT, spawn);
  const dragonSpots = [
    { x: 10, y: 8 },
    { x: 8, y: 9 },
    { x: 12, y: 9 },
    { x: 10, y: 10 },
  ].filter((spot) => dist[idx(spot.x, spot.y)] >= 2);
  const dragon = dragonSpots[Math.floor(rng() * dragonSpots.length)] || { x: 10, y: 8 };

  const safe = landingSet(spawn);
  safe.add(keyOf(spawn.x, spawn.y));
  safe.add(keyOf(dragon.x, dragon.y));
  placeHazards(tiles, dist, safe, 3, 1, rng);

  const enemies = placeEnemies(tiles, dist, safe, ["grunt"], rng, null, spawn);

  return {
    width: WIDTH,
    height: HEIGHT,
    tiles,
    spawn,
    stairs: null,
    princess: { x: 10, y: 17 },
    dragon: { x: dragon.x, y: dragon.y },
    gateTiles,
    enemies,
    floorIndex: 4,
    seed,
    boss: true,
    fallback: false,
  };
}

function placeRooms(tiles, rng) {
  const rooms = [];
  const target = 4 + Math.floor(rng() * 2);
  for (let n = 0; n < target; n++) {
    let placed = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const w = 6 + Math.floor(rng() * 2);
      const h = 6 + Math.floor(rng() * 2);
      const x = 1 + Math.floor(rng() * (WIDTH - w - 2));
      const y = 1 + Math.floor(rng() * (HEIGHT - h - 2));
      const room = { x, y, w, h };
      if (rooms.some((other) => rectsCrowd(room, other))) continue;
      rooms.push(room);
      carveRect(tiles, x, y, w, h);
      placed = true;
      break;
    }
    if (!placed) break;
  }
  return rooms;
}

function rectsCrowd(a, b) {
  return (
    a.x < b.x + b.w + 1 &&
    a.x + a.w + 1 > b.x &&
    a.y < b.y + b.h + 1 &&
    a.y + a.h + 1 > b.y
  );
}

function linkRooms(tiles, rooms, rng) {
  const pending = rooms.map((_, index) => index);
  const joined = [pending.shift()];
  while (pending.length) {
    let best = null;
    for (const left of joined) {
      for (const right of pending) {
        const score = roomDistance(rooms[left], rooms[right]);
        if (!best || score < best.score) best = { left, right, score };
      }
    }
    connectRooms(tiles, rooms[best.left], rooms[best.right]);
    joined.push(best.right);
    pending.splice(pending.indexOf(best.right), 1);
  }
  if (rooms.length > 3 && rng() < 0.85) {
    const a = Math.floor(rng() * rooms.length);
    let b = Math.floor(rng() * (rooms.length - 1));
    if (b >= a) b += 1;
    connectRooms(tiles, rooms[a], rooms[b]);
  }
}

function connectRooms(tiles, a, b) {
  const sources = floorCells(tiles, a);
  const goals = floorCells(tiles, b);
  if (!carveKnightBridge(tiles, sources, goals)) carveWideHall(tiles, a, b);
}

function floorCells(tiles, room) {
  const cells = [];
  for (let y = room.y; y < room.y + room.h; y++) {
    for (let x = room.x; x < room.x + room.w; x++) {
      if (tiles[idx(x, y)] === TILE_FLOOR) cells.push({ x, y });
    }
  }
  return cells;
}

function carveKnightBridge(tiles, sources, goals) {
  const goalSet = new Set(goals.map((cell) => keyOf(cell.x, cell.y)));
  const sourceSet = new Set();
  const queue = [];
  const previous = new Map();
  for (const cell of sources) {
    const key = keyOf(cell.x, cell.y);
    if (tiles[idx(cell.x, cell.y)] !== TILE_FLOOR) continue;
    sourceSet.add(key);
    previous.set(key, null);
    queue.push(cell);
  }
  let found = null;
  for (let head = 0; head < queue.length && !found; head++) {
    const cell = queue[head];
    for (const move of KNIGHT_OFFSETS) {
      const x = cell.x + move.dx;
      const y = cell.y + move.dy;
      if (x <= 0 || y <= 0 || x >= WIDTH - 1 || y >= HEIGHT - 1) continue;
      const key = keyOf(x, y);
      if (previous.has(key)) continue;
      const tile = tiles[idx(x, y)];
      if (tile !== TILE_WALL && tile !== TILE_FLOOR) continue;
      previous.set(key, keyOf(cell.x, cell.y));
      if (goalSet.has(key)) {
        found = key;
        break;
      }
      queue.push({ x, y });
    }
  }
  if (!found) return false;
  let cursor = found;
  while (cursor && !sourceSet.has(cursor)) {
    const [x, y] = cursor.split(",").map(Number);
    if (tiles[idx(x, y)] === TILE_WALL) tiles[idx(x, y)] = TILE_FLOOR;
    cursor = previous.get(cursor);
  }
  return true;
}

function carveWideHall(tiles, a, b) {
  const x0 = Math.floor(a.x + a.w / 2);
  const y0 = Math.floor(a.y + a.h / 2);
  const x1 = Math.floor(b.x + b.w / 2);
  const y1 = Math.floor(b.y + b.h / 2);
  carveThickLine(tiles, x0, y0, x1, y0);
  carveThickLine(tiles, x1, y0, x1, y1);
}

function carveThickLine(tiles, x0, y0, x1, y1) {
  const dx = Math.sign(x1 - x0);
  const dy = Math.sign(y1 - y0);
  let x = x0;
  let y = y0;
  while (true) {
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        const tx = x + ox;
        const ty = y + oy;
        if (tx <= 0 || ty <= 0 || tx >= WIDTH - 1 || ty >= HEIGHT - 1) continue;
        if (tiles[idx(tx, ty)] === TILE_WALL) tiles[idx(tx, ty)] = TILE_FLOOR;
      }
    }
    if (x === x1 && y === y1) break;
    x += dx;
    y += dy;
  }
}

function pickSpawn(tiles, rng) {
  const candidates = [];
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (tiles[idx(x, y)] !== TILE_FLOOR) continue;
      const degree = landingCells(tiles, x, y).length;
      if (degree < 2) continue;
      candidates.push({ x, y, degree });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  let best = null;
  const sample = Math.min(candidates.length, 10);
  for (let i = 0; i < sample; i++) {
    const cell = candidates[i];
    const dist = knightDistanceMap(tiles, WIDTH, HEIGHT, cell);
    const reach = countReached(dist);
    if (reach < 18) continue;
    if (!best || reach > best.reach || (reach === best.reach && cell.degree > best.degree)) {
      best = { x: cell.x, y: cell.y, reach, degree: cell.degree };
    }
  }
  return best;
}

function pickStairs(tiles, dist, spawn, rng) {
  let bestDist = 4;
  const pool = [];
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (x === spawn.x && y === spawn.y) continue;
      if (tiles[idx(x, y)] !== TILE_FLOOR) continue;
      const value = dist[idx(x, y)];
      if (value > bestDist) {
        bestDist = value;
        pool.length = 0;
        pool.push({ x, y });
      } else if (value === bestDist) pool.push({ x, y });
    }
  }
  if (!pool.length || bestDist < 4) return null;
  return pool[Math.floor(rng() * pool.length)];
}

function sprinklePillars(tiles, rng, spawn, dist) {
  const safe = landingSet(spawn);
  safe.add(keyOf(spawn.x, spawn.y));
  const spots = shuffledFloors(tiles, dist, safe, rng);
  const amount = 2 + Math.floor(rng() * 3);
  let placed = 0;
  for (const spot of spots) {
    if (placed >= amount) break;
    tiles[idx(spot.x, spot.y)] = TILE_PILLAR;
    const next = knightDistanceMap(tiles, WIDTH, HEIGHT, spawn);
    const far = farthestDistance(next);
    if (countReached(next) < 18 || far < 4) {
      tiles[idx(spot.x, spot.y)] = TILE_FLOOR;
      continue;
    }
    placed += 1;
  }
}

function placeHazards(tiles, dist, safe, spikeCount, pitCount, rng) {
  const spots = shuffledFloors(tiles, dist, safe, rng).filter(
    (spot) => dist[idx(spot.x, spot.y)] >= 2
  );
  for (let i = 0; i < spikeCount && spots.length; i++) {
    const spot = spots.pop();
    tiles[idx(spot.x, spot.y)] = TILE_SPIKE;
  }
  for (let i = 0; i < pitCount && spots.length; i++) {
    const spot = spots.pop();
    tiles[idx(spot.x, spot.y)] = TILE_PIT;
  }
}

function enemyRoster(floorIndex) {
  if (floorIndex <= 1) return ["grunt", "grunt"];
  if (floorIndex === 2) return ["grunt", "grunt", "brute", "spitter"];
  return ["grunt", "grunt", "grunt", "brute", "brute", "spitter"];
}

function placeEnemies(tiles, dist, safe, roster, rng, stairs, spawn) {
  const blocked = new Set(safe);
  if (stairs) blocked.add(keyOf(stairs.x, stairs.y));
  const spots = shuffledFloors(tiles, dist, blocked, rng).filter((spot) => {
    const tile = tiles[idx(spot.x, spot.y)];
    const reach = dist[idx(spot.x, spot.y)];
    const chebyshev = Math.max(Math.abs(spot.x - spawn.x), Math.abs(spot.y - spawn.y));
    return tile === TILE_FLOOR && reach >= 2 && chebyshev >= 3;
  });
  const near = spots
    .filter((spot) => dist[idx(spot.x, spot.y)] <= 4)
    .sort((a, b) => dist[idx(a.x, a.y)] - dist[idx(b.x, b.y)]);
  const enemies = [];
  const used = new Set(blocked);
  const ordered = near.length ? [near[0], ...spots.filter((spot) => spot !== near[0])] : spots;
  for (const type of roster) {
    const spot = ordered.find((cell) => !used.has(keyOf(cell.x, cell.y)));
    if (!spot) break;
    used.add(keyOf(spot.x, spot.y));
    enemies.push({ type, x: spot.x, y: spot.y });
  }
  return enemies;
}

function landingSet(origin) {
  const set = new Set();
  for (const move of KNIGHT_OFFSETS) {
    const x = origin.x + move.dx;
    const y = origin.y + move.dy;
    if (inBounds(x, y)) set.add(keyOf(x, y));
  }
  return set;
}

function landingCells(tiles, x, y) {
  const cells = [];
  for (const move of KNIGHT_OFFSETS) {
    const nx = x + move.dx;
    const ny = y + move.dy;
    if (!inBounds(nx, ny)) continue;
    if (!isLandable(tiles[idx(nx, ny)])) continue;
    cells.push({ x: nx, y: ny, ...move });
  }
  return cells;
}

export function legalLandings(tiles, width, height, x, y) {
  const cells = [];
  for (const move of KNIGHT_OFFSETS) {
    const nx = x + move.dx;
    const ny = y + move.dy;
    if (!inBounds(nx, ny, width, height)) continue;
    if (!isLandable(tiles[ny * width + nx])) continue;
    cells.push({ x: nx, y: ny, ...move });
  }
  return cells;
}

function shuffledFloors(tiles, dist, blocked, rng) {
  const spots = [];
  for (let y = 1; y < HEIGHT - 1; y++) {
    for (let x = 1; x < WIDTH - 1; x++) {
      if (dist[idx(x, y)] < 0) continue;
      if (tiles[idx(x, y)] !== TILE_FLOOR) continue;
      if (blocked.has(keyOf(x, y))) continue;
      spots.push({ x, y });
    }
  }
  for (let i = spots.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [spots[i], spots[j]] = [spots[j], spots[i]];
  }
  return spots;
}

function farthestDistance(dist) {
  let best = 0;
  for (const value of dist) if (value > best) best = value;
  return best;
}

function countReached(dist) {
  let count = 0;
  for (const value of dist) if (value >= 0) count += 1;
  return count;
}

function carveRect(tiles, x, y, w, h) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx <= 0 || yy <= 0 || xx >= WIDTH - 1 || yy >= HEIGHT - 1) continue;
      tiles[idx(xx, yy)] = TILE_FLOOR;
    }
  }
}

function roomDistance(a, b) {
  const ax = a.x + a.w / 2;
  const ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2;
  const by = b.y + b.h / 2;
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

function keyOf(x, y) {
  return `${x},${y}`;
}

export function openGate(level) {
  for (const gate of level.gateTiles) {
    level.tiles[idx(gate.x, gate.y, level.width)] = TILE_FLOOR;
  }
  level.gateOpen = true;
}
