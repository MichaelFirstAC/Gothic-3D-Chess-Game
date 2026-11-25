import { test } from 'node:test';
import assert from 'node:assert/strict';
import { squareIndex } from '../src/engine.js';
import { isKnightShift, knightLegs, knightArrowOutline } from '../src/effects/arrowShape.js';

const shift = (a, b) => isKnightShift(squareIndex(a), squareIndex(b));

test('only knight-shaped moves get the L', () => {
  for (const to of ['f3', 'h3', 'e2']) assert.ok(shift('g1', to), to);
  for (const to of ['e4', 'd3', 'a1', 'g3', 'f2']) assert.ok(!shift(to === 'e4' ? 'e2' : 'g1', to), to);
});

test('the long leg comes first', () => {
  assert.deepEqual(knightLegs(1, -2), { first: [0, -1], second: [1, 0], long: 2, short: 1 });
  assert.deepEqual(knightLegs(-2, 1), { first: [-1, 0], second: [0, 1], long: 2, short: 1 });
});

const style = { start: 0.2, reach: 0.1, shaft: 0.13, head: 0.34, headLength: 0.5 };

// Signed area by the shoelace formula.
const area = (points) => Math.abs(points.reduce((sum, [x, y], i) => {
  const [nx, ny] = points[(i + 1) % points.length];
  return sum + x * ny - nx * y;
}, 0)) / 2;

const crosses = (a, b, c, d) => {
  const turn = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return turn(a, b, c) * turn(a, b, d) < 0 && turn(c, d, a) * turn(c, d, b) < 0;
};

test('the outline is one simple polygon with a mitred corner, for all eight moves', () => {
  for (const [dx, dz] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
    const points = knightArrowOutline(dx, dz, style);
    assert.equal(points.length, 9);
    // No edge crosses another, so no layer is drawn over itself.
    for (let i = 0; i < 9; i++) {
      for (let j = i + 2; j < 9; j++) {
        if (i === 0 && j === 8) continue;
        assert.ok(!crosses(points[i], points[(i + 1) % 9], points[j], points[(j + 1) % 9]), `${dx},${dz}: ${i}/${j}`);
      }
    }
    // Shaft area (leg lengths measured to the mitre) plus the triangular head.
    const shaftLength = (2 - style.start) + (1 + style.reach - style.headLength);
    const expected = shaftLength * style.shaft * 2 + style.head * style.headLength;
    assert.ok(Math.abs(area(points) - expected) < 1e-9, `${area(points)} vs ${expected}`);
    // The tip sits just past the target, along the short leg.
    const { second } = knightLegs(dx, dz);
    assert.deepEqual(points[4].map((v) => +v.toFixed(6)), [dx + second[0] * 0.1, dz + second[1] * 0.1].map((v) => +v.toFixed(6)));
  }
});
