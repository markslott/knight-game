import {
  TILE_FLOOR,
  TILE_GATE,
  TILE_PILLAR,
  TILE_PIT,
  TILE_SPIKE,
  TILE_STAIRS,
  TILE_WALL,
} from "./dungeon.js";
import { spikePhase } from "./entities.js";
import { LEAP_COST, STAMINA_MAX, canLeap, knightVisual } from "./knight.js";

export function render(ctx, game) {
  const { canvas } = ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#100e0c";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (!game.level) {
    drawMenuBackdrop(ctx, game);
    return;
  }

  ctx.save();
  if (game.shake > 0) {
    const mag = game.shake * game.tileSize * 0.45;
    ctx.translate((Math.random() - 0.5) * mag * 2, (Math.random() - 0.5) * mag * 2);
  }

  const size = game.tileSize;
  const bounds = visibleBounds(game, canvas, size);
  for (let y = bounds.top; y <= bounds.bottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      drawTile(ctx, game, x, y, size);
    }
  }

  drawHazards(ctx, game, size);
  drawLandings(ctx, game, size);
  drawTelegraphs(ctx, game, size);
  drawActors(ctx, game, size);
  drawProjectiles(ctx, game, size);
  drawParticles(ctx, game, size);
  drawQuips(ctx, game, size);
  drawBanner(ctx, game);
  if (game.hurtFlash > 0) {
    ctx.fillStyle = `rgba(180, 24, 32, ${game.hurtFlash * 0.35})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.restore();
}

function drawMenuBackdrop(ctx, game) {
  const { canvas } = ctx;
  const size = Math.max(42, Math.floor(Math.min(canvas.width, canvas.height) / 16));
  const cols = Math.ceil(canvas.width / size) + 1;
  const rows = Math.ceil(canvas.height / size) + 1;
  const drift = (game.clock * 12) % size;
  for (let y = -1; y < rows; y++) {
    for (let x = -1; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? "#2a3326" : "#222a1f";
      ctx.fillRect(x * size - drift, y * size + drift * 0.3, size - 1, size - 1);
    }
  }
}

function visibleBounds(game, canvas, size) {
  const halfW = canvas.width / 2 / size + 1;
  const halfH = canvas.height / 2 / size + 1;
  return {
    left: Math.floor(game.camera.x - halfW),
    right: Math.ceil(game.camera.x + halfW),
    top: Math.floor(game.camera.y - halfH),
    bottom: Math.ceil(game.camera.y + halfH),
  };
}

function tilePos(game, x, y, size, canvas) {
  return {
    sx: canvas.width / 2 + (x - game.camera.x) * size,
    sy: canvas.height / 2 + (y - game.camera.y) * size,
  };
}

function drawTile(ctx, game, x, y, size) {
  const { sx, sy } = tilePos(game, x, y, size, ctx.canvas);
  if (x < 0 || y < 0 || x >= game.level.width || y >= game.level.height) {
    drawWall(ctx, sx, sy, size, TILE_WALL);
    return;
  }
  const tile = game.level.tiles[y * game.level.width + x];
  if (tile === TILE_WALL || tile === TILE_PILLAR || tile === TILE_GATE) {
    drawWall(ctx, sx, sy, size, tile);
    return;
  }
  const light = (x + y) % 2 === 0;
  ctx.fillStyle = light ? "#3d4a3a" : "#313c2e";
  ctx.fillRect(sx, sy, size, size);
  ctx.fillStyle = light ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)";
  const speck = hash(x, y);
  ctx.fillRect(sx + speck * (size - 6), sy + hash(y, x) * (size - 6), 3, 3);

  if (tile === TILE_PIT) drawPit(ctx, sx, sy, size);
  if (tile === TILE_STAIRS) drawStairs(ctx, sx, sy, size, game.clock);
  if (tile === TILE_SPIKE) drawSpike(ctx, sx, sy, size, spikePhase(x, y, game.time));
}

function drawWall(ctx, sx, sy, size, tile) {
  const lip = Math.max(5, size * 0.2);
  ctx.fillStyle = "#1a1612";
  ctx.fillRect(sx, sy, size, size);
  if (tile === TILE_PILLAR) {
    ctx.fillStyle = "#3f342b";
    ctx.beginPath();
    ctx.ellipse(sx + size / 2, sy + size * 0.58, size * 0.28, size * 0.16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6d5b4a";
    ctx.fillRect(sx + size * 0.32, sy + size * 0.16, size * 0.36, size * 0.5);
    ctx.fillStyle = "#8a7360";
    ctx.beginPath();
    ctx.ellipse(sx + size / 2, sy + size * 0.18, size * 0.28, size * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.fillStyle = tile === TILE_GATE ? "#2a2118" : "#3a2f26";
  ctx.fillRect(sx, sy, size, size - lip);
  ctx.fillStyle = tile === TILE_GATE ? "#4a3c28" : "#4d3f33";
  ctx.fillRect(sx + 2, sy + 2, size - 4, 4);
  if (tile === TILE_GATE) {
    ctx.strokeStyle = "#e2b657";
    ctx.lineWidth = Math.max(2, size * 0.06);
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
      const x = sx + (size * i) / 4;
      ctx.moveTo(x, sy + 6);
      ctx.lineTo(x, sy + size - lip);
    }
    ctx.moveTo(sx + 4, sy + size * 0.35);
    ctx.lineTo(sx + size - 4, sy + size * 0.35);
    ctx.stroke();
  }
}

function drawPit(ctx, sx, sy, size) {
  ctx.fillStyle = "#070b10";
  ctx.beginPath();
  ctx.ellipse(sx + size / 2, sy + size / 2, size * 0.32, size * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#1d3344";
  ctx.lineWidth = 3;
  ctx.stroke();
}

function drawStairs(ctx, sx, sy, size, time) {
  ctx.save();
  ctx.translate(sx + size / 2, sy + size / 2);
  ctx.strokeStyle = "#e2b657";
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.globalAlpha = 0.75 + Math.sin(time * 4) * 0.25;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.28, Math.PI * 0.2, Math.PI * 1.7);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.08, -size * 0.26);
  ctx.lineTo(size * 0.22, -size * 0.12);
  ctx.lineTo(size * 0.02, -size * 0.08);
  ctx.fillStyle = "#e2b657";
  ctx.fill();
  ctx.restore();
}

function drawSpike(ctx, sx, sy, size, phase) {
  const hot = phase === "up" ? "#ff5a36" : phase === "telegraph" ? "#ffb199" : "#8d939c";
  ctx.fillStyle = hot;
  const rise = phase === "up" ? 0.42 : phase === "telegraph" ? 0.24 : 0.16;
  for (let i = 0; i < 3; i++) {
    const x = sx + size * (0.22 + i * 0.22);
    ctx.beginPath();
    ctx.moveTo(x, sy + size * 0.72);
    ctx.lineTo(x + size * 0.08, sy + size * 0.72);
    ctx.lineTo(x + size * 0.04, sy + size * (0.72 - rise));
    ctx.fill();
  }
  if (phase === "telegraph") {
    ctx.fillStyle = "rgba(255, 90, 54, 0.28)";
    ctx.fillRect(sx + 2, sy + 2, size - 4, size - 4);
  }
}

function drawHazards(ctx, game, size) {
  const pulse = 0.35 + Math.sin(game.time * 10) * 0.15;
  for (const enemy of game.enemies) {
    if (enemy.action?.tiles) {
      for (const tile of enemy.action.tiles) {
        paintMark(ctx, game, tile.x, tile.y, size, `rgba(146, 112, 196, ${pulse})`);
      }
    }
  }
}

function drawLandings(ctx, game, size) {
  if (!game.knight || game.knight.leaping || game.state !== "playing") return;
  const ready = canLeap(game.knight);
  for (const landing of game.landings) {
    const { sx, sy } = tilePos(game, landing.x, landing.y, size, ctx.canvas);
    ctx.fillStyle = ready ? "rgba(226, 182, 87, 0.28)" : "rgba(226, 182, 87, 0.1)";
    ctx.strokeStyle = ready ? "rgba(226, 182, 87, 0.95)" : "rgba(226, 182, 87, 0.35)";
    ctx.lineWidth = Math.max(2, size * 0.06);
    roundRect(ctx, sx + 4, sy + 4, size - 8, size - 8, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = ready ? "#f3e2b0" : "rgba(243, 226, 176, 0.45)";
    ctx.font = `700 ${Math.max(12, Math.floor(size * 0.34))}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(landing.key, sx + size / 2, sy + size / 2);
  }
}

function drawTelegraphs(ctx, game, size) {
  const pulse = 0.28 + Math.sin(game.time * 12) * 0.12;
  for (const enemy of game.enemies) {
    if (!enemy.telegraph) continue;
    paintMark(ctx, game, enemy.telegraph.x, enemy.telegraph.y, size, `rgba(255, 90, 54, ${pulse + 0.2})`);
  }
  const dragon = game.dragon;
  if (dragon && dragon.hp > 0 && dragon.telegraph?.type === "line") {
    for (const tile of dragon.telegraph.tiles) {
      paintMark(ctx, game, tile.x, tile.y, size, `rgba(255, 70, 30, ${pulse + 0.25})`);
    }
  } else if (dragon && dragon.hp > 0 && dragon.telegraph?.tile) {
    paintMark(ctx, game, dragon.telegraph.tile.x, dragon.telegraph.tile.y, size, `rgba(255, 40, 24, ${pulse + 0.35})`);
  }
  if (dragon?.scorchLife > 0 && dragon.scorch) {
    for (const tile of dragon.scorch) {
      paintMark(ctx, game, tile.x, tile.y, size, `rgba(255, 150, 40, ${dragon.scorchLife})`);
    }
  }
}

function paintMark(ctx, game, x, y, size, color) {
  const { sx, sy } = tilePos(game, x, y, size, ctx.canvas);
  ctx.fillStyle = color;
  ctx.fillRect(sx + 3, sy + 3, size - 6, size - 6);
}

function drawActors(ctx, game, size) {
  const visual = knightVisual(game.knight);
  const actors = [];
  if (game.level.princess) actors.push({ kind: "princess", x: game.level.princess.x, y: game.level.princess.y, sort: game.level.princess.y });
  for (const enemy of game.enemies) {
    if (enemy.hp > 0) actors.push({ kind: enemy.type, enemy, x: enemy.x, y: enemy.y, sort: enemy.y });
  }
  if (game.dragon) actors.push({ kind: "dragon", dragon: game.dragon, x: game.dragon.x, y: game.dragon.y, sort: game.dragon.y + 0.1 });
  actors.push({ kind: "knight", x: visual.x, y: visual.y, sort: visual.y + 0.2, visual });
  actors.sort((a, b) => a.sort - b.sort);

  for (const actor of actors) {
    const px = ctx.canvas.width / 2 + (actor.x + 0.5 - game.camera.x) * size;
    const py = ctx.canvas.height / 2 + (actor.y + 0.5 - game.camera.y) * size;
    const scale = size / 48;
    if (actor.kind === "knight") drawKnightActor(ctx, game, px, py, scale, actor.visual);
    else if (actor.kind === "princess") drawPrincess(ctx, px, py, scale, game.clock);
    else if (actor.kind === "dragon") drawDragon(ctx, px, py, scale, actor.dragon);
    else drawMonster(ctx, px, py, scale, actor.enemy);
  }
}

function drawKnightActor(ctx, game, px, py, scale, visual) {
  const knight = game.knight;
  const air = visual.air * 26 * scale;
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 10 * scale, (12 - visual.air * 4) * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  if (knight.stamina < STAMINA_MAX && !knight.leaping) {
    const ratio = knight.stamina / STAMINA_MAX;
    ctx.strokeStyle = knight.stamina >= LEAP_COST ? "#e2b657" : "#8d5a28";
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(0, 0, 20 * scale, -Math.PI / 2, -Math.PI / 2 + Math.max(0.05, ratio) * Math.PI * 2);
    ctx.stroke();
  }
  const flicker = knight.iframes > 0 && Math.floor(game.time * 18) % 2 === 0;
  ctx.globalAlpha = flicker ? 0.45 : 1;
  ctx.translate(0, -air);
  ctx.scale(knight.facing, 1);
  if (knight.leaping) ctx.rotate(-0.25 + knight.leapT * 0.5);
  drawKnightSprite(ctx, scale, air, knight.flash > 0, game.clock);
  ctx.restore();
}

function drawKnightSprite(ctx, scale, air, flash, time) {
  const s = scale;
  ctx.fillStyle = "#7a1f2b";
  ctx.beginPath();
  ctx.moveTo(-2 * s, -6 * s);
  ctx.quadraticCurveTo(-16 * s, 2 * s + Math.sin(time * 6) * 2 * s, -7 * s, 14 * s);
  ctx.lineTo(2 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = flash ? "#fff" : "#8d6b45";
  ctx.fillRect(-6 * s, 4 * s, 4 * s, 9 * s);
  ctx.fillRect(1 * s, 4 * s, 4 * s, 9 * s);
  ctx.fillStyle = flash ? "#fff" : "#d7dee6";
  roundRect(ctx, -8 * s, -10 * s, 16 * s, 16 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = "#e2b657";
  ctx.fillRect(-8 * s, 1 * s, 16 * s, 2.4 * s);
  ctx.fillStyle = flash ? "#fff" : "#c5ced6";
  ctx.beginPath();
  ctx.arc(0, -14 * s, 7.5 * s, Math.PI, 0);
  ctx.lineTo(7 * s, -8 * s);
  ctx.lineTo(-7 * s, -8 * s);
  ctx.fill();
  ctx.fillStyle = "#171411";
  ctx.fillRect(-5 * s, -13 * s, 10 * s, 3 * s);
  ctx.fillStyle = "#9aa3ad";
  ctx.fillRect(-6 * s, -8 * s, 12 * s, 2 * s);
  ctx.fillStyle = "#7a1f2b";
  ctx.beginPath();
  ctx.moveTo(-1 * s, -20 * s);
  ctx.quadraticCurveTo(10 * s, -18 * s, 3 * s, -8 * s);
  ctx.quadraticCurveTo(0, -16 * s, -3 * s, -18 * s);
  ctx.fill();
  ctx.save();
  ctx.translate(9 * s, -2 * s);
  ctx.rotate(air > 0 ? -0.8 : -0.35);
  ctx.fillStyle = "#e2b657";
  ctx.fillRect(-1.5 * s, -1 * s, 3 * s, 5 * s);
  ctx.fillStyle = flash ? "#fff" : "#f4f7fb";
  ctx.fillRect(-1.1 * s, -16 * s, 2.2 * s, 15 * s);
  ctx.restore();
}

function drawMonster(ctx, px, py, scale, enemy) {
  ctx.save();
  ctx.translate(px, py);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 8 * scale, 10 * scale, 4 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  if (enemy.flash > 0) ctx.globalAlpha = 0.7;
  if (enemy.type === "grunt") drawGrunt(ctx, scale);
  else if (enemy.type === "brute") drawBrute(ctx, scale, enemy);
  else drawSpitter(ctx, scale);
  ctx.restore();
}

function drawGrunt(ctx, s) {
  ctx.fillStyle = "#6b8f71";
  ctx.beginPath();
  ctx.ellipse(0, 0, 9 * s, 11 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#243028";
  ctx.beginPath();
  ctx.arc(-3 * s, -2 * s, 1.4 * s, 0, Math.PI * 2);
  ctx.arc(3.4 * s, -1.2 * s, 1.6 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#243028";
  ctx.lineWidth = Math.max(1, 1.3 * s);
  ctx.beginPath();
  ctx.moveTo(-5.4 * s, -5.4 * s);
  ctx.lineTo(-1 * s, -4.2 * s);
  ctx.moveTo(1.4 * s, -4.4 * s);
  ctx.lineTo(5.6 * s, -6.2 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.4 * s, 3 * s, 2.3 * s, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#3e5a44";
  ctx.fillRect(-7 * s, 6 * s, 5 * s, 4 * s);
  ctx.fillRect(2 * s, 6 * s, 5 * s, 4 * s);
}

function drawBrute(ctx, s, enemy) {
  ctx.fillStyle = "#8c4a3a";
  roundRect(ctx, -11 * s, -12 * s, 22 * s, 20 * s, 4 * s);
  ctx.fill();
  ctx.fillStyle = "#e7d2b0";
  ctx.beginPath();
  ctx.moveTo(-8 * s, -12 * s);
  ctx.lineTo(-12 * s, -20 * s);
  ctx.lineTo(-4 * s, -12 * s);
  ctx.moveTo(8 * s, -12 * s);
  ctx.lineTo(12 * s, -20 * s);
  ctx.lineTo(4 * s, -12 * s);
  ctx.fill();
  ctx.fillStyle = "#1b1210";
  ctx.fillRect(-6 * s, -4 * s, 4 * s, 2 * s);
  ctx.fillRect(2 * s, -4 * s, 4 * s, 2 * s);
  ctx.strokeStyle = "#1b1210";
  ctx.lineWidth = Math.max(1.4, 2 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8 * s, -8 * s);
  ctx.lineTo(-2 * s, -6 * s);
  ctx.moveTo(8 * s, -8 * s);
  ctx.lineTo(2 * s, -6 * s);
  ctx.moveTo(-3 * s, 2.5 * s);
  ctx.quadraticCurveTo(0, 5.5 * s, 3 * s, 2.5 * s);
  ctx.stroke();
  drawPips(ctx, s, enemy.hp, enemy.maxHp, -16);
}

function drawSpitter(ctx, s) {
  ctx.fillStyle = "#6a5a8c";
  ctx.beginPath();
  ctx.moveTo(0, -14 * s);
  ctx.lineTo(10 * s, 10 * s);
  ctx.lineTo(-10 * s, 10 * s);
  ctx.fill();
  ctx.fillStyle = "#d7cdea";
  ctx.beginPath();
  ctx.arc(0, -6 * s, 4 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2a2140";
  ctx.beginPath();
  ctx.ellipse(-1.2 * s, -6.5 * s, 1.15 * s, 0.45 * s, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#5a4a78";
  ctx.lineWidth = Math.max(1, s);
  ctx.beginPath();
  ctx.arc(1.2 * s, -4.8 * s, 1.7 * s, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = "#8fd0ff";
  ctx.beginPath();
  ctx.arc(7 * s, 2 * s, 3 * s, 0, Math.PI * 2);
  ctx.fill();
}

function drawDragon(ctx, px, py, scale, dragon) {
  const s = scale * 1.35;
  ctx.save();
  ctx.translate(px, py);
  ctx.globalAlpha = dragon.hp <= 0 ? 0.35 : dragon.flash > 0 ? 0.75 : 1;
  ctx.fillStyle = "rgba(0,0,0,0.35)";
  ctx.beginPath();
  ctx.ellipse(0, 12 * scale, 18 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b33a2b";
  ctx.beginPath();
  ctx.ellipse(-10 * s, -4 * s, 10 * s, 6 * s, -0.4, 0, Math.PI * 2);
  ctx.ellipse(10 * s, -4 * s, 10 * s, 6 * s, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8e2a22";
  roundRect(ctx, -14 * s, -8 * s, 28 * s, 16 * s, 6 * s);
  ctx.fill();
  ctx.fillStyle = "#e2b657";
  ctx.beginPath();
  ctx.ellipse(0, 0, 6 * s, 4 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2d36b";
  ctx.beginPath();
  ctx.arc(8 * s, -10 * s, 2 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a120e";
  ctx.fillRect(7.4 * s, -12 * s, 1.2 * s, 4 * s);
  ctx.strokeStyle = "#5c120e";
  ctx.lineWidth = Math.max(1, 1.4 * s);
  ctx.beginPath();
  ctx.moveTo(5 * s, -13.2 * s);
  ctx.quadraticCurveTo(8 * s, -15.2 * s, 11.5 * s, -12.6 * s);
  ctx.stroke();
  ctx.fillStyle = "#5c120e";
  ctx.beginPath();
  ctx.moveTo(12 * s, -2 * s);
  ctx.lineTo(24 * s, 2 * s);
  ctx.lineTo(12 * s, 6 * s);
  ctx.fill();
  if (dragon.hp > 0) drawPips(ctx, scale, dragon.hp, dragon.maxHp, -28);
  ctx.restore();
}

function drawPrincess(ctx, px, py, scale, time) {
  const s = scale;
  ctx.save();
  ctx.translate(px, py + Math.sin(time * 2) * s);
  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(0, 12 * s, 8 * s, 3 * s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f2d2e0";
  ctx.beginPath();
  ctx.moveTo(-8 * s, 10 * s);
  ctx.lineTo(0, -2 * s);
  ctx.lineTo(8 * s, 10 * s);
  ctx.fill();
  ctx.fillStyle = "#f6e2b8";
  ctx.beginPath();
  ctx.arc(0, -6 * s, 4.5 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2a22";
  ctx.beginPath();
  ctx.arc(-1.5 * s, -6.1 * s, 0.7 * s, 0, Math.PI * 2);
  ctx.arc(1.6 * s, -6.1 * s, 0.7 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#f6e2b8";
  ctx.lineWidth = Math.max(1.4, 1.8 * s);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(5 * s, 2 * s);
  ctx.lineTo(11 * s, -7 * s);
  ctx.stroke();
  ctx.fillStyle = "#e2b657";
  ctx.beginPath();
  ctx.moveTo(-5 * s, -10 * s);
  ctx.lineTo(-2 * s, -16 * s);
  ctx.lineTo(0, -10 * s);
  ctx.lineTo(2 * s, -16 * s);
  ctx.lineTo(5 * s, -10 * s);
  ctx.fill();
  ctx.restore();
}

function drawPips(ctx, s, hp, max, y) {
  const gap = 5 * s;
  const start = -((max - 1) * gap) / 2;
  for (let i = 0; i < max; i++) {
    ctx.fillStyle = i < hp ? "#e2b657" : "rgba(0,0,0,0.35)";
    ctx.beginPath();
    ctx.arc(start + i * gap, y * s, 1.7 * s, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawProjectiles(ctx, game, size) {
  for (const shot of game.projectiles) {
    const px = ctx.canvas.width / 2 + (shot.x + 0.5 - game.camera.x) * size;
    const py = ctx.canvas.height / 2 + (shot.y + 0.5 - game.camera.y) * size;
    ctx.fillStyle = "#d7c4ff";
    ctx.beginPath();
    ctx.arc(px, py, Math.max(4, size * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#f4f0ff";
    ctx.stroke();
  }
}

function drawParticles(ctx, game, size) {
  for (const particle of game.particles) {
    const px = ctx.canvas.width / 2 + (particle.x - game.camera.x) * size;
    const py = ctx.canvas.height / 2 + (particle.y - game.camera.y) * size;
    ctx.globalAlpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.fillRect(px, py, particle.size, particle.size);
    ctx.globalAlpha = 1;
  }
}

function drawQuips(ctx, game, size) {
  if (!game.quips?.length) return;
  const fontSize = Math.max(13, Math.floor(size * 0.3));
  const nameSize = Math.max(10, Math.floor(fontSize * 0.72));
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  const boxes = game.quips.map((quip) => {
    const spot = quipSpot(ctx, game, quip, size);
    ctx.font = `600 ${fontSize}px Georgia, serif`;
    const textW = ctx.measureText(quip.text).width;
    ctx.font = `700 ${nameSize}px Georgia, serif`;
    const nameW = ctx.measureText(quip.name).width;
    return {
      quip,
      px: spot.px,
      py: spot.py,
      w: Math.max(textW, nameW) + 20,
      h: fontSize + nameSize + 16,
    };
  });
  separateBalloons(boxes);
  for (const box of boxes) {
    const { quip } = box;
    const fade = Math.min(1, quip.life / 0.35);
    ctx.globalAlpha = fade;
    const w = box.w;
    const h = box.h;
    const x = box.px - w / 2;
    const y = box.py - h;
    ctx.fillStyle = "rgba(22, 17, 14, 0.94)";
    ctx.strokeStyle = quip.color;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(box.px - 7, y + h - 1);
    ctx.lineTo(box.px + 7, y + h - 1);
    ctx.lineTo(box.px, y + h + 8);
    ctx.closePath();
    ctx.fill();
    ctx.font = `700 ${nameSize}px Georgia, serif`;
    ctx.fillStyle = quip.color;
    ctx.fillText(quip.name, box.px, y + 6 + nameSize / 2);
    ctx.font = `600 ${fontSize}px Georgia, serif`;
    ctx.fillStyle = "#f6efe2";
    ctx.fillText(quip.text, box.px, y + nameSize + 10 + fontSize / 2);
  }
  ctx.restore();
}

function separateBalloons(boxes) {
  const gap = 10;
  for (let pass = 0; pass < boxes.length; pass++) {
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (Math.abs(a.px - b.px) >= (a.w + b.w) / 2 + gap) continue;
        const aTop = a.py - a.h;
        const bTop = b.py - b.h;
        if (aTop >= b.py + 8 + gap || bTop >= a.py + 8 + gap) continue;
        const upper = a.py < b.py ? a : b;
        const lower = upper === a ? b : a;
        upper.py = Math.min(upper.py, lower.py - lower.h - gap - 8);
      }
    }
  }
}

function quipSpot(ctx, game, quip, size) {
  const anchor = quipAnchor(game, quip);
  const px = ctx.canvas.width / 2 + (anchor.x + 0.5 - game.camera.x) * size;
  const lift = quip.id === "dragon" ? 1.45 : 1.15;
  const py = ctx.canvas.height / 2 + (anchor.y + 0.5 - game.camera.y) * size - size * lift;
  if (quip.id !== "princess") return { px, py };
  const margin = 28;
  const off =
    px < margin || px > ctx.canvas.width - margin || py < margin || py > ctx.canvas.height - margin;
  if (!off) return { px, py };
  return { px: ctx.canvas.width / 2, py: ctx.canvas.height - 28 };
}

function quipAnchor(game, quip) {
  if (quip.id === "knight" && game.knight) {
    const visual = knightVisual(game.knight);
    return { x: visual.x, y: visual.y };
  }
  return { x: quip.x, y: quip.y };
}

function drawBanner(ctx, game) {
  if (!game.banner || game.banner.life <= 0) return;
  const alpha = Math.min(1, game.banner.life);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#f3e2b0";
  ctx.font = `700 ${Math.max(22, Math.floor(ctx.canvas.width * 0.03))}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(game.banner.text, ctx.canvas.width / 2, 18);
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hash(x, y) {
  const value = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return value - Math.floor(value);
}
