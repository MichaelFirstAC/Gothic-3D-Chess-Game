// The cathedral is coming apart: lumps of masonry break loose along the far
// walls and tumble slowly into the chasm.
import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import { seededRandom } from './textures.js';

// Stones fall from this height to this one, then begin again. Both ends are out
// of sight: one up in the gloom, the other in the black below.
const FROM = 34;
const TO = -44;

// Where each stone falls. Every one hugs a wall in one of the four arms, farther
// out than the camera can travel, so none ever passes in front of the board.
export function fallingStonePlaces(count = 90, seed = 71) {
  const random = seededRandom(seed);
  const between = (min, max) => min + random() * (max - min);
  return Array.from({ length: count }, (_, i) => {
    const end = i % 2 ? 1 : -1;
    // Most fall in the long nave arms, the rest in the shorter transepts.
    const nave = i % 5 < 3;
    const side = random() < 0.5 ? -1 : 1;
    const along = end * (nave ? between(23, 48) : between(23, 31));
    const across = side * between(9, 14.6);
    return {
      x: nave ? across : along,
      z: nave ? along : across,
      phase: random(),
      speed: between(1.1, 3.4),
      // Mostly crumbs, now and then a whole block.
      size: 0.16 + random() ** 3 * 0.95,
      axis: [between(-1, 1), between(-1, 1), between(-1, 1)],
      spin: between(0.25, 1.3),
    };
  });
}

// The height of a falling stone after `seconds`.
export function fallingHeight({ phase, speed }, seconds) {
  const span = FROM - TO;
  return FROM - ((phase * span + speed * seconds) % span);
}

function lump(random) {
  const points = Array.from({ length: 11 }, () => new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5)
    .normalize().multiplyScalar(0.6 + random() * 0.5));
  const geometry = new ConvexGeometry(points);
  geometry.deleteAttribute('uv');
  return geometry;
}

export function createFallingStone(material) {
  const random = seededRandom(9);
  const places = fallingStonePlaces();
  // A few shapes, shared out among the stones.
  const kinds = [0, 1, 2].map((kind) => {
    const mine = places.filter((_, i) => i % 3 === kind);
    const mesh = new THREE.InstancedMesh(lump(random), material, mine.length);
    // They move all over the building, so a fixed bounding sphere would not do.
    mesh.frustumCulled = false;
    return { mesh, mine };
  });
  const group = new THREE.Group();
  group.add(...kinds.map(({ mesh }) => mesh));

  const matrix = new THREE.Matrix4();
  const turn = new THREE.Quaternion();
  const axis = new THREE.Vector3();
  const at = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const update = (seconds) => {
    for (const { mesh, mine } of kinds) {
      mine.forEach((stone, i) => {
        turn.setFromAxisAngle(axis.set(...stone.axis).normalize(), seconds * stone.spin + stone.phase * 6.28);
        at.set(stone.x, fallingHeight(stone, seconds), stone.z);
        mesh.setMatrixAt(i, matrix.compose(at, turn, scale.setScalar(stone.size)));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  };
  update(0);
  return { group, update };
}
