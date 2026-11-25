// Used wax candles: an uneven column with a sunken melt pool, runs of frozen
// wax down the sides, a curled burnt wick, and wax spilled on the drip pan.
// The wax glows warmly near the flame, as if lit from within.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from './textures.js';

const SIDES = 40;
export const WICK_LENGTH = 0.04;

const smoothstep = THREE.MathUtils.smoothstep;
const angleGap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Smooth, repeatable unevenness around and along a candle.
function wobble(angle, y, seed) {
  return Math.sin(angle * 3 + seed * 5.1 + y * 9) * 0.5
    + Math.sin(angle * 5 - seed * 2.3 - y * 23) * 0.3
    + Math.sin(y * 41 + seed * 8.7) * 0.2;
}

// Colour and inner glow are carried per vertex. `glow` is 0..1.
function paint(geometry, glowAt, shadeAt = () => 1) {
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const glow = new Float32Array(position.count);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const shade = shadeAt(x, y, z);
    colors.set([shade, shade * 0.985, shade * 0.94], i * 3);
    glow[i] = glowAt(x, y, z);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('glow', new THREE.BufferAttribute(glow, 1));
  return geometry;
}

// One candle standing at the origin. Returns its wax, its wick, and where the
// flame belongs.
export function candle(height, seed, radius = 0.054) {
  const random = seededRandom(seed * 7919 + 13);
  const poolDepth = radius * (0.28 + random() * 0.16);
  // The rim melts lower on one side.
  const leanAngle = random() * Math.PI * 2;
  const leanDrop = 0.008 + random() * 0.016;

  const drips = Array.from({ length: 4 + Math.floor(random() * 3) }, () => ({
    angle: random() * Math.PI * 2,
    width: 0.2 + random() * 0.17,
    end: height * (0.1 + random() * 0.68), // how far down the run got
    swell: radius * (0.12 + random() * 0.2),
  }));

  // Profile as [share of radius, height]. The last points form the melt pool.
  const profile = [[0, 0], [1.1, 0], [1.13, 0.008], [1.04, 0.018]];
  const rows = 34;
  for (let i = 1; i <= rows; i++) {
    const t = i / rows;
    profile.push([1.02 - t * 0.07, 0.018 + t * (height - 0.03)]);
  }
  profile.push([0.97, height - 0.004], [0.93, height], [0.82, height - 0.001]);
  const inner = profile.length;
  profile.push([0.68, height - poolDepth * 0.55], [0.4, height - poolDepth * 0.92], [0.16, height - poolDepth], [0, height - poolDepth]);

  const geometry = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius, y)), SIDES);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const index = i % profile.length;
    const x = position.getX(i);
    const z = position.getZ(i);
    let y = position.getY(i);
    const angle = Math.atan2(x, z);
    let r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const outside = index < inner;
    // The top edge is ragged and lower on the side the draught takes.
    const nearTop = smoothstep(y, height - 0.07, height);
    const slump = (1 - Math.cos(angle - leanAngle)) * 0.5 * leanDrop + Math.max(0, wobble(angle * 2, 0, seed + 4)) * 0.007;
    y -= nearTop * slump * (r / radius);
    if (outside && y > 0.02) {
      r += wobble(angle, y, seed) * radius * 0.055;
      for (const drip of drips) {
        const across = Math.exp(-((angleGap(angle, drip.angle) / drip.width) ** 2));
        if (across < 0.02) continue;
        // A run swells into a bead where it froze.
        const along = smoothstep(y, drip.end - 0.012, drip.end + 0.004);
        const bead = Math.exp(-(((y - drip.end - 0.018) / 0.04) ** 2)) * 0.22;
        r += across * drip.swell * (along * (0.7 + 0.3 * (y / height)) + bead);
        // Wax heaps a little on the lip above each run.
        y += across * smoothstep(y, height - 0.025, height) * drip.swell * 0.5;
      }
    }
    position.setXYZ(i, Math.sin(angle) * r, y, Math.cos(angle) * r);
  }
  geometry.computeVertexNormals();

  const wax = paint(
    geometry.toNonIndexed(),
    // Brightest where the flame shines through the thin rim, fading downward.
    (x, y) => THREE.MathUtils.clamp(1 - (height - y) / 0.17, 0, 1) ** 2,
    (x, y, z) => 0.93 + 0.07 * wobble(Math.atan2(x, z) * 2, y * 2.5, seed + 9),
  );

  // The wick curls over as it burns.
  const base = height - poolDepth - 0.002;
  const bend = random() * Math.PI * 2;
  const curl = 0.008 + random() * 0.008;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, base, 0),
    new THREE.Vector3(Math.sin(bend) * curl * 0.15, base + WICK_LENGTH * 0.55, Math.cos(bend) * curl * 0.15),
    new THREE.Vector3(Math.sin(bend) * curl * 0.6, base + WICK_LENGTH * 0.9, Math.cos(bend) * curl * 0.6),
    new THREE.Vector3(Math.sin(bend) * curl, base + WICK_LENGTH, Math.cos(bend) * curl),
  ]);
  const wick = new THREE.TubeGeometry(curve, 10, 0.0042, 5);
  // The flame sits on the upper part of the wick.
  const flameAt = curve.getPoint(0.78);

  return { wax, wick, flameAt };
}

// Wax that has run off onto a pan: a thin, irregular puddle with a few blobs.
export function spill(radius, seed) {
  const random = seededRandom(seed * 104729 + 7);
  const profile = [[0, 0.011], [0.45, 0.0105], [0.72, 0.008], [0.9, 0.0045], [1, 0]];
  const puddle = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r * radius, y)), 36);
  const position = puddle.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const angle = Math.atan2(x, z);
    const reach = 1 + wobble(angle, 0, seed) * 0.22 + wobble(angle * 2.3, 0, seed + 2) * 0.1;
    position.setXYZ(i, x * reach, position.getY(i), z * reach);
  }
  puddle.computeVertexNormals();
  const blobs = Array.from({ length: 3 }, () => {
    const angle = random() * Math.PI * 2;
    const out = radius * (0.55 + random() * 0.42);
    return new THREE.SphereGeometry(0.009 + random() * 0.012, 10, 8)
      .scale(1, 0.55, 1.25).rotateY(angle).translate(Math.sin(angle) * out, 0.003, Math.cos(angle) * out);
  });
  const merged = mergeGeometries([puddle, ...blobs].map((g) => (g.index ? g.toNonIndexed() : g)));
  return paint(merged, () => 0.04, () => 0.82);
}

// All the wax and wicks for one candelabrum. sockets: where candles stand;
// panRadii: the size of the dish under each. Returns merged geometry plus the
// place for each flame.
export function candleSet(sockets, heights, panRadii, seed) {
  const random = seededRandom(seed * 31 + 5);
  const wax = [];
  const wicks = [];
  const flames = [];
  sockets.forEach((socket, i) => {
    const height = heights[i] * (0.86 + random() * 0.28);
    const made = candle(height, seed * 10 + i, i ? 0.047 : 0.056);
    // A slight tilt, turned a different way each time.
    const tilt = new THREE.Matrix4().compose(
      new THREE.Vector3(socket.x, socket.y, socket.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((random() - 0.5) * 0.09, random() * 6.28, (random() - 0.5) * 0.09)),
      new THREE.Vector3(1, 1, 1),
    );
    wax.push(made.wax.applyMatrix4(tilt));
    wax.push(spill(panRadii[i], seed * 13 + i).translate(socket.x, socket.y, socket.z));
    wicks.push(made.wick.applyMatrix4(tilt));
    flames.push(made.flameAt.applyMatrix4(tilt));
  });
  return { wax: mergeGeometries(wax), wick: mergeGeometries(wicks), flames };
}

// Ivory wax. Instead of costly transmission, each vertex says how much of the
// flame's light shows through it.
export function waxMaterial() {
  const material = new THREE.MeshStandardMaterial({
    color: 0xd9c9a2, vertexColors: true, roughness: 0.52, metalness: 0,
  });
  const strength = { value: 1 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWaxLight = strength;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float glow;\nvarying float vWaxGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWaxGlow = glow;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWaxLight;\nvarying float vWaxGlow;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        totalEmissiveRadiance += uWaxLight * (vec3(0.95, 0.42, 0.11) * vWaxGlow * 0.62 + vec3(0.085, 0.055, 0.026));`);
  };
  material.customProgramCacheKey = () => 'candle-wax';
  return { material, light: strength };
}
