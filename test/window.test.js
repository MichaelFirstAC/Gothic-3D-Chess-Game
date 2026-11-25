import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WINDOW, REACH, MOON_DIR, MOON_SIZE, MOONLIGHT, holeEdge, glassShards } from '../src/roseShape.js';
import { breaks } from '../src/brokenGlass.js';

// The radius of the opening toward `angle`.
const edgeAt = (angle) => {
  const edge = holeEdge();
  const turn = ((angle / (Math.PI * 2)) % 1 + 1) % 1;
  return edge[Math.round(turn * edge.length) % edge.length].radius;
};

test('moonlight comes straight from the moon, down into the church', () => {
  const moon = new THREE.Vector3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z);
  assert.ok(Math.abs(moon.length() - 1) < 1e-9);
  assert.ok(moon.add(new THREE.Vector3(MOONLIGHT.x, MOONLIGHT.y, MOONLIGHT.z)).length() < 1e-9);
  assert.ok(MOONLIGHT.y < 0 && MOONLIGHT.z > 0, 'down and into the church');
});

test('seen from low beside the board, the window shows the moon, partly cut off', () => {
  const eye = new THREE.Vector3(0, 1.5, 21);
  const moon = new THREE.Vector3(MOON_DIR.x, MOON_DIR.y, MOON_DIR.z);
  const right = moon.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(moon);
  // Whether a line of sight passes through the opening in the wall.
  const through = (look) => {
    const share = (WINDOW.z - eye.z) / look.z;
    const x = eye.x + look.x * share - WINDOW.x;
    const y = eye.y + look.y * share - WINDOW.y;
    return Math.hypot(x, y) < edgeAt(Math.atan2(y, x));
  };
  const samples = 360;
  let hidden = 0;
  for (let i = 0; i < samples; i++) {
    const a = (i / samples) * Math.PI * 2;
    const limb = moon.clone().addScaledVector(right, Math.cos(a) * MOON_SIZE).addScaledVector(up, Math.sin(a) * MOON_SIZE);
    if (!through(limb.normalize())) hidden++;
  }
  assert.ok(through(moon), 'its middle shows');
  assert.ok(hidden > samples * 0.03, `only ${hidden} of the outline is cut off`);
  assert.ok(hidden < samples * 0.6, `${hidden} of the outline is hidden`);
});

test('the opening and its glass stay within the painted square', () => {
  for (const { radius } of holeEdge()) assert.ok(radius > 6.5 && radius < REACH);
  const shards = glassShards();
  assert.ok(shards.length > 15);
  for (const { corners } of shards) for (const [x, y] of corners) assert.ok(Math.max(Math.abs(x), Math.abs(y)) < REACH);
});

test('every window is broken, and no two in the same way', () => {
  const kinds = [5, 23, 71, 88].map((seed) => breaks(seed));
  for (const rings of kinds) {
    assert.ok(rings.length >= 3);
    const [great] = rings;
    const xs = great.map(([x]) => x);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 90, 'a break wide enough to see');
  }
  assert.equal(new Set(kinds.map((rings) => JSON.stringify(rings))).size, 4);
  assert.deepEqual(breaks(5), breaks(5));
});
