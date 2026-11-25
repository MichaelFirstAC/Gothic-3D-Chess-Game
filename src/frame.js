// The stone surround of the board: a carved dark marble frame with a polished
// border band. It is seated on the dais carved from the top of the rock pillar
// (pillar.js). Nothing here is metal.
import * as THREE from 'three';
import { marble } from './textures.js';

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

  for (const mesh of [frame, border]) {
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
}
