import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  START_FEN, Game, parseFen, legalMoves, applyMove, squareIndex, squareName,
  insufficientMaterial, canPossiblyMate,
} from '../src/engine.js';

function perft(state, depth) {
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  return moves.reduce((sum, m) => sum + perft(applyMove(state, m), depth - 1), 0);
}

// Published reference node counts (chessprogramming.org, "Perft Results").
const PERFT = [
  ['start position', START_FEN, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['en passant pins', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['promotions', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['position 5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
  ['position 6', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', [46, 2079, 89890]],
];

for (const [name, fen, counts] of PERFT) {
  test(`perft: ${name}`, () => {
    counts.forEach((expected, i) => {
      assert.equal(perft(parseFen(fen), i + 1), expected, `depth ${i + 1}`);
    });
  });
}

const play = (game, ...moves) => {
  for (const text of moves) {
    const entry = game.play(
      squareIndex(text.slice(0, 2)), squareIndex(text.slice(2, 4)), text[4] || null,
    );
    assert.ok(entry, `illegal move ${text}`);
  }
};

const targets = (game, from) => game.movesFrom(squareIndex(from)).map((m) => squareName(m.to)).sort();

test('checkmate ends the game and is notated', () => {
  const game = new Game();
  play(game, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  assert.deepEqual(game.result, { winner: 'b', reason: 'checkmate' });
  assert.equal(game.history.at(-1).san, 'Qh4#');
  assert.equal(game.play(squareIndex('a2'), squareIndex('a3')), null);
});

test('stalemate', () => {
  const game = new Game('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1');
  play(game, 'g5g6');
  assert.deepEqual(game.result, { winner: null, reason: 'stalemate' });
});

test('castling moves the rook; not allowed out of or through check', () => {
  const game = new Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  play(game, 'e1g1');
  assert.equal(game.state.board[squareIndex('f1')], 'R');
  assert.equal(game.history[0].san, 'O-O');
  assert.ok(!targets(game, 'e8').includes('g8'), 'f8 is attacked by the f1 rook');
  assert.ok(targets(game, 'e8').includes('c8'));

  const checked = new Game('4k3/4r3/8/8/8/8/8/R3K2R w KQ - 0 1');
  assert.ok(!targets(checked, 'e1').includes('g1'));
  assert.ok(!targets(checked, 'e1').includes('c1'));
});

test('en passant is only available immediately', () => {
  const game = new Game();
  play(game, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
  assert.ok(targets(game, 'e5').includes('d6'));
  play(game, 'h2h3', 'a6a5');
  assert.ok(!targets(game, 'e5').includes('d6'));
});

test('promotion requires a choice and allows underpromotion', () => {
  const game = new Game('8/P7/8/8/8/8/k6K/8 w - - 0 1');
  assert.equal(game.play(squareIndex('a7'), squareIndex('a8')), null);
  play(game, 'a7a8n');
  assert.equal(game.state.board[squareIndex('a8')], 'N');
});

test('SAN disambiguation', () => {
  const game = new Game('4k3/8/8/8/8/8/8/R4RK1 w - - 0 1');
  play(game, 'a1d1');
  assert.equal(game.history[0].san, 'Rad1');
});

const SHUFFLE = ['g1f3', 'g8f6', 'f3g1', 'f6g8'];

test('threefold repetition is claimable, fivefold is automatic', () => {
  const game = new Game();
  play(game, ...SHUFFLE, ...SHUFFLE.slice(0, 3));
  assert.deepEqual(game.drawClaims(), []);
  assert.ok(game.intendedDrawClaims().some((c) => c.san === 'Ng8'));
  play(game, 'f6g8');
  assert.deepEqual(game.drawClaims(), ['threefold repetition']);
  assert.equal(game.result, null);
  play(game, ...SHUFFLE, ...SHUFFLE);
  assert.equal(game.result.reason, 'fivefold repetition');
  game.undo();
  assert.equal(game.result, null);
});

test('fifty moves is claimable, seventy-five is automatic, mate wins first', () => {
  const fifty = new Game('4k3/8/8/8/8/8/8/R3K3 w - - 99 80');
  assert.deepEqual(fifty.drawClaims(), []);
  assert.ok(fifty.intendedDrawClaims().length > 0);
  play(fifty, 'a1a2');
  assert.deepEqual(fifty.drawClaims(), ['the fifty-move rule']);

  const auto = new Game('4k3/8/8/8/8/8/8/R3K3 w - - 149 100');
  play(auto, 'a1a2');
  assert.equal(auto.result.reason, 'the seventy-five move rule');

  const mate = new Game('7k/8/6K1/8/8/8/8/R7 w - - 149 100');
  play(mate, 'a1a8');
  assert.equal(mate.result.reason, 'checkmate');
});

test('insufficient material', () => {
  const dead = (fen) => insufficientMaterial(parseFen(fen).board);
  assert.ok(dead('4k3/8/8/8/8/8/8/4K3 w - - 0 1'));
  assert.ok(dead('4k3/8/8/8/8/8/8/4KN2 w - - 0 1'));
  assert.ok(dead('2b1k3/8/8/8/8/8/8/4KB2 w - - 0 1'), 'bishops on the same color');
  assert.ok(!dead('5bk1/8/8/8/8/8/8/4KB2 w - - 0 1'), 'bishops on opposite colors');
  assert.ok(!dead('4k3/8/8/8/8/8/8/3NKN2 w - - 0 1'));
  assert.ok(!dead('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'));
});

test('resigning against a side that cannot mate is a draw', () => {
  const game = new Game('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  game.resign('w');
  assert.equal(game.result.winner, null);
  assert.ok(canPossiblyMate(game.state.board, 'w'));
});
