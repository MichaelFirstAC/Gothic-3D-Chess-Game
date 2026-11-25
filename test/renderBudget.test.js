import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { pixelRatioFor, poseOf, createShadowWatch } from '../src/renderBudget.js';

test('a small window keeps the screen sharpness, up to the cap', () => {
  assert.equal(pixelRatioFor(0, 1, 960, 760), 1);
  assert.equal(pixelRatioFor(0, 1.25, 800, 600), 1.25);
  assert.equal(pixelRatioFor(0, 3, 400, 700), 1.35);
});

test('a large sharp window is held to the pixel budget', () => {
  for (const [w, h] of [[1280, 800], [1620, 1270], [2560, 1300]]) {
    const ratio = pixelRatioFor(0, 2, w, h);
    assert.ok(ratio < 2);
    assert.ok(w * h * ratio * ratio <= 1.75e6 * 1.001 || ratio === 0.6, `${w}x${h}: ${ratio}`);
  }
});

test('each lower level draws no more than the one above', () => {
  const ratios = [0, 1, 2, 3].map((level) => pixelRatioFor(level, 2, 1500, 1000));
  assert.deepEqual([...ratios].sort((a, b) => b - a), ratios);
  assert.ok(ratios[3] >= 0.6);
});

test('a view with no size yet is not a problem', () => {
  assert.equal(pixelRatioFor(0, 2, 0, 0), 1.35);
});

test('shadows are redrawn only when something changes', () => {
  const pieces = new THREE.Group();
  const knight = new THREE.Object3D();
  pieces.add(knight);
  const watch = createShadowWatch([pieces]);
  assert.equal(watch(false), true, 'the first frame');
  assert.equal(watch(false), false, 'nothing moved');
  knight.position.x += 0.01;
  assert.equal(watch(false), true, 'moved');
  knight.visible = false;
  assert.equal(watch(false), true, 'hidden');
  knight.rotation.y = 0.5;
  assert.equal(watch(false), true, 'turned');
  pieces.add(new THREE.Object3D());
  assert.equal(watch(false), true, 'added');
  pieces.remove(knight);
  assert.equal(watch(false), true, 'removed');
  assert.equal(watch(false), false);
});

test('shadows keep up with an effect, including the frame after it ends', () => {
  const watch = createShadowWatch([new THREE.Group()]);
  watch(false);
  assert.equal(watch(true), true);
  assert.equal(watch(true), true);
  assert.equal(watch(false), true);
  assert.equal(watch(false), false);
});

test('swapping one piece for another is noticed', () => {
  const group = new THREE.Group();
  group.add(new THREE.Object3D());
  const before = poseOf([group]);
  group.clear();
  group.add(new THREE.Object3D());
  assert.notEqual(poseOf([group]), before);
});
