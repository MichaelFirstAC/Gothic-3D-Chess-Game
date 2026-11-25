import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeFacts, groundMoment, contradiction } from '../src/analysis/grounding.js';
import { buildPrompt } from '../api/explain.js';

// Two moments from a real game, with the lines Stockfish gave.
const rookTrade = {
  ply: 39, moveNumber: 20, color: 'w', phase: 'middlegame', classification: 'blunder',
  fen: '2r1r1k1/p5pp/1p1q1n2/3Pn3/3QpB2/6P1/PP3PBP/R4RK1 w - - 1 20',
  played: 'Rac1', best: 'Rad1',
  bestLine: ['Rad1', 'Rc5', 'Bxe4', 'g5', 'Bxe5', 'Qxe5'],
  replyLine: ['Rxc1', 'Rxc1', 'Qxd5', 'Qxd5+', 'Nxd5', 'Bxe4'],
  evalBefore: '+3.8', evalAfter: '+0.6',
};
const quietPawn = {
  ply: 36, moveNumber: 18, color: 'b', phase: 'middlegame', classification: 'mistake',
  fen: 'r3r1k1/pp4pp/3q1n2/3pn3/2PQpB2/6P1/PP3PBP/R4RK1 b - c3 0 18',
  played: 'b6', best: 'Nc6',
  bestLine: ['Nc6', 'Bxd6', 'Nxd4', 'cxd5', 'Nf3+', 'Bxf3'],
  replyLine: ['cxd5', 'Rad8', 'Bxe4', 'Nxe4', 'Qxe4', 'Qxd5'],
  evalBefore: '+0.6', evalAfter: '+1.9',
};

test('the model is told what each move does', () => {
  const facts = describeFacts(rookTrade);
  assert.match(facts, /White: king g1, queen d4, rooks a1 f1/);
  assert.match(facts, /Rxc1: Black rook takes White rook on c1/);
  assert.match(facts, /Rxc1: White rook takes Black rook on c1/);
  assert.match(facts, /Qxd5\+: White queen takes Black queen on d5, check/);
  assert.match(facts, /Material along that continuation: no material gain or loss for White/);
  assert.match(describeFacts(quietPawn), /knight e5/, 'the piece on e5 is a knight, not a pawn');
  assert.match(buildPrompt({ moments: [rookTrade], reviewedSide: null }), /White rook takes Black rook/);
});

// These sentences came back from a real model before it was given the facts.
test('a rook "lost" in an even trade is rejected', () => {
  const claim = 'Rac1 loses a rook after Rxc1 Rxc1, and the ensuing queen trades leave Black with a material edge.';
  assert.equal(contradiction(claim, groundMoment(rookTrade)), 'claims a piece is lost');
});

test('a piece on the wrong square is rejected', () => {
  const claim = 'Nc6 develops a piece, attacks the e5 pawn and reinforces d4.';
  assert.equal(contradiction(claim, groundMoment(quietPawn)), 'puts a pawn on e5');
});

test('"a piece down" is rejected when the lines only cost a pawn or so', () => {
  const facts = groundMoment({
    ...quietPawn, ply: 38, moveNumber: 19, fen: 'r3r1k1/p5pp/1p1q1n2/3Pn3/3QpB2/6P1/PP3PBP/R4RK1 b - - 0 19',
    played: 'Rac8', bestLine: ['Rad8', 'Bxe4', 'Nxe4', 'Qxe4', 'Qxd5', 'Qxd5+'],
    replyLine: ['Rad1', 'Rc5', 'Bxe4', 'g5', 'Bxe5', 'Qxe5'],
  });
  for (const claim of ["Black's queen recaptures on e5, leaving Black a piece down.", 'Black ends up down a piece.']) {
    assert.equal(contradiction(claim, facts), 'claims a side is a piece down', claim);
  }
});

test('accurate wording is kept', () => {
  const facts = groundMoment(rookTrade);
  for (const text of [
    'Rac1 lets Black trade rooks with Rxc1, and most of the advantage goes with them.',
    'The rook on c1 is exchanged and the queen on d5 comes off as well.',
    'Rad1 keeps more pressure on the centre and the knight on e5.',
  ]) assert.equal(contradiction(text, facts), null, text);
});

test('claims of lost material need lines that show it', () => {
  const hung = groundMoment({
    ...rookTrade, fen: '4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 20', played: 'Nd5',
    bestLine: ['Ne4', 'Kd7', 'Kd2'], replyLine: ['exd5', 'Kd2', 'Kd7'],
  });
  assert.equal(hung.replyGain, -3);
  assert.equal(contradiction('Nd5 loses a knight to exd5.', hung), null);
  assert.equal(contradiction('Black comes out with a material advantage.', hung), null);
});
