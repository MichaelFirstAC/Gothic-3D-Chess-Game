// A High Gothic interior after Cologne Cathedral, with the board at the
// crossing: clustered piers, pointed arcades, triforium, tall clerestory and
// ribbed vaults. It has no floor. Piers and walls carry on down into a chasm
// and are lost in the dark. Repeated parts are built once and instanced.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { lancetGlass, roseGlass, shaftTexture } from './textures.js';
import { stoneMaterial } from './stoneMaterial.js';
import { createFallingStone } from './fallingStone.js';
import { withAbyss } from './abyssFog.js';

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

// Shafts of coloured light falling from the clerestory, past the crossing and
// down into the chasm. They stand well back, where the camera cannot reach.
function addLightShafts(group) {
  const beam = shaftTexture();
  const additive = (color) => withAbyss(new THREE.MeshBasicMaterial({
    map: beam, color, opacity: 0.15, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide,
  }), { density: 0.04, floor: -40 });
  const quad = (a, b, c, d) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a, b, c, a, c, d].flat(), 3));
    // The texture is brightest at v = 1, which is the window end.
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 0], 2));
    return g;
  };
  const tints = { warm: 0xffa648, rose: 0xd6406a, cool: 0x4f7dff, violet: 0x9a5cff };
  const falls = [
    ['warm', 1, 1], ['cool', -1, 1], ['rose', 1, 2], ['violet', -1, 2],
    ['cool', 1, -1], ['warm', -1, -1], ['violet', 1, -2], ['rose', -1, -2],
  ];
  const END = -27;
  const beams = {};
  for (const [tint, side, bay] of falls) {
    const z = Math.sign(bay) * bayCentre(Math.abs(bay));
    const lean = Math.sign(bay) * 5;
    const top = BASE_Y + CLERESTORY + 7;
    const x0 = side * (HALF - 0.8);
    const x1 = -side * 3;
    (beams[tint] ||= []).push(
      quad([x0, top, z - 2.4], [x0, top, z + 2.4], [x1, END, z + lean + 4], [x1, END, z + lean - 4]),
      quad([x0, top + 2.2, z], [x0, top - 2.2, z], [x1 + side * 4, END, z + lean], [x1 - side * 4, END, z + lean]),
    );
  }
  const shafts = new THREE.Group();
  for (const [tint, color] of Object.entries(tints)) {
    shafts.add(new THREE.Mesh(mergeGeometries(beams[tint]), additive(color)));
  }
  group.add(shafts);
  return shafts;
}

export function addCathedral(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const stone = stoneMaterial({ color: 0x504a4c });
  const dark = withAbyss(new THREE.MeshBasicMaterial({ color: 0x07050a }));

  group.add(
    instanced(pierGeometry(), stone, pierPlacements()),
    instanced(bayGeometry(), stone, bayPlacements()),
    instanced(vaultGeometry(HALF * 2, BAY), stone, vaultPlacements()),
    instanced(vaultGeometry(HALF * 2, HALF * 2, 0.34), stone, [{ x: 0, z: 0 }]),
    instanced(undercroftGeometry(), stone, bayPlacements().map((p) => ({ ...p, y: UNDERCROFT }))),
  );

  // Darkness behind the triforium arcade.
  const passage = new THREE.PlaneGeometry(BAY - 1.4, 3.4).translate(0, TRIFORIUM + 1.7, 0);
  const outward = bayPlacements().map((p) => (p.turn
    ? { ...p, x: p.x + Math.sign(p.x) * 0.75, turn: -Math.sign(p.x) * Math.PI / 2 }
    : { ...p, z: p.z + Math.sign(p.z) * 0.75, turn: p.z > 0 ? Math.PI : 0 }));
  group.add(instanced(passage, dark, outward));

  // Stained glass is lit from outside, so it ignores the lamps but not the fog.
  const glass = (map, tint) => withAbyss(new THREE.MeshBasicMaterial({ map, color: tint, side: THREE.DoubleSide }));
  const clerestory = glassPane(6, WINDOW_HEIGHT).translate(0, CLERESTORY, 0);
  const panes = [lancetGlass(5), lancetGlass(23), lancetGlass(71)];
  panes.forEach((map, k) => {
    group.add(instanced(clerestory, glass(map, 0x9b93a8), bayPlacements().filter((_, i) => i % 3 === k)));
  });

  const { tall, low } = endAndAisleWindows();
  const frameFor = (width, height) => moulding(lancetOutline(0, 0, width, height), 0.18, 0.05, 48);
  group.add(
    instanced(glassPane(2.8, 12), glass(panes[1], 0x9a92ac), tall),
    instanced(stoneGeometry([frameFor(2.8, 12)]), stone, tall),
  );
  const aisle = glassPane(2.2, 8);
  group.add(
    instanced(aisle, glass(panes[2], 0x7d7690), low),
    instanced(stoneGeometry([frameFor(2.2, 8)]), stone, low),
  );

  // Walls closing the four arms, and the outer walls of the nave aisles. All of
  // them reach down as far as the piers.
  const wall = (width, depth, top, x, z) => block(width, top - DEEP, depth, x, (top + DEEP) / 2, z);
  const walls = [
    wall(HALF * 2 + 18, 1, WALL_TOP, 0, -NAVE_END - 0.1),
    wall(HALF * 2 + 18, 1, WALL_TOP, 0, NAVE_END + 0.1),
  ];
  for (const s of [-1, 1]) {
    walls.push(wall(1, HALF * 2, WALL_TOP, s * (TRANSEPT_END + 0.1), 0));
    for (const sz of [-1, 1]) {
      walls.push(wall(1, BAY * NAVE_BAYS, ARCADE_APEX + 1, s * (HALF + 9), sz * (HALF + BAY * NAVE_BAYS / 2)));
    }
  }
  const shell = new THREE.Mesh(stoneGeometry(walls), stone);
  shell.position.y = BASE_Y;
  group.add(shell);

  // The great rose at the east end, with stone tracery around it.
  const rose = new THREE.Mesh(
    new THREE.CircleGeometry(7.5, 64),
    new THREE.MeshBasicMaterial({ map: roseGlass(), color: 0xb4adc4, transparent: true, fog: false }),
  );
  rose.position.set(0, BASE_Y + 23.5, -NAVE_END + 0.55);
  const ring = new THREE.Mesh(stoneGeometry([
    new THREE.TorusGeometry(7.7, 0.45, 8, 64), new THREE.TorusGeometry(8.5, 0.2, 6, 64),
  ]), stone);
  ring.position.copy(rose.position);
  group.add(rose, ring);

  const shafts = addLightShafts(group);

  const rubble = createFallingStone(stone);
  group.add(rubble.group);

  // The stone costs the most to shade, so it is drawn after everything in
  // front of it: whatever is hidden is then never shaded at all.
  group.traverse((object) => {
    if (object.material === stone) object.renderOrder = 1;
  });

  return {
    update(seconds) { rubble.update(seconds); },
    // Dropped on slow machines.
    setShafts(visible) { shafts.visible = visible; },
  };
}
