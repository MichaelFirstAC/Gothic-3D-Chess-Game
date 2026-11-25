// The noise behind each candle flame. Pure functions: the flame's shader and the
// light it casts are driven from the same numbers, so they flicker together.

function hash(n) {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

// Smooth value noise in one dimension, in the range 0..1.
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const t = f * f * (3 - 2 * f);
  return hash(i) * (1 - t) + hash(i + 1) * t;
}

const centred = (x) => noise1(x) * 2 - 1;

// The state of one flame at `time` seconds:
//   strength  brightness and height, about 1
//   swayX/Z   how far the tip leans, in world units
export function flameState(time, seed) {
  const t = time + seed * 17.3;
  const breathe = centred(t * 2.1) * 0.08 + centred(t * 7.3 + 40) * 0.05 + centred(t * 15.7 + 90) * 0.025;
  // Now and then a draught catches the flame and it gutters for a moment.
  const gust = Math.max(0, noise1(t * 0.55 + 7) - 0.72) / 0.28;
  const gutter = gust * (0.5 + 0.5 * Math.sin(t * 38)) * 0.28;
  return {
    strength: 1 + breathe - gutter,
    swayX: centred(t * 1.3 + 11) * 0.025 + centred(t * 4.7 + 23) * 0.008 + gust * 0.02,
    swayZ: centred(t * 1.1 + 53) * 0.018,
  };
}
