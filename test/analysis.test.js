import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Game, parsePgn, toFen } from '../src/engine.js';
import {
  winPercent, winDrop, classify, moveAccuracy, accuracy, fromEngine, flipScore, scoreCp, formatScore,
} from '../src/analysis/score.js';
import { createStockfish, parseInfo } from '../src/analysis/stockfish.js';
import { reviewGame, lineToSan } from '../src/analysis/review.js';

const close = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} is not close to ${expected}`);

const cp = (value) => ({ cp: value });
const mating = (n) => ({ mate: n, wins: true });
const mated = (n) => ({ mate: n, wins: false });

test('winPercent follows the logistic curve', () => {
  assert.equal(winPercent(0), 50);
  close(winPercent(100), 59.10);
  close(winPercent(-100), 40.90);
  close(winPercent(10000), 100);
  close(winPercent(-10000), 0);
  close(winPercent(300) + winPercent(-300), 100);
});

test('mate scores count as 10000 centipawns', () => {
  assert.equal(scoreCp(mating(3)), 10000);
  assert.equal(scoreCp(mated(0)), -10000);
  assert.deepEqual(fromEngine({ mate: -2 }), mated(2));
  assert.deepEqual(fromEngine({ mate: 0 }), mated(0));
  assert.deepEqual(fromEngine({ cp: 35 }), cp(35));
  assert.deepEqual(flipScore(mated(0)), mating(0));
  assert.deepEqual(flipScore(cp(0)), cp(0));
});

// Centipawns that give up almost exactly `drop` points of winning chance from level.
const after = (drop) => cp(-Math.log(100 / (50 - drop) - 1) / 0.00368208);

test('classify uses the drop in winning chance', () => {
  const rate = (drop) => classify({ isBest: false, before: cp(0), after: after(drop) });
  assert.equal(rate(0), 'good');
  assert.equal(rate(1.9), 'good');
  assert.equal(rate(2.1), 'inaccuracy');
  assert.equal(rate(9.9), 'inaccuracy');
  assert.equal(rate(10.1), 'mistake');
  assert.equal(rate(19.9), 'mistake');
  assert.equal(rate(20.1), 'blunder');
  assert.equal(classify({ isBest: false, before: cp(0), after: cp(200) }), 'good', 'gaining is not a drop');
  assert.equal(winDrop(cp(0), cp(200)), 0);
});

test('the engine move is Best even if the second search disagrees', () => {
  assert.equal(classify({ isBest: true, before: cp(100), after: cp(-100) }), 'best');
});

test('missing or allowing a forced mate is a blunder', () => {
  const rate = (before, next) => classify({ isBest: false, before, after: next });
  assert.equal(rate(mating(2), cp(900)), 'blunder', 'missed, though still winning');
  assert.equal(rate(cp(-900), mated(3)), 'blunder', 'allowed, though already lost');
  assert.equal(rate(mating(2), mating(5)), 'good', 'a slower mate is still a mate');
  assert.equal(rate(mated(4), mated(1)), 'good', 'it could not be avoided');
  assert.equal(rate(mating(1), mating(0)), 'good');
});

test('accuracy averages the per-move formula and stays within 0..100', () => {
  close(moveAccuracy(0), 100);
  close(moveAccuracy(10), 63.58);
  assert.equal(moveAccuracy(100), 0);
  close(accuracy([0, 10]), (moveAccuracy(0) + moveAccuracy(10)) / 2);
  assert.equal(accuracy([]), null);
});

test('formatScore', () => {
  assert.equal(formatScore(cp(130)), '+1.3');
  assert.equal(formatScore(cp(-45)), '-0.5');
  assert.equal(formatScore(cp(-2)), '0.0');
  assert.equal(formatScore(cp(2)), '0.0');
  assert.equal(formatScore(mating(3)), 'M3');
  assert.equal(formatScore(mated(2)), '-M2');
  assert.equal(formatScore(mating(0)), '1-0');
});

test('parseInfo keeps only exact main-line scores', () => {
  assert.deepEqual(
    parseInfo('info depth 14 seldepth 20 multipv 1 score cp 31 nodes 9 pv e2e4 e7e5'),
    { cp: 31, pv: ['e2e4', 'e7e5'] },
  );
  assert.deepEqual(parseInfo('info depth 3 score mate -2 pv h7h8'), { mate: -2, pv: ['h7h8'] });
  assert.deepEqual(parseInfo('info depth 0 score mate 0'), { mate: 0, pv: [] });
  assert.equal(parseInfo('info depth 9 score cp 50 lowerbound nodes 1 pv a2a3'), null);
  assert.equal(parseInfo('info depth 9 multipv 2 score cp 5 pv a2a3'), null);
  assert.equal(parseInfo('info string NNUE enabled'), null);
  assert.equal(parseInfo('bestmove e2e4'), null);
});

// A stand-in for the worker that answers like Stockfish does.
function fakeWorker({ holdSearch = false } = {}) {
  const worker = {
    sent: [],
    terminated: false,
    reply: (line) => queueMicrotask(() => worker.onmessage({ data: line })),
    postMessage(command) {
      worker.sent.push(command);
      if (command === 'uci') worker.reply('uciok');
      if (command === 'isready') worker.reply('readyok');
      if (command.startsWith('go') && !holdSearch) {
        worker.reply('info depth 1 score cp 10 pv d2d4');
        worker.reply('info depth 14 score cp 28 pv e2e4 e7e5');
        worker.reply('bestmove e2e4 ponder e7e5');
      }
      if (command === 'stop') worker.reply('bestmove a2a3');
    },
    terminate() { worker.terminated = true; },
  };
  return worker;
}

test('the Stockfish wrapper speaks UCI and returns the deepest line', async () => {
  const worker = fakeWorker();
  const engine = createStockfish(worker, { depth: 9 });
  const [first, second] = await Promise.all([engine.analyse('fen one'), engine.analyse('fen two', { depth: 3 })]);
  assert.deepEqual(first, { cp: 28, pv: ['e2e4', 'e7e5'], bestmove: 'e2e4' });
  assert.deepEqual(second, first);
  assert.deepEqual(worker.sent, [
    'uci', 'isready',
    'position fen fen one', 'go depth 9',
    'position fen fen two', 'go depth 3',
  ]);
  engine.dispose();
  assert.ok(worker.terminated);
  await assert.rejects(engine.analyse('fen three'), /shut down/);
});

test('cancelling a search stops the engine and keeps it usable', async () => {
  const worker = fakeWorker({ holdSearch: true });
  const engine = createStockfish(worker);
  await engine.ready();
  const controller = new AbortController();
  const search = engine.analyse('fen', { signal: controller.signal });
  while (!worker.sent.includes('go depth 14')) await new Promise((r) => setImmediate(r));
  controller.abort();
  await assert.rejects(search, { name: 'AbortError' });
  assert.equal(worker.sent.at(-1), 'stop');
  await engine.newGame();
  assert.equal(worker.sent.at(-2), 'ucinewgame');
});

test('a worker that fails to load rejects instead of hanging', async () => {
  const worker = { postMessage() {}, terminate() {} };
  const engine = createStockfish(worker);
  const waiting = engine.analyse('fen');
  await new Promise((r) => setImmediate(r));
  worker.onerror({ message: 'boom' });
  await assert.rejects(waiting, /could not run: boom/);
});

test('lineToSan stops at the first illegal move', () => {
  assert.deepEqual(lineToSan(new Game().state, ['e2e4', 'e7e5', 'g1f3', 'a1a5', 'b8c6']), ['e4', 'e5', 'Nf3']);
});

test('reviewGame rates each move from the mover point of view', async () => {
  // Fool's mate. Scores are for the side to move, as an engine reports them.
  const { game } = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
  const script = [
    { cp: 30, bestmove: 'e2e4', pv: ['e2e4'] },
    { cp: 60, bestmove: 'e7e5', pv: ['e7e5', 'd2d4'] },
    { cp: -60, bestmove: 'd2d4', pv: ['d2d4'] },
    { mate: 1, bestmove: 'd8h4', pv: ['d8h4'] },
  ];
  const asked = [];
  const progress = [];
  const review = await reviewGame(
    { history: game.history, finalState: game.state, result: game.result },
    {
      evaluate: async (fen) => { asked.push(fen); return script[asked.length - 1]; },
      onProgress: (done, total) => progress.push(`${done}/${total}`),
    },
  );
  assert.equal(asked.length, 4, 'the mated position is not sent to the engine');
  assert.equal(asked[0], toFen(game.history[0].state));
  assert.deepEqual(progress, ['1/4', '2/4', '3/4', '4/4']);
  assert.deepEqual(review.moves.map((m) => m.classification), ['inaccuracy', 'best', 'blunder', 'best']);

  const [f3, e5, g4, mate] = review.moves;
  assert.deepEqual(f3.after, { cp: -60 });
  assert.equal(f3.best.san, 'e4');
  assert.deepEqual(f3.replyLine, ['e5', 'd4']);
  assert.deepEqual(e5.whiteAfter, { cp: -60 });
  assert.deepEqual(g4.whiteAfter, { mate: 1, wins: false });
  assert.deepEqual(g4.bestLine, ['d4']);
  assert.deepEqual(mate.after, { mate: 0, wins: true });
  assert.equal(mate.drop, 0);
  assert.ok(review.accuracy.b > review.accuracy.w);
});

test('reviewGame scores a finished draw without the engine and can be cancelled', async () => {
  const stalemate = new Game('7k/5K2/8/6Q1/8/8/8/8 w - - 0 1');
  stalemate.play(38, 46); // Qg6
  const record = { history: stalemate.history, finalState: stalemate.state, result: stalemate.result };
  const review = await reviewGame(record, {
    evaluate: async () => ({ mate: 1, bestmove: 'g5g7', pv: ['g5g7'] }),
  });
  assert.deepEqual(review.moves[0].after, { cp: 0 });
  assert.equal(review.moves[0].classification, 'blunder', 'threw away a mate');
  assert.equal(review.accuracy.b, null);

  const controller = new AbortController();
  await assert.rejects(
    reviewGame(record, {
      signal: controller.signal,
      evaluate: async () => { controller.abort(); return { cp: 0, bestmove: null, pv: [] }; },
    }),
    { name: 'AbortError' },
  );
});
