import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { jaggedLine, heightAt, clipBelow, capBreak, brokenShaft, rubbleAlong } from '../src/ruin.js';
import { BAYS, PIERS } from '../src/ruinPlan.js';

const points = (geometry) => {
  const { position } = geometry.attributes;
  return Array.from({ length: position.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(position, i));
};

function area(geometry) {
  const all = points(geometry);
  let sum = 0;
  for (let i = 0; i < all.length; i += 3) {
    sum += new THREE.Triangle(all[i], all[i + 1], all[i + 2]).getArea();
  }
  return sum;
}

const wall = () => new THREE.PlaneGeometry(10, 20).translate(0, 10, 0);

test('a break runs from end to end and wanders about its level', () => {
  const line = jaggedLine(4, -4.5, 4.5, 20, 3);
  assert.equal(line[0][0], -4.5);
  assert.equal(line.at(-1)[0], 4.5);
  line.forEach(([x, y], i) => {
    if (i) assert.ok(x >= line[i - 1][0], 'goes one way');
    assert.ok(Math.abs(y - 20) < 12, String(y));
  });
  assert.ok(Math.max(...line.map(([, y]) => y)) - Math.min(...line.map(([, y]) => y)) > 1, 'ragged');
  assert.deepEqual(line, jaggedLine(4, -4.5, 4.5, 20, 3));
});

test('cutting a wall leaves exactly what lies below the break', () => {
  // Level at 5: a quarter of a 10 by 20 wall.
  assert.ok(Math.abs(area(clipBelow(wall(), [[-5, 5], [5, 5]])) - 50) < 1e-3);
  // A slope from 0 up to 20: half of it.
  assert.ok(Math.abs(area(clipBelow(wall(), [[-5, 0], [5, 20]])) - 100) < 1e-3);
  // Nothing is cut when the break is above, everything when below.
  assert.ok(Math.abs(area(clipBelow(wall(), [[-5, 30], [5, 30]])) - 200) < 1e-3);
  assert.ok(area(clipBelow(wall(), [[-5, -1], [5, -1]])) < 1e-6);
});

test('nothing is left standing above a ragged break', () => {
  const line = jaggedLine(9, -5, 5, 11, 3);
  const cut = clipBelow(wall(), line);
  for (const p of points(cut)) assert.ok(p.y <= heightAt(line, p.x) + 1e-3 || line.some(([x]) => Math.abs(x - p.x) < 0.07), `${p.x}, ${p.y}`);
  assert.ok(cut.attributes.normal.count === cut.attributes.position.count);
});

test('the raw top of a wall is closed only where there was stone', () => {
  const line = jaggedLine(2, -4, 4, 8);
  const cap = capBreak(line, 1, (x) => x > 0, 1);
  assert.ok(cap.attributes.position.count > 0);
  for (const p of points(cap)) {
    assert.ok(p.x > -1, `closed over thin air at ${p.x}`);
    assert.ok(Math.abs(p.z) <= 0.5 + 1e-6);
  }
  const { normal } = cap.attributes;
  for (let i = 0; i < normal.count; i++) assert.ok(normal.getY(i) >= -1e-6, 'faces upward');
});

test('snapped shafts and loose blocks are sound geometry', () => {
  const parts = [...brokenShaft(0.3, -5, 12, 8, 1, 2, 7), ...rubbleAlong([[-3, 10], [3, 12]], 6, 3)];
  for (const part of parts) {
    assert.ok(part.attributes.position.array.every(Number.isFinite));
    assert.equal(part.attributes.uv, undefined);
    for (const p of points(part)) assert.ok(p.y < 14.5, String(p.y));
  }
});

test('much has fallen, but enough stands', () => {
  const states = Object.values(BAYS);
  assert.ok(states.filter((s) => s === 'gone').length >= 4);
  assert.ok(states.length >= 10 && states.length <= 16, 'of 24 bays');
  assert.ok(Object.values(PIERS).every((h) => h >= 12), 'no pillar broken down out of sight');
});
