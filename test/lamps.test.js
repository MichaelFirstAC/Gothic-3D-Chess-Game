import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { lampPlan, LAMP_LIGHT } from '../src/lampPlan.js';
import { bakeLight } from '../src/lightBake.js';
import { lampGeometry } from '../src/lamps.js';
import { bayState, pierState } from '../src/ruinPlan.js';
import { createPieceFactory } from '../src/pieces.js';

const lamps = lampPlan();

test('there are fires of all three kinds all round the building', () => {
  assert.equal(lamps.length, 20);
  for (const kind of Object.keys(LAMP_LIGHT)) assert.ok(lamps.filter((l) => l.kind === kind).length >= 4, kind);
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    assert.ok(lamps.some(({ at: [x, , z] }) => Math.sign(x) === sx && Math.sign(z) === sz), `${sx}, ${sz}`);
  }
});

test('no lamp hangs on stone that has fallen', () => {
  for (const { kind, at: [x, y, z] } of lamps) {
    if (kind === 'lantern' && Math.abs(x) === 16) assert.equal(bayState({ x, z }), undefined, `bay ${x},${z}`);
    if (kind === 'torch' && Math.abs(Math.abs(x) - 13.4) > 0.1) {
      // The pillar it is fixed to is the one just behind it.
      const px = [16, 25, 34, 43].map((v) => v * Math.sign(x)).find((v) => Math.abs(v - x) < 2.1);
      const pz = [16, 25, 34, 43].map((v) => v * Math.sign(z)).find((v) => Math.abs(v - z) < 2.1);
      const level = pierState({ x: px, z: pz });
      assert.ok(level === undefined || level - 0.8 > y + 2, `torch above the stump at ${px},${pz}`);
    }
  }
});

test('no lamp comes within reach of the camera or the board', () => {
  for (const { at: [x, y, z] } of lamps) {
    const out = Math.max(Math.abs(x), Math.abs(z));
    assert.ok(out > 13, `${x}, ${z} is over the board`);
    // The camera stays within 21 of the middle, and 3 more by panning.
    if (Math.abs(x) < 17 && Math.abs(z) < 17) assert.ok(Math.hypot(Math.abs(x) - 14.8, Math.abs(z) - 14.8) > 1.1 || y > 18);
  }
});

test('the ironwork is one sound mesh and stays cheap', () => {
  const geometry = lampGeometry();
  assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  assert.ok(geometry.attributes.color.count === geometry.attributes.position.count);
  assert.ok(geometry.attributes.position.count / 3 < 90000, String(geometry.attributes.position.count / 3));
});

test('baked light fades with distance and points back toward its source', () => {
  const grid = { min: [-5, -5, -5], size: [11, 11, 11], step: 1 };
  const { light, way } = bakeLight([{ x: 0, y: 0, z: 0, reach: 5, colour: [2, 1, 0], fire: true }], grid);
  const at = (x, y, z) => ((z + 5) * 11 + (y + 5)) * 11 + (x + 5);
  assert.ok(light[at(1, 0, 0) * 4] > light[at(3, 0, 0) * 4]);
  assert.equal(light[at(5, 0, 0) * 4], 0, 'nothing beyond its reach');
  assert.equal(light[at(2, 0, 0) * 4 + 3], 1, 'all of it is firelight');
  assert.ok(way[at(3, 0, 0) * 4] < -0.99, 'it lies back toward -x');
});

test('light from two sides leaves no single direction', () => {
  const grid = { min: [-5, -1, -1], size: [11, 3, 3], step: 1 };
  const lamp = (x, fire) => ({ x, y: 0, z: 0, reach: 8, colour: [1, 1, 1], fire });
  const { light, way } = bakeLight([lamp(-3, true), lamp(3, false)], grid);
  const middle = ((1 * 3 + 1) * 11 + 5) * 4;
  assert.ok(Math.abs(way[middle]) < 1e-6);
  assert.ok(Math.abs(light[middle + 3] - 0.5) < 1e-6, 'half of it flickers');
});

test('a pawn cannot be seen through its hood from any side', () => {
  const pawn = createPieceFactory()('P');
  pawn.rotation.y = 0;
  pawn.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const sides = pawn.children.map((mesh) => mesh.material.side);
  const first = (side) => {
    for (const mesh of pawn.children) mesh.material.side = side;
    return ray.intersectObject(pawn, true)[0]?.distance;
  };
  let looked = 0;
  // Level and downward sights at the head from every direction.
  for (let a = 0; a < 48; a++) {
    for (const [height, tilt] of [[0.63, 0], [0.7, 0], [0.74, 0], [0.8, 0], [0.72, 0.5], [0.68, 0.9]]) {
      for (const aside of [-0.1, -0.06, 0, 0.06, 0.1]) {
        const angle = (a / 48) * Math.PI * 2;
        const from = new THREE.Vector3(Math.sin(angle), tilt, Math.cos(angle)).normalize().multiplyScalar(3);
        const across = new THREE.Vector3(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(aside);
        const target = new THREE.Vector3(0, height, 0).add(across);
        const origin = target.clone().add(from);
        ray.set(origin, from.clone().negate().normalize());
        const anything = first(THREE.DoubleSide);
        if (anything === undefined) continue;
        looked++;
        // The nearest thing in the way must be turned toward the eye, or it
        // would not be drawn and what lies behind would show.
        const drawn = first(THREE.FrontSide);
        assert.ok(drawn !== undefined && drawn - anything < 0.012, `through at ${(angle * 180) / Math.PI} degrees, height ${height}, aside ${aside}`);
      }
    }
  }
  pawn.children.forEach((mesh, i) => { mesh.material.side = sides[i]; });
  assert.ok(looked > 500);
});
