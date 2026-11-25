import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candle, candleSet } from '../src/candles.js';

const points = (geometry) => {
  const p = geometry.attributes.position;
  return Array.from({ length: p.count }, (_, i) => [p.getX(i), p.getY(i), p.getZ(i)]);
};

test('a candle is uneven, has runs and a sunken top, and no bad numbers', () => {
  const { wax, wick, flameAt } = candle(0.45, 3, 0.05);
  const all = points(wax);
  assert.ok(all.every((v) => v.every(Number.isFinite)));
  // The radius at mid-height varies around the candle.
  const band = all.filter(([, y]) => y > 0.2 && y < 0.22).map(([x, , z]) => Math.hypot(x, z));
  assert.ok(Math.max(...band) - Math.min(...band) > 0.004);
  // The middle of the top sits below the rim: a melt pool.
  const rim = Math.max(...all.map(([, y]) => y));
  const centre = Math.max(...all.filter(([x, y, z]) => y > 0.3 && Math.hypot(x, z) < 0.008).map(([, y]) => y));
  assert.ok(rim - centre > 0.012, `${rim} ${centre}`);
  // The flame sits on the wick, above the pool and no higher than the wick.
  const wickTop = Math.max(...points(wick).map(([, y]) => y));
  assert.ok(flameAt.y > centre && flameAt.y <= wickTop);
  const glow = wax.attributes.glow.array;
  assert.ok(glow.every((g) => g >= 0 && g <= 1));
});

test('candles differ from one another but are repeatable', () => {
  const sockets = [{ x: 0, y: 1.17, z: 0 }, { x: 0.34, y: 1.05, z: 0 }, { x: -0.34, y: 1.05, z: 0 }];
  const a = candleSet(sockets, [0.55, 0.36, 0.43], [0.15, 0.08, 0.08], 1);
  const b = candleSet(sockets, [0.55, 0.36, 0.43], [0.15, 0.08, 0.08], 2);
  assert.equal(a.flames.length, 3);
  assert.notDeepEqual(a.flames.map((f) => f.y), b.flames.map((f) => f.y));
  const again = candleSet(sockets, [0.55, 0.36, 0.43], [0.15, 0.08, 0.08], 1);
  assert.deepEqual(a.flames, again.flames);
  a.flames.forEach((flame, i) => {
    assert.ok(Math.hypot(flame.x - sockets[i].x, flame.z - sockets[i].z) < 0.05, 'over its own socket');
    assert.ok(flame.y > sockets[i].y + 0.25);
  });
});
