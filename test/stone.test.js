import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutWall } from '../src/stoneLayout.js';

const SIZE = 1024;

// How many blocks cover each sample point of the wrapping tile.
function coverage(blocks, step = 7) {
  const counts = [];
  for (let y = 3; y < SIZE; y += step) {
    for (let x = 3; x < SIZE; x += step) {
      counts.push(blocks.filter((b) => {
        const dx = ((x - b.x) % SIZE + SIZE) % SIZE;
        return dx < b.width && y >= b.y && y < b.y + b.height;
      }).length);
    }
  }
  return counts;
}

test('the wall is filled exactly once everywhere, for many seeds', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const counts = coverage(layoutWall(SIZE, seed), 11);
    assert.ok(counts.every((n) => n === 1), `seed ${seed}: ${counts.filter((n) => n !== 1).length} bad points`);
  }
});

test('courses differ in height and some stones rise through two', () => {
  const blocks = layoutWall(2048, 5);
  const heights = new Set(blocks.map((b) => b.height));
  assert.ok(heights.size > 8, String(heights.size));
  const usual = Math.max(...[...heights].filter((h) => h <= 125));
  assert.ok(blocks.some((b) => b.height > usual), 'at least one tall stone');
  assert.ok(new Set(blocks.map((b) => b.width)).size > 40);
});

test('different seeds give different walls, the same seed the same wall', () => {
  assert.deepEqual(layoutWall(SIZE, 9), layoutWall(SIZE, 9));
  assert.notDeepEqual(layoutWall(SIZE, 9), layoutWall(SIZE, 10));
});
