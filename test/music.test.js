import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHORDS, nextChord, frequencyOf } from '../src/music.js';
import { loadSettings, DEFAULT_SETTINGS } from '../src/audio.js';

test('music is off by default', () => {
  assert.equal(DEFAULT_SETTINGS.music, false);
  assert.equal(loadSettings(() => ({ getItem: () => '{"muted":true}' })).music, false);
  assert.equal(loadSettings(() => ({ getItem: () => '{"music":true,"musicVolume":0.9}' })).musicVolume, 0.9);
});

test('chords stay within D Dorian and D Aeolian', () => {
  // D E F G A, B flat or B, and C, as pitch classes.
  const allowed = new Set([2, 4, 5, 7, 9, 10, 11, 0]);
  for (const [name, notes] of Object.entries(CHORDS)) {
    assert.ok(notes.every((n) => allowed.has(n % 12)), name);
  }
  assert.equal(frequencyOf(69), 440);
  assert.ok(Math.abs(frequencyOf(38) - 73.42) < 0.01);
});

test('chords change every 8 to 16 seconds without quick repeats', () => {
  const recent = [];
  const seen = new Set();
  for (let i = 0; i < 400; i++) {
    const { name, seconds } = nextChord(recent);
    assert.ok(seconds >= 8 && seconds <= 16);
    assert.ok(!recent.slice(-3).includes(name), `${name} came back too soon`);
    recent.push(name);
    seen.add(name);
  }
  assert.equal(seen.size, Object.keys(CHORDS).length);
});
