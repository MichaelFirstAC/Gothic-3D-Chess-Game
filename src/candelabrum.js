// A Gothic floor candelabrum in aged wrought iron: a turned shaft with moulded
// base, knops and ring mouldings, a flared drip pan, and two curled arms that
// carry the side candles. Its foot stands at y = -0.8.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { canvasTexture, seededRandom } from './textures.js';

const SIDES = 32;

// The shaft in profile, as [radius, height] from the foot to the drip pan.
export const SHAFT_PROFILE = [
  // Stepped, moulded foot.
  [0, -0.8], [0.455, -0.8], [0.472, -0.786], [0.47, -0.766], [0.452, -0.752], [0.405, -0.748],
  [0.398, -0.732], [0.41, -0.716], [0.402, -0.697], [0.38, -0.688], [0.335, -0.682], [0.31, -0.668],
  [0.298, -0.648], [0.312, -0.632], [0.306, -0.614], [0.286, -0.604],
  // A bell curving up into the stem.
  [0.232, -0.59], [0.18, -0.562], [0.142, -0.522], [0.12, -0.474], [0.108, -0.418],
  [0.128, -0.398], [0.14, -0.378], [0.132, -0.358], [0.106, -0.34], [0.08, -0.312],
  [0.069, -0.24], [0.064, -0.06], [0.061, 0.1], [0.062, 0.158],
  // Ring moulding, then the great knop.
  [0.08, 0.17], [0.086, 0.188], [0.08, 0.205], [0.064, 0.214], [0.07, 0.232], [0.098, 0.254],
  [0.122, 0.292], [0.128, 0.322], [0.118, 0.358], [0.092, 0.39], [0.066, 0.412], [0.072, 0.432],
  [0.068, 0.447], [0.056, 0.458], [0.054, 0.6], [0.051, 0.742],
  // Upper ring and a second, smaller knop.
  [0.068, 0.756], [0.075, 0.776], [0.068, 0.796], [0.054, 0.808], [0.058, 0.848],
  [0.082, 0.872], [0.095, 0.898], [0.088, 0.924], [0.062, 0.944], [0.048, 0.972], [0.05, 1.045],
  // The drip pan: a flared dish with a rolled lip.
  [0.064, 1.07], [0.092, 1.1], [0.138, 1.124], [0.19, 1.144], [0.218, 1.166], [0.232, 1.188],
  [0.226, 1.202], [0.212, 1.198], [0.202, 1.184], [0.164, 1.172], [0.09, 1.168], [0, 1.168],
];

// Where the three candles stand, relative to the foot of the candelabrum.
export const SOCKETS = [
  { x: 0, y: 1.17, z: 0 },
  { x: 0.345, y: 1.052, z: 0 },
  { x: -0.345, y: 1.052, z: 0 },
];

// Doubles the points at sharp corners, so mouldings keep crisp edges while the
// curves between them stay smooth.
function crisp(profile, sharpest = 0.75) {
  const result = [];
  profile.forEach((point, i) => {
    result.push(point);
    const a = profile[i - 1];
    const c = profile[i + 1];
    if (!a || !c) return;
    const turn = Math.atan2(c[1] - point[1], c[0] - point[0]) - Math.atan2(point[1] - a[1], point[0] - a[0]);
    if (Math.abs(Math.atan2(Math.sin(turn), Math.cos(turn))) > sharpest) result.push(point);
  });
  return result;
}

const lathe = (profile, sides = SIDES) =>
  new THREE.LatheGeometry(crisp(profile).map(([r, y]) => new THREE.Vector2(r, y)), sides);

// One curled arm in the x-y plane, reaching toward +x.
function arm(side) {
  const curve = (points, radius, segments = 48) => new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(points.map(([x, y]) => new THREE.Vector3(x * side, y, 0))),
    segments, radius, 10,
  );
  // A scroll: a spiral that tightens toward its end.
  const scroll = (cx, cy, radius, from, turns, steps = 14) => Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1);
    const angle = from + turns * Math.PI * 2 * t;
    return [cx + Math.cos(angle) * radius * (1 - t * 0.72), cy + Math.sin(angle) * radius * (1 - t * 0.72)];
  });
  return [
    // The main branch: out from the lower knop, dipping, then up to the cup.
    curve([[0.05, 0.795], [0.13, 0.755], [0.23, 0.77], [0.31, 0.845], [0.345, 0.94], [0.345, 1.02]], 0.019),
    // A scroll curling under the branch.
    curve([[0.06, 0.8], [0.15, 0.755], ...scroll(0.188, 0.685, 0.07, Math.PI / 2, -1.35)], 0.011, 64),
    // A small upper curl beside the stem.
    curve([[0.24, 0.775], ...scroll(0.255, 0.87, 0.055, -Math.PI / 2, -1.2)], 0.009, 48),
    new THREE.SphereGeometry(0.022, 12, 10).translate(0.345 * side, 0.99, 0),
    // A little pan to catch the wax.
    lathe([
      [0, 1.012], [0.02, 1.012], [0.036, 1.022], [0.07, 1.034], [0.098, 1.052], [0.102, 1.064],
      [0.09, 1.062], [0.074, 1.052], [0.04, 1.05], [0, 1.05],
    ], 24).translate(0.345 * side, 0, 0),
  ];
}

// Dark iron with warm rust gathering in the hollows. The tint is carried in
// vertex colours: surfaces tucked in near the axis rust more than proud ones.
function rustTint(geometry, random) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const y = position.getY(i);
    const r = Math.hypot(position.getX(i), position.getZ(i));
    // Faces that look down or sit in a waist hold damp.
    const under = Math.max(0, -normal.getY(i));
    let waist = 0;
    for (const [pr, py] of SHAFT_PROFILE) {
      if (Math.abs(py - y) < 0.035) waist = Math.max(waist, pr - r);
    }
    const noise = 0.5 + 0.5 * Math.sin(y * 37 + position.getX(i) * 53) * Math.sin(position.getZ(i) * 61 + y * 11);
    const rust = THREE.MathUtils.clamp(waist * 14 + under * 0.45 + (noise - 0.72) * 1.2, 0, 1) * (0.75 + random() * 0.25);
    colors.set([1 + rust * 0.9, 1 + rust * 0.12, 1 - rust * 0.28], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function candelabrumGeometry() {
  const parts = [lathe(SHAFT_PROFILE), ...arm(1), ...arm(-1)];
  const merged = mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));
  return rustTint(merged, seededRandom(41));
}

// Mottled, pitted iron.
function ironTexture() {
  const random = seededRandom(613);
  const texture = canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#39332f';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 650; i++) {
      const x = random() * size;
      const y = random() * size;
      const r = 3 + random() ** 2 * 34;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = random();
      g.addColorStop(0, tone < 0.45 ? 'rgba(12,10,10,0.35)' : tone < 0.82 ? 'rgba(98,88,80,0.22)' : 'rgba(112,62,34,0.34)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = random() < 0.7 ? 'rgba(8,6,6,0.5)' : 'rgba(150,128,108,0.3)';
      ctx.fillRect(random() * size, random() * size, 1 + random() * 1.6, 1 + random() * 1.6);
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 3);
  return texture;
}

export function ironMaterial(environment) {
  return new THREE.MeshStandardMaterial({
    map: ironTexture(), vertexColors: true, color: 0xb9ada4,
    metalness: 0.28, roughness: 0.74, envMap: environment, envMapIntensity: 0.28,
  });
}
