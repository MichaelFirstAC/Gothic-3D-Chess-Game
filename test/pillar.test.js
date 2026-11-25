import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DAIS_FOOT, LEDGE, TOP_Y, gravePosition, rimRadius, squareReach, noise3, fbm3,
} from '../src/pillarShape.js';
import { pillarGeometry } from '../src/pillar.js';

const angles = Array.from({ length: 720 }, (_, i) => (i / 720) * Math.PI * 2);

// Whether a point of the flat top lies inside the rim.
const onTop = (x, z) => Math.hypot(x, z) <= rimRadius(Math.atan2(x, z));

test('the rim stays outside the dais all the way round', () => {
  for (const a of angles) assert.ok(rimRadius(a) >= DAIS_FOOT * squareReach(a) + 0.1, `at ${a}`);
});

test('the rim joins up with itself', () => {
  assert.ok(Math.abs(rimRadius(0) - rimRadius(Math.PI * 2)) < 1e-9);
});

test('all four candle stands have rock under their whole foot', () => {
  for (const x of [-5.7, 5.7]) {
    for (const z of [-5.7, 5.7]) {
      for (const a of angles) assert.ok(onTop(x + Math.sin(a) * 0.48, z + Math.cos(a) * 0.48), `${x},${z} at ${a}`);
    }
  }
});

test('every grave is on a ledge and clear of the rim above it', () => {
  // A captured piece is drawn small; this is roughly the radius of its base.
  const foot = 0.2;
  for (const side of [1, -1]) {
    for (let i = 0; i < 15; i++) {
      const [x, y, z] = gravePosition(side, i);
      assert.equal(y, LEDGE.y);
      assert.ok(y < TOP_Y);
      assert.ok(Math.abs(x) + foot <= LEDGE.outer, `too far out: ${x}`);
      assert.ok(Math.abs(z) + foot <= LEDGE.halfLength, `past the end: ${z}`);
      for (const dz of [-foot, 0, foot]) {
        assert.ok(!onTop(x - Math.sign(x) * foot, z + dz), `under the rim: ${x}, ${z}`);
      }
    }
  }
});

test('no two graves share a place', () => {
  const places = [1, -1].flatMap((side) => Array.from({ length: 15 }, (_, i) => gravePosition(side, i).join()));
  assert.equal(new Set(places).size, 30);
});

test('the noise is repeatable and stays in range', () => {
  for (let i = 0; i < 500; i++) {
    const p = [i * 0.37 - 80, i * 0.11 - 20, i * -0.23];
    assert.ok(Math.abs(noise3(...p)) <= 1);
    assert.ok(Math.abs(fbm3(...p)) <= 1);
    assert.equal(fbm3(...p), fbm3(...p));
  }
});

test('the pillar is one sound mesh that reaches far down', () => {
  const geometry = pillarGeometry();
  const values = geometry.attributes.position.array;
  assert.ok(values.every(Number.isFinite), 'every vertex is a real point');
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  assert.ok(min.y <= -60, `only reaches ${min.y}`);
  // Nothing pokes up through the board.
  assert.ok(max.y < -0.2, `rises to ${max.y}`);
  assert.ok(geometry.attributes.position.count / 3 < 70000, 'stays cheap to draw');
});
