// What is left of the great rose window. The opening goes right through the east
// wall (cathedral.js cuts it); in it hang the stumps of the tracery and a few
// teeth of glass, and through it shows the night sky. Moonlight comes through
// along one direction and lights the stone that can see the moon.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from './textures.js';
import { WINDOW, REACH, MOONLIGHT, holeEdge, glassShards, SPOKES, ARCS } from './roseShape.js';

// ---------------------------------------------------------------- what gets through

let mask = null;

// How much light each point of the opening lets through, and of what colour:
// open sky lets everything through, stone nothing, and glass only its own hue.
export function windowMask(size = 256) {
  if (mask) return mask;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // World units from here on, with y upward.
  const unit = size / (REACH * 2);
  ctx.filter = 'blur(1.6px)';
  ctx.setTransform(unit, 0, 0, -unit, size / 2, size / 2);
  const path = (corners) => {
    ctx.beginPath();
    corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
  };
  path(holeEdge().map(({ angle, radius }) => [Math.cos(angle) * radius, Math.sin(angle) * radius]));
  ctx.fillStyle = '#fff';
  ctx.fill();
  for (const { corners, colour } of glassShards()) {
    path(corners);
    ctx.fillStyle = `#${new THREE.Color(colour).getHexString()}`;
    ctx.fill();
  }
  ctx.strokeStyle = '#000';
  for (const [angle, from, to, thickness] of SPOKES) {
    ctx.lineWidth = thickness * 2.1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * from, Math.sin(angle) * from);
    ctx.lineTo(Math.cos(angle) * to, Math.sin(angle) * to);
    ctx.stroke();
  }
  for (const [radius, thickness, from, length] of ARCS) {
    ctx.lineWidth = thickness * 2.1;
    ctx.beginPath();
    ctx.arc(0, 0, radius, from, from + length);
    ctx.stroke();
  }
  mask = new THREE.CanvasTexture(canvas);
  mask.colorSpace = THREE.NoColorSpace;
  return mask;
}

const number = (v) => v.toFixed(5);
const vec = ({ x, y, z }) => `vec3(${number(x)}, ${number(y)}, ${number(z)})`;

// GLSL: how much moonlight reaches a point, found by following its ray back to
// the window. `along` returns the distance it has travelled indoors. Needs
// `uniform sampler2D uWindowMask`.
export const MOONLIGHT_GLSL = /* glsl */ `
  const vec3 MOON_RAY = ${vec(MOONLIGHT)};
  const vec3 MOON_WINDOW = ${vec(WINDOW)};
  vec3 moonThrough(vec3 p, out float along) {
    along = (p.z - MOON_WINDOW.z) / MOON_RAY.z;
    vec2 at = p.xy - MOON_WINDOW.xy - MOON_RAY.xy * along;
    if (along < 0.0 || max(abs(at.x), abs(at.y)) > ${number(REACH)}) return vec3(0.0);
    return texture2D(uWindowMask, at / ${number(REACH * 2)} + 0.5).rgb;
  }
`;

// ---------------------------------------------------------------- stone and glass

// The stone that is left: two rings with lengths missing, spokes snapped off
// short and what still hangs of the inner ring.
export function brokenTracery() {
  const random = seededRandom(57);
  const arc = (radius, tube, from, length) => new THREE.TorusGeometry(radius, tube, 7, Math.ceil(length * 14), length)
    .rotateZ(from);
  // A length of stone from `from` to `to`, ending in a jagged break.
  const spoke = (angle, from, to, thickness) => {
    const geometry = new THREE.CylinderGeometry(thickness * 0.55, thickness, from - to, 6, 3);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      if (position.getY(i) < (from - to) / 2 - 0.01) continue;
      position.setY(i, position.getY(i) + (random() - 0.5) * 0.55);
    }
    // The cylinder runs inward from the rim, along the spoke's angle.
    geometry.rotateZ(angle + Math.PI / 2).translate(Math.cos(angle) * (from + to) / 2, Math.sin(angle) * (from + to) / 2, 0);
    return geometry;
  };
  const parts = [
    // The outer mouldings, each missing a stretch.
    arc(7.75, 0.42, 4.25, 4.9), arc(8.5, 0.2, 4.6, 2.2), arc(8.5, 0.2, 0.95, 2.6),
    ...ARCS.map((a) => arc(...a)),
    ...SPOKES.map((s) => spoke(...s)),
  ].map((geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute('uv');
    return flat;
  });
  return mergeGeometries(parts);
}

// Each shard has thickness: bright where the night shines through its face,
// dark along its leaded edges.
function shardGeometry() {
  return mergeGeometries(glassShards().map(({ corners, colour }, n) => {
    const geometry = new THREE.ExtrudeGeometry(
      new THREE.Shape(corners.map(([x, y]) => new THREE.Vector2(x, y))),
      { depth: 0.14, bevelEnabled: false },
    );
    // Each hangs a little out of true.
    geometry.translate(0, 0, ((n * 37) % 11) * 0.022);
    const normal = geometry.attributes.normal;
    const [x, y] = corners[2];
    // Those on the side nearest the moon shine a little more.
    const lit = 0.34 + 0.5 * Math.max(0, (x * 0.5 + y * 0.87) / 8);
    const tone = new THREE.Color(colour);
    const colours = new Float32Array(normal.count * 3);
    for (let i = 0; i < normal.count; i++) {
      const edge = Math.abs(normal.getZ(i)) < 0.5 ? 0.12 : lit;
      colours.set([tone.r * edge, tone.g * edge, tone.b * edge], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    return geometry;
  }));
}

// ---------------------------------------------------------------- the window

// Placed in the building's own coordinates.
export function brokenRose(stone) {
  const window = new THREE.Group();
  const tracery = new THREE.Mesh(brokenTracery(), stone);
  // Set back into the thickness of the wall.
  tracery.position.set(WINDOW.x, WINDOW.y, WINDOW.z + 0.9);
  const shards = new THREE.Mesh(
    shardGeometry(),
    new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.9, fog: false }),
  );
  shards.position.set(WINDOW.x, WINDOW.y, WINDOW.z + 0.25);
  window.add(shards, tracery);
  return window;
}
