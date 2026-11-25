import { test } from 'node:test';
import assert from 'node:assert/strict';
import { easeInOut } from '../src/effects/timeline.js';
import { contactFraction, easeInOutInverse } from '../src/effects/impact.js';

test('the easing can be run backwards', () => {
  for (const p of [0, 0.1, 0.3, 0.5, 0.62, 0.9, 1]) {
    assert.ok(Math.abs(easeInOut(easeInOutInverse(p)) - p) < 1e-9, String(p));
  }
});

test('the break is timed to when the pieces touch', () => {
  for (const distance of [1, Math.SQRT2, 3, 7]) {
    const remaining = distance * (1 - easeInOut(contactFraction(distance)));
    assert.ok(Math.abs(remaining - 0.62) < 0.01, `${distance}: ${remaining} squares apart`);
  }
  assert.ok(contactFraction(1) < contactFraction(7), 'a short step touches sooner in its slide');
  assert.ok(contactFraction(Math.SQRT2) < 0.6, 'well before a pawn capture finishes');
  assert.equal(contactFraction(2.24, true), 0.78);
});
