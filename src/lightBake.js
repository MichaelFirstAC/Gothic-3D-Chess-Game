// Works out once, before play, all the still light in the building, and keeps it
// in a grid through space. A shader then reads any number of lamps for the price
// of two lookups. Pure arithmetic.

// The grid: its lowest corner, how many points each way, and their spacing.
export const GRID = { min: [-37, -6, -57], size: [75, 46, 115], step: 1 };

// lights: [{ x, y, z, reach, colour: [r, g, b], fire }], colours already at full
// strength and `fire` true for flames. Returns two grids of four numbers a point:
//   light  r, g, b, and the share of it that comes from fire (so it can flicker)
//   way    the average direction toward that light, shorter where it comes from
//          several sides
export function bakeLight(lights, grid = GRID) {
  const { min, size: [nx, ny, nz], step } = grid;
  const points = nx * ny * nz;
  const light = new Float32Array(points * 4);
  const way = new Float32Array(points * 4);
  const total = new Float32Array(points);
  const burning = new Float32Array(points);

  for (const { x, y, z, reach, colour, fire } of lights) {
    // Only the points this light can reach.
    const span = [x, y, z].map((v, axis) => [
      Math.max(0, Math.ceil((v - reach - min[axis]) / step)),
      Math.min(grid.size[axis] - 1, Math.floor((v + reach - min[axis]) / step)),
    ]);
    const brightness = (colour[0] + colour[1] + colour[2]) / 3;
    for (let k = span[2][0]; k <= span[2][1]; k++) {
      for (let j = span[1][0]; j <= span[1][1]; j++) {
        for (let i = span[0][0]; i <= span[0][1]; i++) {
          const dx = x - (min[0] + i * step);
          const dy = y - (min[1] + j * step);
          const dz = z - (min[2] + k * step);
          const away = Math.hypot(dx, dy, dz);
          if (away >= reach) continue;
          const falloff = (1 - away / reach) ** 2;
          const at = (k * ny + j) * nx + i;
          for (let c = 0; c < 3; c++) light[at * 4 + c] += colour[c] * falloff;
          const weight = brightness * falloff;
          total[at] += weight;
          if (fire) burning[at] += weight;
          if (away > 1e-3) {
            way[at * 4] += (dx / away) * weight;
            way[at * 4 + 1] += (dy / away) * weight;
            way[at * 4 + 2] += (dz / away) * weight;
          }
        }
      }
    }
  }
  for (let at = 0; at < points; at++) {
    if (!total[at]) continue;
    for (let c = 0; c < 3; c++) way[at * 4 + c] /= total[at];
    light[at * 4 + 3] = burning[at] / total[at];
  }
  return { light, way };
}
