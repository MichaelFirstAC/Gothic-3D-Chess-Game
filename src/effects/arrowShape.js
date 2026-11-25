// Outline of the L-shaped arrow for knight moves. Pure geometry in board
// coordinates (x, z), so it can be tested without a renderer.

// Only a knight moves one square one way and two the other.
export function isKnightShift(from, to) {
  const files = Math.abs((to & 7) - (from & 7));
  const ranks = Math.abs((to >> 3) - (from >> 3));
  return files * ranks === 2;
}

// Unit directions of the two legs, the long one first.
export function knightLegs(dx, dz) {
  const longIsX = Math.abs(dx) > Math.abs(dz);
  const first = longIsX ? [Math.sign(dx), 0] : [0, Math.sign(dz)];
  const second = longIsX ? [0, Math.sign(dz)] : [Math.sign(dx), 0];
  return { first, second, long: Math.max(Math.abs(dx), Math.abs(dz)), short: Math.min(Math.abs(dx), Math.abs(dz)) };
}

// One closed outline with a mitred corner, relative to the centre of the start
// square. `start` is how far along the first leg the tail begins, and `reach`
// how far past the target square's centre the tip ends.
export function knightArrowOutline(dx, dz, { start, reach, shaft, head, headLength }) {
  const { first: [ax, az], second: [bx, bz], long, short } = knightLegs(dx, dz);
  const at = (along, across, side = [0, 0]) => [along[0] + side[0] * across, along[1] + side[1] * across];
  // Left-hand normals of each leg.
  const n1 = [-az, ax];
  const n2 = [-bz, bx];
  const tail = [ax * start, az * start];
  const corner = [ax * long, az * long];
  const tipAt = short + reach;
  const tip = [corner[0] + bx * tipAt, corner[1] + bz * tipAt];
  const neck = [tip[0] - bx * headLength, tip[1] - bz * headLength];
  // At a right angle the mitre point is offset by both normals at once.
  const mitre = [n1[0] + n2[0], n1[1] + n2[1]];
  return [
    at(tail, shaft, n1),
    at(corner, shaft, mitre),
    at(neck, shaft, n2),
    at(neck, head, n2),
    tip,
    at(neck, -head, n2),
    at(neck, -shaft, n2),
    at(corner, -shaft, mitre),
    at(tail, -shaft, n1),
  ];
}
