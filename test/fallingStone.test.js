import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallingStonePlaces, fallingHeight } from '../src/fallingStone.js';

// The camera's farthest reach: its distance plus how far panning can carry it.
const CAMERA_REACH = 21;

test('falling stones stay out where the camera cannot go', () => {
  for (const { x, z } of fallingStonePlaces(400, 3)) {
    assert.ok(Math.max(Math.abs(x), Math.abs(z)) > CAMERA_REACH + 1, `${x}, ${z}`);
    // Inside the arms of the building.
    assert.ok(Math.min(Math.abs(x), Math.abs(z)) < 16, `${x}, ${z} is outside the walls`);
  }
});

test('a stone only ever falls, then starts again from the top', () => {
  const [stone] = fallingStonePlaces(1);
  let last = fallingHeight(stone, 0);
  let restarts = 0;
  for (let t = 0.1; t < 120; t += 0.1) {
    const y = fallingHeight(stone, t);
    assert.ok(y <= 34 && y >= -44, String(y));
    if (y > last) {
      assert.ok(last < -40, `jumped back from ${last}`);
      restarts++;
    }
    last = y;
  }
  assert.ok(restarts > 0);
});
