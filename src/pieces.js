// Procedural gothic chess set: octagonal plinths, lancet windows, buttresses,
// pinnacles and spires. One board square is 1 unit; pieces face +z.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TAU = Math.PI * 2;

export function createMaterials() {
  const set = (body, trim, glow, voidColor) => ({
    body: new THREE.MeshPhysicalMaterial(body),
    trim: new THREE.MeshStandardMaterial(trim),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: glow, emissiveIntensity: 2.4 }),
    void: new THREE.MeshStandardMaterial({ color: voidColor, roughness: 0.95, metalness: 0 }),
  });
  return {
    w: set(
      { color: 0xd8ccae, roughness: 0.42, metalness: 0.04, clearcoat: 0.35, clearcoatRoughness: 0.35 },
      { color: 0xc09a4e, roughness: 0.34, metalness: 0.95 },
      0xffa42e, 0x2a2117,
    ),
    b: set(
      { color: 0x24212b, roughness: 0.3, metalness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.22 },
      { color: 0x93141f, roughness: 0.32, metalness: 0.88 },
      0xff1a1a, 0x050406,
    ),
  };
}

// Collects geometry per material, then merges each bucket into a single mesh.
class Sculpture {
  constructor() {
    this.parts = { body: [], trim: [], glow: [], void: [] };
  }

  add(slot, geometry, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')),
      new THREE.Vector3(sx, sy, sz),
    ));
    this.parts[slot].push(g);
    return this;
  }

  // Places the same part `count` times around the vertical axis, facing outward.
  ring(slot, geometry, count, radius, y, { phase = 0, tilt = 0, ...rest } = {}) {
    for (let i = 0; i < count; i++) {
      const a = phase + (i / count) * TAU;
      this.add(slot, geometry, { ...rest, x: Math.sin(a) * radius, y, z: Math.cos(a) * radius, ry: a, rx: tilt });
    }
    return this;
  }

  build(materials) {
    const group = new THREE.Group();
    for (const [slot, list] of Object.entries(this.parts)) {
      if (!list.length) continue;
      const mesh = new THREE.Mesh(mergeGeometries(list), materials[slot]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

function faceted(geometry) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  g.computeVertexNormals();
  return g;
}

// Surface of revolution from [radius, height] pairs. Eight sides gives crisp
// octagonal masonry; many sides gives a smooth turned form.
function turned(profile, sides = 8) {
  const g = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), sides, Math.PI / 8);
  return sides <= 12 ? faceted(g) : g;
}

const cone = (radius, height, sides = 6) =>
  faceted(new THREE.ConeGeometry(radius, height, sides).translate(0, height / 2, 0));
const post = (top, bottom, height, sides = 6) =>
  faceted(new THREE.CylinderGeometry(top, bottom, height, sides).translate(0, height / 2, 0));
const ball = (radius) => new THREE.SphereGeometry(radius, 14, 10);
const gem = (radius) => faceted(new THREE.OctahedronGeometry(radius));
const band = (radius, tube, sides = 8) =>
  faceted(new THREE.TorusGeometry(radius, tube, 6, sides).rotateX(Math.PI / 2).rotateY(Math.PI / 8));
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Outline of a pointed (lancet) arch standing on y = 0.
function lancetPath(path, w, h) {
  const half = w / 2;
  const spring = h * 0.55;
  path.moveTo(-half, 0);
  path.lineTo(-half, spring);
  path.quadraticCurveTo(-half, h * 0.85, 0, h);
  path.quadraticCurveTo(half, h * 0.85, half, spring);
  path.lineTo(half, 0);
  path.closePath();
  return path;
}

function extrude(shape, depth, bevel = 0.006) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10,
  }).translate(0, 0, -depth / 2);
}

const lancet = (w, h, depth = 0.012) => extrude(lancetPath(new THREE.Shape(), w, h), depth, 0);

function lancetFrame(w, h, rim = 0.018, depth = 0.025) {
  const shape = lancetPath(new THREE.Shape(), w + rim * 2, h + rim * 1.6);
  const hole = new THREE.Path();
  lancetPath(hole, w, h);
  shape.holes.push(hole);
  return extrude(shape, depth, 0.003);
}

// Blind windows set into the faces of an octagonal shaft.
function windows(s, { count, radius, y, w, h, phase = 0, lit = false }) {
  s.ring(lit ? 'glow' : 'void', lancet(w, h), count, radius, y, { phase });
  s.ring('trim', lancetFrame(w, h, 0.012, 0.016), count, radius + 0.008, y, { phase });
}

// A slender pier with a pointed cap and finial.
function pinnacles(s, { count, radius, y, height, width = 0.028, phase = 0 }) {
  s.ring('body', post(width, width * 1.15, height * 0.55, 4), count, radius, y, { phase });
  s.ring('body', cone(width * 1.35, height * 0.45, 4), count, radius, y + height * 0.55, { phase });
  s.ring('trim', gem(width * 0.65), count, radius, y + height * 1.02, { phase });
}

function flyingButtresses(s, { count, outer, inner, base, top, phase = 0 }) {
  const arc = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, base + (top - base) * 0.45, outer),
    new THREE.Vector3(0, top, outer * 0.95),
    new THREE.Vector3(0, top, inner),
  );
  s.ring('body', new THREE.TubeGeometry(arc, 16, 0.016, 6), count, 0, 0, { phase });
  pinnacles(s, { count, radius: outer, y: base, height: (top - base) * 0.78, width: 0.024, phase });
}

// Shared stepped octagonal plinth. Its top is at y = 0.2.
function plinth(s, r) {
  s.add('body', turned([
    [0, 0], [r, 0], [r, 0.06], [r * 0.9, 0.075], [r * 0.9, 0.095],
    [r * 0.8, 0.13], [r * 0.7, 0.16], [r * 0.72, 0.2], [0, 0.2],
  ]));
  s.add('trim', band(r * 0.92, 0.014), { y: 0.082 });
  s.ring('trim', gem(0.018), 8, r * 0.9, 0.037);
}

function gothicCross(s, y, size) {
  const arm = new THREE.Shape();
  // One flared arm ending in a point, mirrored four ways.
  arm.moveTo(-0.014 * size, 0);
  arm.lineTo(-0.02 * size, 0.07 * size);
  arm.lineTo(-0.05 * size, 0.09 * size);
  arm.lineTo(0, 0.14 * size);
  arm.lineTo(0.05 * size, 0.09 * size);
  arm.lineTo(0.02 * size, 0.07 * size);
  arm.lineTo(0.014 * size, 0);
  arm.closePath();
  const g = extrude(arm, 0.03 * size);
  const centre = y + 0.14 * size;
  s.add('trim', g, { y: centre });
  s.add('trim', g, { y: centre, rz: Math.PI / 2, sx: 0.85, sy: 0.85 });
  s.add('trim', g, { y: centre, rz: -Math.PI / 2, sx: 0.85, sy: 0.85 });
  s.add('trim', box(0.028 * size, 0.15 * size, 0.03 * size), { y: y + 0.07 * size });
  s.add('glow', gem(0.026 * size), { y: centre, sz: 1.2 });
}

// A hooded acolyte with eyes burning in the cowl.
function pawn() {
  const s = new Sculpture();
  plinth(s, 0.3);
  s.add('body', turned([[0, 0.2], [0.19, 0.2], [0.15, 0.27], [0.11, 0.4], [0.092, 0.52], [0, 0.52]]));
  s.ring('body', cone(0.024, 0.22, 4), 8, 0.188, 0.2, { phase: Math.PI / 8, tilt: -0.28 });
  s.add('body', turned([[0, 0.5], [0.175, 0.5], [0.12, 0.555], [0.07, 0.58], [0, 0.58]]));
  s.add('trim', band(0.168, 0.012), { y: 0.508 });
  const hood = [[0.07, 0.56], [0.135, 0.62], [0.142, 0.7], [0.115, 0.77], [0.06, 0.84], [0.018, 0.9], [0, 0.93]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  const gap = 1.5;
  s.add('body', new THREE.LatheGeometry(hood, 28, gap / 2, TAU - gap));
  s.add('void', ball(0.108), { y: 0.69, sy: 1.15 });
  for (const x of [-0.036, 0.036]) s.add('glow', ball(0.014), { x, y: 0.705, z: 0.101, sy: 0.6 });
  s.add('trim', gem(0.028), { y: 0.945, sy: 1.6 });
  s.add('trim', gem(0.026), { y: 0.535, z: 0.152 });
  return s;
}

// A cathedral tower with lancet windows, crenellations and corner pinnacles.
function rook() {
  const s = new Sculpture();
  plinth(s, 0.38);
  s.add('body', turned([
    [0, 0.2], [0.27, 0.2], [0.235, 0.28], [0.215, 0.34], [0.205, 0.82],
    [0.23, 0.85], [0.285, 0.9], [0.285, 0.99], [0.215, 0.99], [0.2, 0.95], [0, 0.95],
  ]));
  // Radius to the middle of a face of the octagon.
  const face = 0.21 * Math.cos(Math.PI / 8);
  windows(s, { count: 4, radius: face, y: 0.44, w: 0.07, h: 0.24 });
  windows(s, { count: 4, radius: face, y: 0.52, w: 0.042, h: 0.16, phase: Math.PI / 4, lit: true });
  s.add('trim', band(0.222, 0.013), { y: 0.35 });
  s.add('trim', band(0.218, 0.011), { y: 0.78 });
  s.add('trim', band(0.285, 0.012), { y: 0.9 });
  s.ring('body', box(0.095, 0.12, 0.06), 4, 0.245, 1.04);
  s.ring('trim', cone(0.034, 0.055, 4), 4, 0.245, 1.1);
  pinnacles(s, { count: 4, radius: 0.265, y: 0.97, height: 0.34, width: 0.036, phase: Math.PI / 4 });
  s.add('body', post(0.13, 0.15, 0.17, 8), { y: 0.95 });
  s.add('body', cone(0.17, 0.36, 8), { y: 1.11 });
  s.add('trim', band(0.15, 0.011), { y: 1.13 });
  s.add('trim', post(0.006, 0.01, 0.1), { y: 1.45 });
  s.add('trim', gem(0.028), { y: 1.54, sy: 1.5 });
  flyingButtresses(s, { count: 4, outer: 0.31, inner: 0.19, base: 0.17, top: 0.74, phase: Math.PI / 4 });
  return s;
}

// An armoured nightmare steed with a thorned mane.
function knight() {
  const s = new Sculpture();
  plinth(s, 0.35);
  s.add('body', turned([[0, 0.2], [0.23, 0.2], [0.2, 0.25], [0.235, 0.3], [0.2, 0.33], [0, 0.33]]));
  s.add('trim', band(0.232, 0.013), { y: 0.3 });

  // Head in profile: x runs toward the muzzle, y is height.
  const head = new THREE.Shape();
  head.moveTo(-0.19, 0.3);
  head.bezierCurveTo(-0.27, 0.55, -0.25, 0.86, -0.1, 1.04); // back of the neck
  head.lineTo(-0.105, 1.25); // ear
  head.lineTo(-0.02, 1.11);
  head.bezierCurveTo(0.05, 1.12, 0.11, 1.06, 0.14, 0.99); // brow
  head.bezierCurveTo(0.19, 0.9, 0.27, 0.82, 0.33, 0.75); // bridge of the nose
  head.quadraticCurveTo(0.37, 0.69, 0.32, 0.63); // muzzle
  head.lineTo(0.22, 0.62);
  head.lineTo(0.27, 0.67); // open mouth
  head.lineTo(0.13, 0.7);
  head.bezierCurveTo(0.03, 0.72, -0.02, 0.68, 0.0, 0.6); // jaw
  head.bezierCurveTo(0.2, 0.5, 0.21, 0.4, 0.17, 0.3); // chest
  head.closePath();
  const turn = -Math.PI / 2; // shape x -> world +z
  // Carve some depth into the slab: broad at the chest, narrow at ears and muzzle.
  const skull = extrude(head, 0.1, 0.04);
  const points = skull.attributes.position;
  const clamp = THREE.MathUtils.clamp;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const y = points.getY(i);
    const muzzle = y > 0.55 ? clamp((x - 0.1) / 0.27, 0, 1) * 0.35 : 0;
    const ears = clamp((y - 1.08) / 0.18, 0, 1) * 0.5;
    const chest = clamp((0.62 - y) / 0.32, 0, 1) * 0.4;
    points.setZ(i, points.getZ(i) * (1 - muzzle - ears + chest));
  }
  s.add('body', faceted(skull), { ry: turn });
  // Neck, cheek and brow muscles.
  s.add('body', ball(0.1), { y: 0.62, z: -0.09, rx: -0.2, sx: 1.12, sy: 2.5, sz: 1.15 });
  s.add('body', ball(0.1), { y: 0.88, z: 0.02, rx: 0.65, sx: 1.04, sy: 1.35, sz: 0.95 });
  // Chamfron: a spined plate running down the face.
  const ridge = new THREE.CatmullRomCurve3([[1.1, 0.02], [1.04, 0.13], [0.93, 0.225], [0.82, 0.31], [0.74, 0.372]]
    .map(([y, z]) => new THREE.Vector3(0, y, z)));
  s.add('trim', new THREE.TubeGeometry(ridge, 24, 0.02, 6));

  for (const side of [-1, 1]) {
    const x = side * 0.112;
    s.add('void', ball(0.036), { x: side * 0.1, y: 0.965, z: 0.065, sx: 0.5 });
    s.add('glow', ball(0.02), { x, y: 0.965, z: 0.065, sx: 0.55, sy: 0.65 });
    s.add('void', ball(0.017), { x: side * 0.07, y: 0.72, z: 0.3, sx: 0.5 });
    s.add('body', cone(0.034, 0.2, 5), { x: side * 0.055, y: 1.075, z: -0.06, rx: -0.22, rz: -side * 0.2 });
    // Curled ram horns.
    const horn = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x * 0.8, 1.05, 0.0),
      new THREE.Vector3(side * 0.17, 1.07, -0.1),
      new THREE.Vector3(side * 0.19, 0.95, -0.15),
      new THREE.Vector3(side * 0.17, 0.89, -0.06),
    ]);
    s.add('trim', new THREE.TubeGeometry(horn, 20, 0.018, 6));
    // Bridle straps.
    s.add('trim', box(0.012, 0.022, 0.2), { x: side * 0.088, y: 0.8, z: 0.19, rx: 0.62, ry: side * -0.12 });
    s.add('trim', gem(0.026), { x: side * 0.115, y: 0.86, z: 0.09 });
    // Overlapping armour lames on the neck.
    [[0.46, -0.06], [0.57, -0.1], [0.68, -0.11], [0.78, -0.1]].forEach(([y, z], i) => {
      s.add('trim', box(0.014, 0.02, 0.19 - i * 0.015), { x: side * (0.116 - i * 0.004), y, z, rx: -0.35 });
    });
  }
  s.add('trim', box(0.165, 0.022, 0.022), { y: 0.765, z: 0.265 });
  s.add('trim', cone(0.026, 0.13, 4), { y: 1.07, z: 0.075, rx: 0.65 });

  // Mane of thorns along the back of the neck: [forward offset, height, lean].
  [[-0.1, 1.07, -0.5], [-0.17, 0.99, -0.85], [-0.215, 0.89, -1.1], [-0.245, 0.78, -1.3],
    [-0.255, 0.66, -1.45], [-0.25, 0.54, -1.6], [-0.235, 0.43, -1.75]]
    .forEach(([z, y, lean], i) => {
      s.add(i % 2 ? 'trim' : 'body', cone(0.04, 0.17 - i * 0.008, 4), { y, z: z + 0.025, rx: lean, sx: 0.6 });
    });

  windows(s, { count: 4, radius: 0.215, y: 0.215, w: 0.05, h: 0.08, phase: Math.PI / 4 });
  return s;
}

// A tall pointed mitre pierced by tracery, crowned with a cross.
function bishop() {
  const s = new Sculpture();
  plinth(s, 0.33);
  s.add('body', turned([[0, 0.2], [0.215, 0.2], [0.15, 0.29], [0.1, 0.5], [0.08, 0.78], [0, 0.78]]));
  flyingButtresses(s, { count: 4, outer: 0.24, inner: 0.085, base: 0.17, top: 0.7, phase: Math.PI / 4 });
  windows(s, { count: 4, radius: 0.112, y: 0.37, w: 0.034, h: 0.17 });
  s.add('body', turned([[0, 0.76], [0.2, 0.78], [0.14, 0.82], [0.085, 0.86], [0, 0.86]]));
  s.add('trim', band(0.192, 0.013), { y: 0.783 });
  pinnacles(s, { count: 8, radius: 0.155, y: 0.79, height: 0.13, width: 0.014, phase: Math.PI / 8 });
  s.add('body', turned([
    [0, 0.84], [0.09, 0.85], [0.155, 0.95], [0.168, 1.07], [0.14, 1.2], [0.08, 1.32], [0.025, 1.4], [0, 1.43],
  ], 32), { sz: 0.8 });
  for (const z of [-1, 1]) {
    const ry = z > 0 ? 0 : Math.PI;
    s.add('glow', lancet(0.05, 0.2), { y: 0.99, z: z * 0.134, rx: z * -0.05, ry });
    s.add('trim', lancetFrame(0.05, 0.2, 0.016, 0.03), { y: 0.99, z: z * 0.137, rx: z * -0.05, ry });
    s.add('trim', box(0.012, 0.18, 0.016), { y: 1.08, z: z * 0.147 });
    s.add('trim', box(0.066, 0.012, 0.016), { y: 1.1, z: z * 0.147 });
  }
  s.add('trim', band(0.1, 0.012, 24), { y: 0.865, sz: 0.85 });
  s.add('trim', ball(0.038), { y: 1.44 });
  gothicCross(s, 1.46, 0.72);
  return s;
}

// A waisted figure under a crown of tall thorned spires.
function queen() {
  const s = new Sculpture();
  plinth(s, 0.39);
  s.add('body', turned([
    [0, 0.2], [0.265, 0.2], [0.2, 0.28], [0.125, 0.5], [0.09, 0.78], [0.095, 0.92], [0.13, 1.08], [0, 1.08],
  ]));
  flyingButtresses(s, { count: 8, outer: 0.29, inner: 0.095, base: 0.17, top: 0.82, phase: Math.PI / 8 });
  windows(s, { count: 8, radius: 0.155, y: 0.31, w: 0.036, h: 0.15 });
  s.add('trim', band(0.098, 0.016), { y: 0.8 });
  s.add('body', turned([[0, 1.04], [0.2, 1.09], [0.15, 1.13], [0, 1.13]]));
  s.add('trim', band(0.196, 0.014), { y: 1.09 });
  s.add('body', turned([[0, 1.12], [0.12, 1.12], [0.14, 1.22], [0.19, 1.3], [0.16, 1.31], [0.11, 1.25], [0, 1.25]]));
  s.add('trim', band(0.188, 0.012, 16), { y: 1.3 });
  s.ring('glow', lancet(0.026, 0.07), 8, 0.136, 1.155);
  // Alternating tall and short thorns, splayed outward.
  s.ring('trim', cone(0.03, 0.38, 4), 8, 0.17, 1.28, { tilt: 0.26 });
  s.ring('body', cone(0.026, 0.23, 4), 8, 0.172, 1.28, { phase: Math.PI / 8, tilt: 0.42 });
  s.ring('glow', gem(0.018), 8, 0.268, 1.64);
  s.add('body', turned([[0, 1.24], [0.085, 1.27], [0.055, 1.38], [0.035, 1.5], [0, 1.5]]));
  s.add('trim', ball(0.05), { y: 1.53 });
  s.add('trim', cone(0.022, 0.28, 6), { y: 1.56 });
  s.add('glow', gem(0.026), { y: 1.87, sy: 1.5 });
  return s;
}

// The tallest piece: an arched imperial crown surmounted by a gothic cross.
function king() {
  const s = new Sculpture();
  plinth(s, 0.4);
  s.add('body', turned([
    [0, 0.2], [0.28, 0.2], [0.22, 0.28], [0.16, 0.44], [0.13, 0.96], [0.145, 1.08], [0.17, 1.16], [0, 1.16],
  ]));
  flyingButtresses(s, { count: 8, outer: 0.3, inner: 0.13, base: 0.17, top: 0.9, phase: Math.PI / 8 });
  const face = Math.cos(Math.PI / 8);
  windows(s, { count: 8, radius: 0.146 * face + 0.006, y: 0.55, w: 0.04, h: 0.27 });
  s.add('trim', band(0.162, 0.016), { y: 0.45 });
  s.add('trim', band(0.136, 0.014), { y: 0.97 });
  s.add('body', turned([[0, 1.12], [0.23, 1.18], [0.17, 1.22], [0, 1.22]]));
  s.add('trim', band(0.226, 0.015), { y: 1.18 });
  pinnacles(s, { count: 8, radius: 0.19, y: 1.19, height: 0.15, width: 0.016, phase: Math.PI / 8 });
  s.add('body', turned([[0, 1.2], [0.14, 1.2], [0.155, 1.33], [0.2, 1.42], [0, 1.42]]));
  s.add('trim', band(0.198, 0.016, 16), { y: 1.42 });
  s.ring('glow', gem(0.026), 8, 0.16, 1.32, { sy: 1.4 });
  s.ring('trim', cone(0.03, 0.17, 4), 8, 0.2, 1.42, { tilt: 0.2 });
  // Eight ribs rising from the circlet to meet under the cross.
  const rib = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 1.42, 0.19),
    new THREE.Vector3(0, 1.62, 0.215),
    new THREE.Vector3(0, 1.64, 0.07),
    new THREE.Vector3(0, 1.74, 0),
  );
  s.ring('trim', new THREE.TubeGeometry(rib, 20, 0.014, 6), 8, 0, 0, { phase: Math.PI / 8 });
  s.add('void', ball(0.15), { y: 1.44, sy: 1.1 });
  s.add('trim', ball(0.048), { y: 1.75 });
  gothicCross(s, 1.77, 1.15);
  return s;
}

const BUILDERS = { p: pawn, r: rook, n: knight, b: bishop, q: queen, k: king };

// Returns make(piece) for FEN piece letters. Geometry is built once and shared.
export function createPieceFactory() {
  const materials = createMaterials();
  const cache = new Map();
  return function make(piece) {
    if (!cache.has(piece)) {
      const type = piece.toLowerCase();
      const color = piece === type ? 'b' : 'w';
      const group = BUILDERS[type]().build(materials[color]);
      // White advances toward -z; black toward +z. Knights are angled slightly
      // so their profile reads from either player's seat.
      let facing = color === 'w' ? Math.PI : 0;
      if (type === 'n') facing += color === 'w' ? 0.95 : -0.95;
      group.rotation.y = facing;
      cache.set(piece, group);
    }
    return cache.get(piece).clone();
  };
}
