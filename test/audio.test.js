import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadSettings, saveSettings, makeImpulse, jitter, resultSound, createAudio, SOUNDS, DEFAULT_SETTINGS,
} from '../src/audio.js';

function memory(initial) {
  const data = new Map(initial ? [['gothic-chess-audio', initial]] : []);
  const store = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  return () => store;
}

test('settings survive a round trip and bad data falls back to the defaults', () => {
  const storage = memory();
  saveSettings(storage, { ...DEFAULT_SETTINGS, muted: true, volume: 0.25 });
  assert.equal(loadSettings(storage).muted, true);
  assert.equal(loadSettings(storage).volume, 0.25);
  for (const junk of ['not json', 'null', '{"muted":"yes","volume":"loud"}']) {
    assert.deepEqual(loadSettings(memory(junk)), DEFAULT_SETTINGS, junk);
  }
  assert.equal(loadSettings(memory('{"volume":9}')).volume, 1);
});

test('blocked storage is harmless', () => {
  const blocked = () => { throw new Error('blocked'); };
  assert.deepEqual(loadSettings(blocked), DEFAULT_SETTINGS);
  assert.doesNotThrow(() => saveSettings(blocked, DEFAULT_SETTINGS));
});

test('the reverb impulse is stereo, four seconds or so, and dies away', () => {
  const rate = 8000;
  const [left, right] = makeImpulse(rate, 4);
  assert.equal(left.length, rate * 4);
  const energy = (data, from, to) => data.slice(from * rate, to * rate).reduce((sum, v) => sum + v * v, 0);
  assert.ok(energy(left, 0, 1) > energy(left, 1, 2) * 3);
  assert.ok(energy(left, 3, 4) < energy(left, 0, 1) / 300);
  assert.ok(left.every((v) => Math.abs(v) <= 1));
  assert.notDeepEqual(left.slice(1000, 1100), right.slice(1000, 1100));
});

test('pitch varies only slightly', () => {
  assert.equal(jitter(() => 0.5), 1);
  assert.ok(jitter(() => 0) > 0.95 && jitter(() => 1) < 1.05);
});

test('every sound the game asks for exists', () => {
  const wanted = ['select', 'place', 'knight', 'castle', 'capture', 'crack', 'sink', 'reform', 'promote',
    'check', 'checkmate', 'stalemate', 'draw', 'undo', 'illegal', 'click'];
  for (const name of wanted) assert.equal(typeof SOUNDS[name], 'function', name);
  assert.equal(resultSound({ winner: 'w', reason: 'resignation' }), 'checkmate');
  assert.equal(resultSound({ winner: null, reason: 'stalemate' }), 'stalemate');
  assert.equal(resultSound({ winner: null, reason: 'mutual agreement' }), 'draw');
});

test('nothing plays, and nothing breaks, before audio is unlocked', () => {
  const audio = createAudio({ storage: memory() });
  assert.doesNotThrow(() => audio.play('place'));
  audio.set({ volume: 0.4 });
  assert.equal(audio.settings.volume, 0.4);
});
