// The rock spire that holds up the board. Its top is carved into a stepped dais;
// below the broken rim it overhangs, narrows and twists away into the dark. The
// grave ledges, jutting shelves and clinging rubble are part of the same mesh, so
// the whole pillar is one material and one draw call.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  TOP_Y, DAIS_FOOT, DAIS_TOP_Y, LEDGE, rimRadius, squareReach, fbm3, noise3, smooth,
} from './pillarShape.js';
import { rockSurface, noiseTexture, seededRandom } from './textures.js';
import { addAbyssFog } from './abyssFog.js';

const SEGMENTS = 168; // a multiple of 8, so the dais corners fall on vertices
const RINGS = 96;
const DEPTH = 66;

// How close a point is to a candle stand's foot, from 1 on it to 0 well away.
const underStand = (x, z) => 1 - smooth(0.55, 1.1, Math.hypot(Math.abs(x) - 5.7, Math.abs(z) - 5.7));

// Joins rings of points, each SEGMENTS long, into a surface facing outward.
function skin(rings) {
  const positions = new Float32Array(rings.length * SEGMENTS * 3);
  rings.forEach((ring, r) => ring.forEach((p, s) => positions.set(p, (r * SEGMENTS + s) * 3)));
  const index = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let s = 0; s < SEGMENTS; s++) {
      const a = r * SEGMENTS + s;
      const b = r * SEGMENTS + ((s + 1) % SEGMENTS);
      const c = a + SEGMENTS;
      const d = b + SEGMENTS;
      index.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(index);
  return geometry;
}

const ringAt = (point) => Array.from({ length: SEGMENTS }, (_, s) => point((s / SEGMENTS) * Math.PI * 2));

// The dais, from the middle outward, then the worn flat top as far as the rim.
function crown() {
  // [half-width of the square, height]: a bed for the frame, a chamfer, a
  // narrow step and a sloping foot that runs into the floor of the top.
  const profile = [
    [0, DAIS_TOP_Y], [4.5, DAIS_TOP_Y], [4.55, -0.25], [4.58, -0.42],
    [4.68, -0.47], [4.69, -0.66], [DAIS_FOOT, TOP_Y + 0.02],
  ];
  const rings = profile.map(([half, y]) => ringAt((a) => {
    const r = half * squareReach(a);
    // Chisel work and wear: slight, and only below the bed the frame sits on.
    const worn = y < -0.24 ? noise3(Math.sin(a) * 26, y * 9, Math.cos(a) * 26) * 0.022 : 0;
    return [Math.sin(a) * (r + worn), y, Math.cos(a) * (r + worn)];
  }));
  for (const share of [0.04, 0.3, 0.6, 0.85, 1]) {
    rings.push(ringAt((a) => {
      const from = DAIS_FOOT * squareReach(a);
      const r = THREE.MathUtils.lerp(from, rimRadius(a), share);
      const x = Math.sin(a) * r;
      const z = Math.cos(a) * r;
      // Hollows only, so nothing standing on the top is ever buried.
      const hollow = Math.max(0, fbm3(x * 0.9, 3.1, z * 0.9, 3)) * 0.16 * (1 - underStand(x, z)) * smooth(0, 0.25, share);
      return [x, TOP_Y - hollow, z];
    }));
  }
  return rings;
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

function flank() {
  return Array.from({ length: RINGS }, (_, i) => {
    const t = (i + 1) / RINGS;
    // Rings are crowded near the top, which is the part that can be seen well.
    const depth = DEPTH * t ** 2.1;
    return ringAt((a) => {
      const rim = rimRadius(a);
      // The lip drops sharply, then the underside cuts back to the body.
      const body = smooth(0.1, 3.8, depth);
      const turn = a + depth * 0.035;
      const lumpy = 1 + 0.14 * Math.sin(turn * 3 + 1.3) + 0.09 * Math.sin(turn * 5 - depth * 0.21);
      let r = THREE.MathUtils.lerp(rim, coreRadius(depth) * lumpy, body);
      const sx = Math.sin(turn);
      const sz = Math.cos(turn);
      const grow = smooth(0, 6, depth);
      // Great masses, then ridged splits running mostly up and down, then beds
      // of harder rock that stand proud.
      const mass = fbm3(sx * 2.1, depth * 0.17, sz * 2.1, 4) * (0.18 + 1.25 * grow);
      const split = (0.5 - Math.abs(fbm3(sx * 6.2, depth * 0.34, sz * 6.2, 3))) * (0.14 + 0.5 * grow);
      const bed = noise3(sx * 1.3, depth * 1.15 + fbm3(sx * 2, depth * 0.2, sz * 2, 2) * 1.6, sz * 1.3);
      const shelf = Math.sign(bed) * Math.abs(bed) ** 0.45 * (0.07 + 0.2 * grow);
      const broken = fbm3(sx * 17, depth * 2.4, sz * 17, 3) * 0.16;
      r += (mass + split + shelf) * smooth(0.02, 0.5, depth) + broken * smooth(0, 0.12, depth);
      // Stay under the ledges, which join the rock on each side.
      const y = TOP_Y - depth - (depth < 0.5 ? Math.abs(broken) * 0.7 : 0) + noise3(sx * 4, depth, sz * 4) * 0.22 * grow;
      const besideLedge = Math.abs(Math.cos(a) * rim) < LEDGE.halfLength + 0.4 && Math.abs(Math.sin(a)) > 0.6;
      if (besideLedge && y > LEDGE.y - 0.45) r = Math.min(r, rim + 0.04);
      return [Math.sin(a) * r, y, Math.cos(a) * r];
    });
  });
}

// A shelf of rock jutting from one side: level on top, ragged along its edge,
// and thinning back into the spire below.
function graveLedge(side) {
  const width = LEDGE.outer - LEDGE.inner;
  const geometry = new THREE.BoxGeometry(width, 1, LEDGE.halfLength * 2, 12, 6, 52);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const u = THREE.MathUtils.clamp(position.getX(i) / width + 0.5, 0, 1); // 0 in the rock, 1 at the edge
    const v = THREE.MathUtils.clamp(0.5 - position.getY(i), 0, 1); // 0 on top, 1 underneath
    let z = position.getZ(i);
    const along = Math.abs(z) / LEDGE.halfLength;
    // Rounded off at both ends, and ragged beyond where any grave stands.
    const reach = LEDGE.outer - 0.5 * smooth(0.86, 1, along)
      + Math.max(-0.04, fbm3(side * 3, z * 1.7, 0.4, 3) * 0.3);
    let x = LEDGE.inner + u * (reach - LEDGE.inner);
    const thickness = 1.5 - 0.95 * u ** 1.4 - 0.35 * along ** 4;
    const rough = fbm3(x * 2.3 + side * 11, v * 3, z * 2.3, 3);
    // The underside slopes back toward the spire.
    x -= v ** 1.5 * u * (0.9 + rough * 0.5);
    const y = LEDGE.y - v * thickness * (1 + 0.45 * rough)
      - (v === 0 ? Math.max(0, noise3(x * 3, side, z * 3)) * 0.025 : 0);
    z += v * rough * 0.4;
    position.setXYZ(i, side * x, y, z);
  }
  // Mirroring the left ledge turns it inside out, so wind it back.
  if (side < 0) {
    const index = geometry.index.array;
    for (let i = 0; i < index.length; i += 3) [index[i + 1], index[i + 2]] = [index[i + 2], index[i + 1]];
  }
  return geometry;
}

// An irregular lump of rock.
function lump(seed, detail = 1) {
  const geometry = new THREE.IcosahedronGeometry(1, detail);
  const position = geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    v.multiplyScalar(1 + fbm3(v.x * 1.6 + seed, v.y * 1.6, v.z * 1.6, 3) * 0.75);
    position.setXYZ(i, v.x, v.y, v.z);
  }
  return geometry;
}

function jutsAndRubble(rings) {
  const random = seededRandom(97);
  const parts = [];
  const place = (geometry, [x, y, z], scale, turn, tip = 0) => parts.push(geometry.applyMatrix4(
    new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(tip, turn, tip * 0.7)),
      new THREE.Vector3(...scale),
    ),
  ));
  // A point on the flank at a depth and an angle, pulled in by `sink`.
  const onFlank = (depth, angle, sink) => {
    const ring = rings.reduce((best, r) => (
      Math.abs(TOP_Y - r[0][1] - depth) < Math.abs(TOP_Y - best[0][1] - depth) ? r : best));
    const [x, y, z] = ring[Math.floor((angle / (Math.PI * 2)) * SEGMENTS) % SEGMENTS];
    return [x * (1 - sink), y, z * (1 - sink)];
  };
  // Larger shelves jutting from the sides.
  [[2.9, 0.35], [3.6, 3.55], [5.4, 5.7], [7.2, 2.3], [9.5, 0.9], [12.5, 4.4], [17, 1.7], [22, 5.2]]
    .forEach(([depth, angle], i) => {
      const at = onFlank(depth, angle, 0.02);
      place(lump(i * 7.3, 2), at, [0.9 + random() * 0.8, 0.35 + random() * 0.35, 0.8 + random() * 0.7], angle, random() * 0.3 - 0.15);
    });
  // Rubble caught on the way down.
  for (let i = 0; i < 90; i++) {
    const depth = 0.5 + random() ** 1.6 * 15;
    const size = 0.07 + random() ** 2.4 * 0.42;
    place(lump(i * 3.1, size > 0.25 ? 1 : 0), onFlank(depth, random() * Math.PI * 2, 0.015),
      [size, size * (0.6 + random() * 0.5), size], random() * 6.28, random() * 1.2 - 0.6);
  }
  // Broken stones lying on the top, at the two ends, clear of the dais.
  for (let i = 0; i < 46; i++) {
    const angle = (i % 2) * Math.PI + (random() - 0.5) * 1.3;
    const from = DAIS_FOOT * squareReach(angle) + 0.18;
    const to = rimRadius(angle) - 0.1;
    if (to <= from) continue;
    const r = from + random() * (to - from);
    const size = 0.035 + random() ** 2.5 * 0.17;
    const x = Math.sin(angle) * r;
    const z = Math.cos(angle) * r;
    if (underStand(x, z) > 0) continue;
    place(lump(200 + i, 0), [x, TOP_Y + size * 0.25, z], [size, size * 0.65, size], random() * 6.28, random() * 0.5);
  }
  return parts;
}

// Vertex colours: darker in splits and under overhangs, with beds of warmer and
// colder rock, and a paler worn top.
function weather(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const colors = new Float32Array(position.count * 3);
  const warm = new THREE.Color(1.05, 0.99, 0.91);
  const cold = new THREE.Color(0.84, 0.9, 1.04);
  const tint = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const depth = TOP_Y - y;
    const bed = fbm3(x * 0.12, y * 0.85 + noise3(x * 0.3, y * 0.1, z * 0.3) * 1.5, z * 0.12, 3);
    tint.copy(cold).lerp(warm, smooth(-0.25, 0.3, bed));
    let shade = 1 + bed * 0.3;
    // Faces turned downward catch little light.
    shade *= 0.72 + 0.28 * smooth(-0.8, 0.5, normal.getY(i));
    if (depth < 0.05 && normal.getY(i) > 0.9) shade *= 1.08;
    // Trodden pale, so that the dark pieces stand out on the ledges.
    if (Math.abs(y - LEDGE.y) < 0.04 && Math.abs(x) > 5 && normal.getY(i) > 0.85) shade *= 1.45;
    colors.set([tint.r * shade, tint.g * shade, tint.b * shade], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

export function pillarGeometry() {
  const top = crown();
  const sides = flank();
  const parts = [
    // The crown is listed from the middle outward and downward, like the flank.
    skin([...top, ...sides]),
    graveLedge(1),
    graveLedge(-1),
    ...jutsAndRubble(sides),
  ].map((geometry) => {
    const flat = geometry.index ? geometry.toNonIndexed() : geometry;
    flat.deleteAttribute('uv');
    // One normal per face: broken rock, not smooth clay.
    flat.computeVertexNormals();
    return flat;
  });
  return weather(mergeGeometries(parts));
}

const ROCK_VERTEX = /* glsl */ `
  vRockPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vRockNormal = normalize(mat3(modelMatrix) * objectNormal);
`;

const ROCK_HEAD = /* glsl */ `
  uniform sampler2D uRock;
  uniform sampler2D uRockRelief;
  uniform sampler2D uNoise;
  varying vec3 vRockPos;
  varying vec3 vRockNormal;
`;

// Mapped from three sides at two unrelated sizes, so no patch comes round again.
const ROCK_COLOUR = /* glsl */ `
  vec3 faceNormal = normalize(vRockNormal);
  vec3 blend = pow(abs(faceNormal), vec3(5.0));
  blend /= blend.x + blend.y + blend.z;
  vec2 uvX = vRockPos.zy / 3.7;
  vec2 uvY = vRockPos.xz / 3.7;
  vec2 uvZ = vRockPos.xy / 3.7 + 0.31;
  vec3 grain = texture2D(uRock, uvX).rgb * blend.x + texture2D(uRock, uvY).rgb * blend.y + texture2D(uRock, uvZ).rgb * blend.z;
  vec3 broad = texture2D(uRock, uvX * 0.27 + 0.57).rgb * blend.x
    + texture2D(uRock, uvY * 0.27 + 0.19).rgb * blend.y
    + texture2D(uRock, uvZ * 0.27 + 0.83).rgb * blend.z;
  vec3 patches = texture2D(uNoise, (vRockPos.xz + vRockPos.y * vec2(0.43, -0.37)) * 0.021).rgb;
  vec3 rock = mix(grain, grain * grain * 2.2, 0.5) * (0.86 + 0.42 * broad.g);
  rock *= 0.8 + 0.4 * patches.r;
  rock = mix(rock, rock * vec3(0.62, 0.7, 0.58), smoothstep(0.56, 0.75, patches.b) * 0.7);
  diffuseColor.rgb *= rock;
`;

const ROCK_RELIEF = /* glsl */ `
  vec3 tnX = texture2D(uRockRelief, uvX).xyz * 2.0 - 1.0;
  vec3 tnY = texture2D(uRockRelief, uvY).xyz * 2.0 - 1.0;
  vec3 tnZ = texture2D(uRockRelief, uvZ).xyz * 2.0 - 1.0;
  vec3 bumped = faceNormal
    + vec3(0.0, tnX.y, tnX.x) * blend.x
    + vec3(tnY.x, 0.0, tnY.y) * blend.y
    + vec3(tnZ.x, tnZ.y, 0.0) * blend.z;
  normal = normalize((viewMatrix * vec4(normalize(bumped), 0.0)).xyz);
`;

function rockMaterial() {
  const surface = rockSurface(61);
  const uniforms = {
    uRock: { value: surface.map },
    uRockRelief: { value: surface.normalMap },
    uNoise: { value: noiseTexture(23) },
  };
  const material = new THREE.MeshLambertMaterial({ color: 0xbcb7b0, vertexColors: true, reflectivity: 0 });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;\nvarying vec3 vRockNormal;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${ROCK_VERTEX}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ROCK_HEAD}`)
      .replace('#include <map_fragment>', ROCK_COLOUR)
      .replace('#include <normal_fragment_maps>', ROCK_RELIEF);
    addAbyssFog(shader);
  };
  material.customProgramCacheKey = () => 'pillar-rock';
  return material;
}

export function addPillar(scene) {
  const pillar = new THREE.Mesh(pillarGeometry(), rockMaterial());
  pillar.receiveShadow = true;
  scene.add(pillar);
  return pillar;
}
