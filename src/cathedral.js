// A High Gothic cathedral after Cologne, in ruins, with the board at the
// crossing: clustered piers, pointed arcades, triforium, tall clerestory and
// ribbed vaults, much of it fallen (ruinPlan.js says what) and open to the sky.
// It has no floor. Piers and walls carry on down into a chasm and are lost in
// the dark. Whole parts are built once and instanced; broken ones are merged.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { brokenRose } from './brokenRose.js';
import { brokenLancet, brokenGlassMaterial } from './brokenGlass.js';
import { WINDOW, holeEdge } from './roseShape.js';
import { stoneMaterial, stoneTime } from './stoneMaterial.js';
import { createLamps } from './lamps.js';
import { withAbyss } from './abyssFog.js';
import { createSkyDome } from './skyDome.js';
import { jaggedLine, heightAt, clipBelow, capBreak, brokenShaft, rubbleAlong } from './ruin.js';
import { bayState, pierState, keyOf, WHOLE_VAULTS } from './ruinPlan.js';

// The level heights are measured from. There is no floor there.
const BASE_Y = -0.8;
// How far below that the stonework is built; it is black well before this.
const DEEP = -50;
// Where a blind arcade stands out of the walls, down in the chasm.
const UNDERCROFT = -12;
// Half-width of nave and transepts. The camera never travels farther out than
// about 21 units, so piers at the crossing corners never block the board.
const HALF = 16;
const BAY = 9;
const NAVE_BAYS = 4;
const TRANSEPT_BAYS = 2;
const NAVE_END = HALF + BAY * NAVE_BAYS;
const TRANSEPT_END = HALF + BAY * TRANSEPT_BAYS;

// Heights above the base level.
const ARCADE_SPRING = 10;
const ARCADE_APEX = 15;
const TRIFORIUM = 16;
const CLERESTORY = 20;
const WINDOW_HEIGHT = 12;
const VAULT_SPRING = 30;
const VAULT_APEX = 40;
const WALL_TOP = 34;

// ---------------------------------------------------------------- helpers

const stoneGeometry = (parts) => mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)));

const cylinder = (top, bottom, y0, y1, sides, x = 0, z = 0) =>
  new THREE.CylinderGeometry(top, bottom, y1 - y0, sides, 1, true).translate(x, (y0 + y1) / 2, z);

const block = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

// A pointed arch outline from its springing points up to the apex.
function archPoints(cx, spring, width, rise, segments = 10) {
  const half = width / 2;
  const side = (sign) => new THREE.QuadraticBezierCurve(
    new THREE.Vector2(cx + sign * half, spring),
    new THREE.Vector2(cx + sign * half, spring + rise * 0.72),
    new THREE.Vector2(cx, spring + rise),
  ).getPoints(segments);
  return [...side(-1), ...side(1).reverse().slice(1)];
}

// A lancet opening with its sill at y0 and its point at y0 + height.
function lancetOutline(cx, y0, width, height) {
  const rise = Math.min(width * 0.9, height * 0.45);
  return [
    new THREE.Vector2(cx - width / 2, y0),
    ...archPoints(cx, y0 + height - rise, width, rise),
    new THREE.Vector2(cx + width / 2, y0),
  ];
}

// A moulding: a thin tube following a flat outline in the plane z.
function moulding(points, radius, z, segments = 40) {
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) {
    path.add(new THREE.LineCurve3(
      new THREE.Vector3(points[i - 1].x, points[i - 1].y, z),
      new THREE.Vector3(points[i].x, points[i].y, z),
    ));
  }
  return new THREE.TubeGeometry(path, segments, radius, 5);
}

// A glass pane in the shape of a lancet, with the texture stretched across it.
function glassPane(width, height) {
  const geometry = new THREE.ShapeGeometry(new THREE.Shape(lancetOutline(0, 0, width, height)));
  const position = geometry.attributes.position;
  const uv = geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    uv.setXY(i, position.getX(i) / width + 0.5, position.getY(i) / height);
  }
  return geometry;
}

function instanced(geometry, material, placements) {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  const matrix = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  placements.forEach(({ x, y = BASE_Y, z, turn = 0, scale }, i) => {
    const size = scale ? new THREE.Vector3(scale[0], scale[1], 1) : one;
    mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3(x, y, z), spin.setFromAxisAngle(up, turn), size));
  });
  mesh.computeBoundingSphere();
  return mesh;
}

// ---------------------------------------------------------------- parts

// A bundle of slender shafts around a core, rising unbroken to the vault.
function pierGeometry() {
  const parts = [cylinder(0.9, 0.9, DEEP, VAULT_SPRING, 8)];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const major = i % 2 === 0;
    const radius = major ? 0.3 : 0.17;
    const x = Math.sin(angle) * 1.05;
    const z = Math.cos(angle) * 1.05;
    parts.push(cylinder(radius, radius, DEEP, VAULT_SPRING, major ? 8 : 6, x, z));
    // Foliage capitals where the arcade and the vault spring.
    for (const y of [ARCADE_SPRING, VAULT_SPRING]) {
      parts.push(cylinder(radius * 1.75, radius, y - 0.55, y, 6, x, z));
      parts.push(cylinder(radius * 1.85, radius * 1.85, y, y + 0.14, 6, x, z));
    }
  }
  // Rings binding the shafts, above and down into the dark.
  for (const y of [-19, -9, -0.2, TRIFORIUM - 0.3, CLERESTORY - 0.4]) parts.push(cylinder(1.38, 1.38, y, y + 0.16, 16));
  return stoneGeometry(parts);
}

// One bay of wall: the arcade arch below, four triforium openings, and one
// great clerestory window with tracery. It spans x from -BAY/2 to BAY/2.
function bayGeometry() {
  const half = BAY / 2;
  const arch = archPoints(0, ARCADE_SPRING, BAY, ARCADE_APEX - ARCADE_SPRING, 12);
  const wall = new THREE.Shape([
    ...arch, new THREE.Vector2(half, WALL_TOP), new THREE.Vector2(-half, WALL_TOP),
  ]);
  const lights = [-2.55, -0.85, 0.85, 2.55];
  const outline = lancetOutline(0, CLERESTORY, 6, WINDOW_HEIGHT);
  for (const x of lights) wall.holes.push(new THREE.Path(lancetOutline(x, TRIFORIUM + 0.2, 1.3, 3)));
  wall.holes.push(new THREE.Path(outline));
  const parts = [
    new THREE.ExtrudeGeometry(wall, { depth: 0.9, bevelEnabled: false }).translate(0, 0, -0.45),
  ];
  for (const z of [-0.55, 0.55]) {
    parts.push(moulding(arch, 0.3, z, 36));
    parts.push(moulding(archPoints(0, ARCADE_SPRING, BAY - 1, ARCADE_APEX - ARCADE_SPRING - 0.55), 0.16, z * 0.55, 36));
    parts.push(moulding(outline, 0.16, z, 44));
    for (const x of lights) parts.push(moulding(lancetOutline(x, TRIFORIUM + 0.2, 1.3, 3), 0.08, z * 0.9, 22));
    for (const y of [ARCADE_APEX + 0.55, CLERESTORY - 0.35]) parts.push(block(BAY, 0.26, 0.3, 0, y, z));
  }
  // Tracery: mullions, two sub-arches and an oculus.
  for (const x of [-1, 1]) parts.push(block(0.2, WINDOW_HEIGHT * 0.66, 0.3, x, CLERESTORY + WINDOW_HEIGHT * 0.33, 0));
  parts.push(block(0.14, WINDOW_HEIGHT * 0.66, 0.24, 0, CLERESTORY + WINDOW_HEIGHT * 0.33, 0));
  for (const x of [-1.5, 1.5]) {
    parts.push(moulding(archPoints(x, CLERESTORY + WINDOW_HEIGHT * 0.52, 3, 2.3), 0.1, 0, 24));
  }
  parts.push(new THREE.TorusGeometry(1.15, 0.11, 6, 24).translate(0, CLERESTORY + WINDOW_HEIGHT * 0.76, 0));
  return stoneGeometry(parts);
}

// The lower storey, seen dimly over the edge: a blind arch under a string
// course, standing a little proud of the wall behind it.
function undercroftGeometry() {
  const half = BAY / 2;
  const arch = archPoints(0, 0, BAY - 1.2, 4.4, 12);
  const wall = new THREE.Shape([
    new THREE.Vector2(-half, -9), new THREE.Vector2(-half + 0.6, -9), ...arch,
    new THREE.Vector2(half - 0.6, -9), new THREE.Vector2(half, -9),
    new THREE.Vector2(half, 5.6), new THREE.Vector2(-half, 5.6),
  ]);
  const parts = [new THREE.ExtrudeGeometry(wall, { depth: 0.9, bevelEnabled: false }).translate(0, 0, -0.45)];
  for (const z of [-0.55, 0.55]) {
    parts.push(moulding(arch, 0.26, z, 32));
    parts.push(block(BAY, 0.3, 0.34, 0, 5.4, z));
  }
  return stoneGeometry(parts);
}

// Quadripartite ribs over a span `width` (along x) by `length` (along z).
function vaultGeometry(width, length, thickness = 0.24) {
  const w = width / 2;
  const l = length / 2;
  const rib = (from, to, apex, radius) => {
    const middle = new THREE.Vector3((from.x + to.x) / 2, apex, (from.z + to.z) / 2);
    // Each half bows upward, which gives the rib its pointed profile.
    const halfRib = (end) => new THREE.QuadraticBezierCurve3(
      end, new THREE.Vector3().lerpVectors(end, middle, 0.18).setY(apex - 1.2), middle,
    );
    return [from, to].map((end) => new THREE.TubeGeometry(halfRib(end), 18, radius, 5));
  };
  const at = (x, z) => new THREE.Vector3(x, VAULT_SPRING, z);
  const parts = [
    ...rib(at(-w, -l), at(w, l), VAULT_APEX, thickness),
    ...rib(at(w, -l), at(-w, l), VAULT_APEX, thickness),
    ...rib(at(-w, -l), at(w, -l), VAULT_APEX - 0.4, thickness * 1.35),
    ...rib(at(-w, l), at(w, l), VAULT_APEX - 0.4, thickness * 1.35),
    ...rib(at(-w, -l), at(-w, l), VAULT_SPRING + 3.4, thickness),
    ...rib(at(w, -l), at(w, l), VAULT_SPRING + 3.4, thickness),
    block(0.3, 0.3, length, 0, VAULT_APEX, 0),
    new THREE.CylinderGeometry(0.75, 0.55, 0.5, 8).translate(0, VAULT_APEX - 0.15, 0),
  ];
  return stoneGeometry(parts);
}

// ---------------------------------------------------------------- ruins

// Where there was stone in a bay: above the arch, below the top of the wall
// and outside its windows.
function bayIsStone() {
  const arch = archPoints(0, ARCADE_SPRING, BAY, ARCADE_APEX - ARCADE_SPRING, 24).map((p) => [p.x, p.y]);
  const holes = [
    lancetOutline(0, CLERESTORY, 6, WINDOW_HEIGHT),
    ...[-2.55, -0.85, 0.85, 2.55].map((x) => lancetOutline(x, TRIFORIUM + 0.2, 1.3, 3)),
  ];
  const within = (ring, x, y) => ring.reduce((inside, a, i) => {
    const b = ring[(i + 1) % ring.length];
    const crosses = (a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    return crosses ? !inside : inside;
  }, false);
  return (x, y) => y < WALL_TOP - 0.05 && y > heightAt(arch, x) && !holes.some((ring) => within(ring, x, y));
}

// What is left of a bay: broken off along a ragged line, or nothing but the
// springing of its arch beside each pillar.
function ruinedBay(whole, isStone, state, seed) {
  const half = BAY / 2;
  const line = state === 'gone'
    ? [[-half, 14.6], [-3.9, 13.1], [-3.84, 12], [-2.9, 11.6], [-2.5, 8], [2.7, 8], [3.1, 11.2], [3.8, 11.5], [3.86, 13.4], [half, 13]]
    : jaggedLine(seed, -half, half, state, 3);
  return [
    clipBelow(whole, line),
    capBreak(line, 0.9, isStone, seed),
    ...(state === 'gone' ? [] : rubbleAlong(line, 9, seed)),
  ];
}

// A snapped pillar: every shaft has broken at its own height.
function ruinedPier(level, seed) {
  const height = (k) => level + (((seed * 37 + k * 53) % 17) / 17) * 5 - 2.4;
  const parts = brokenShaft(0.9, DEEP, level - 1.6, 8, 0, 0, seed);
  const tops = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const major = i % 2 === 0;
    const radius = major ? 0.3 : 0.17;
    const x = Math.sin(angle) * 1.05;
    const z = Math.cos(angle) * 1.05;
    const top = height(i);
    tops.push(top);
    parts.push(...brokenShaft(radius, DEEP, top, major ? 8 : 6, x, z, seed * 11 + i));
    if (top > ARCADE_SPRING + 0.8) {
      parts.push(cylinder(radius * 1.75, radius, ARCADE_SPRING - 0.55, ARCADE_SPRING, 6, x, z));
      parts.push(cylinder(radius * 1.85, radius * 1.85, ARCADE_SPRING, ARCADE_SPRING + 0.14, 6, x, z));
    }
  }
  for (const y of [-19, -9, -0.2, TRIFORIUM - 0.3]) {
    if (y < Math.min(...tops) - 0.6) parts.push(cylinder(1.38, 1.38, y, y + 0.16, 16));
  }
  parts.push(...rubbleAlong([[-1, level - 1.5], [1, level - 1.5]], 5, seed, 1.6));
  return parts;
}

// Fallen vaults: only the ribs springing from either side are left, reaching
// out into the sky and broken off.
function ruinedVault(whole, width, seed) {
  const w = width / 2;
  const line = [
    [-w - 1, 41], [-w * 0.78, 36.6], [-w * 0.77, 34.4], [-w * 0.52, 33.8], [-w * 0.46, 29],
    [w * 0.5, 29], [w * 0.62, 32.4], [w * 0.63, 34.2], [w * 0.86, 35], [w + 1, 40],
  ].map(([x, y], i) => [x, y + (((seed * 29 + i * 13) % 9) / 9 - 0.5) * 1.4]);
  return clipBelow(whole, line);
}

// An outer wall in the x-y plane, one unit thick, whose ragged top follows
// `tops`: [[along the wall, height], ...].
function raggedWall(tops, seed, hole) {
  const edge = [];
  for (let i = 1; i < tops.length; i++) {
    const [x0, y0] = tops[i - 1];
    const [x1, y1] = tops[i];
    const piece = jaggedLine(seed * 31 + i, x0, x1, 0, 1.5);
    for (const [x, jag] of piece) edge.push(new THREE.Vector2(x, y0 + ((y1 - y0) * (x - x0)) / (x1 - x0) + jag * 0.8));
  }
  const from = tops[0][0];
  const to = tops[tops.length - 1][0];
  const shape = new THREE.Shape([new THREE.Vector2(from, DEEP), new THREE.Vector2(to, DEEP), ...edge.reverse()]);
  if (hole) shape.holes.push(new THREE.Path(hole));
  return new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }).translate(0, 0, -0.5);
}

// The walls closing the four arms, and the outer walls of the nave aisles.
// Heights are measured from the base level.
function outerWalls() {
  const half = HALF + 9;
  // The east wall, with the broken window as a hole right through it.
  const opening = holeEdge().map(({ angle, radius }) => new THREE.Vector2(
    WINDOW.x + Math.cos(angle) * radius, WINDOW.y - BASE_Y + Math.sin(angle) * radius,
  ));
  const east = raggedWall(
    [[-half, 21], [-19, 27], [-15, 17], [-12, 36], [-6, 41], [-1, 36.5], [5, 43], [11, 35.5], [14, 38], [17, 22], [21, 30], [half, 18]],
    3, opening,
  ).translate(0, 0, WINDOW.z + 0.5);
  const west = raggedWall(
    [[-half, 15], [-17, 27], [-13, 31], [-5, 30.5], [-2, 24], [1, 31], [12, 31], [15, 19], [half, 23]], 5,
  ).translate(0, 0, NAVE_END + 0.1);
  const walls = [east, west];
  for (const s of [-1, 1]) {
    // The ends of the transepts keep their tall windows, but little above them.
    walls.push(raggedWall([[-HALF, 17], [-12, 30], [-4, 31], [0, s > 0 ? 29.5 : 36], [5, 31.5], [12, 30], [HALF, 14]], 7 + s)
      .rotateY(Math.PI / 2).translate(s * (TRANSEPT_END + 0.1), 0, 0));
    // Each aisle wall is low, and breached beside every bay that has gone.
    for (const end of [-1, 1]) {
      const tops = [[0, ARCADE_APEX + 1]];
      for (let i = 0; i < NAVE_BAYS; i++) {
        const breached = bayState({ x: s * HALF, z: end * bayCentre(i) }) === 'gone';
        if (breached) tops.push([i * BAY + 0.6, 9], [i * BAY + 2.4, -6], [i * BAY + 6.8, -3], [i * BAY + 8.4, 11]);
        else tops.push([i * BAY + 4.5, 14.5]);
      }
      tops.push([BAY * NAVE_BAYS, 15]);
      walls.push(raggedWall(tops, 11 + s * 3 + end)
        .rotateY(-end * Math.PI / 2).translate(s * (HALF + 9), 0, end * HALF));
    }
  }
  return walls;
}

// ---------------------------------------------------------------- layout

const range = (count, f) => Array.from({ length: count }, (_, i) => f(i));
const bayCentre = (i) => HALF + BAY * (i + 0.5);

function pierPlacements() {
  const places = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      range(NAVE_BAYS + 1, (i) => places.push({ x: sx * HALF, z: sz * (HALF + BAY * i) }));
      range(TRANSEPT_BAYS, (i) => places.push({ x: sx * (HALF + BAY * (i + 1)), z: sz * HALF }));
    }
  }
  return places;
}

// Walls run along the nave (turned a quarter) and along the transepts.
function bayPlacements() {
  const places = [];
  for (const a of [-1, 1]) {
    for (const b of [-1, 1]) {
      range(NAVE_BAYS, (i) => places.push({ x: a * HALF, z: b * bayCentre(i), turn: Math.PI / 2 }));
      range(TRANSEPT_BAYS, (i) => places.push({ x: b * bayCentre(i), z: a * HALF }));
    }
  }
  return places;
}

function vaultPlacements() {
  const places = [];
  for (const s of [-1, 1]) {
    range(NAVE_BAYS, (i) => places.push({ x: 0, z: s * bayCentre(i) }));
    range(TRANSEPT_BAYS, (i) => places.push({ x: s * bayCentre(i), z: 0, turn: Math.PI / 2 }));
  }
  return places;
}

// Window positions in walls that close each arm, and in the outer aisle walls.
function endAndAisleWindows() {
  const tall = [];
  const low = [];
  // The five under the great rose sit low enough to leave stone between their
  // points and its ring.
  for (const x of [-9.5, -4.75, 0, 4.75, 9.5]) tall.push({ x, y: BASE_Y + 0.5, z: -NAVE_END + 0.5 });
  for (const x of [-8, 0, 8]) tall.push({ x, y: BASE_Y + 8, z: NAVE_END - 0.5, turn: Math.PI, scale: [1.35, 1.7] });
  for (const s of [-1, 1]) {
    for (const z of [-8, 0, 8]) {
      tall.push({ x: s * (TRANSEPT_END - 0.5), y: BASE_Y + 7, z, turn: -s * Math.PI / 2, scale: [1.35, 1.7] });
    }
    for (const sz of [-1, 1]) {
      range(NAVE_BAYS, (i) => {
        for (const dz of [-1.9, 1.9]) {
          low.push({ x: s * (HALF + 8.4), y: BASE_Y + 2.2, z: sz * bayCentre(i) + dz, turn: -s * Math.PI / 2 });
        }
      });
    }
  }
  return { tall, low };
}

export function addCathedral(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const stone = stoneMaterial({ color: 0x3b363b });
  const dark = withAbyss(new THREE.MeshBasicMaterial({ color: 0x07050a }));

  const crossing = { x: 0, z: 0 };
  const standing = bayPlacements().filter((p) => bayState(p) === undefined);
  group.add(
    instanced(pierGeometry(), stone, pierPlacements().filter((p) => pierState(p) === undefined)),
    instanced(bayGeometry(), stone, standing),
    instanced(vaultGeometry(HALF * 2, BAY), stone, vaultPlacements().filter((p) => WHOLE_VAULTS.has(keyOf(p.x, p.z)))),
    instanced(undercroftGeometry(), stone, bayPlacements().map((p) => ({ ...p, y: UNDERCROFT }))),
  );

  // Everything broken is gathered into one mesh, put where it stood.
  const broken = [];
  const stand = (parts, { x, z, turn = 0 }, y = BASE_Y) => {
    for (const part of parts) {
      const geometry = part.index ? part.toNonIndexed() : part.clone();
      geometry.deleteAttribute('uv');
      broken.push(geometry.rotateY(turn).translate(x, y, z));
    }
  };
  const wholeBay = bayGeometry();
  const isStone = bayIsStone();
  bayPlacements().forEach((place, i) => {
    const state = bayState(place);
    if (state !== undefined) stand(ruinedBay(wholeBay, isStone, state, i + 3), place);
  });
  pierPlacements().forEach((place, i) => {
    const level = pierState(place);
    if (level !== undefined) stand(ruinedPier(level, i + 7), place);
  });
  const wholeVault = vaultGeometry(HALF * 2, BAY);
  vaultPlacements().forEach((place, i) => {
    if (!WHOLE_VAULTS.has(keyOf(place.x, place.z))) stand([ruinedVault(wholeVault, HALF * 2, i + 1)], place);
  });
  stand([ruinedVault(vaultGeometry(HALF * 2, HALF * 2, 0.34), HALF * 2, 21)], crossing);
  stand(outerWalls(), crossing);
  const ruins = new THREE.Mesh(mergeGeometries(broken), stone);
  group.add(ruins);

  // Darkness behind the triforium arcade, where it still stands.
  const passage = new THREE.PlaneGeometry(BAY - 1.4, 3.4).translate(0, TRIFORIUM + 1.7, 0);
  const outward = standing.map((p) => (p.turn
    ? { ...p, x: p.x + Math.sign(p.x) * 0.75, turn: -Math.sign(p.x) * Math.PI / 2 }
    : { ...p, z: p.z + Math.sign(p.z) * 0.75, turn: p.z > 0 ? Math.PI : 0 }));
  group.add(instanced(passage, dark, outward));

  // Stained glass is lit from outside, so it ignores the lamps but not the fog.
  // All of it is broken, in four different ways, half of them mirrored.
  const panes = [5, 23, 71, 88].map(brokenLancet);
  // Shares the windows at `places` out among the four, and adds them.
  const glaze = (geometry, places, tint, first = 0) => {
    panes.forEach((map, k) => {
      const mine = places.filter((_, i) => (i + first) % panes.length === k);
      if (mine.length) group.add(instanced(geometry, brokenGlassMaterial(map, tint), mine));
    });
  };
  glaze(glassPane(6, WINDOW_HEIGHT).translate(0, CLERESTORY, 0), standing, 0x9b93a8);

  const { tall, low: everyLow } = endAndAisleWindows();
  // The aisle windows went with the wall wherever it is breached.
  const low = everyLow.filter(({ x, z }) => bayState({
    x: Math.sign(x) * HALF,
    z: Math.sign(z) * bayCentre(Math.floor((Math.abs(z) - HALF) / BAY)),
  }) !== 'gone');
  const frameFor = (width, height) => moulding(lancetOutline(0, 0, width, height), 0.18, 0.05, 48);
  glaze(glassPane(2.8, 12), tall, 0x9a92ac, 1);
  glaze(glassPane(2.2, 8), low, 0x7d7690, 2);
  group.add(
    instanced(stoneGeometry([frameFor(2.8, 12)]), stone, tall),
    instanced(stoneGeometry([frameFor(2.2, 8)]), stone, low),
  );

  // The great rose at the east end, broken open to the night.
  const rose = brokenRose(stone);
  group.add(rose);

  const lamps = createLamps();
  group.add(lamps.group);

  const sky = createSkyDome();
  group.add(sky.mesh);

  // The stone costs the most to shade, so it is drawn after everything in
  // front of it: whatever is hidden is then never shaded at all.
  group.traverse((object) => {
    if (object.material === stone) object.renderOrder = 1;
  });

  return {
    update(seconds) {
      sky.update(seconds);
      lamps.update(seconds);
      stoneTime.value = seconds;
    },
  };
}
