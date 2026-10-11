import { createAudio } from "./audio.js";
import {
  TILE_PIT,
  TILE_SPIKE,
  generateFloor,
  idx,
  mulberry32,
  openGate,
} from "./dungeon.js";
import {
  contactAmount,
  createDragon,
  createEnemy,
  spikePhase,
  strikeTile,
  updateDragon,
  updateEnemies,
  updateProjectiles,
} from "./entities.js";
import { createInput } from "./input.js";
import {
  BOON_IDS,
  applyBoon,
  createKnight,
  hurtKnight,
  knightVisual,
  LEAP_COST,
  canLeap,
  drainPitStamina,
  landingsFrom,
  startLeap,
  updateKnight,
} from "./knight.js";
import { render } from "./render.js";
import { freshMemory, princessGap, speak } from "./voices.js";
import { createUI } from "./ui.js";

const BEST_KEY = "knights-leap-best";
const MUSIC_KEY = "knights-leap-music";
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
];

const canvas = document.getElementById("view");
const ctx = canvas.getContext("2d");
const input = createInput(canvas);
const audio = createAudio();
const ui = createUI(document.getElementById("overlay"), document.getElementById("hud"));
const debug = new URLSearchParams(location.search).has("debug");

const game = {
  state: "title",
  seed: 1,
  rng: mulberry32(1),
  floorIndex: 1,
  level: null,
  knight: null,
  enemies: [],
  dragon: null,
  projectiles: [],
  spikes: [],
  boons: freshBoons(),
  boonChoices: [],
  kills: 0,
  floorsCleared: 0,
  camera: { x: 10.5, y: 10.5 },
  time: 0,
  clock: 0,
  shake: 0,
  hurtFlash: 0,
  particles: [],
  banner: null,
  quips: [],
  voiceAt: {},
  voiceLast: {},
  memory: freshMemory(),
  princessNext: 1.2,
  landings: [],
  tileSize: 48,
  best: readBest(),
  lastScore: 0,
  muted: false,
  music: readMusicPref(),
  showHint: false,
};

function freshBoons() {
  return { swift: 0, shock: false, plate: 0, blood: false };
}

function score() {
  const hp = game.knight ? game.knight.hp : 0;
  return game.kills * 100 + game.floorsCleared * 500 + hp * 50;
}

function readMusicPref() {
  try {
    return localStorage.getItem(MUSIC_KEY) !== "0";
  } catch {
    return true;
  }
}

function toggleMusic() {
  audio.unlock();
  if (game.music && !audio.playing) {
    audio.startMusic();
    return;
  }
  game.music = audio.toggleMusic();
}

function readBest() {
  try {
    const value = Number(localStorage.getItem(BEST_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function writeBest(value) {
  const best = Math.max(readBest(), value);
  try {
    localStorage.setItem(BEST_KEY, String(best));
  } catch {
    /* private mode */
  }
  return best;
}

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
  const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  game.tileSize = Math.max(36, Math.floor(Math.min(canvas.width, canvas.height) / 14));
}

function startRun() {
  audio.unlock();
  if (game.music) audio.startMusic();
  game.seed = (Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0;
  game.rng = mulberry32(game.seed ^ 0x51ed);
  game.floorIndex = 1;
  game.kills = 0;
  game.floorsCleared = 0;
  game.boons = freshBoons();
  game.projectiles = [];
  game.particles = [];
  game.knight = null;
  game.showHint = true;
  game.memory = freshMemory();
  game.voiceLast = {};
  game.princessNext = 1.2;
  loadFloor();
  game.state = "playing";
  input.clearQueue();
}

function loadFloor() {
  const previous = game.knight;
  game.level = generateFloor(game.floorIndex, game.seed);
  game.level.gateOpen = false;
  game.knight = createKnight(game.level.spawn);
  if (previous && previous.hp > 0) {
    game.knight.maxHp = previous.maxHp;
    game.knight.hp = Math.min(previous.hp, game.knight.maxHp);
  }
  game.enemies = game.level.enemies.map(createEnemy);
  game.dragon = game.level.dragon ? createDragon(game.level.dragon) : null;
  game.projectiles = [];
  game.time = 0;
  game.spikes = [];
  for (let y = 0; y < game.level.height; y++) {
    for (let x = 0; x < game.level.width; x++) {
      if (game.level.tiles[idx(x, y, game.level.width)] === TILE_SPIKE) {
        game.spikes.push({ x, y, last: "idle" });
      }
    }
  }
  const visual = knightVisual(game.knight);
  game.camera.x = visual.x + 0.5;
  game.camera.y = visual.y + 0.5;
  game.quips = [];
  game.voiceAt = {};
  game.banner = {
    text: game.level.boss ? "Maeve is sealed behind Cinder" : `Floor ${game.floorIndex}`,
    life: 2.3,
  };
  audio.cue(game.level.boss ? "prison" : "field");
  refreshLandings();
}

function refreshLandings() {
  if (!game.knight || !game.level || game.knight.leaping) {
    game.landings = [];
    return;
  }
  game.landings = landingsFrom(game.level, game.knight.x, game.knight.y);
}

function rollBoons() {
  const pool = BOON_IDS.filter((id) => {
    if (id === "shock" && game.boons.shock) return false;
    if (id === "blood" && game.boons.blood) return false;
    return true;
  });
  const first = Math.floor(game.rng() * pool.length);
  let second = Math.floor(game.rng() * (pool.length - 1));
  if (second >= first) second += 1;
  return [pool[first], pool[second]];
}

function pickBoon(id) {
  if (game.state !== "boon") return;
  applyBoon(game.knight, game.boons, id);
  audio.boon();
  loadFloor();
  game.state = "playing";
  input.release();
}

function takeStairs() {
  if (game.state !== "playing" || !game.level?.stairs) return;
  audio.stairs();
  game.floorsCleared += 1;
  game.floorIndex += 1;
  game.boonChoices = rollBoons();
  game.state = "boon";
  input.release();
}

function win() {
  if (game.state !== "playing") return;
  game.floorsCleared += 1;
  game.lastScore = score();
  game.best = writeBest(game.lastScore);
  game.state = "victory";
  audio.victory();
  input.release();
}

function die() {
  if (game.state !== "playing") return;
  if (game.knight) game.knight.hp = 0;
  game.lastScore = score();
  game.best = writeBest(game.lastScore);
  game.state = "dead";
  audio.death();
  input.release();
}

function beginLeap(landing) {
  startLeap(game.knight, landing);
  game.showHint = false;
  audio.leap();
  const mood = game.knight.stamina < LEAP_COST ? "tired" : "leap";
  game.memory.leaps += 1;
  if (mood === "tired") game.memory.tired += 1;
  speak(game, "knight", game.knight.fromX, game.knight.fromY, mood, game.knight);
  refreshLandings();
}

function pointerTile(pointer) {
  const px = pointer.x * canvas.width;
  const py = pointer.y * canvas.height;
  const tx = (px - canvas.width / 2) / game.tileSize + game.camera.x;
  const ty = (py - canvas.height / 2) / game.tileSize + game.camera.y;
  return { x: Math.floor(tx), y: Math.floor(ty) };
}

function tryLeapFromInput() {
  const knight = game.knight;
  if (!canLeap(knight)) return;
  const pointer = input.consumePointer();
  if (pointer) {
    const tile = pointerTile(pointer);
    const landing = game.landings.find((cell) => cell.x === tile.x && cell.y === tile.y);
    if (debug) game.lastInput = { type: "pointer", tile, matched: Boolean(landing) };
    if (landing) {
      beginLeap(landing);
      return;
    }
  }
  const move = input.consumeLeap() || input.heldLeap();
  if (!move) return;
  const landing = game.landings.find((cell) => cell.dx === move.dx && cell.dy === move.dy);
  if (debug) game.lastInput = { type: "key", key: move.key, matched: Boolean(landing) };
  if (landing) beginLeap(landing);
}

function field() {
  return {
    dt: game.frameDt,
    level: game.level,
    knight: game.knight,
    enemies: game.enemies,
    dragon: game.dragon,
    onBreath() {
      applyHurt(1, "breath");
    },
    onShot() {
      applyHurt(1, "shot");
    },
    speak(id, x, y, mood, entity) {
      speak(game, id, x, y, mood, entity);
    },
  };
}

function resolveLanding() {
  const knight = game.knight;
  const tile = game.level.tiles[idx(knight.x, knight.y, game.level.width)];
  audio.land();
  burst(knight.x + 0.5, knight.y + 0.5, "#d7dee6", 8);
  strike(knight.x, knight.y);
  if (game.boons.shock) {
    for (const [ox, oy] of NEIGHBORS) strike(knight.x + ox, knight.y + oy);
  }
  tallyKills();
  if (game.dragon && game.dragon.hp > 0 && game.dragon.flash > 0 && knight.x === game.dragon.x && knight.y === game.dragon.y) {
    game.memory.dragonHits += 1;
    speak(game, "dragon", game.dragon.x, game.dragon.y, "hurt", game.dragon);
  }
  if (tile === TILE_PIT) {
    game.memory.pits += 1;
    drainPitStamina(knight);
    applyHurt(1, "pit");
  }
  if (tile === TILE_SPIKE && spikePhase(knight.x, knight.y, game.time) === "up") {
    game.memory.spikes += 1;
    applyHurt(1, "spike");
    const spike = game.spikes.find((cell) => cell.x === knight.x && cell.y === knight.y);
    if (spike) spike.last = "up";
  }
}

function strike(x, y) {
  strikeTile(game.enemies, game.dragon, x, y, 1);
}

function tallyKills() {
  const slain = [];
  for (const enemy of game.enemies) {
    if (enemy.hp <= 0 && !enemy.counted) {
      enemy.counted = true;
      slain.push(enemy);
    }
  }
  if (game.dragon && game.dragon.hp <= 0 && !game.dragon.counted) {
    game.dragon.counted = true;
    slain.push(game.dragon);
  }
  if (!slain.length) return;
  game.kills += slain.length;
  for (const enemy of slain) {
    const kind = enemy.type || "dragon";
    if (game.memory.kills[kind] != null) game.memory.kills[kind] += 1;
  }
  audio.kill();
  for (const enemy of slain) burst(enemy.x + 0.5, enemy.y + 0.5, "#e2b657", 12);
  if (game.boons.blood && game.knight.hp > 0) {
    game.knight.hp = Math.min(game.knight.maxHp, game.knight.hp + slain.length);
  }
}

function applyHurt(amount, source) {
  const from = source || touchSource();
  const result = hurtKnight(game.knight, amount, game.boons);
  if (result === "hurt") {
    game.memory.hurts += 1;
    game.memory.lastHit = from;
    audio.hurt();
    game.shake = 0.24;
    game.hurtFlash = 0.45;
    speak(game, "knight", game.knight.x, game.knight.y, "hurt", game.knight);
  } else if (result === "block") {
    game.memory.blocks += 1;
    game.memory.lastHit = from;
    audio.block();
  }
}

function touchSource() {
  const knight = game.knight;
  if (
    game.dragon &&
    game.dragon.hp > 0 &&
    game.dragon.stagger <= 0 &&
    game.dragon.x === knight.x &&
    game.dragon.y === knight.y
  ) {
    return "dragon";
  }
  for (const enemy of game.enemies) {
    if (enemy.hp > 0 && enemy.stagger <= 0 && enemy.x === knight.x && enemy.y === knight.y) return enemy.type;
  }
  return "hit";
}

function updateSpikes() {
  const knight = game.knight;
  for (const spike of game.spikes) {
    const phase = spikePhase(spike.x, spike.y, game.time);
    const popped = phase === "up" && spike.last !== "up";
    spike.last = phase;
    if (!popped || knight.leaping) continue;
    if (knight.x === spike.x && knight.y === spike.y) {
      game.memory.spikes += 1;
      applyHurt(1, "spike");
    }
  }
}

function burst(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 0.4 + Math.random() * 1.6;
    game.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0.35 + Math.random() * 0.25,
      max: 0.6,
      color,
      size: 2 + Math.random() * 3,
    });
  }
}

function updateParticles(dt) {
  for (const particle of game.particles) {
    particle.life -= dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);
}

function updateCamera(dt) {
  const visual = knightVisual(game.knight);
  const blend = 1 - Math.exp(-dt * 8);
  game.camera.x += (visual.x + 0.5 - game.camera.x) * blend;
  game.camera.y += (visual.y + 0.5 - game.camera.y) * blend;
}

function openTheGate() {
  if (!game.dragon || game.dragon.hp > 0 || game.level.gateOpen) return;
  openGate(game.level);
  audio.gate();
  const princess = game.level.princess;
  const line = princess ? speak(game, "princess", princess.x, princess.y, "open", null, true) : "Leap to me.";
  game.banner = { text: `Maeve: ${line}`, life: 2.6 };
  game.princessNext = game.memory.runTime + princessGap(game.memory);
  if (princess) burst(princess.x + 0.5, princess.y + 0.5, "#e2b657", 16);
}

function simulate(dt) {
  game.frameDt = dt;
  game.time += dt;
  game.memory.runTime += dt;
  if (game.banner) {
    game.banner.life -= dt;
    if (game.banner.life <= 0) game.banner = null;
  }
  if (game.hurtFlash > 0) game.hurtFlash = Math.max(0, game.hurtFlash - dt);
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt);
  for (const quip of game.quips) quip.life -= dt;
  game.quips = game.quips.filter((quip) => quip.life > 0);
  if (game.memory.runTime >= game.princessNext) {
    const princess = game.level.princess || { x: -12, y: -12 };
    const mood = game.level.gateOpen ? "open" : "sealed";
    speak(game, "princess", princess.x, princess.y, mood, null, true);
    game.princessNext = game.memory.runTime + princessGap(game.memory);
  }

  refreshLandings();
  tryLeapFromInput();
  const landed = updateKnight(game.knight, dt, game.boons) === "landed";
  if (landed) resolveLanding();

  const world = field();
  game.projectiles.push(...updateEnemies(game.enemies, world));
  updateDragon(game.dragon, world);
  game.projectiles = updateProjectiles(game.projectiles, world);
  openTheGate();

  const bump = contactAmount(game.enemies, game.dragon, game.knight);
  if (bump) applyHurt(bump);
  updateSpikes();
  tallyKills();
  game.enemies = game.enemies.filter((enemy) => enemy.hp > 0);

  updateParticles(dt);
  updateCamera(dt);
  refreshLandings();
  updateCursor();

  if (game.knight.hp <= 0) {
    die();
    return;
  }
  const knight = game.knight;
  if (!knight.leaping && game.level.stairs && knight.x === game.level.stairs.x && knight.y === game.level.stairs.y) {
    takeStairs();
    return;
  }
  if (
    !knight.leaping &&
    game.level.boss &&
    game.level.gateOpen &&
    knight.x === game.level.princess.x &&
    knight.y === game.level.princess.y
  ) {
    win();
  }
}

function updateCursor() {
  const hover = input.hover();
  if (!hover || !canLeap(game.knight)) {
    canvas.style.cursor = "default";
    return;
  }
  const tile = pointerTile(hover);
  const match = game.landings.some((cell) => cell.x === tile.x && cell.y === tile.y);
  canvas.style.cursor = match ? "pointer" : "default";
}

function handleMeta(dt) {
  if (input.consumeMute()) {
    audio.unlock();
    game.muted = audio.toggle();
  }
  if (input.consumeMusic()) toggleMusic();
  if (input.consumePause()) {
    if (game.state === "playing") {
      game.state = "paused";
      input.release();
    } else if (game.state === "paused") game.state = "playing";
  }
  if (input.consumeStart()) {
    audio.unlock();
    if (game.state === "title" || game.state === "dead" || game.state === "victory") startRun();
  }
  const choice = input.consumeBoon();
  if (choice && game.state === "boon") {
    const id = game.boonChoices[choice - 1];
    if (id) pickBoon(id);
  }
  if (game.state !== "playing") {
    input.consumePointer();
    input.consumeLeap();
    if (game.banner) game.banner.life -= dt;
  }
}

function loop(now) {
  if (!loop.last) loop.last = now;
  const dt = Math.min(0.034, (now - loop.last) / 1000);
  loop.last = now;
  game.clock += dt;
  resize();
  handleMeta(dt);
  if (game.state === "playing") simulate(dt);
  else if (game.state === "title") updateCursor();
  render(ctx, game);
  ui.sync(game, game.state === "dead" || game.state === "victory" ? game.lastScore : score(), {
    onStart: startRun,
    onRetry: startRun,
    onResume() {
      game.state = "playing";
    },
    onPick: pickBoon,
    onMute() {
      audio.unlock();
      game.muted = audio.toggle();
    },
    onMusic: toggleMusic,
  });
  requestAnimationFrame(loop);
}

if (debug) {
  window.__game = {
    damage(amount = 1) {
      if (!game.knight || game.state !== "playing") return;
      game.knight.hp = Math.max(0, game.knight.hp - amount);
      if (game.knight.hp <= 0) die();
    },
    skipFloor() {
      takeStairs();
    },
    jumpToBoss() {
      game.floorIndex = 4;
      game.floorsCleared = 3;
      loadFloor();
      game.state = "playing";
    },
    slayDragon() {
      if (!game.dragon) return;
      game.dragon.hp = 0;
      openTheGate();
    },
    age(seconds = 20) {
      game.memory.runTime += seconds;
      game.princessNext = game.memory.runTime;
    },
    memory() {
      return game.memory;
    },
    rescue() {
      if (!game.level?.boss || game.state !== "playing") return;
      if (game.dragon) game.dragon.hp = 0;
      if (!game.level.gateOpen) openGate(game.level);
      game.level.gateOpen = true;
      game.knight.leaping = false;
      game.knight.x = game.level.princess.x;
      game.knight.y = game.level.princess.y;
      game.knight.fromX = game.knight.x;
      game.knight.fromY = game.knight.y;
      win();
    },
    snapshot() {
      return {
        state: game.state,
        floor: game.floorIndex,
        hp: game.knight?.hp ?? 0,
        stamina: game.knight?.stamina ?? 0,
        maxHp: game.knight?.maxHp ?? 0,
        x: game.knight?.x,
        y: game.knight?.y,
        seed: game.seed,
        gateOpen: Boolean(game.level?.gateOpen),
        dragonHp: game.dragon?.hp ?? null,
        enemies: game.enemies.map((enemy) => ({ type: enemy.type, x: enemy.x, y: enemy.y, hp: enemy.hp })),
        landings: game.landings.map((cell) => ({ x: cell.x, y: cell.y, key: cell.key })),
        score: score(),
        best: game.best,
        boons: { ...game.boons },
        camera: { x: game.camera.x, y: game.camera.y },
        tileSize: game.tileSize,
        view: { w: canvas.width, h: canvas.height },
        lastInput: game.lastInput || null,
        quips: game.quips.map((quip) => ({ name: quip.name, text: quip.text, id: quip.id })),
        runTime: game.memory.runTime,
        calls: game.memory.calls,
        memory: {
          leaps: game.memory.leaps,
          hurts: game.memory.hurts,
          pits: game.memory.pits,
          spikes: game.memory.spikes,
          kills: { ...game.memory.kills },
          lastHit: game.memory.lastHit,
        },
      };
    },
  };
}

requestAnimationFrame(loop);
