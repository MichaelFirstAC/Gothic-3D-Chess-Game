// What holds up the board: a flat top of polished black marble with a block cut
// to seat the board, and under them matte black boulders stacked into a spire
// that narrows away into the dark. The top is painted as one piece
// (slabMarble.js) and the rock has no texture, so nothing can repeat.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import {
  TOP_Y, DAIS_FOOT, DAIS_TOP_Y, TOP_HALF, TOP_CORNER, rimRadius, smooth,
} from './pillarShape.js';
import { seededRandom, marble } from './textures.js';
import { slabMarble } from './slabMarble.js';
import { addAbyssFog } from './abyssFog.js';

const DEPTH = 66;
const TAU = Math.PI * 2;

const between = (random, min, max) => min + random() * (max - min);

// Gives every vertex of a chunk the same tone, so that neighbours differ a
// little. `topShade` overrides it on faces that look straight up.
function tint(geometry, shade, topShade = shade) {
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(normal.count * 3);
  for (let i = 0; i < normal.count; i++) colors.fill(normal.getY(i) > 0.95 ? topShade : shade, i * 3, i * 3 + 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

// A mesh of loose triangles with one normal per face.
function faceted(positions) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// An angular boulder about `size` across in each direction.
function boulder(random, [width, height, depth]) {
  const points = Array.from({ length: 15 }, () => {
    const v = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    // Pushed out toward a box, which gives broad faces and hard corners.
    const boxy = Math.max(Math.abs(v.x), Math.abs(v.y), Math.abs(v.z)) ** -0.75;
    v.multiplyScalar(boxy * between(random, 0.82, 1.12) * 0.5);
    return v.multiply(new THREE.Vector3(width, height, depth));
  });
  const geometry = new ConvexGeometry(points);
  geometry.deleteAttribute('uv');
  return geometry;
}

// The block the board rests on: one cleanly cut square with stepped edges.
function dais() {
  // [half-width, height]
  const profile = [
    [4.5, DAIS_TOP_Y], [4.55, -0.25], [4.57, -0.43], [4.68, -0.47], [4.69, -0.68],
    [DAIS_FOOT, TOP_Y + 0.02], [DAIS_FOOT, TOP_Y - 0.4],
  ];
  const corners = (half) => [[1, 1], [1, -1], [-1, -1], [-1, 1]].map(([x, z]) => [x * half, z * half]);
  const rings = profile.map(([half, y]) => corners(half).map(([x, z]) => [x, y, z]));
  const positions = [];
  const [a, b, c, d] = rings[0];
  positions.push(...a, ...b, ...c, ...a, ...c, ...d);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      positions.push(...rings[r][i], ...rings[r + 1][i], ...rings[r][j]);
      positions.push(...rings[r][j], ...rings[r + 1][i], ...rings[r + 1][j]);
    }
  }
  return faceted(positions);
}

// The flat slab, in one piece, with a narrow bevel round its edge. Below that
// the side draws in a little to meet the boulders. Returns its top (bevel
// included) and its edge, which are finished differently.
function plate() {
  // The eight corners of the outline, in order round the middle.
  const cut = TOP_CORNER - TOP_HALF;
  const first8th = Math.atan2(cut, TOP_HALF);
  const angles = [0, 1, 2, 3].flatMap((quarter) => [first8th, Math.PI / 2 - first8th]
    .map((a) => a + (quarter * Math.PI) / 2));
  // [how far inside the edge, height]
  const profile = [[0.05, TOP_Y], [0, TOP_Y - 0.05], [0.03, TOP_Y - 0.4], [0.45, TOP_Y - 0.7]];
  const rings = profile.map(([inside, y]) => angles.map((a) => {
    const r = rimRadius(a) - inside;
    return [Math.sin(a) * r, y, Math.cos(a) * r];
  }));
  const top = [];
  const edge = [];
  const [first] = rings;
  const last = rings[rings.length - 1];
  for (let i = 0; i < angles.length; i++) {
    const j = (i + 1) % angles.length;
    top.push(...[[0, TOP_Y, 0], first[i], first[j]].flat());
    edge.push(...[[0, last[0][1], 0], last[j], last[i]].flat());
    for (let r = 0; r < rings.length - 1; r++) {
      (r === 0 ? top : edge).push(...[
        rings[r][i], rings[r + 1][i], rings[r][j],
        rings[r][j], rings[r + 1][i], rings[r + 1][j],
      ].flat());
    }
  }
  return { top: faceted(top), edge: faceted(edge) };
}

// Texture coordinates taken straight from each vertex's place.
function mapped(geometry, at) {
  const { position, normal } = geometry.attributes;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv.set(at(position.getX(i), position.getY(i), position.getZ(i), normal.getX(i), normal.getY(i), normal.getZ(i)), i * 2);
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// Radius of the body of the spire at a depth below the top.
function coreRadius(depth) {
  const stops = [[0, 5.2], [3, 4.7], [8, 4.1], [14, 3.7], [24, 3.0], [40, 2.7], [DEPTH, 2.1]];
  const next = stops.findIndex(([d]) => d >= depth);
  if (next <= 0) return stops[0][1];
  const [d0, r0] = stops[next - 1];
  const [d1, r1] = stops[next];
  return r0 + (r1 - r0) * ((depth - d0) / (d1 - d0));
}

// No boulder may break through the flat top, and just under it none may stick
// out past its edge.
function keepBelow(geometry) {
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    if (position.getY(i) > TOP_Y - 0.4) position.setY(i, TOP_Y - 0.4);
    const x = position.getX(i);
    const z = position.getZ(i);
    const limit = rimRadius(Math.atan2(x, z)) - 0.12;
    const out = Math.hypot(x, z);
    if (out > limit && position.getY(i) > TOP_Y - 1.3) {
      position.setX(i, (x * limit) / out);
      position.setZ(i, (z * limit) / out);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Courses of boulders, small near the top where they are seen well and larger
// further down, where few can be made out.
function boulders(random) {
  const parts = [];
  for (let depth = 0.85, course = 0; depth < DEPTH - 2; course++) {
    const tall = Math.min(3.6, 0.8 + depth * 0.1);
    // The lip overhangs, then the underside cuts back to the body.
    const body = smooth(0.1, 4.2, depth);
    const typical = coreRadius(depth);
    const count = Math.max(8, Math.round((TAU * typical) / (tall * 1.05)));
    for (let i = 0; i < count; i++) {
      const angle = ((i + (course % 2) * 0.5 + between(random, -0.22, 0.22)) / count) * TAU;
      const lumpy = 1 + 0.13 * Math.sin(angle * 3 + 1.3 + depth * 0.1) + 0.09 * Math.sin(angle * 5 - depth * 0.21);
      const reach = THREE.MathUtils.lerp(rimRadius(angle) - 0.15, typical * lumpy, body)
        + between(random, -0.28, 0.28) * (0.4 + body);
      const size = [
        ((TAU * reach) / count) * between(random, 0.95, 1.45),
        tall * between(random, 0.95, 1.55),
        tall * between(random, 1.1, 1.7),
      ];
      const centre = reach - size[2] * 0.45;
      const chunk = boulder(random, size).applyMatrix4(new THREE.Matrix4().compose(
        new THREE.Vector3(
          Math.sin(angle) * centre,
          TOP_Y - depth - between(random, -0.25, 0.25) * tall,
          Math.cos(angle) * centre,
        ),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(
          between(random, -0.17, 0.17), angle + between(random, -0.2, 0.2), between(random, -0.17, 0.17), 'YXZ',
        )),
        new THREE.Vector3(1, 1, 1),
      ));
      parts.push(tint(keepBelow(chunk), between(random, 0.7, 1.25)));
    }
    depth += tall * 0.72;
  }
  return parts;
}

// A dark heart behind the chunks, so no gap shows through to the other side.
function core() {
  const stops = [TOP_Y - 0.5, -3, -8, -16, -28, -44, -DEPTH];
  const points = stops.map((y) => new THREE.Vector2(coreRadius(TOP_Y - y) * 0.7, y));
  const geometry = new THREE.LatheGeometry([new THREE.Vector2(0, stops[0]), ...points].reverse(), 14).toNonIndexed();
  geometry.deleteAttribute('uv');
  geometry.computeVertexNormals();
  return tint(geometry, 0.35);
}

// The three finishes: the painted top of the slab, the darker marble of the
// dais and the slab's edge, and the bare rock below.
export function pillarParts() {
  const random = seededRandom(97);
  const { top, edge } = plate();
  const span = TOP_HALF * 2;
  return {
    // One painting laid flat across the whole top.
    top: mapped(top, (x, y, z) => [x / span + 0.5, 0.5 - z / span]),
    // Each face is mapped along whichever way it looks.
    trim: mergeGeometries([dais(), edge].map((geometry) => mapped(geometry, (x, y, z, nx, ny, nz) => {
      if (Math.abs(ny) > 0.7) return [x / 9.6 + 0.5, z / 9.6 + 0.5];
      return [(Math.abs(nx) > Math.abs(nz) ? z : x + 3.1) / 9.6 + 0.5, y / 4 + 0.7];
    }))),
    rock: mergeGeometries([...boulders(random), core()]),
  };
}

export function addPillar(scene) {
  const { top, trim, rock } = pillarParts();

  // Polished like the board's squares, so the lamp and the candles gleam in it.
  const polished = new THREE.MeshStandardMaterial({ map: slabMarble(), roughness: 0.3, metalness: 0.14 });
  const dark = marble('#191519', '#8c8092', 211);
  dark.wrapS = dark.wrapT = THREE.RepeatWrapping;
  const carved = new THREE.MeshStandardMaterial({ map: dark, roughness: 0.36, metalness: 0.12 });

  // The rock is dead matte, so the coloured lights cannot glaze it. The slight
  // green in the colour cancels the violet they would leave, and it reads black.
  const stone = new THREE.MeshLambertMaterial({ color: 0x2b2d28, vertexColors: true, reflectivity: 0 });
  stone.onBeforeCompile = (shader) => addAbyssFog(shader);
  stone.customProgramCacheKey = () => 'pillar-rock';

  const pillar = new THREE.Group();
  for (const [geometry, material] of [[top, polished], [trim, carved], [rock, stone]]) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    // The dais throws its shadow across the slab.
    mesh.castShadow = material === carved;
    pillar.add(mesh);
  }
  scene.add(pillar);
  return pillar;
}
