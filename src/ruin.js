// Breaking stonework. A break is a jagged line [[x, height], ...]; whatever
// stands above it is cut away, exactly, and the raw top is closed over so that
// walls keep their thickness. Pure geometry.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { seededRandom } from './textures.js';

// A ragged line from `from` to `to` wandering about `level`, with here and
// there a sudden step where a whole stone has dropped out.
export function jaggedLine(seed, from, to, level, rough = 2.4) {
  const random = seededRandom(seed * 977 + 5);
  const points = [];
  let drift = (random() - 0.5) * rough;
  for (let x = from; x < to - 0.25; x += 0.35 + random() * 0.75) {
    drift = drift * 0.62 + (random() - 0.5) * rough * 1.5;
    points.push([x, level + drift]);
    // A step: nearly upright, to a new height.
    if (random() < 0.22) {
      drift += (random() - 0.5) * rough * 1.8;
      points.push([x + 0.06, level + drift]);
    }
  }
  points.push([to, level + drift * 0.6]);
  return points;
}

// The height of a break at `x`. Beyond its ends it runs level.
export function heightAt(line, x) {
  if (x <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i];
    if (x <= x1) {
      const [x0, y0] = line[i - 1];
      return x1 > x0 ? y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) : y1;
    }
  }
  return line[line.length - 1][1];
}

// Keeps the part of a convex polygon where `inside(corner)` is not negative.
function trim(polygon, inside) {
  const kept = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const da = inside(a);
    const db = inside(b);
    if (da >= 0) kept.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      kept.push(a.map((v, k) => v + (b[k] - v) * t));
    }
  }
  return kept;
}

const asGeometry = (positions, normals) => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
};

// What remains of `geometry` below the break. Only positions and normals are
// kept.
export function clipBelow(geometry, line) {
  const flat = geometry.index ? geometry.toNonIndexed() : geometry;
  const position = flat.attributes.position.array;
  const normal = flat.attributes.normal.array;
  // The line as straight stretches, the end ones running on for ever.
  const far = 1e5;
  const spans = [[-far, line[0][1], line[0][0], line[0][1]]];
  for (let i = 1; i < line.length; i++) {
    if (line[i][0] > line[i - 1][0]) spans.push([...line[i - 1], ...line[i]]);
  }
  const [lastX, lastY] = line[line.length - 1];
  spans.push([lastX, lastY, far, lastY]);

  const positions = [];
  const normals = [];
  for (let i = 0; i < position.length; i += 9) {
    const corners = [0, 3, 6].map((o) => [
      position[i + o], position[i + o + 1], position[i + o + 2],
      normal[i + o], normal[i + o + 1], normal[i + o + 2],
    ]);
    const left = Math.min(...corners.map((c) => c[0]));
    const right = Math.max(...corners.map((c) => c[0]));
    for (const [x0, y0, x1, y1] of spans) {
      if (x1 < left || x0 > right) continue;
      const slope = (y1 - y0) / (x1 - x0);
      let polygon = trim(corners, (c) => c[0] - x0);
      polygon = trim(polygon, (c) => x1 - c[0]);
      polygon = trim(polygon, (c) => y0 + slope * (c[0] - x0) - c[1]);
      // A face lying wholly on the boundary of two stretches belongs to one.
      if (right - left < 1e-6 && Math.abs(left - x1) < 1e-6) continue;
      for (let k = 2; k < polygon.length; k++) {
        for (const corner of [polygon[0], polygon[k - 1], polygon[k]]) {
          positions.push(corner[0], corner[1], corner[2]);
          normals.push(corner[3], corner[4], corner[5]);
        }
      }
    }
  }
  return asGeometry(positions, normals);
}

// Closes the broken top of a wall `thickness` deep (centred on z = 0), wherever
// `solid(x, y)` says there was stone just under the break.
export function capBreak(line, thickness, solid, seed) {
  const random = seededRandom(seed * 131 + 17);
  const positions = [];
  const normals = [];
  const half = thickness / 2;
  const triangle = (a, b, c) => {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    if (n.y < 0) {
      [b, c] = [c, b];
      n.negate();
    }
    for (const p of [a, b, c]) {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
  };
  for (let i = 1; i < line.length; i++) {
    const [x0, y0] = line[i - 1];
    const [x1, y1] = line[i];
    const x = (x0 + x1) / 2;
    if (x1 - x0 < 1e-3 || !solid(x, (y0 + y1) / 2 - 0.06)) continue;
    // A ridge along the middle of the broken core, a little above its edges.
    const at = (px, py, z) => new THREE.Vector3(px, py, z);
    const ridge = at(x, (y0 + y1) / 2 + 0.05 + random() * 0.28, (random() - 0.5) * half);
    const corners = [at(x0, y0, half), at(x1, y1, half), at(x1, y1, -half), at(x0, y0, -half)];
    for (let k = 0; k < 4; k++) triangle(corners[k], corners[(k + 1) % 4], ridge);
  }
  return asGeometry(positions, normals);
}

// A stump of one shaft of a pillar, from `from` up to a splintered top.
export function brokenShaft(radius, from, top, sides, x, z, seed) {
  const random = seededRandom(seed);
  const side = new THREE.CylinderGeometry(radius, radius, top - from, sides, 1, true)
    .translate(x, (from + top) / 2, z);
  const position = side.attributes.position;
  const lift = Array.from({ length: sides }, () => (random() - 0.5) * 1.1);
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > top - 1e-4) position.setY(i, top + lift[(i % (sides + 1)) % sides]);
  }
  side.computeVertexNormals();
  // The raw end, fanned over from the splintered edge.
  const positions = [];
  const normals = [];
  const peak = new THREE.Vector3(x, top + (random() - 0.2) * 0.6, z);
  const rim = (i) => {
    const angle = (i / sides) * Math.PI * 2;
    return new THREE.Vector3(x + Math.sin(angle) * radius, top + lift[i % sides], z + Math.cos(angle) * radius);
  };
  for (let i = 0; i < sides; i++) {
    const [a, b] = [rim(i), rim(i + 1)];
    const n = new THREE.Vector3().subVectors(a, peak).cross(new THREE.Vector3().subVectors(b, peak)).normalize();
    for (const p of [peak, a, b]) {
      positions.push(p.x, p.y, p.z);
      normals.push(n.x, n.y, n.z);
    }
  }
  const body = side.toNonIndexed();
  body.deleteAttribute('uv');
  return [body, asGeometry(positions, normals)];
}

// Loose blocks left lying along a break.
export function rubbleAlong(line, count, seed, depth = 0.9) {
  const random = seededRandom(seed * 53 + 29);
  return Array.from({ length: count }, () => {
    const x = line[0][0] + random() * (line[line.length - 1][0] - line[0][0]);
    const size = 0.18 + random() ** 2 * 0.55;
    const points = Array.from({ length: 10 }, () => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5)
      .normalize().multiplyScalar(size * (0.6 + random() * 0.6)));
    const geometry = new ConvexGeometry(points);
    geometry.deleteAttribute('uv');
    return geometry.translate(x, heightAt(line, x) + size * 0.18, (random() - 0.5) * depth);
  });
}
