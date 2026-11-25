// The stone surround of the board: a carved dark marble frame with a polished
// border band, on a rough, chipped limestone plinth. Nothing here is metal.
import * as THREE from 'three';
import { marble, limestone } from './textures.js';

// A square ring with chamfered edges. `inner` and `outer` are half-widths of the
// finished stone, and `top` is the height of its upper face.
function chamferedRing({ inner, outer, top, height, chamfer }) {
  const square = (path, half) => {
    path.moveTo(-half, -half);
    path.lineTo(half, -half);
    path.lineTo(half, half);
    path.lineTo(-half, half);
    path.closePath();
    return path;
  };
  // The bevel grows the outline and shrinks the hole, so start inset by it.
  const shape = square(new THREE.Shape(), outer - chamfer);
  shape.holes.push(square(new THREE.Path(), inner + chamfer));
  return new THREE.ExtrudeGeometry(shape, {
    depth: height - chamfer * 2, bevelEnabled: true, bevelThickness: chamfer, bevelSize: chamfer, bevelSegments: 1,
  }).rotateX(-Math.PI / 2).translate(0, top - height + chamfer, 0);
}

// A stable pseudo-random value for a point, so that faces which share a corner
// move it the same way and no cracks open between them.
function jitter(x, y, z, salt) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7 + salt * 19.19) * 43758.5453;
  return s - Math.floor(s);
}

// A block whose edges and faces have been knocked about.
export function chippedBlock(size, height, { segments = 40, chip = 0.07, seed = 1 } = {}) {
  const geometry = new THREE.BoxGeometry(size, height, size, segments, 3, segments);
  const position = geometry.attributes.position;
  const half = [size / 2, height / 2, size / 2];
  const point = [0, 0, 0];
  for (let i = 0; i < position.count; i++) {
    point[0] = position.getX(i);
    point[1] = position.getY(i);
    point[2] = position.getZ(i);
    const key = point.map((v) => Math.round(v * 1000) / 1000);
    const onFace = point.map((v, axis) => Math.abs(Math.abs(v) - half[axis]) < 1e-4);
    const edge = onFace.filter(Boolean).length >= 2;
    // Edges chip deeply here and there; flat faces are only slightly uneven.
    const bite = edge ? chip * (jitter(...key, seed) ** 3) * 2.2 : chip * 0.14 * jitter(...key, seed + 5);
    for (let axis = 0; axis < 3; axis++) {
      if (onFace[axis]) position.setComponent(i, axis, point[axis] - Math.sign(point[axis]) * bite);
    }
  }
  const faceted = geometry.toNonIndexed();
  faceted.computeVertexNormals();
  return faceted;
}

export function addFrame(scene, environment) {
  // Stretches one slab of marble across the whole frame.
  const slab = (base, vein, seed) => {
    const map = marble(base, vein, seed);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.repeat.set(1 / 9.4, 1 / 9.4);
    map.offset.set(0.5, 0.5);
    return map;
  };
  const stone = (map, roughness, extra = {}) => new THREE.MeshStandardMaterial({
    map, roughness, metalness: 0, envMap: environment, envMapIntensity: roughness < 0.5 ? 0.22 : 0.06, ...extra,
  });

  const granite = slab('#221f24', '#6d6671', 143);
  const band = slab('#6b6259', '#c8bca8', 57);
  // Extruded geometry has two groups: the flat faces, then the sides and chamfers.
  const frame = new THREE.Mesh(
    chamferedRing({ inner: 4, outer: 4.46, top: 0.03, height: 0.24, chamfer: 0.035 }),
    [stone(granite, 0.3), stone(granite, 0.78)],
  );
  const border = new THREE.Mesh(
    chamferedRing({ inner: 4.012, outer: 4.1, top: 0.043, height: 0.05, chamfer: 0.012 }),
    [stone(band, 0.28), stone(band, 0.45)],
  );

  const limeMap = limestone(29);
  limeMap.wrapS = limeMap.wrapT = THREE.RepeatWrapping;
  limeMap.repeat.set(3, 3);
  const lime = stone(limeMap, 0.85, { color: 0x9a9184, flatShading: true });
  const step = new THREE.Mesh(chippedBlock(9.2, 0.17, { chip: 0.05, seed: 3 }), lime);
  step.position.y = -0.29;
  const plinth = new THREE.Mesh(chippedBlock(9.56, 0.42, { chip: 0.085, seed: 8 }), lime);
  plinth.position.y = -0.58;

  for (const mesh of [frame, border, step, plinth]) {
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}
