// The optional background music: a slow organ drone wandering among modal
// chords, with a distant choir now and then. audio.js owns the sound graph.

// Chords as MIDI notes, all within D Dorian and D Aeolian.
export const CHORDS = {
  Dm: [38, 50, 57, 62, 65],
  'Dm add9': [38, 50, 57, 64, 65],
  Am: [33, 52, 57, 60, 64],
  C: [36, 52, 55, 60, 64],
  F: [41, 53, 57, 60, 65],
  'G (Dorian)': [43, 50, 55, 59, 62],
  'B flat (Aeolian)': [34, 53, 58, 62, 65],
  Gm: [31, 50, 55, 58, 62],
  'D open': [38, 45, 50, 57, 62],
};

export const frequencyOf = (note) => 440 * 2 ** ((note - 69) / 12);

// The next chord and how long to hold it. Never the same twice running, and the
// two chords before it are avoided too, so the music keeps moving.
export function nextChord(recent, random = Math.random) {
  const names = Object.keys(CHORDS).filter((name) => !recent.slice(-3).includes(name));
  // Return home now and then.
  const home = names.filter((name) => name.startsWith('D'));
  const pool = home.length && random() < 0.28 ? home : names;
  return { name: pool[Math.floor(random() * pool.length)], seconds: 8 + random() * 8 };
}

const OVERLAP = 4.5; // seconds over which one chord gives way to the next

// ctx: an AudioContext. out: where the music goes. choir: (at, notes, level, length).
export function createDrone(ctx, out, choir) {
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 820;
  filter.Q.value = 0.4;
  filter.connect(out);

  const sounding = new Set();
  const recent = [];
  let timer = null;
  let untilChoir = 2;

  // One organ pipe: a soft saw and a sine, slightly out of tune with each other.
  function voice(at, frequency, level, length) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(level, at + OVERLAP);
    gain.gain.setValueAtTime(level, at + length);
    gain.gain.linearRampToValueAtTime(0, at + length + OVERLAP);
    gain.connect(filter);
    for (const [type, share, detune] of [['sawtooth', 0.35, -4], ['sine', 1, 3 + Math.random() * 3]]) {
      const oscillator = ctx.createOscillator();
      const mix = ctx.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      mix.gain.value = share;
      oscillator.connect(mix).connect(gain);
      oscillator.start(at);
      oscillator.stop(at + length + OVERLAP + 0.1);
      sounding.add(oscillator);
      oscillator.onended = () => sounding.delete(oscillator);
    }
  }

  function step() {
    const chord = nextChord(recent);
    recent.push(chord.name);
    if (recent.length > 4) recent.shift();
    const at = ctx.currentTime + 0.05;
    const notes = CHORDS[chord.name];
    notes.forEach((note, i) => {
      // Upper voices are quieter, and a few drop out so the texture varies.
      if (i > 1 && Math.random() < 0.15) return;
      voice(at + i * 0.35, frequencyOf(note), 0.05 / (1 + i * 0.35), chord.seconds);
    });
    if (--untilChoir <= 0) {
      untilChoir = 3 + Math.floor(Math.random() * 4);
      const high = notes.slice(-2).map((note) => frequencyOf(note));
      choir(at + 2 + Math.random() * 3, high, 0.075, 6 + Math.random() * 3);
    }
    timer = setTimeout(step, chord.seconds * 1000);
  }

  return {
    get playing() { return timer !== null; },
    start() {
      if (timer === null) step();
    },
    // Stops after `after` seconds, which leaves time for a fade.
    stop(after = 0) {
      clearTimeout(timer);
      timer = null;
      for (const oscillator of sounding) {
        try {
          oscillator.stop(ctx.currentTime + after);
        } catch { /* it has already stopped */ }
      }
      sounding.clear();
    },
  };
}
