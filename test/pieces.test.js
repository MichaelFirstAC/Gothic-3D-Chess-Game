import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createPieceFactory } from '../src/pieces.js';

const make = createPieceFactory();

// A white piece, facing +z, with its meshes by material.
function stand(letter) {
  const piece = make(letter);
  piece.rotation.set(0, 0, 0);
  piece.updateMatrixWorld(true);
  const [body, trim, glow, dark] = piece.children;
  for (const mesh of piece.children) mesh.material.side = THREE.DoubleSide;
  return { body, trim, glow, dark };
}

const vertices = (mesh) => {
  const points = mesh.geometry.attributes.position;
  return Array.from({ length: points.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(points, i));
};

// How far `point` stands clear of the stone, looking from it toward `toward`.
// Nothing or less than nothing means that it is on the stone or in it.
function clearance(stone, point, toward) {
  const way = toward.clone().sub(point).normalize();
  // Starting a little way out, so that a point just inside is seen to be so.
  const ray = new THREE.Raycaster(point.clone().addScaledVector(way, -0.02), way);
  const hit = ray.intersectObject(stone)[0];
  return hit ? hit.distance - 0.02 : Infinity;
}

test('windows lie flat on their shafts, tapering or not, from sill to point', () => {
  // Each shaft's windows are those whose dark panes are between these heights.
  for (const [letter, from, to] of [['R', 0.43, 0.69], ['N', 0.2, 0.29], ['B', 0.3, 0.49], ['Q', 0.3, 0.47], ['K', 0.54, 0.83]]) {
    const { body, dark } = stand(letter);
    const panes = vertices(dark).filter((v) => v.y > from && v.y < to && Math.hypot(v.x, v.z) < 0.25);
    assert.ok(panes.length > 0, letter);
    const worst = Math.max(...panes.map((v) => clearance(body, v, new THREE.Vector3(0, v.y, 0))));
    assert.ok(worst < 0.012, `${letter}: a window stands ${worst.toFixed(3)} off its shaft`);
  }
});

test('the lights of the crowns and the mitre lie on the stone too', () => {
  for (const [letter, from, to] of [['Q', 1.14, 1.23], ['K', 1.25, 1.33], ['B', 0.98, 1.2]]) {
    const { body, glow } = stand(letter);
    const lights = vertices(glow).filter((v) => v.y > from && v.y < to);
    assert.ok(lights.length > 0, letter);
    const worst = Math.max(...lights.map((v) => clearance(body, v, new THREE.Vector3(0, v.y, 0))));
    assert.ok(worst < 0.012, `${letter}: a light stands ${worst.toFixed(3)} off the stone`);
  }
});

// The distance from a point to the nearest of a mesh's triangles.
function distanceTo(triangles, point) {
  const near = new THREE.Vector3();
  let best = Infinity;
  for (const { triangle, box } of triangles) {
    if (box.distanceToPoint(point) < best) {
      best = Math.min(best, triangle.closestPointToPoint(point, near).distanceTo(point));
    }
  }
  return best;
}

const trianglesOf = (mesh) => {
  const corners = vertices(mesh);
  const all = Array.from({ length: corners.length / 3 }, (_, i) => {
    const three = corners.slice(i * 3, i * 3 + 3);
    return { triangle: new THREE.Triangle(...three), box: new THREE.Box3().setFromPoints(three) };
  });
  // A triangle with no area (at the point of a turned form) has no nearest point.
  return all.filter(({ triangle }) => triangle.getArea() > 1e-10);
};

test("the knight's straps lie on its head and neck", () => {
  const { body, trim } = stand('N');
  const stone = trianglesOf(body);
  // The lames, the bridle and the noseband.
  const straps = vertices(trim).filter((v) => v.y > 0.4 && v.y < 0.82 && Math.abs(v.x) > 0.045);
  assert.ok(straps.length > 500);
  const worst = Math.max(...straps.map((v) => distanceTo(stone, v)));
  assert.ok(worst < 0.016, `a strap stands ${worst.toFixed(3)} off the head`);
});

test("the knight's neck straps have no loose ends", () => {
  const { trim } = stand('N');
  const gold = vertices(trim);
  // Each of the three rings is met on both flanks, over the nape and at the throat.
  for (const [nape, throat] of [
    [[0.42, -0.25], [0.4, 0.16]], [[0.52, -0.26], [0.462, 0.165]],
    [[0.625, -0.26], [0.522, 0.14]],
  ]) {
    const along = new THREE.Vector2(throat[1] - nape[1], throat[0] - nape[0]).normalize();
    const middle = new THREE.Vector2((nape[1] + throat[1]) / 2, (nape[0] + throat[0]) / 2);
    // The gold lying in this ring's plane, by its direction round the neck.
    const round = new Set(gold
      .map((v) => ({ x: v.x, off: new THREE.Vector2(v.z, v.y).sub(middle) }))
      .filter(({ off }) => Math.abs(off.cross(along)) < 0.013 && off.length() < 0.3)
      .map(({ x, off }) => Math.floor(((Math.atan2(x, off.dot(along)) + Math.PI) / (Math.PI * 2)) * 12) % 12));
    assert.equal(round.size, 12, `the ring from ${nape} to ${throat} is broken`);
  }
});

test("the gold ring round the knight's base is not broken by its neck", () => {
  const { body } = stand('N');
  // Nothing of the stone comes out past the middle of the ring at its height.
  const within = 0.232 * Math.cos(Math.PI / 8);
  const through = vertices(body).filter((v) => v.y > 0.29 && v.y < 0.312
    && Array.from({ length: 8 }, (_, i) => (i * Math.PI) / 4)
      .some((a) => v.x * Math.sin(a) + v.z * Math.cos(a) > within + 0.003)
    // The drum's own rim, under the ring, is meant to be there.
    && Math.abs(v.y - 0.3) > 0.001);
  assert.equal(through.length, 0, `${through.length} corners come through the ring`);
});

test('the piers of the flying buttresses reach down to the plinth', () => {
  for (const [letter, out] of [['R', 0.31], ['B', 0.24], ['Q', 0.29], ['K', 0.3]]) {
    const { body } = stand(letter);
    // The lowest corners of the piers: out where only they and the plinth are.
    const feet = vertices(body).filter((v) => {
      const from = Math.hypot(v.x, v.z);
      return Math.abs(from - out) < 0.02 && v.y > 0.05 && v.y < 0.14;
    });
    assert.ok(feet.length > 0, `${letter}: no pier comes below the top of the plinth`);
  }
});
