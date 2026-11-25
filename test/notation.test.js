import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  START_FEN, Game, parseFen, toFen, legalMoves, applyMove, moveToUci, uciToMove,
  toSan, sanToMove, parsePgn, squareIndex,
} from '../src/engine.js';

test('toFen round-trips', () => {
  const fens = [
    START_FEN,
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', // all castling rights
    'r3k2r/8/8/8/8/8/8/R3K2R b Kq - 12 40', // some castling rights
    'rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3', // en passant
    '8/P7/8/8/8/8/k6K/8 w - - 0 1', // about to promote
    'Q6k/8/8/8/8/8/7K/1n6 b - - 0 60', // just promoted
  ];
  for (const fen of fens) assert.equal(toFen(parseFen(fen)), fen);
});

test('toFen follows the game through a double pawn push', () => {
  const game = new Game();
  game.play(squareIndex('e2'), squareIndex('e4'));
  assert.equal(toFen(game.state), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
});

test('UCI converts both ways, including castling and promotion', () => {
  const state = parseFen('r3k3/1P6/8/8/8/8/8/4K2R w Kq - 0 1');
  for (const move of legalMoves(state)) {
    assert.deepEqual(uciToMove(state, moveToUci(move)), move);
  }
  assert.equal(uciToMove(state, 'e1g1').flag, 'castle-short');
  assert.equal(uciToMove(state, 'b7a8n').promotion, 'n');
  assert.equal(moveToUci(uciToMove(state, 'b7b8q')), 'b7b8q');
  assert.equal(uciToMove(state, 'b7b8'), null, 'a promotion must name the piece');
  assert.equal(uciToMove(state, 'h1h9'), null);
  assert.equal(uciToMove(state, '(none)'), null);
});

test('sanToMove reads every legal move that toSan writes', () => {
  const fens = [
    'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
    'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
    '4k3/8/8/8/Q6Q/8/8/Q3K3 w - - 0 1', // needs file, rank and full-square hints
  ];
  for (const fen of fens) {
    const state = parseFen(fen);
    for (const move of legalMoves(state)) assert.deepEqual(sanToMove(state, toSan(state, move)), move);
  }
});

test('sanToMove tolerates suffixes and rejects illegal moves', () => {
  const state = parseFen(START_FEN);
  for (const san of ['e4', 'e4!', 'e4?!', 'e4+', 'e4#', 'e4!!']) {
    assert.equal(moveToUci(sanToMove(state, san)), 'e2e4', san);
  }
  assert.equal(sanToMove(state, 'e5'), null);
  assert.equal(sanToMove(state, 'Ke2'), null);
  const castle = parseFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.equal(sanToMove(castle, '0-0-0').flag, 'castle-long');
});

const fixture = readFileSync(new URL('./fixtures/chesscom-daily.pgn', import.meta.url), 'utf8');

test('parsePgn replays a real Chess.com game to its recorded final position', () => {
  const { headers, game } = parsePgn(fixture);
  assert.equal(headers.White, 'erik');
  assert.equal(headers.Black, 'chrhanson');
  assert.equal(game.history.length, 106);
  assert.ok(game.history.some((h) => h.san === 'h8=Q'));
  assert.ok(game.history.some((h) => h.san === 'O-O'));
  // The site's own record of where the game ended.
  assert.equal(toFen(game.state), headers.CurrentPosition);
  assert.deepEqual(game.result, { winner: 'w', reason: 'the recorded result' });
});

test('parsePgn handles Windows line endings and a byte order mark', () => {
  const { headers, game } = parsePgn(`﻿${fixture.replace(/\r?\n/g, '\r\n')}`);
  assert.equal(headers.Site, 'Chess.com');
  assert.equal(game.history.length, 106);
});

test('parsePgn strips comments, variations and NAGs', () => {
  const { headers, game } = parsePgn(`[Event "Test \\"quoted\\""]

1. e4 {best (by test) [%clk 0:03:00]} e5 $1 (1... c5 2. Nf3 (2. Nc3 {nested}) d6) 2.Nf3!? Nc6 ; rest of line
3. Bb5 a6?? *`);
  assert.equal(headers.Event, 'Test "quoted"');
  assert.deepEqual(game.history.map((h) => h.san), ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']);
  assert.equal(game.result, null);
});

test('parsePgn starts from a FEN header', () => {
  const { game } = parsePgn('[SetUp "1"]\n[FEN "4k3/P7/8/8/8/8/8/4K3 w - - 0 1"]\n\n1. a8=Q+ Kd7 *');
  assert.deepEqual(game.history.map((h) => h.san), ['a8=Q+', 'Kd7']);
});

test('parsePgn keeps a checkmate over the header result', () => {
  const { game } = parsePgn('[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
  assert.deepEqual(game.result, { winner: 'b', reason: 'checkmate' });
});

test('parsePgn reports the first illegal move', () => {
  assert.throws(() => parsePgn('1. e4 e5 2. Ke3 Nc6'), /Illegal or unreadable move 2\. Ke3 \(half-move 3\)/);
  assert.throws(() => parsePgn('1. e4 e4'), /1\.\.\. e4/);
  assert.throws(() => parsePgn('1. e4 {never closed'), /never closed/);
  assert.throws(() => parsePgn('[Variant "Chess960"]\n\n1. e4'), /not supported/);
  assert.throws(() => parsePgn(''), /No chess game/);
});

test('reading notation leaves the position unchanged', () => {
  const state = parseFen(START_FEN);
  const next = applyMove(state, sanToMove(state, 'Nf3'));
  assert.equal(toFen(state), START_FEN);
  assert.notEqual(toFen(next), START_FEN);
});
