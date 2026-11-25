import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createQualityGovernor, MAX_LEVEL } from '../src/quality.js';

function run(frameTime, frames, options) {
  const applied = [];
  const governor = createQualityGovernor((level) => applied.push(level), { warmup: 5, sample: 10, ...options });
  for (let i = 0; i < frames; i++) governor.frame(typeof frameTime === 'function' ? frameTime(i) : frameTime);
  return applied;
}

test('a fast machine keeps full detail', () => {
  assert.deepEqual(run(16.7, 500), [0]);
});

test('a slow machine steps down one level at a time and then stops', () => {
  assert.deepEqual(run(40, 15), [0, 1]);
  assert.deepEqual(run(40, 1000), [0, 1, 2, 3]);
  assert.equal(MAX_LEVEL, 3);
});

test('hidden tabs and the occasional hitch are ignored', () => {
  assert.deepEqual(run(1000, 500), [0]);
  assert.deepEqual(run((i) => (i % 5 === 0 ? 90 : 16), 500), [0]);
});

test('a starting level can be given', () => {
  assert.deepEqual(run(16, 100, { level: 2 }), [2]);
});
