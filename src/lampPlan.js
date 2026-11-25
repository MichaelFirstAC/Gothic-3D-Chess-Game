// Where the fires hang, and all the soft light in the cathedral. Only stone that
// still stands carries a lamp. Pure data.
import { bayState, pierState } from './ruinPlan.js';

// World height of the level the building's heights are measured from.
const BASE_Y = -0.8;

// How much higher a pillar's break must be than a lamp fixed to it.
const CLEAR = 3.5;

// kind: 'torch' (in an iron bracket, flat against stone), 'lantern' (a caged
// fire hung on a chain) or 'brazier' (an open bowl hung on three chains).
// `at` is where the flame burns; `facing` turns the fixture away from its stone;
// `hangs` is the length of chain above it.
export function lampPlan() {
  const lamps = [];
  const standsAt = (x, z, height) => {
    const level = pierState({ x, z });
    return level === undefined || level >= height + CLEAR;
  };

  // Torches on the pillars, on the side that looks into the building. At the
  // crossing they sit on the side toward an arm, out of the camera's way.
  const torch = (x, z, outX, outZ, height) => {
    if (!standsAt(x, z, height)) return;
    lamps.push({
      kind: 'torch', facing: Math.atan2(outX, outZ),
      at: [x + outX * 1.95, BASE_Y + height, z + outZ * 1.95],
    });
  };
  // Staggered, so that neighbouring pillars and the two sides take turns.
  for (const [x, z] of [
    [-16, -25], [-16, -43], [-16, 16], [-16, 34],
    [16, -16], [16, -34], [16, 25], [16, 43],
  ]) torch(x, z, -Math.sign(x), 0, Math.abs(z) === 34 ? 8.4 : 7.4);
  // Two more on the east wall, either side of the broken window.
  for (const x of [-13.4, 13.4]) lamps.push({ kind: 'torch', facing: 0, at: [x, BASE_Y + 9.2, -50.75] });

  // Lanterns hung in arches of walls that still stand.
  for (const [x, z] of [[-16, -29.5], [-16, 47.5], [16, -47.5], [16, 20.5], [-29.5, 16], [29.5, -16]]) {
    // The arch needs its wall above it. (A break at 28 leaves the arch whole.)
    const state = bayState({ x, z });
    if (state !== undefined && state !== 28) continue;
    lamps.push({ kind: 'lantern', facing: 0, at: [x, BASE_Y + 11.2, z], hangs: 3.1 });
  }

  // Fire bowls hung out from the pillars higher up, where they light the ruins.
  const brazier = (x, z, outX, outZ, height) => {
    if (!standsAt(x, z, height + 3)) return;
    lamps.push({
      kind: 'brazier', facing: Math.atan2(outX, outZ), hangs: 2.6,
      at: [x + outX * 3, BASE_Y + height, z + outZ * 3],
    });
  };
  brazier(16, -43, -1, 0, 17);
  brazier(-16, -25, 1, 0, 15.5);
  brazier(16, 25, -1, 0, 17);
  brazier(-16, 34, 1, 0, 16);
  return lamps;
}

// The light each kind of lamp throws: colour, how far, how strong.
export const LAMP_LIGHT = {
  torch: { colour: 0xff8c2e, reach: 11, strength: 2.2 },
  lantern: { colour: 0xffab4a, reach: 11, strength: 1.9 },
  brazier: { colour: 0xff7422, reach: 14, strength: 2.6 },
};

const WARM = 0xffa755;
const ROSE = 0xc9466e;
const BLUE = 0x5478e8;
const VIOLET = 0x9461e0;
const MOONBOUNCE = 0xa3bbf5;

// Soft light with no lamp of its own: [x, y, z, reach, colour, strength].
export const GLOWS = [
  // Beneath the clerestory windows along the nave, either side of the crossing.
  [12, 24, 21, 20, WARM, 0.9], [-12, 22, 22, 20, BLUE, 1.0],
  [12, 22, -22, 20, VIOLET, 1.0], [-12, 24, -21, 20, ROSE, 0.9],
  // Along the transepts.
  [23, 17, 11, 17, ROSE, 0.8], [23, 20, -11, 17, BLUE, 0.9],
  [-23, 20, 11, 17, VIOLET, 0.9], [-23, 17, -11, 17, WARM, 0.8],
  // Between the tall windows on the two end walls of the transepts.
  [30, 17, 4.2, 12, WARM, 1.1], [30, 8, -4.2, 12, BLUE, 1.2],
  [-30, 17, -4.2, 12, ROSE, 1.1], [-30, 8, 4.2, 12, VIOLET, 1.2],
  // A little moonlight thrown back up from where the beam falls.
  [-6, 6, -34, 18, MOONBOUNCE, 0.45],
  // Candlelight reaching the four piers round the board.
  [11, 3, 11, 13, WARM, 0.85], [-11, 3, 11, 13, WARM, 0.85],
  [11, 3, -11, 13, WARM, 0.85], [-11, 3, -11, 13, WARM, 0.85],
];
