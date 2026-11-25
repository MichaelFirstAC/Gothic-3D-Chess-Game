// All sound, synthesised with the Web Audio API and played into a generated
// cathedral reverb. No audio files are needed.
//
// To replace a sound with a recording, put the file in public/sounds/ and list
// it in SOUND_FILES, for example  capture: '/sounds/capture.ogg'. Callers only
// ever ask for a sound by name, so nothing else changes.

import { createDrone } from './music.js';

export const SOUND_FILES = {};

const STORAGE_KEY = 'gothic-chess-audio';
export const DEFAULT_SETTINGS = { muted: false, volume: 0.7, music: false, musicVolume: 0.4 };
const REVERB_SECONDS = 4.2;
const MUSIC_FADE = 2; // seconds
const MUSIC_TRIM = 0.7; // keeps the music well under the effects
const DUCK = 0.5; // how far the music dips while an effect sounds

// ---------------------------------------------------------------- pure helpers

const clampVolume = (value, fallback) => (Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback);

// Reads saved settings. Storage can be blocked, missing or hold anything.
export function loadSettings(storage) {
  let saved = {};
  try {
    saved = JSON.parse(storage().getItem(STORAGE_KEY)) || {};
  } catch { /* start from the defaults */ }
  return {
    muted: typeof saved.muted === 'boolean' ? saved.muted : DEFAULT_SETTINGS.muted,
    volume: clampVolume(saved.volume, DEFAULT_SETTINGS.volume),
    music: typeof saved.music === 'boolean' ? saved.music : DEFAULT_SETTINGS.music,
    musicVolume: clampVolume(saved.musicVolume, DEFAULT_SETTINGS.musicVolume),
  };
}

export function saveSettings(storage, settings) {
  try {
    storage().setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch { /* only a convenience */ }
}

// A stone hall's echo: stereo noise that dies away, growing duller as it goes.
export function makeImpulse(sampleRate, seconds, random = Math.random) {
  const length = Math.floor(sampleRate * seconds);
  return [0, 1].map(() => {
    const data = new Float32Array(length);
    let held = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      // Falls by about 60 dB over the whole length.
      const envelope = Math.exp(-6.9 * t);
      // A one-pole low-pass that closes over time.
      const smoothing = 0.15 + 0.75 * t;
      held = held * smoothing + (random() * 2 - 1) * (1 - smoothing);
      // A short gap before the first reflections arrive.
      data[i] = held * envelope * Math.min(1, i / (sampleRate * 0.025));
    }
    return data;
  });
}

// A little different every time, within `spread` either way.
export const jitter = (random = Math.random, spread = 0.035) => 1 + (random() * 2 - 1) * spread;

// ---------------------------------------------------------------- building blocks

function createKit(ctx) {
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const samples = noise.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;

  // A gain with an attack and an exponential fall.
  function envelope(out, at, peak, attack, decay) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    gain.connect(out);
    return gain;
  }

  return {
    envelope,
    tone(out, at, { frequency, to, type = 'sine', peak = 0.2, attack = 0.005, decay = 0.3 }) {
      const oscillator = ctx.createOscillator();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, at);
      if (to) oscillator.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
      oscillator.connect(envelope(out, at, peak, attack, decay));
      oscillator.start(at);
      oscillator.stop(at + attack + decay + 0.05);
    },
    // A burst of filtered noise: the basis of every stony sound.
    burst(out, at, {
      filter = 'bandpass', frequency = 1000, to, q = 1, peak = 0.3, attack = 0.002, decay = 0.1,
    }) {
      const source = ctx.createBufferSource();
      source.buffer = noise;
      source.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = filter;
      band.frequency.setValueAtTime(frequency, at);
      if (to) band.frequency.exponentialRampToValueAtTime(to, at + attack + decay);
      band.Q.value = q;
      source.connect(band).connect(envelope(out, at, peak, attack, decay));
      source.start(at, Math.random() * 1.5);
      source.stop(at + attack + decay + 0.05);
    },
  };
}

// Bell partials are deliberately out of tune with one another.
const BELL = [
  [0.5, 0.5, 1.6], [1, 1, 1.3], [1.19, 0.55, 1.1], [1.5, 0.4, 0.9], [2, 0.5, 0.8],
  [2.51, 0.26, 0.6], [3.01, 0.2, 0.45], [4.17, 0.12, 0.3], [5.43, 0.08, 0.2],
];

function bell(kit, out, at, frequency, level, length) {
  for (const [ratio, strength, share] of BELL) {
    kit.tone(out, at, { frequency: frequency * ratio, peak: level * strength, attack: 0.004, decay: length * share });
  }
  kit.burst(out, at, { frequency: frequency * 6, q: 2, peak: level * 0.35, decay: 0.05 });
}

// Stone set down on stone: a bright tick over a short low knock.
function stoneTap(kit, out, at, pitch, level = 1) {
  kit.burst(out, at, { frequency: 2300 * pitch, q: 2.2, peak: 0.5 * level, decay: 0.045 });
  kit.burst(out, at + 0.004, { frequency: 760 * pitch, q: 4, peak: 0.35 * level, decay: 0.09 });
  kit.tone(out, at, { frequency: 165 * pitch, to: 92 * pitch, peak: 0.45 * level, decay: 0.12 });
}

// A choir-like swell: detuned saws through the vowel formants of "ah".
function choir(ctx, kit, out, at, notes, level, length) {
  const swell = kit.envelope(out, at, level, length * 0.45, length * 0.55);
  const formants = [[800, 6], [1150, 8], [2900, 10]].map(([frequency, q]) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = q;
    filter.connect(swell);
    return filter;
  });
  for (const note of notes) {
    for (const detune of [-8, 7]) {
      const voice = ctx.createOscillator();
      voice.type = 'sawtooth';
      voice.frequency.value = note;
      voice.detune.value = detune;
      for (const filter of formants) voice.connect(filter);
      voice.start(at);
      voice.stop(at + length + 0.1);
    }
  }
}

// ---------------------------------------------------------------- the sounds

// Each takes (kit, out, at, pitch, ctx).
export const SOUNDS = {
  select(kit, out, at, pitch) {
    kit.burst(out, at, { frequency: 1500 * pitch, to: 2400 * pitch, q: 1, peak: 0.5, attack: 0.02, decay: 0.09 });
    kit.tone(out, at + 0.04, { frequency: 620 * pitch, peak: 0.18, decay: 0.08 });
  },
  place(kit, out, at, pitch) {
    stoneTap(kit, out, at, pitch);
  },
  // Two quick strikes, like hooves.
  knight(kit, out, at, pitch) {
    stoneTap(kit, out, at, pitch * 1.18, 0.75);
    stoneTap(kit, out, at + 0.085, pitch * 0.94);
  },
  castle(kit, out, at, pitch) {
    kit.burst(out, at, { filter: 'lowpass', frequency: 900 * pitch, q: 0.7, peak: 0.16, attack: 0.08, decay: 0.2 });
    stoneTap(kit, out, at + 0.02, pitch);
    stoneTap(kit, out, at + 0.2, pitch * 0.86);
  },
  // A sharp split, then rubble.
  capture(kit, out, at, pitch) {
    kit.burst(out, at, { filter: 'highpass', frequency: 2100 * pitch, peak: 0.8, decay: 0.09 });
    kit.tone(out, at, { frequency: 190 * pitch, to: 55, peak: 0.55, decay: 0.2 });
    for (let i = 0; i < 26; i++) {
      const delay = 0.03 + Math.random() ** 1.6 * 0.65;
      kit.burst(out, at + delay, {
        frequency: (500 + Math.random() * 2600) * pitch, q: 3 + Math.random() * 5,
        peak: 0.3 * (1 - delay), decay: 0.03 + Math.random() * 0.05,
      });
    }
  },
  crack(kit, out, at, pitch) {
    kit.burst(out, at, { filter: 'highpass', frequency: 2600 * pitch, peak: 0.55, decay: 0.07 });
    for (let i = 0; i < 9; i++) {
      kit.burst(out, at + 0.03 + Math.random() * 0.25, {
        frequency: (700 + Math.random() * 1800) * pitch, q: 5, peak: 0.16, decay: 0.04,
      });
    }
  },
  sink(kit, out, at, pitch) {
    kit.burst(out, at, { filter: 'lowpass', frequency: 130 * pitch, to: 60, q: 1.2, peak: 0.75, attack: 0.18, decay: 0.8 });
    kit.tone(out, at, { frequency: 58 * pitch, to: 34, peak: 0.35, attack: 0.15, decay: 0.8 });
  },
  reform(kit, out, at, pitch) {
    [1320, 1760, 1975, 2637, 3136].forEach((frequency, i) => {
      kit.tone(out, at + i * 0.065, { frequency: frequency * pitch, peak: 0.05, attack: 0.12, decay: 0.65 });
    });
    kit.burst(out, at, { filter: 'highpass', frequency: 5200, peak: 0.05, attack: 0.3, decay: 0.45 });
  },
  promote(kit, out, at, pitch, ctx) {
    [392, 493.9, 587.3, 784, 987.8].forEach((frequency, i) => {
      kit.tone(out, at + 0.35 + i * 0.16, { frequency: frequency * pitch, type: 'triangle', peak: 0.13, decay: 0.7 });
    });
    choir(ctx, kit, out, at + 0.2, [196 * pitch, 293.7 * pitch, 392 * pitch], 0.3, 1.7);
  },
  check(kit, out, at, pitch) {
    bell(kit, out, at, 207 * pitch, 0.26, 1.9);
  },
  checkmate(kit, out, at, pitch) {
    for (let i = 0; i < 3; i++) bell(kit, out, at + i * 1.15, 110 * pitch, 0.34, 3);
  },
  // Two bells that disagree.
  stalemate(kit, out, at, pitch) {
    bell(kit, out, at, 138.6 * pitch, 0.28, 2.8);
    bell(kit, out, at + 0.85, 146.8 * pitch, 0.24, 2.8);
  },
  draw(kit, out, at, pitch) {
    bell(kit, out, at, 146.8 * pitch, 0.32, 3);
  },
  // A swell that stops short, like a sound played backwards.
  undo(kit, out, at, pitch) {
    kit.burst(out, at, { frequency: 320 * pitch, to: 2600 * pitch, q: 1.6, peak: 0.3, attack: 0.34, decay: 0.03 });
    kit.tone(out, at, { frequency: 180 * pitch, to: 420 * pitch, peak: 0.07, attack: 0.32, decay: 0.03 });
  },
  illegal(kit, out, at, pitch) {
    kit.tone(out, at, { frequency: 105 * pitch, to: 58, peak: 0.45, decay: 0.14 });
    kit.burst(out, at, { filter: 'lowpass', frequency: 320 * pitch, peak: 0.25, decay: 0.08 });
  },
  click(kit, out, at, pitch) {
    kit.burst(out, at, { frequency: 2600 * pitch, q: 1.4, peak: 0.55, decay: 0.035 });
  },
};

// ---------------------------------------------------------------- the player

export function createAudio({ storage = () => window.localStorage } = {}) {
  const settings = loadSettings(storage);
  let graph = null; // built on the first user gesture, as browsers require
  const files = new Map(); // name -> decoded AudioBuffer
  const lastPlayed = new Map();

  const level = () => (settings.muted ? 0 : settings.volume);

  function build() {
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return null;
    const ctx = new Context();
    const output = ctx.createDynamicsCompressor();
    output.connect(ctx.destination);

    const reverb = ctx.createConvolver();
    const impulse = makeImpulse(ctx.sampleRate, REVERB_SECONDS);
    const buffer = ctx.createBuffer(2, impulse[0].length, ctx.sampleRate);
    impulse.forEach((channel, i) => buffer.getChannelData(i).set(channel));
    reverb.buffer = buffer;
    const wet = ctx.createGain();
    wet.gain.value = 0.55;
    reverb.connect(wet).connect(output);

    // A bus is a volume control feeding both the room and its echo.
    const bus = (volume) => {
      const input = ctx.createGain();
      input.gain.value = volume;
      input.connect(output);
      input.connect(reverb);
      return input;
    };

    for (const [name, url] of Object.entries(SOUND_FILES)) {
      fetch(url)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((decoded) => files.set(name, decoded))
        .catch(() => { /* the synthesised sound is used instead */ });
    }
    const kit = createKit(ctx);
    // Music has its own volume, with a second gain that dips under the effects.
    const music = bus(0);
    const duck = ctx.createGain();
    duck.connect(music);
    const drone = createDrone(ctx, duck, (at, notes, loudness, length) => choir(ctx, kit, duck, at, notes, loudness, length));
    return { ctx, kit, effects: bus(level()), music, duck, drone };
  }

  // Fades the music in or out over a couple of seconds.
  function applyMusic() {
    if (!graph) return;
    const { ctx, music, drone } = graph;
    const target = settings.music ? settings.musicVolume * MUSIC_TRIM : 0;
    const now = ctx.currentTime;
    const turningOn = settings.music && !drone.playing;
    music.gain.cancelScheduledValues(now);
    music.gain.setValueAtTime(music.gain.value, now);
    music.gain.linearRampToValueAtTime(target, now + (turningOn || !settings.music ? MUSIC_FADE : 0.15));
    if (turningOn) drone.start();
    else if (!settings.music && drone.playing) drone.stop(MUSIC_FADE);
  }

  function dip(at) {
    const { duck, drone } = graph;
    if (!drone.playing) return;
    duck.gain.cancelScheduledValues(at);
    duck.gain.setTargetAtTime(DUCK, at, 0.05);
    duck.gain.setTargetAtTime(1, at + 0.7, 0.5);
  }

  function unlock() {
    const first = !graph;
    graph ||= build();
    if (graph?.ctx.state === 'suspended') graph.ctx.resume();
    // Music left on last time starts with the first gesture.
    if (first && settings.music) applyMusic();
    return graph;
  }

  function apply() {
    saveSettings(storage, settings);
    graph?.effects.gain.setTargetAtTime(level(), graph.ctx.currentTime, 0.03);
  }

  return {
    settings,
    unlock,
    // Does nothing until the first click or key press has unlocked audio.
    play(name, { delay = 0 } = {}) {
      if (!graph || !level()) return;
      const { ctx, kit, effects } = graph;
      const at = ctx.currentTime + 0.01 + delay;
      // The same sound twice in the same instant would only be louder.
      if (at - (lastPlayed.get(name) ?? -1) < 0.03) return;
      lastPlayed.set(name, at);
      if (name !== 'click') dip(at);
      const recording = files.get(name);
      if (recording) {
        const source = ctx.createBufferSource();
        source.buffer = recording;
        source.playbackRate.value = jitter();
        source.connect(effects);
        source.start(at);
      } else SOUNDS[name]?.(kit, effects, at, jitter(), ctx);
    },
    set(changes) {
      Object.assign(settings, changes);
      apply();
      if ('music' in changes || 'musicVolume' in changes) applyMusic();
    },
    // Development aid.
    get graph() { return graph; },
  };
}

// Which bell marks the end of a game.
export function resultSound({ winner, reason }) {
  if (winner) return 'checkmate';
  return reason === 'stalemate' ? 'stalemate' : 'draw';
}
