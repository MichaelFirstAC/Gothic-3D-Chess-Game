// Which piece the pointer is over, found cheaply. Testing a ray against every
// triangle of thirty-two carved pieces takes many milliseconds, far too long to
// do while the mouse moves. A chess piece is close to a solid of revolution, so
// each is stood in for by a short stack of cylinders that follows its outline.
// Pure geometry.

const BANDS = 14;
const shapes = new WeakMap();

// The stack for a piece whose meshes share its own upright axis: for each band
// of height, the farthest that anything in it reaches from the axis.
function stackOf(piece) {
  const key = piece.children[0].geometry;
  let stack = shapes.get(key);
  if (stack) return stack;
  const triangles = [];
  let top = 0;
  for (const { geometry } of piece.children) {
    const position = geometry.attributes.position;
    const index = geometry.index?.array;
    const count = index ? index.length : position.count;
    for (let i = 0; i < count; i += 3) {
      let low = Infinity;
      let high = -Infinity;
      let reach = 0;
      for (let k = 0; k < 3; k++) {
        const v = index ? index[i + k] : i + k;
        const y = position.getY(v);
        low = Math.min(low, y);
        high = Math.max(high, y);
        reach = Math.max(reach, Math.hypot(position.getX(v), position.getZ(v)));
      }
      triangles.push(low, high, reach);
      top = Math.max(top, high);
    }
  }
  const height = top / BANDS;
  const radius = new Array(BANDS).fill(0);
  for (let i = 0; i < triangles.length; i += 3) {
    const first = Math.max(0, Math.floor(triangles[i] / height));
    const last = Math.min(BANDS - 1, Math.floor((triangles[i + 1] - 1e-6) / height));
    for (let band = first; band <= last; band++) radius[band] = Math.max(radius[band], triangles[i + 2]);
  }
  stack = { height, radius };
  shapes.set(key, stack);
  return stack;
}

// How far along the ray the cylinder from `y0` to `y1` is first met, or
// Infinity. `o` and `d` are the ray's start and direction.
function meet(o, d, y0, y1, radius) {
  let best = Infinity;
  // Its curved side.
  const a = d.x * d.x + d.z * d.z;
  const b = 2 * (o.x * d.x + o.z * d.z);
  const c = o.x * o.x + o.z * o.z - radius * radius;
  const under = b * b - 4 * a * c;
  if (a > 1e-12 && under >= 0) {
    const t = (-b - Math.sqrt(under)) / (2 * a);
    const y = o.y + d.y * t;
    if (t > 0 && y >= y0 && y <= y1) best = t;
  }
  // Its two flat ends.
  if (Math.abs(d.y) > 1e-9) {
    for (const end of [y0, y1]) {
      const t = (end - o.y) / d.y;
      if (t > 0 && t < best && Math.hypot(o.x + d.x * t, o.z + d.z * t) <= radius) best = t;
    }
  }
  return best;
}

// The distance along `ray` ({ origin, direction }) to a piece standing upright
// at its position with an even scale, or Infinity if it misses.
export function distanceToPiece(ray, piece) {
  const scale = piece.scale.x || 1;
  const { origin, direction } = ray;
  const o = {
    x: (origin.x - piece.position.x) / scale,
    y: (origin.y - piece.position.y) / scale,
    z: (origin.z - piece.position.z) / scale,
  };
  const { height, radius } = stackOf(piece);
  let best = Infinity;
  for (let band = 0; band < radius.length; band++) {
    if (radius[band] > 0) best = Math.min(best, meet(o, direction, band * height, (band + 1) * height, radius[band]));
  }
  return best * scale;
}

// The nearest of `pieces` that the ray meets, or null.
export function nearestPiece(ray, pieces) {
  let found = null;
  let near = Infinity;
  for (const piece of pieces) {
    const distance = distanceToPiece(ray, piece);
    if (distance < near) {
      near = distance;
      found = piece;
    }
  }
  return found;
}
