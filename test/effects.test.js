import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPieceFactory } from '../src/pieces.js';
import { fracturePiece, stepBody } from '../src/effects/fracture.js';
import { createTimeline, phase } from '../src/effects/timeline.js';

const make = createPieceFactory();

function surface(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const count = index ? index.count : position.count;
  const at = (i) => {
    const v = index ? index.getX(i) : i;
    return [position.getX(v), position.getY(v), position.getZ(v)];
  };
  let total = 0;
  for (let i = 0; i < count; i += 3) {
    const [a, b, c] = [at(i), at(i + 1), at(i + 2)];
    const u = b.map((v, k) => v - a[k]);
    const w = c.map((v, k) => v - a[k]);
    total += Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) / 2;
  }
  return total;
}

test('every piece breaks into 20 to 40 chunks that keep its whole surface', () => {
  for (const letter of 'PRNBQKprnbqk') {
    const piece = make(letter);
    const before = piece.children.map((mesh) => Array.from(mesh.geometry.attributes.position.array));
    const chunks = fracturePiece(piece);
    assert.ok(chunks.length >= 20 && chunks.length <= 40, `${letter}: ${chunks.length}`);

    const whole = piece.children.reduce((sum, mesh) => sum + surface(mesh.geometry), 0);
    const broken = chunks.reduce((sum, c) => sum + surface(c.geometry), 0);
    assert.ok(Math.abs(whole - broken) / whole < 0.001, `${letter}: ${whole} vs ${broken}`);

    for (const { geometry } of chunks) {
      const covered = geometry.groups.reduce((sum, g) => sum + g.count, 0);
      assert.equal(covered, geometry.attributes.position.count);
      for (const group of geometry.groups) assert.ok(group.materialIndex < piece.children.length);
    }
    // The factory's shared geometry is left exactly as it was.
    piece.children.forEach((mesh, i) => {
      assert.deepEqual(Array.from(mesh.geometry.attributes.position.array), before[i], letter);
    });
  }
});

test('a fracture is prepared once per piece type', () => {
  assert.equal(fracturePiece(make('Q')), fracturePiece(make('Q')));
  assert.notEqual(fracturePiece(make('Q')), fracturePiece(make('q')));
});

test('a loose chunk falls, bounces and comes to rest on the floor', () => {
  const body = { position: { x: 0, y: 1, z: 0 }, velocity: { x: 1, y: 2, z: 0 }, spin: 6, floor: 0.05, resting: false };
  let bounces = 0;
  let falling = false;
  for (let i = 0; i < 600 && !body.resting; i++) {
    stepBody(body, 1 / 60);
    if (falling && body.velocity.y > 0) bounces++;
    falling = body.velocity.y < 0;
    assert.ok(body.position.y >= 0.05 - 1e-9);
  }
  assert.ok(body.resting);
  assert.ok(bounces >= 1 && bounces <= 3, String(bounces));
  assert.equal(body.position.y, 0.05);
  assert.ok(body.position.x > 0.2 && body.position.x < 1.5, 'it settles nearby');
});

test('the timeline runs effects to the end and cleans up exactly once', async () => {
  const timeline = createTimeline();
  const times = [];
  let ends = 0;
  const done = timeline.run({ duration: 0.25, update: (t) => times.push(+t.toFixed(2)), end: () => ends++ });
  for (let i = 0; i < 6; i++) timeline.advance(0.1);
  assert.equal(await done, true);
  assert.deepEqual(times, [0, 0.1, 0.2, 0.25]);
  assert.equal(ends, 1);
  assert.equal(timeline.size, 0);
});

test('cancelling ends every effect at once, and a stall cannot skip far ahead', async () => {
  const timeline = createTimeline();
  const ended = [];
  const jobs = ['a', 'b'].map((name) => timeline.run({ duration: 5, end: (completed) => ended.push([name, completed]) }));
  let seen = 0;
  timeline.run({ duration: 5, update: (t) => { seen = t; } });
  timeline.advance(60);
  assert.ok(seen <= 0.1);
  timeline.cancelAll();
  timeline.cancelAll();
  assert.deepEqual(await Promise.all(jobs), [false, false]);
  assert.deepEqual(ended, [['a', false], ['b', false]]);
  assert.equal(phase(5, 0, 10), 0.5);
  assert.equal(phase(-1, 0, 10), 0);
});
