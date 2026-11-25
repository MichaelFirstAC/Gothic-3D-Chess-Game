// The outline of the rock pillar the board stands on. Pure logic, so that what
// has to fit on it can be tested: the carved dais under the board, the candle
// stands, and the two ledges that hold the captured pieces.
//
// Angles are measured like atan2(x, z): 0 faces white's end, a quarter turn
// faces the +x side.

// The flat, worn top. The candle stands' feet rest here.
export const TOP_Y = -0.8;

// Half-width of the square dais at its foot, and where it meets the board frame.
export const DAIS_FOOT = 4.78;
export const DAIS_TOP_Y = -0.215;

// The captured pieces stand on a ledge on each side, a step below the top.
export const LEDGE = {
  y: -1.15,
  inner: 4.4, // buried in the pillar
  outer: 6.35,
  halfLength: 4.1,
};

// The two columns of graves on each ledge, as distances from the middle.
const GRAVE_X = 5.34;
const GRAVE_COLUMN = 0.55;
const GRAVE_ROW = 0.58;

// Where the nth piece taken by one side stands. side: +1 or -1.
export function gravePosition(side, index) {
  return [
    side * (GRAVE_X + Math.floor(index / 8) * GRAVE_COLUMN),
    LEDGE.y,
    side * (3.35 - (index % 8) * GRAVE_ROW),
  ];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (from, to, v) => {
  const t = clamp01((v - from) / (to - from));
  return t * t * (3 - 2 * t);
};

const hash = (x, y, z) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// Smooth noise in space, from -1 to 1.
export function noise3(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fade = (t) => t * t * (3 - 2 * t);
  const fx = fade(x - ix);
  const fy = fade(y - iy);
  const fz = fade(z - iz);
  const mix = (a, b, t) => a + (b - a) * t;
  const face = (dz) => mix(
    mix(hash(ix, iy, iz + dz), hash(ix + 1, iy, iz + dz), fx),
    mix(hash(ix, iy + 1, iz + dz), hash(ix + 1, iy + 1, iz + dz), fx),
    fy,
  );
  return mix(face(0), face(1), fz) * 2 - 1;
}

// Several octaves of noise3, still within -1 to 1.
export function fbm3(x, y, z, octaves = 4) {
  let sum = 0;
  let weight = 0;
  for (let i = 0; i < octaves; i++) {
    const amplitude = 0.5 ** i;
    const f = 2.03 ** i;
    sum += noise3(x * f + i * 19.7, y * f + i * 7.3, z * f + i * 31.1) * amplitude;
    weight += amplitude;
  }
  return sum / weight;
}

// Distance from the middle to the side of a square of half-width 1.
export const squareReach = (angle) => 1 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));

// The broken edge of the flat top. It hugs the dais on the sides, so that the
// ledges show below it, spreads at both ends, and reaches out in four spurs that
// carry the candle stands.
export function rimRadius(angle) {
  const cos = Math.cos(angle);
  const dais = DAIS_FOOT * squareReach(angle);
  const ends = cos * cos;
  const base = 5.0 + 1.2 * ends;
  // How far round from the nearest diagonal.
  const quarter = Math.PI / 2;
  const fromDiagonal = ((angle % quarter) + quarter) % quarter - quarter / 2;
  const spur = Math.exp(-((fromDiagonal / 0.13) ** 4));
  const plain = Math.max(base, dais + 0.2);
  // Ragged at the ends only; the sides stay clear of the graves.
  const ragged = fbm3(Math.sin(angle) * 5.5, 0.5, cos * 5.5, 3)
    * 0.5 * smooth(0.55, 0.9, Math.abs(cos)) * (1 - spur);
  const edge = Math.max(dais + 0.12, plain + ragged);
  return edge + (Math.max(8.95, edge) - edge) * spur;
}
