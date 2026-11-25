// The outline of the rock pillar the board stands on. Pure logic, so that what
// has to fit on it can be tested: the carved dais under the board, the candle
// stands, and the captured pieces beside the board.
//
// Angles are measured like atan2(x, z): 0 faces white's end, a quarter turn
// faces the +x side.

// The flat top. The candle stands and the captured pieces rest on it.
export const TOP_Y = -0.8;

// Half-width of the square dais at its foot, and where it meets the board frame.
export const DAIS_FOOT = 4.78;
export const DAIS_TOP_Y = -0.215;

// The top is a plain square with its corners trimmed: its half-width, and the
// largest |x| + |z| left once a corner is cut. The candle stands sit just inside
// the corners.
export const TOP_HALF = 6.4;
export const TOP_CORNER = 12.25;

// The two columns of graves on each side, as distances from the middle.
const GRAVE_X = 5.34;
const GRAVE_COLUMN = 0.55;
const GRAVE_ROW = 0.58;

// Where the nth piece taken by one side stands. side: +1 or -1.
export function gravePosition(side, index) {
  return [
    side * (GRAVE_X + Math.floor(index / 8) * GRAVE_COLUMN),
    TOP_Y,
    side * (3.35 - (index % 8) * GRAVE_ROW),
  ];
}

const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const smooth = (from, to, v) => {
  const t = clamp01((v - from) / (to - from));
  return t * t * (3 - 2 * t);
};

// Distance from the middle to the side of a square of half-width 1.
export const squareReach = (angle) => 1 / Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle)));

// The edge of the flat top, as a distance from the middle.
export function rimRadius(angle) {
  return Math.min(
    TOP_HALF * squareReach(angle),
    TOP_CORNER / (Math.abs(Math.cos(angle)) + Math.abs(Math.sin(angle))),
  );
}
