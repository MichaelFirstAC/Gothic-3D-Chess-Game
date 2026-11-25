// The measurements of the broken east window and of the moon beyond it. Pure
// data and arithmetic, so that the wall, the glass, the moon and the moonlight
// all agree, and so that it can be tested.
import { seededRandom } from './textures.js';

// The middle of the window, on the outer face of the east wall.
export const WINDOW = { x: 0, y: 22.7, z: -52.6 };
// Half-width of the square that holds the whole opening.
export const REACH = 9;
const HOLE = 7.45;

// The moon is in the sky with the stars, immeasurably far off: all it has is
// the direction it lies in and how wide it looks (in radians). It stands where
// the broken wall cuts a little off it, seen from low beside the board.
export const MOON_DIR = (() => {
  const [x, y, z] = [0.05, 0.318, -0.947];
  const length = Math.hypot(x, y, z);
  return { x: x / length, y: y / length, z: z / length };
})();
export const MOON_SIZE = 0.043;

// Moonlight arrives as parallel rays, straight from there.
export const MOONLIGHT = { x: -MOON_DIR.x, y: -MOON_DIR.y, z: -MOON_DIR.z };

// The broken edge of the opening, as { angle, radius } all the way round, with a
// few deep bites where whole stones have gone.
export function holeEdge(seed = 29, points = 96) {
  const random = seededRandom(seed);
  const bites = [[0.55, 0.9, 0.2], [2.45, 0.75, 0.28], [3.9, 1.05, 0.24], [5.3, 0.5, 0.16]];
  return Array.from({ length: points }, (_, i) => {
    const angle = (i / points) * Math.PI * 2;
    let radius = HOLE + (random() - 0.5) * 0.42;
    for (const [at, depth, width] of bites) {
      const away = Math.abs(Math.atan2(Math.sin(angle - at), Math.cos(angle - at)));
      if (away < width) radius += depth * (1 - away / width) * (0.7 + random() * 0.5);
    }
    return { angle, radius: Math.min(radius, REACH - 0.4) };
  });
}

// Spokes snapped off short: [angle, from radius, to radius, thickness].
export const SPOKES = [
  [2.75, 7.7, 2.9, 0.23], [3.3, 7.7, 4.4, 0.2], [3.85, 7.7, 1.5, 0.24], [4.4, 7.7, 4.4, 0.2],
  [4.95, 7.7, 5.9, 0.2], [5.6, 7.7, 3.6, 0.22], [6.2, 7.7, 6.2, 0.2], [1.75, 7.7, 5.4, 0.2],
  [2.2, 7.7, 6.4, 0.18], [1.15, 7.7, 6.5, 0.19],
];
// What still hangs of the middle ring: [radius, thickness, from angle, length].
export const ARCS = [[4.5, 0.17, 2.75, 1.65], [4.5, 0.17, 5.35, 0.55]];

const JEWELS = [0x8a1634, 0x1f3c94, 0x5a2278, 0x12604f, 0xa5741a];

// The teeth of glass that have not yet fallen: { corners: [[x, y]], colour }.
export function glassShards(seed = 83) {
  const random = seededRandom(seed);
  const between = (min, max) => min + random() * (max - min);
  const shards = [];
  // [angle round the window, how many panes hang there]
  for (const [at, count] of [[2.05, 5], [2.9, 3], [3.45, 6], [4.35, 5], [4.95, 2], [5.9, 4]]) {
    for (let i = 0; i < count; i++) {
      const angle = at + (i - count / 2) * 0.13 + between(-0.03, 0.03);
      const rim = HOLE + 0.6;
      const tip = HOLE - between(0.5, 2.9);
      const point = (a, r) => [Math.cos(a) * r, Math.sin(a) * r];
      shards.push({
        corners: [
          point(angle - 0.072, rim),
          point(angle - between(0.02, 0.085), between(tip, HOLE - 0.2)),
          point(angle + between(-0.05, 0.05), tip),
          point(angle + between(0.02, 0.075), between(tip + 0.3, HOLE)),
          point(angle + 0.072, rim),
        ],
        colour: JEWELS[Math.floor(random() * JEWELS.length)],
      });
    }
  }
  return shards;
}
