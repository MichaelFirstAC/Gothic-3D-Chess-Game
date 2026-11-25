import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noise1, flameState } from '../src/effects/flicker.js';

const samples = (seed) => Array.from({ length: 3000 }, (_, i) => flameState(i / 60, seed));

test('noise is smooth and stays within 0..1', () => {
  let previous = noise1(0);
  for (let i = 1; i < 2000; i++) {
    const value = noise1(i * 0.01);
    assert.ok(value >= 0 && value <= 1);
    assert.ok(Math.abs(value - previous) < 0.05);
    previous = value;
  }
});

test('a flame stays near full strength and sways only a little', () => {
  for (const seed of [0, 1, 7, 11]) {
    for (const { strength, swayX, swayZ } of samples(seed)) {
      assert.ok(strength > 0.55 && strength < 1.25, String(strength));
      assert.ok(Math.abs(swayX) < 0.06 && Math.abs(swayZ) < 0.03);
    }
  }
});

test('it gutters now and then, but not all the time', () => {
  const dips = samples(3).filter((s) => s.strength < 0.84).length;
  assert.ok(dips > 0 && dips < 600, String(dips));
});

test('flames do not move in step, and each is repeatable', () => {
  const a = samples(1).map((s) => s.strength);
  const b = samples(2).map((s) => s.strength);
  const together = a.filter((v, i) => Math.abs(v - b[i]) < 0.005).length;
  assert.ok(together < a.length * 0.2, String(together));
  assert.deepEqual(flameState(5.5, 4), flameState(5.5, 4));
});
