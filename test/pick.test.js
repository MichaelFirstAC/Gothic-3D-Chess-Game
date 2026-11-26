import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { distanceToPiece, nearestPiece } from '../src/pick.js';
import { createPieceFactory } from '../src/pieces.js';

const make = createPieceFactory();
const place = (letter, x, z) => {
  const piece = make(letter);
  piece.position.set(x, 0, z);
  piece.updateMatrixWorld(true);
  return piece;
};
// A line of sight from `eye` through `target`.
const sight = (eye, target) => ({
  origin: new THREE.Vector3(...eye),
  direction: new THREE.Vector3(...target).sub(new THREE.Vector3(...eye)).normalize(),
});

test('a sight at the body of each piece meets it, close to where its stone is', () => {
  for (const letter of 'PNBRQKpnbrqk') {
    const piece = place(letter, 1.5, -0.5);
    const ray = sight([1.5, 6, 7], [1.5, 0.35, -0.5]);
    const rough = distanceToPiece(ray, piece);
    const exact = new THREE.Raycaster(ray.origin, ray.direction).intersectObject(piece, true)[0];
    assert.ok(Number.isFinite(rough), letter);
    // A knight's head juts to one side, so its round stand-in is more generous.
    const slack = letter.toLowerCase() === 'n' ? 0.45 : 0.3;
    assert.ok(exact && Math.abs(rough - exact.distance) < slack, `${letter}: ${rough} against ${exact?.distance}`);
  }
});

test('a sight well clear of a piece misses it', () => {
  const piece = place('Q', 0, 0);
  for (const target of [[0.75, 0.5, 0], [-0.8, 0.2, 0], [0, 2.9, 0]]) {
    assert.equal(distanceToPiece(sight([0, 2, 8], target), piece), Infinity, `${target}`);
  }
});

test('of two in line, the nearer piece is chosen', () => {
  const back = place('k', 0, -1);
  const front = place('P', 0, 2);
  assert.equal(nearestPiece(sight([0, 3, 9], [0, 0.4, 2]), [back, front]), front);
  // Over the pawn's head to the king behind it.
  assert.equal(nearestPiece(sight([0, 3, 9], [0, 1.5, -1]), [back, front]), back);
});

test('a smaller captured piece is measured at its own size', () => {
  const piece = place('K', 0, 0);
  piece.scale.setScalar(0.58);
  assert.equal(distanceToPiece(sight([0, 1.7, 8], [0, 1.7, 0]), piece), Infinity);
  assert.ok(Number.isFinite(distanceToPiece(sight([0, 0.5, 8], [0, 0.5, 0]), piece)));
});

test('looking over the whole board takes well under a millisecond', () => {
  const pieces = [...'rnbqkbnrppppppppPPPPPPPPRNBQKBNR'].map((letter, i) => place(letter, (i % 8) - 3.5, Math.floor(i / 8) - 1.5));
  nearestPiece(sight([0, 8, 12], [0, 0.4, 0]), pieces);
  // The fastest of a few short runs: other test files running alongside can only
  // make a run slower, so one slowed run says nothing about the code.
  const run = () => {
    const started = performance.now();
    for (let i = 0; i < 40; i++) nearestPiece(sight([0, 8, 12], [(i % 9) - 4, 0.4, (i % 5) - 2]), pieces);
    return (performance.now() - started) / 40;
  };
  const each = Math.min(...Array.from({ length: 5 }, run));
  assert.ok(each < 0.5, `${each.toFixed(3)} ms a look`);
});
