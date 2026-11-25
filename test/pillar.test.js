import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  DAIS_FOOT, TOP_Y, gravePosition, rimRadius, squareReach,
} from '../src/pillarShape.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { pillarParts } from '../src/pillar.js';

// All of the pillar as one mesh, for measuring.
const pillarGeometry = () => mergeGeometries(Object.values(pillarParts()).map((geometry) => {
  const bare = geometry.clone();
  for (const name of Object.keys(bare.attributes)) if (name !== 'position') bare.deleteAttribute(name);
  return bare;
}));

const angles = Array.from({ length: 720 }, (_, i) => (i / 720) * Math.PI * 2);

// Whether a point of the flat top lies inside the rim.
const onTop = (x, z) => Math.hypot(x, z) <= rimRadius(Math.atan2(x, z));

test('the rim stays outside the dais all the way round', () => {
  for (const a of angles) assert.ok(rimRadius(a) >= DAIS_FOOT * squareReach(a) + 0.1, `at ${a}`);
});

test('the rim joins up with itself', () => {
  assert.ok(Math.abs(rimRadius(0) - rimRadius(Math.PI * 2)) < 1e-9);
});

test('all four candle stands have rock under their whole foot', () => {
  for (const x of [-5.7, 5.7]) {
    for (const z of [-5.7, 5.7]) {
      for (const a of angles) assert.ok(onTop(x + Math.sin(a) * 0.48, z + Math.cos(a) * 0.48), `${x},${z} at ${a}`);
    }
  }
});

test('every grave is on the flat top, between the dais and the edge', () => {
  // A captured piece is drawn small; this is roughly the radius of its base.
  const foot = 0.2;
  for (const side of [1, -1]) {
    for (let i = 0; i < 15; i++) {
      const [x, y, z] = gravePosition(side, i);
      assert.equal(y, TOP_Y);
      assert.ok(Math.abs(x) - foot > DAIS_FOOT, `against the dais: ${x}`);
      for (const a of angles) assert.ok(onTop(x + Math.sin(a) * foot, z + Math.cos(a) * foot), `off the edge: ${x}, ${z}`);
    }
  }
});

test('no two graves share a place', () => {
  const places = [1, -1].flatMap((side) => Array.from({ length: 15 }, (_, i) => gravePosition(side, i).join()));
  assert.equal(new Set(places).size, 30);
});

test('the pillar is one sound mesh that reaches far down', () => {
  const geometry = pillarGeometry();
  const values = geometry.attributes.position.array;
  assert.ok(values.every(Number.isFinite), 'every vertex is a real point');
  geometry.computeBoundingBox();
  const { min, max } = geometry.boundingBox;
  assert.ok(min.y <= -60, `only reaches ${min.y}`);
  // Nothing pokes up through the board.
  assert.ok(max.y < -0.2, `rises to ${max.y}`);
  assert.ok(geometry.attributes.position.count / 3 < 70000, 'stays cheap to draw');
});

// The height of the rock straight below a point.
function ground() {
  const mesh = new THREE.Mesh(pillarGeometry(), new THREE.MeshBasicMaterial());
  const ray = new THREE.Raycaster();
  return (x, z) => {
    ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
    return ray.intersectObject(mesh)[0]?.point.y ?? -Infinity;
  };
}

test('every grave and candle stand rests on level rock, with nothing poking through', () => {
  const heightAt = ground();
  const footing = (x, z, reach, level, what) => {
    for (const [dx, dz] of [[0, 0], [reach, 0], [-reach, 0], [0, reach], [0, -reach]]) {
      const y = heightAt(x + dx, z + dz);
      assert.ok(Math.abs(y - level) < 0.01, `${what} at ${x + dx}, ${z + dz}: rock at ${y}`);
    }
  };
  for (const side of [1, -1]) {
    for (let i = 0; i < 15; i++) {
      const [x, y, z] = gravePosition(side, i);
      footing(x, z, 0.16, y, 'grave');
    }
  }
  for (const x of [-5.7, 5.7]) {
    for (const z of [-5.7, 5.7]) footing(x, z, 0.44, TOP_Y, 'stand');
  }
});
