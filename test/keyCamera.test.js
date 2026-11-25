import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createKeyMotion, isTyping, createKeyTracker, clampTarget, PAN_LIMIT } from '../src/keyCamera.js';
import { TOP_Y } from '../src/pillarShape.js';

const limits = { minDistance: 6, maxDistance: 21, maxPolarAngle: Math.PI * 0.49 };
const start = { radius: 13, phi: 0.64, theta: 0 };
// Holds the keys for a while from a standstill, one frame at a time.
function steer(keys, seconds = 0.5, frame = 1 / 60) {
  const motion = createKeyMotion();
  let view = start;
  for (let t = 0; t < seconds - 1e-9; t += frame) view = motion.step(view, keys, frame, limits) || view;
  return view;
}

test('each key moves the camera its own way', () => {
  assert.ok(steer(['KeyD']).theta > 0 && steer(['KeyA']).theta < 0);
  assert.ok(steer(['KeyW']).phi < start.phi && steer(['KeyS']).phi > start.phi);
  assert.ok(steer(['KeyQ']).radius > start.radius && steer(['KeyE']).radius < start.radius);
});

test('opposite keys cancel, other keys do nothing, and keys combine', () => {
  assert.deepEqual(steer(['KeyA', 'KeyD', 'KeyW', 'KeyS', 'KeyQ', 'KeyE', 'KeyZ']), start);
  const both = steer(['KeyD', 'KeyE']);
  assert.ok(both.theta > 0 && both.radius < start.radius);
});

test('tilt and zoom stay within the mouse limits', () => {
  assert.equal(steer(['KeyS'], 60).phi, limits.maxPolarAngle);
  assert.ok(steer(['KeyW'], 60).phi > 0);
  assert.equal(steer(['KeyQ'], 60).radius, 21);
  assert.equal(steer(['KeyE'], 60).radius, 6);
});

test('panning cannot carry the camera under the pillar top or far away', () => {
  assert.deepEqual(clampTarget({ x: 1, y: 1, z: -2 }), { x: 1, y: 1, z: -2 });
  const far = clampTarget({ x: 30, y: -40, z: 40 });
  assert.ok(Math.abs(Math.hypot(far.x, far.z) - PAN_LIMIT.radius) < 1e-9);
  assert.equal(far.y, PAN_LIMIT.minY);
  assert.equal(clampTarget({ x: 0, y: 90, z: 0 }).y, PAN_LIMIT.maxY);
  // Even at the lowest tilt and the longest reach, the camera is above the top.
  assert.ok(PAN_LIMIT.minY + limits.maxDistance * Math.cos(limits.maxPolarAngle) > TOP_Y);
});

test('movement eases in, then glides to a stop', () => {
  const motion = createKeyMotion();
  let view = start;
  const turnedBy = (keys) => {
    const next = motion.step(view, keys, 1 / 60, limits);
    if (!next) return null;
    const turned = next.theta - view.theta;
    view = next;
    return turned;
  };
  const held = Array.from({ length: 60 }, () => turnedBy(['KeyD']));
  assert.ok(held[0] > 0 && held[0] < held[10] && held[10] < held[30], 'speeds up');
  assert.ok(held[59] - held[58] < held[1] - held[0], 'and levels off');
  const released = [];
  for (let moved = turnedBy([]); moved !== null && released.length < 600; moved = turnedBy([])) released.push(moved);
  assert.ok(released[0] > held[59] * 0.8, 'no sudden stop');
  assert.ok(released.every((moved, i) => moved >= 0 && (i === 0 || moved < released[i - 1])), 'only slows');
  assert.ok(released.length > 15 && released.length < 150, String(released.length));
});

test('the distance covered does not depend on the frame rate', () => {
  const smooth = steer(['KeyD'], 1, 1 / 120);
  const choppy = steer(['KeyD'], 1, 1 / 20);
  assert.ok(Math.abs(smooth.theta - choppy.theta) < 1e-9);
});

test('no speed is left over after pushing against a limit', () => {
  const motion = createKeyMotion();
  let view = start;
  for (let i = 0; i < 300; i++) view = motion.step(view, ['KeyS'], 1 / 60, limits);
  const back = motion.step(view, ['KeyW'], 1 / 60, limits);
  assert.ok(back.phi < view.phi, 'turns back at once');
});

test('typing is left alone but panel controls are not', () => {
  assert.ok(isTyping({ tagName: 'INPUT', type: 'text' }));
  assert.ok(isTyping({ tagName: 'TEXTAREA' }));
  for (const type of ['checkbox', 'range']) assert.ok(!isTyping({ tagName: 'INPUT', type }));
  assert.ok(!isTyping({ tagName: 'BUTTON' }));
});

test('the tracker follows held keys and lets them go', () => {
  const target = new EventTarget();
  let blocked = false;
  const held = createKeyTracker(target, () => blocked);
  const send = (type, extra) => target.dispatchEvent(Object.assign(new Event(type), extra));
  send('keydown', { code: 'KeyW' });
  send('keydown', { code: 'KeyD' });
  send('keydown', { code: 'KeyE', ctrlKey: true });
  assert.deepEqual([...held], ['KeyW', 'KeyD']);
  send('keyup', { code: 'KeyW' });
  assert.deepEqual([...held], ['KeyD']);
  send('blur');
  assert.equal(held.size, 0);
  blocked = true;
  send('keydown', { code: 'KeyA' });
  assert.equal(held.size, 0);
});
