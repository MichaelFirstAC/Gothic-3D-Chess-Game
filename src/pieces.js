// Procedural gothic chess set: octagonal plinths, lancet windows, buttresses,
// pinnacles and spires. One board square is 1 unit; pieces face +z.
import * as THREE from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { marbleFinish } from './pieceMarble.js';

const TAU = Math.PI * 2;
// How far the middle of an octagon's face is, for corners 1 from the centre.
const FACE = Math.cos(Math.PI / 8);

export function createMaterials() {
  const set = (body, veins, trim, glow, voidColor) => ({
    body: marbleFinish(new THREE.MeshPhysicalMaterial(body), veins),
    trim: new THREE.MeshStandardMaterial(trim),
    glow: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: glow, emissiveIntensity: 2.0 }),
    void: new THREE.MeshStandardMaterial({ color: voidColor, roughness: 0.95, metalness: 0 }),
  });
  return {
    // Honed ivory marble, full of fine smoky flaws.
    w: set(
      { color: 0xdcd2bf, roughness: 0.44, metalness: 0.05, clearcoat: 0.22, clearcoatRoughness: 0.4 },
      { cloud: 0xbdb2a4, vein: 0x655862, gilt: 0xab8a4a, rim: 0x2a1d10, veinStrength: 0.5 },
      // The brass of the inlay in the slab.
      { color: 0xa8864a, roughness: 0.46, metalness: 0.9 },
      0xffa42e, 0x241c14,
    ),
    // Honed black marble, with pale hairlines.
    b: set(
      { color: 0x1a171d, roughness: 0.38, metalness: 0.16, clearcoat: 0.38, clearcoatRoughness: 0.32 },
      { cloud: 0x29242f, vein: 0x655d6c, gilt: 0x8f7442, rim: 0x35285a, veinStrength: 0.44 },
      { color: 0x74121f, roughness: 0.44, metalness: 0.88 },
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

// The radius of a turned profile at height y, on its first rising run there.
function radiusAt(profile, y) {
  for (let i = 1; i < profile.length; i++) {
    const [[r0, y0], [r1, y1]] = [profile[i - 1], profile[i]];
    if (y1 > y0 && y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  throw new Error(`the profile does not reach ${y}`);
}

// How a face of an eight-sided profile lies between two heights: how far out it
// is at the lower one, and how far it leans (outward is positive). Anything set
// on a tapering face needs both, or one end of it floats.
function faceOf(profile, from, to) {
  const out = radiusAt(profile, from) * FACE;
  return { out, lean: Math.atan2(radiusAt(profile, to) * FACE - out, to - from) };
}

// Outline of a pointed (lancet) arch standing on y = 0, or with its foot raised
// to `sill`.
function lancetPath(path, w, h, sill = 0) {
  const half = w / 2;
  const spring = h * 0.55;
  path.moveTo(-half, sill);
  path.lineTo(-half, spring);
  path.quadraticCurveTo(-half, h * 0.85, 0, h);
  path.quadraticCurveTo(half, h * 0.85, half, spring);
  path.lineTo(half, sill);
  path.closePath();
  return path;
}

function extrude(shape, depth, bevel = 0.006) {
  return new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10,
  }).translate(0, 0, -depth / 2);
}

const lancet = (w, h, depth = 0.004) => extrude(lancetPath(new THREE.Shape(), w, h), depth, 0);

// The frame goes all the way round: two jambs, the arch and the sill.
function lancetFrame(w, h, rim = 0.018, depth = 0.006) {
  const shape = lancetPath(new THREE.Shape(), w + rim * 2, h + rim * 1.6);
  const hole = new THREE.Path();
  lancetPath(hole, w, h, rim * 0.9);
  shape.holes.push(hole);
  return extrude(shape, depth, 0.0015);
}

// A flat strap lying along a surface. Each row is where its two edges touch the
// surface and which way is out from it there.
function ribbon(rows) {
  const corners = rows.map(({ edges, out }) => edges.flatMap((edge) => [
    edge.clone().addScaledVector(out, -0.005),
    edge.clone().addScaledVector(out, 0.006),
  ]));
  const lengths = corners.slice(1).map((row, i) => new ConvexGeometry([...corners[i], ...row]));
  const g = mergeGeometries(lengths);
  // Like every other part, so that they can all be merged.
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}

// Blind windows set into the faces of an octagonal shaft.
function windows(s, { profile, count, y, w, h, phase = 0, lit = false }) {
  const { out, lean } = faceOf(profile, y, y + h);
  s.ring(lit ? 'glow' : 'void', lancet(w, h), count, out + 0.001, y, { phase, tilt: lean });
  s.ring('trim', lancetFrame(w, h, 0.012), count, out + 0.0015, y, { phase, tilt: lean });
}

// A slender pier with a pointed cap and finial. The shaft may be carried down
// to a `foot` below y, to stand on something lower.
function pinnacles(s, { count, radius, y, height, width = 0.028, phase = 0, foot = y }) {
  s.ring('body', post(width, width * 1.15, y + height * 0.55 - foot, 4), count, radius, foot, { phase });
  s.ring('body', cone(width * 1.35, height * 0.45, 4), count, radius, y + height * 0.55, { phase });
  s.ring('trim', gem(width * 0.65), count, radius, y + height * 1.02, { phase });
}

// The stepped octagonal plinth, whose top is at y = 0.2.
const plinthProfile = (r) => [
  [0, 0], [r, 0], [r, 0.06], [r * 0.9, 0.075], [r * 0.9, 0.095],
  [r * 0.8, 0.13], [r * 0.7, 0.16], [r * 0.72, 0.2], [0, 0.2],
];

// The height of the plinth's upper side `out` from its centre, in the direction
// `angle`.
function plinthHeight(r, out, angle) {
  // The corner radius that reaches this far in this direction.
  const fromFace = angle - Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const needed = (out * Math.cos(fromFace)) / FACE;
  const profile = plinthProfile(r);
  let height = 0;
  for (let i = 1; i < profile.length; i++) {
    const [[r0, y0], [r1, y1]] = [profile[i - 1], profile[i]];
    if (r1 >= needed) height = Math.max(height, y1);
    else if (r0 >= needed) height = Math.max(height, y0 + ((r0 - needed) / (r0 - r1)) * (y1 - y0));
  }
  return height;
}

// `stand` is the radius of the plinth that the piers stand on.
function flyingButtresses(s, { count, outer, inner, base, top, phase = 0, stand }) {
  const arc = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, base + (top - base) * 0.45, outer),
    new THREE.Vector3(0, top, outer * 0.95),
    new THREE.Vector3(0, top, inner),
  );
  s.ring('body', new THREE.TubeGeometry(arc, 16, 0.016, 6), count, 0, 0, { phase });
  // A bright diamond set flat into the outer side of each arch, no wider than
  // the arch is, so that it is neither swallowed by it nor juts out beside it.
  // (`along` is the way along the arch to the height the diamond is at.)
  const along = 1 - Math.sqrt((1 - 0.795) / 0.55);
  const way = arc.getTangent(along);
  const outward = new THREE.Vector3(0, -way.z, way.y);
  const seat = arc.getPoint(along).addScaledVector(outward, 0.014);
  s.ring('trim', gem(0.0156), count, seat.z, seat.y, {
    phase, tilt: -Math.asin(outward.y), sx: 0.82, sy: 1.5, sz: 0.4,
  });
  // Each pier reaches far enough down that its outer side meets the stone too,
  // and ends in a short point where its arch springs from it.
  const foot = plinthHeight(stand, outer + 0.012, phase);
  const spring = arc.v0.y;
  s.ring('body', post(0.024, 0.0276, spring - foot, 4), count, outer, foot, { phase });
  s.ring('body', cone(0.024, (top - base) * 0.17, 4), count, outer, spring, { phase });
}

// Shared stepped octagonal plinth.
function plinth(s, r) {
  s.add('body', turned(plinthProfile(r)));
  s.add('trim', band(r * 0.99, 0.012), { y: 0.06 });
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

// A cowl: a surface of revolution open at the front, with thickness. It has an
// outside, a dark lining that faces inward and the two cut edges joining them,
// so that it cannot be seen through from anywhere.
function cowl(s, profile, gap, sides = 28) {
  const points = (shrink) => profile.map(([r, y]) => new THREE.Vector2(r * shrink, y));
  const open = [gap / 2, TAU - gap];
  s.add('body', new THREE.LatheGeometry(points(1), sides, ...open));
  // Turned inside out by running its triangles the other way.
  const lining = new THREE.LatheGeometry(points(0.9), sides, ...open).toNonIndexed();
  for (const attribute of Object.values(lining.attributes)) {
    const { array, itemSize } = attribute;
    for (let i = 0; i < array.length; i += itemSize * 3) {
      for (let k = 0; k < itemSize; k++) {
        [array[i + itemSize + k], array[i + itemSize * 2 + k]] = [array[i + itemSize * 2 + k], array[i + itemSize + k]];
      }
    }
  }
  const normals = lining.attributes.normal.array;
  for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
  s.add('void', lining);
  // The cut edges, each facing into the opening.
  for (const [angle, facing] of [[gap / 2, -1], [TAU - gap / 2, 1]]) {
    const at = ([r, y], shrink) => [Math.sin(angle) * r * shrink, y, Math.cos(angle) * r * shrink];
    const positions = [];
    const uvs = [];
    for (let i = 1; i < profile.length; i++) {
      const [a, b] = [at(profile[i - 1], 1), at(profile[i], 1)];
      const [c, d] = [at(profile[i - 1], 0.9), at(profile[i], 0.9)];
      const faces = facing > 0 ? [a, c, b, b, c, d] : [a, b, c, b, d, c];
      positions.push(...faces.flat());
      uvs.push(...faces.flatMap(() => [0, 0]));
    }
    const edge = new THREE.BufferGeometry();
    edge.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    edge.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    edge.computeVertexNormals();
    s.add('body', edge);
  }
}

// A hooded acolyte with eyes burning in the cowl.
function pawn() {
  const s = new Sculpture();
  plinth(s, 0.3);
  s.add('body', turned([[0, 0.2], [0.19, 0.2], [0.15, 0.27], [0.11, 0.4], [0.092, 0.52], [0, 0.52]]));
  // Little buttresses: each foot out on the plinth, each point against the waist.
  s.ring('body', cone(0.024, 0.23, 4), 8, 0.204, 0.2, { phase: Math.PI / 8, tilt: -0.417 });
  s.add('body', turned([[0, 0.5], [0.175, 0.5], [0.12, 0.555], [0.07, 0.58], [0, 0.58]]));
  s.add('trim', band(0.168, 0.012), { y: 0.508 });
  cowl(s, [[0.07, 0.56], [0.135, 0.62], [0.142, 0.7], [0.115, 0.77], [0.06, 0.84], [0.018, 0.9], [0, 0.93]], 1.5);
  s.add('void', ball(0.108), { y: 0.69, sy: 1.15 });
  for (const x of [-0.036, 0.036]) s.add('glow', ball(0.014), { x, y: 0.705, z: 0.101, sy: 0.6 });
  s.add('trim', gem(0.028), { y: 0.945, sy: 1.6 });
  // The clasp lies on the slope of the collar.
  s.add('trim', gem(0.026), { y: 0.538, z: 0.132, rx: -0.75, sz: 0.6 });
  return s;
}

// A cathedral tower with lancet windows, crenellations and corner pinnacles.
function rook() {
  const s = new Sculpture();
  plinth(s, 0.38);
  const tower = [
    [0, 0.2], [0.27, 0.2], [0.235, 0.28], [0.215, 0.34], [0.205, 0.82],
    [0.23, 0.85], [0.285, 0.9], [0.285, 0.99], [0.215, 0.99], [0.2, 0.95], [0, 0.95],
  ];
  s.add('body', turned(tower));
  windows(s, { profile: tower, count: 4, y: 0.44, w: 0.07, h: 0.24 });
  windows(s, { profile: tower, count: 4, y: 0.52, w: 0.042, h: 0.16, phase: Math.PI / 4, lit: true });
  s.add('trim', band(0.222, 0.013), { y: 0.35 });
  s.add('trim', band(0.218, 0.011), { y: 0.78 });
  s.add('trim', band(0.285, 0.012), { y: 0.9 });
  // Merlons and corner pinnacles stand on the parapet, none past its face.
  s.ring('body', box(0.095, 0.12, 0.06), 4, 0.232, 1.04);
  s.ring('trim', cone(0.034, 0.055, 4), 4, 0.232, 1.1);
  pinnacles(s, { count: 4, radius: 0.222, y: 0.975, height: 0.34, width: 0.036, phase: Math.PI / 4 });
  // The spire is turned to lie face for face with the tower.
  s.add('body', post(0.13, 0.15, 0.17, 8), { y: 0.95, ry: Math.PI / 8 });
  s.add('body', cone(0.17, 0.36, 8), { y: 1.11, ry: Math.PI / 8 });
  // Round its eaves.
  s.add('trim', band(0.168, 0.011), { y: 1.113 });
  s.add('trim', post(0.006, 0.01, 0.1), { y: 1.45 });
  s.add('trim', gem(0.028), { y: 1.54, sy: 1.5 });
  flyingButtresses(s, { count: 4, outer: 0.31, inner: 0.19, base: 0.17, top: 0.74, phase: Math.PI / 4, stand: 0.38 });
  return s;
}

// Finds the surface of a few solids: the first of it met on the way from `from`
// to `to`.
function surfaceOf(geometries) {
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const meshes = geometries.map((geometry) => new THREE.Mesh(geometry, material));
  const ray = new THREE.Raycaster();
  return (from, to) => {
    ray.set(from, to.clone().sub(from).normalize());
    return ray.intersectObjects(meshes, false)[0]?.point;
  };
}

// Cuts every edge longer than `longest` in two, over and over. Whether an edge
// is cut depends on that edge alone, so no gaps can open between neighbours.
function refine(geometry, longest) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  const points = source.attributes.position;
  const out = [];
  const cut = (a, b, c) => {
    const corners = [a, b, c];
    const middles = corners.map((p, i) => {
      const q = corners[(i + 1) % 3];
      return p.distanceTo(q) > longest ? p.clone().add(q).multiplyScalar(0.5) : null;
    });
    const count = middles.filter(Boolean).length;
    if (!count) {
      for (const p of corners) out.push(p.x, p.y, p.z);
      return;
    }
    // Turned so that the cut edges come first.
    let turn = 0;
    const has = (i) => Boolean(middles[(turn + i) % 3]);
    while (!(has(0) && (count !== 2 || has(1)))) turn++;
    const [p, q, r] = [0, 1, 2].map((i) => corners[(turn + i) % 3]);
    const [pq, qr, rp] = [0, 1, 2].map((i) => middles[(turn + i) % 3]);
    if (count === 1) {
      cut(p, pq, r);
      cut(pq, q, r);
    } else if (count === 2) {
      cut(pq, q, qr);
      cut(p, pq, qr);
      cut(p, qr, r);
    } else {
      cut(p, pq, rp);
      cut(pq, q, qr);
      cut(rp, qr, r);
      cut(pq, qr, rp);
    }
  };
  for (let i = 0; i < points.count; i += 3) {
    cut(...[0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(points, i + k)));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((out.length / 3) * 2), 2));
  return g;
}

// A tube that narrows where `thickness` (0 to 1 along it) says to.
function tapered(curve, segments, radius, thickness) {
  const g = new THREE.TubeGeometry(curve, segments, radius, 6);
  const points = g.attributes.position;
  const point = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const middle = curve.getPointAt(i / segments);
    for (let j = 0; j <= 6; j++) {
      const at = i * 7 + j;
      point.fromBufferAttribute(points, at).sub(middle).multiplyScalar(thickness(i / segments)).add(middle);
      points.setXYZ(at, point.x, point.y, point.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// An armoured nightmare steed with a thorned mane.
function knight() {
  const s = new Sculpture();
  plinth(s, 0.35);
  // Straight where the niches are, so that they sit flat in it.
  const drum = [[0, 0.2], [0.23, 0.2], [0.214, 0.213], [0.214, 0.292], [0.235, 0.3], [0.2, 0.33], [0, 0.33]];
  s.add('body', turned(drum));
  s.add('trim', band(0.232, 0.013), { y: 0.3 });

  // Head in profile: x runs toward the muzzle, y is height.
  const head = new THREE.Shape();
  // Its foot stays inside the base's gold ring, which would otherwise be broken.
  head.moveTo(-0.163, 0.335);
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
  head.bezierCurveTo(0.2, 0.5, 0.21, 0.4, 0.148, 0.335); // chest
  head.closePath();
  const turn = -Math.PI / 2; // shape x -> world +z
  // Carve some depth into the slab: broad at the chest, narrow at ears and muzzle.
  // It is cut finely first, so that its flanks bend smoothly instead of folding
  // along the edges of a few long triangles.
  const skull = refine(extrude(head, 0.1, 0.04), 0.055);
  const points = skull.attributes.position;
  const { clamp, smoothstep } = THREE.MathUtils;
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i);
    const y = points.getY(i);
    const muzzle = clamp((x - 0.1) / 0.27, 0, 1) * 0.35 * smoothstep(y, 0.5, 0.62);
    const ears = clamp((y - 1.08) / 0.18, 0, 1) * 0.5;
    const chest = (1 - smoothstep(y, 0.42, 0.66)) * smoothstep(y, 0.31, 0.42) * 0.4;
    points.setZ(i, points.getZ(i) * (1 - muzzle - ears + chest));
  }
  // Smooth over gentle bends, crisp at the edges.
  s.add('body', toCreasedNormals(skull, Math.PI / 5), { ry: turn });
  // The head: everything the tack lies on.
  const touch = surfaceOf(s.parts.body.slice(-1));
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  // How far out the flank is at height y, z forward.
  const flank = (y, z) => touch(at(1, y, z), at(0, y, z)).x;

  // A strap right round the neck or muzzle, with no ends. It lies in the plane
  // through `middle` that runs `along` [height, forward] and straight across.
  const loop = (middle, along, wide) => {
    const [up, ahead] = along;
    const edgeway = at(0, -ahead, up).normalize();
    const forward = at(0, up, ahead).normalize();
    return ribbon(Array.from({ length: 97 }, (_, i) => {
      const round = ((i % 96) / 96) * TAU;
      const out = forward.clone().multiplyScalar(Math.cos(round)).setX(Math.sin(round));
      const edges = [-0.5, 0.5].map((edge) => {
        const centre = at(0, ...middle).addScaledVector(edgeway, edge * wide);
        return touch(centre, centre.clone().add(out));
      });
      return { edges, out };
    }));
  };

  // Armour lames: three rings round the neck, fanned out from the throat. Each
  // is given by where it crosses the nape and the throat, as [height, forward].
  for (const [nape, throat] of [
    [[0.42, -0.25], [0.4, 0.16]],
    [[0.52, -0.26], [0.462, 0.165]],
    [[0.625, -0.26], [0.522, 0.14]],
  ]) {
    const middle = [(nape[0] + throat[0]) / 2, (nape[1] + throat[1]) / 2];
    s.add('trim', loop(middle, [throat[0] - nape[0], throat[1] - nape[1]], 0.019));
  }
  // The noseband rings the muzzle where the bridle straps end.
  const nose = [0.742, 0.268];
  const overNose = [0.626, 0.78];
  s.add('trim', loop(nose, overNose, 0.022));
  // Chamfron: a plate down the face, from the horn on the forehead to the
  // noseband. Each place between them is a rough [height, forward]; the plate is
  // laid on what is there.
  const off = at(0, 0.626, 0.78);
  // Where the forehead horn comes out of the head, and the top of the noseband.
  const hornway = at(0, Math.cos(0.65), Math.sin(0.65));
  const brow = touch(at(0, 1.07, 0.075), at(0, 1.07, 0.075).add(hornway)).addScaledVector(hornway, 0.006);
  const crossing = touch(at(0, ...nose), at(0, ...nose).add(off)).addScaledVector(off, 0.006);
  const between = [[1.04, 0.13], [0.93, 0.225], [0.875, 0.268], [0.835, 0.3]].map(([y, z]) => {
    const near = at(0, y, z);
    return touch(near.clone().addScaledVector(off, 0.3), near.clone().addScaledVector(off, -0.1))
      .addScaledVector(off, 0.006);
  });
  const ridge = new THREE.CatmullRomCurve3([brow, ...between, crossing]);
  s.add('trim', new THREE.TubeGeometry(ridge, 32, 0.017, 6));
  // A stud where the two straps meet.
  s.add('trim', gem(0.024), { y: crossing.y, z: crossing.z, rx: 0.9 });
  s.add('trim', cone(0.026, 0.13, 4), { y: 1.07, z: 0.075, rx: 0.65 });

  // A strap down one flank from [y, z] to [y, z], `wide` across.
  const strap = (side, from, to, wide) => {
    const along = [to[0] - from[0], to[1] - from[1]];
    const length = Math.hypot(...along);
    const across = [(along[1] / length) * (wide / 2), (-along[0] / length) * (wide / 2)];
    return ribbon(Array.from({ length: 17 }, (_, i) => ({
      out: at(side, 0, 0),
      edges: [-1, 1].map((edge) => {
        const y = from[0] + along[0] * (i / 16) + across[0] * edge;
        const z = from[1] + along[1] * (i / 16) + across[1] * edge;
        return touch(at(side, y, z), at(0, y, z));
      }),
    })));
  };

  for (const side of [-1, 1]) {
    s.add('void', ball(0.036), { x: side * (flank(0.965, 0.065) - 0.006), y: 0.965, z: 0.065, sx: 0.5 });
    s.add('glow', ball(0.02), { x: side * (flank(0.965, 0.065) + 0.007), y: 0.965, z: 0.065, sx: 0.55, sy: 0.65 });
    s.add('void', ball(0.017), { x: side * (flank(0.72, 0.3) - 0.003), y: 0.72, z: 0.3, sx: 0.5 });
    s.add('body', cone(0.034, 0.2, 5), { x: side * 0.055, y: 1.075, z: -0.06, rx: -0.22, rz: -side * 0.2 });
    // Curled ram horns, each growing from a boss and ending in a point.
    const horn = new THREE.CatmullRomCurve3([
      at(side * 0.07, 1.05, 0.0),
      at(side * 0.17, 1.07, -0.1),
      at(side * 0.19, 0.95, -0.15),
      at(side * 0.17, 0.89, -0.06),
    ]);
    s.add('trim', tapered(horn, 24, 0.018, (t) => 1 - Math.max(0, (t - 0.45) / 0.55) * 0.92));
    s.add('trim', ball(0.031), { x: side * flank(1.046, -0.016), y: 1.046, z: -0.016, sx: 0.6 });
    // Bridle straps, from a stud below the eye to the noseband.
    s.add('trim', strap(side, [0.858, 0.109], nose, 0.022));
    s.add('trim', gem(0.026), { x: side * (flank(0.86, 0.105) + 0.006), y: 0.86, z: 0.105, sx: 0.6 });
  }

  // Mane of thorns along the back of the neck: [forward offset, height, lean].
  [[-0.1, 1.07, -0.5], [-0.17, 0.99, -0.85], [-0.215, 0.89, -1.1], [-0.245, 0.78, -1.3],
    [-0.255, 0.66, -1.45], [-0.25, 0.54, -1.6], [-0.235, 0.43, -1.75]]
    .forEach(([z, y, lean], i) => {
      s.add(i % 2 ? 'trim' : 'body', cone(0.04, 0.17 - i * 0.008, 4), { y, z: z + 0.025, rx: lean, sx: 0.6 });
    });

  // Low enough to stand clear under the band above them.
  windows(s, { profile: drum, count: 4, y: 0.214, w: 0.05, h: 0.054, phase: Math.PI / 4 });
  return s;
}

const MITRE = [[0, 0.84], [0.09, 0.85], [0.155, 0.95], [0.168, 1.07], [0.14, 1.2], [0.08, 1.32], [0.025, 1.4], [0, 1.43]];
// The mitre is this much shallower than it is wide.
const MITRE_DEPTH = 0.8;

// How far forward the front of the mitre is at (x, y).
const mitreFront = (x, y) => MITRE_DEPTH * Math.sqrt(Math.max(0, radiusAt(MITRE, y) ** 2 - x ** 2));

// Bends a finely divided fitting, made facing +z at height y, round the front of
// the mitre, standing `lift` proud of it.
function onMitre(geometry, y, lift) {
  const g = geometry.translate(0, y, 0).toNonIndexed();
  const points = g.attributes.position;
  for (let i = 0; i < points.count; i++) {
    points.setZ(i, points.getZ(i) + mitreFront(points.getX(i), points.getY(i)) + lift);
  }
  return faceted(g);
}

// The pane of a lancet, divided finely enough to bend.
function lancetPane(w, h) {
  const g = new THREE.PlaneGeometry(1, 1, 8, 24);
  const points = g.attributes.position;
  for (let i = 0; i < points.count; i++) {
    const y = (points.getY(i) + 0.5) * h;
    // How far along the curve of the arch (see lancetPath) this height is.
    const along = y <= h * 0.55 ? 0 : (0.6 - Math.sqrt(Math.max(0, 0.36 + 0.6 * (0.55 - y / h)))) / 0.3;
    points.setXY(i, points.getX(i) * w * (1 - along ** 2), y);
  }
  return g;
}

// A lancet's frame, laid along the mitre as one band round the opening.
function mitreFrame(w, h, rim, y) {
  const inner = lancetPath(new THREE.Shape(), w, h).curves;
  const outer = lancetPath(new THREE.Shape(), w + rim * 2, h + rim * 1.6).curves;
  const on = (point) => new THREE.Vector3(point.x, y + point.y, mitreFront(point.x, y + point.y));
  const rows = [];
  // Up one side, over the arch and down the other.
  for (let side = 0; side < 4; side++) {
    for (let i = side ? 1 : 0; i <= 12; i++) {
      const edges = [on(inner[side].getPoint(i / 12)), on(outer[side].getPoint(i / 12))];
      const middle = edges[0].clone().add(edges[1]).multiplyScalar(0.5);
      rows.push({ edges, out: new THREE.Vector3(middle.x, 0, middle.z / MITRE_DEPTH ** 2).normalize() });
    }
  }
  return ribbon(rows);
}

// A tall pointed mitre pierced by tracery, crowned with a cross.
function bishop() {
  const s = new Sculpture();
  plinth(s, 0.33);
  const shaft = [[0, 0.2], [0.215, 0.2], [0.15, 0.29], [0.1, 0.5], [0.08, 0.78], [0, 0.78]];
  s.add('body', turned(shaft));
  flyingButtresses(s, { count: 4, outer: 0.24, inner: 0.085, base: 0.17, top: 0.7, phase: Math.PI / 4, stand: 0.33 });
  windows(s, { profile: shaft, count: 4, y: 0.31, w: 0.034, h: 0.17 });
  s.add('body', turned([[0, 0.76], [0.2, 0.78], [0.14, 0.82], [0.085, 0.86], [0, 0.86]]));
  s.add('trim', band(0.192, 0.013), { y: 0.783 });
  pinnacles(s, { count: 8, radius: 0.155, y: 0.79, height: 0.13, width: 0.014, phase: Math.PI / 8 });
  s.add('body', turned(MITRE, 32), { sz: MITRE_DEPTH });
  for (const ry of [0, Math.PI]) {
    s.add('glow', onMitre(lancetPane(0.05, 0.2), 0.99, 0.0025), { ry });
    s.add('trim', mitreFrame(0.05, 0.2, 0.016, 0.99), { ry });
    // The sill, then the tracery: from sill to point, and from jamb to jamb.
    s.add('trim', onMitre(new THREE.BoxGeometry(0.082, 0.014, 0.006, 12, 1, 1), 0.995, 0.003), { ry });
    s.add('trim', onMitre(new THREE.BoxGeometry(0.01, 0.2, 0.005, 2, 20, 1), 1.09, 0.0025), { ry });
    s.add('trim', onMitre(new THREE.BoxGeometry(0.05, 0.01, 0.006, 8, 1, 1), 1.1, 0.0045), { ry });
  }
  s.add('trim', band(0.1, 0.012, 24), { y: 0.865, sz: MITRE_DEPTH });
  s.add('trim', ball(0.038), { y: 1.44 });
  gothicCross(s, 1.46, 0.72);
  return s;
}

// A waisted figure under a crown of tall thorned spires.
function queen() {
  const s = new Sculpture();
  plinth(s, 0.39);
  const figure = [
    [0, 0.2], [0.265, 0.2], [0.2, 0.28], [0.125, 0.5], [0.09, 0.78], [0.095, 0.92], [0.13, 1.08], [0, 1.08],
  ];
  s.add('body', turned(figure));
  flyingButtresses(s, { count: 8, outer: 0.29, inner: 0.095, base: 0.17, top: 0.82, phase: Math.PI / 8, stand: 0.39 });
  windows(s, { profile: figure, count: 8, y: 0.31, w: 0.036, h: 0.15 });
  s.add('trim', band(0.098, 0.016), { y: 0.8 });
  s.add('body', turned([[0, 1.04], [0.2, 1.09], [0.15, 1.13], [0, 1.13]]));
  s.add('trim', band(0.196, 0.014), { y: 1.09 });
  const crown = [[0, 1.12], [0.12, 1.12], [0.14, 1.22], [0.19, 1.3], [0.16, 1.31], [0.11, 1.25], [0, 1.25]];
  s.add('body', turned(crown));
  // Eight-sided like the rim it edges.
  s.add('trim', band(0.188, 0.012), { y: 1.3 });
  const lights = faceOf(crown, 1.152, 1.216);
  s.ring('glow', lancet(0.026, 0.064), 8, lights.out + 0.001, 1.152, { tilt: lights.lean });
  // Alternating tall and short thorns, splayed outward from the rim.
  s.ring('trim', cone(0.03, 0.364, 4), 8, 0.16, 1.3, { tilt: 0.302 });
  s.ring('body', cone(0.026, 0.212, 4), 8, 0.176, 1.298, { phase: Math.PI / 8, tilt: 0.438 });
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
  const figure = [
    [0, 0.2], [0.28, 0.2], [0.22, 0.28], [0.16, 0.44], [0.13, 0.96], [0.145, 1.08], [0.17, 1.16], [0, 1.16],
  ];
  s.add('body', turned(figure));
  flyingButtresses(s, { count: 8, outer: 0.3, inner: 0.13, base: 0.17, top: 0.9, phase: Math.PI / 8, stand: 0.4 });
  windows(s, { profile: figure, count: 8, y: 0.55, w: 0.04, h: 0.27 });
  s.add('trim', band(0.162, 0.016), { y: 0.45 });
  s.add('trim', band(0.136, 0.014), { y: 0.97 });
  s.add('body', turned([[0, 1.12], [0.23, 1.18], [0.17, 1.22], [0, 1.22]]));
  s.add('trim', band(0.226, 0.015), { y: 1.18 });
  pinnacles(s, { count: 8, radius: 0.19, y: 1.19, height: 0.15, width: 0.016, phase: Math.PI / 8 });
  const crown = [[0, 1.2], [0.14, 1.2], [0.155, 1.33], [0.2, 1.42], [0, 1.42]];
  s.add('body', turned(crown));
  s.add('trim', band(0.2, 0.016), { y: 1.42 });
  // Jewels set flat into the faces under the circlet.
  const jewels = faceOf(crown, 1.254, 1.326);
  s.ring('glow', gem(0.026), 8, (jewels.out + radiusAt(crown, 1.326) * FACE) / 2 + 0.001, 1.29,
    { sy: 1.38, sz: 0.35, tilt: jewels.lean });
  s.ring('trim', cone(0.03, 0.177, 4), 8, 0.176, 1.42, { tilt: 0.335 });
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
