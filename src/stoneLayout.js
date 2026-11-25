// Lays out a wall of coursed stone as rectangles that tile in both directions.
// Pure logic, so the layout can be tested without a canvas.
import { seededRandom } from './textures.js';

const between = (random, min, max) => min + random() * (max - min);

// Courses of different heights, filled with blocks of different widths. Now and
// then a larger stone rises through two courses.
export function layoutWall(size, seed, {
  course = [58, 118], width = [96, 300], tall = 0.07,
} = {}) {
  const random = seededRandom(seed);

  const heights = [];
  let used = 0;
  while (used < size) {
    const height = Math.round(between(random, ...course));
    heights.push(Math.min(height, size - used));
    used += height;
  }
  // A sliver left at the top joins the course below it.
  if (heights.at(-1) < course[0] * 0.7) heights[heights.length - 2] += heights.pop();

  const blocks = [];
  // Stretches of the next course already filled by tall stones, as [from, to].
  let taken = [];
  let y = 0;
  heights.forEach((height, row) => {
    const above = [];
    const start = Math.floor(random() * size);
    // The free stretches of this course, walked once around from `start`.
    const busy = taken.map(([from, to]) => [((from - start) % size + size) % size, to - from])
      .sort((a, b) => a[0] - b[0]);
    const free = [];
    let at = 0;
    for (const [from, length] of busy) {
      if (from > at) free.push([at, Math.min(from, size)]);
      at = Math.max(at, from + length);
    }
    // A tall stone that wraps past the start covers the beginning too.
    const wrapped = busy.reduce((end, [from, length]) => Math.max(end, from + length - size), 0);
    if (at < size) free.push([at, size]);
    for (let [from, to] of free) {
      from = Math.max(from, wrapped);
      while (to - from > 0) {
        let span = Math.round(between(random, ...width));
        // Do not leave a sliver at the end of a stretch.
        if (to - from - span < width[0]) span = to - from;
        const doubled = row < heights.length - 1 && span >= width[0] && random() < tall;
        const x = (start + from) % size;
        blocks.push({ x, y, width: span, height: doubled ? height + heights[row + 1] : height });
        if (doubled) above.push([x, x + span]);
        from += span;
      }
    }
    taken = above;
    y += height;
  });
  return blocks;
}
