import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSettleWatch } from '../src/settle.js';
import { createQualityGovernor } from '../src/quality.js';

// The frame at which the watch first reports calm, or -1.
const calmAt = (times) => {
  const watch = createSettleWatch({ run: 10 });
  return times.findIndex((ms) => watch.frame(ms));
};
const frames = (count, ms) => Array(count).fill(ms);

test('calm needs a full run of steady frames', () => {
  assert.equal(calmAt(frames(9, 16)), -1);
  assert.equal(calmAt(frames(30, 16)), 9);
});

test('a hitch starts the wait again', () => {
  assert.equal(calmAt([...frames(5, 16), 900, ...frames(20, 16)]), 15);
  assert.equal(calmAt(Array.from({ length: 60 }, (_, i) => (i % 6 ? 16 : 120))), -1);
});

test('a slow but even machine still counts, a crawling one does not', () => {
  assert.equal(calmAt(frames(30, 55)), 9);
  assert.equal(calmAt(frames(30, 400)), -1);
});

test('hurried quality checks settle on a level within a few frames', () => {
  const applied = [];
  const governor = createQualityGovernor((level) => applied.push(level));
  governor.hurry(true);
  for (let i = 0; i < 36; i++) governor.frame(50);
  assert.equal(governor.level, 1);
  assert.equal(governor.settled, false);
  for (let i = 0; i < 36; i++) governor.frame(16);
  assert.equal(governor.settled, true);
  assert.deepEqual(applied, [0, 1]);
  // Afterwards it is as patient as before.
  governor.hurry(false);
  for (let i = 0; i < 100; i++) governor.frame(50);
  assert.equal(governor.level, 1);
});

test('a fixed quality level is settled from the start', () => {
  assert.equal(createQualityGovernor(() => {}, { maxLevel: 0 }).settled, true);
});
