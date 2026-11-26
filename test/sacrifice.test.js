import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalMoves, moveToUci, parseFen, parsePgn, toFen, uciToMove } from '../src/engine.js';
import { exchangeGain, sacrificeOf } from '../src/analysis/sacrifice.js';
import { classify } from '../src/analysis/score.js';
import { selectKeyMoments } from '../src/analysis/moments.js';
import { reviewGame } from '../src/analysis/review.js';
import { narrateReview } from '../src/analysis/narrator.js';

const given = (fen, uci) => {
  const state = parseFen(fen);
  const move = uciToMove(state, uci, legalMoves(state));
  assert.ok(move, `${uci} is not legal in ${fen}`);
  return sacrificeOf(state, move);
};

// Morphy against the Duke and the Count, Paris 1858.
const OPERA = '1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7 8. Nc3 c6 '
  + '9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7 14. Rd1 Qe6 15. Bxd7+ Nxd7 '
  + '16. Qb8+ Nxb8 17. Rd8# 1-0';

test('the famous sacrifices of the Opera Game are recognised', () => {
  const { game } = parsePgn(OPERA);
  const offered = (san) => {
    const entry = game.history.find((h) => h.san === san);
    return sacrificeOf(entry.state, entry.move);
  };
  // His knight for two pawns is not enough: both come straight back, a point down.
  assert.equal(offered('Nxb5'), 0);
  assert.equal(offered('Qb8+'), 9, 'the whole queen');
  // And the moves round them that give nothing away.
  for (const san of ['e4', 'Nf3', 'Qxf3', 'Bc4', 'O-O-O', 'Rd8#']) assert.equal(offered(san), 0, san);
});

test('the bishop offered on h7 is a sacrifice, though it takes a pawn', () => {
  assert.equal(given('r1bq1rk1/pppnnppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8', 'd3h7'), 2);
});

test('an even trade is not a sacrifice', () => {
  // Knight takes knight, and is taken back.
  assert.equal(given('4k3/8/2p5/3n4/8/2N5/8/4K3 w - - 0 20', 'c3d5'), 0);
});

test('every recapture is counted before anything is called given away', () => {
  // The pawn on e6 guards d5, but taking the knight there loses the queen's guard back.
  const state = parseFen('3qk3/8/8/3N4/8/8/8/3RK3 b - - 0 20');
  assert.equal(exchangeGain(state, 35), 0, 'queen takes knight, rook takes queen');
});

test('a piece that cannot safely be taken is not given up', () => {
  // The pawn that could take the knight is all that shields the queen from the rook.
  assert.equal(given('4q1k1/8/4p3/8/8/2N5/8/4R1K1 w - - 0 20', 'c3d5'), 0);
});

test('a piece already lost where it stood is not sacrificed by moving it', () => {
  // The knight is attacked by a pawn and has only another guarded square to go to.
  assert.equal(given('4k3/8/2p5/8/1p6/2N5/8/4K3 w - - 0 20', 'c3d5'), 0);
});

test('pawns, and pieces handed back when far ahead, do not count', () => {
  assert.equal(given('4k3/8/2p5/8/3P4/8/8/4K3 w - - 0 20', 'd4d5'), 0);
  assert.equal(given('4k3/8/4p3/8/8/2N5/8/QQ2K3 w - - 0 20', 'c3d5'), 0);
});

test('only a sound sacrifice that the engine approves of is brilliant', () => {
  const cp = (value) => ({ cp: value });
  const rate = (facts) => classify({ isBest: false, before: cp(100), after: cp(100), sacrifice: true, ...facts });
  assert.equal(rate({ isBest: true }), 'brilliant');
  assert.equal(rate({ after: cp(90) }), 'brilliant', 'nearly the best move');
  assert.equal(rate({ before: { mate: 3, wins: true }, after: { mate: 2, wins: true }, isBest: true }), 'brilliant');
  assert.equal(rate({ after: cp(-200) }), 'blunder', 'a piece simply lost');
  assert.equal(rate({ after: cp(40) }), 'inaccuracy', 'not good enough');
  assert.equal(rate({ before: cp(-400), after: cp(-400), isBest: true }), 'best', 'still losing');
  assert.equal(rate({ isBest: true, sacrifice: false }), 'best');
});

test('a review marks the sacrifice, praises it and does not send it to be explained', async () => {
  const { game } = parsePgn(OPERA);
  // An engine that approves of every move that was played, from a level game.
  const played = new Map(game.history.map((h) => [toFen(h.state), moveToUci(h.move)]));
  const review = await reviewGame(
    { history: game.history, finalState: game.state, result: game.result },
    { evaluate: async (fen) => ({ cp: 0, bestmove: played.get(fen), pv: [] }) },
  );
  const queen = review.moves.find((m) => m.san === 'Qb8+');
  assert.equal(queen.classification, 'brilliant');
  assert.equal(review.moves.find((m) => m.san === 'e4').classification, 'best');
  assert.ok(!selectKeyMoments(review.moves).some((m) => m.classification === 'brilliant'));
  const text = narrateReview(review).moments.get(queen.ply);
  assert.match(text, /Qb8\+/);
  assert.doesNotMatch(text, /\{|undefined/);
});
