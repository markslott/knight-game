import assert from "node:assert/strict";
import {
  TILE_FLOOR,
  TILE_PIT,
  TILE_SPIKE,
  generateFloor,
  knightDistance,
  openGate,
  KNIGHT_OFFSETS,
  isLandable,
  idx,
} from "./dungeon.js";

const seeds = 40;

for (let seed = 1; seed <= seeds; seed++) {
  for (const floor of [1, 2, 3, 4]) {
    const level = generateFloor(floor, seed);
    const again = generateFloor(floor, seed);
    assert.deepEqual(again.tiles, level.tiles);
    assert.deepEqual(again.enemies, level.enemies);
    assert.equal(isLandable(level.tiles[idx(level.spawn.x, level.spawn.y)]), true);

    const safe = new Set(
      KNIGHT_OFFSETS.map((move) => `${level.spawn.x + move.dx},${level.spawn.y + move.dy}`)
    );
    safe.add(`${level.spawn.x},${level.spawn.y}`);
    for (const mark of safe) {
      const [x, y] = mark.split(",").map(Number);
      if (x < 0 || y < 0 || x >= level.width || y >= level.height) continue;
      const tile = level.tiles[idx(x, y)];
      assert.notEqual(tile, TILE_PIT, `pit on spawn landing seed ${seed} floor ${floor}`);
      assert.notEqual(tile, TILE_SPIKE, `spike on spawn landing seed ${seed} floor ${floor}`);
    }
    for (const enemy of level.enemies) {
      assert.equal(safe.has(`${enemy.x},${enemy.y}`), false);
      const chebyshev = Math.max(
        Math.abs(enemy.x - level.spawn.x),
        Math.abs(enemy.y - level.spawn.y)
      );
      assert.ok(chebyshev >= 3, `enemy too close seed ${seed} floor ${floor}`);
    }

    if (floor < 4) {
      const distance = knightDistance(level, level.spawn, level.stairs);
      assert.ok(
        distance >= 4 && distance < Infinity,
        `seed ${seed} floor ${floor} stairs distance ${distance}`
      );
      assert.equal(level.tiles[idx(level.stairs.x, level.stairs.y)], 4);
    } else {
      const dragonDistance = knightDistance(level, level.spawn, level.dragon);
      assert.ok(dragonDistance >= 2 && dragonDistance < Infinity, `dragon ${dragonDistance}`);
      const sealed = knightDistance(level, level.spawn, level.princess);
      assert.equal(sealed, Infinity, `princess reachable while sealed seed ${seed}`);
      const opened = {
        ...level,
        tiles: level.tiles.slice(),
      };
      openGate(opened);
      const rescued = knightDistance(opened, level.spawn, level.princess);
      assert.ok(rescued >= 2 && rescued < Infinity, `princess ${rescued} seed ${seed}`);
      assert.equal(opened.tiles[idx(level.princess.x, level.princess.y)], TILE_FLOOR);
    }
  }
}

console.log(`solvable across ${seeds} seeds and all four floors`);
