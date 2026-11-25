// Two ways of not doing work: drawing no more pixels than a modest graphics chip
// can fill in time, and redrawing shadows only when something has moved. Pure
// logic.

// For each quality level: the most pixels to draw, and the sharpest ratio.
const BUDGETS = [
  { pixels: 1.75e6, ratio: 1.35 },
  { pixels: 1.35e6, ratio: 1.15 },
  { pixels: 1.1e6, ratio: 1 },
  { pixels: 0.8e6, ratio: 0.85 },
];
const SOFTEST = 0.6;

// Drawn pixels per screen unit for a view `width` by `height` of those units.
// A large window on a sharp screen is what makes a frame slow, so the ratio
// comes down as the window grows.
export function pixelRatioFor(level, deviceRatio, width, height) {
  const { pixels, ratio } = BUDGETS[level];
  const area = width * height;
  const fits = area > 0 ? Math.sqrt(pixels / area) : ratio;
  return Math.max(Math.min(SOFTEST, deviceRatio), Math.min(deviceRatio, ratio, fits));
}

// A number that changes when anything under `roots` appears, goes, is hidden,
// or moves. Each node needs { id, visible, position, quaternion, scale,
// children }.
export function poseOf(roots) {
  let hash = 0;
  const mix = (value) => { hash = (Math.imul(hash, 31) + (Math.round(value * 2048) | 0)) | 0; };
  const visit = (node) => {
    mix(node.id);
    mix(node.visible ? 1 : 0);
    const { position: p, quaternion: q, scale: s } = node;
    mix(p.x); mix(p.y); mix(p.z);
    mix(q.x); mix(q.y); mix(q.z); mix(q.w);
    mix(s.x); mix(s.y); mix(s.z);
    for (const child of node.children) visit(child);
  };
  for (const root of roots) visit(root);
  return hash;
}

// Says, once a frame, whether the shadows need drawing again.
export function createShadowWatch(roots) {
  let last = null;
  let wasBusy = false;
  return (busy) => {
    const pose = poseOf(roots);
    // An effect can change a shadow without moving anything, so redraw all
    // through it, and once more after it ends.
    const redraw = busy || wasBusy || pose !== last;
    last = pose;
    wasBusy = busy;
    return redraw;
  };
}
