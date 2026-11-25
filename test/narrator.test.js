import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFen, parsePgn, uciToMove, toSan, toFen, applyMove, squareIndex } from '../src/engine.js';
import {
  narrateReview, analyseMove, createDealer, settledGain, forkTargets, describeMaterial,
} from '../src/analysis/narrator.js';
import * as book from '../src/analysis/phrasebook.js';

const cp = (value) => ({ cp: value });

// A rated move as review.js would record it.
function rated(fen, uci, {
  classification = 'blunder', best = null, bestLine = best ? [best] : [], replyLine = [],
  before = cp(0), after = cp(-400), drop = 40, ply = 1,
} = {}) {
  const state = parseFen(fen);
  const move = uciToMove(state, uci);
  assert.ok(move, `illegal test move ${uci}`);
  let engineChoice = null;
  if (best) {
    const found = parsePgn(`[SetUp "1"]\n[FEN "${fen}"]\n\n${best}`).game.history[0].move;
    engineChoice = { from: found.from, to: found.to, san: toSan(state, found) };
  }
  return {
    ply, color: state.turn, moveNumber: state.fullmove, san: toSan(state, move), uci, fen,
    classification, best: engineChoice, bestLine, replyLine, before, after, drop,
  };
}

const sentences = (text) => text.split(/(?<=[.!?])\s+/).length;
const kinds = (facts) => [facts.problem?.kind, facts.idea?.kind];

test('a mate in one against the mover is recognised', () => {
  const facts = analyseMove(rated('rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2', 'g2g4', {
    best: 'e3', replyLine: ['Qh4#'], before: cp(-70), after: { mate: 1, wins: false },
  }));
  assert.equal(facts.problem.kind, 'matedAtOnce');
  assert.deepEqual(facts.problem.values, { n: 1, reply: 'Qh4#' });
});

test('a missed mate is recognised, and the engine move explained', () => {
  const facts = analyseMove(rated('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30', 'a1a2', {
    best: 'Ra8#', before: { mate: 1, wins: true }, after: cp(500), replyLine: ['g6'],
  }));
  assert.deepEqual(kinds(facts), ['missedMate', 'mate']);
});

test('a piece left to be taken is named with its square', () => {
  // The knight walks to d5, where a pawn takes it.
  const facts = analyseMove(rated('4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 20', 'c3d5', {
    best: 'Ne4', bestLine: ['Ne4', 'Kd7', 'Kd2'], replyLine: ['exd5', 'Kd2', 'Kd7'],
  }));
  assert.equal(facts.problem.kind, 'hangs');
  assert.deepEqual(facts.problem.values, { reply: 'exd5', piece: 'knight', square: 'd5' });
});

test('a fork in the reply is recognised only when it wins material', () => {
  const fen = '4k3/8/8/8/3n4/8/7P/R3K3 w - - 0 20';
  const lines = { best: 'Kd2', bestLine: ['Kd2', 'Nc6', 'Ra3'] };
  const forked = analyseMove(rated(fen, 'h2h3', { ...lines, replyLine: ['Nc2+', 'Kd2', 'Nxa1', 'Kc3', 'Kd7'] }));
  assert.equal(forked.problem.kind, 'allowsFork');
  assert.equal(forked.problem.values.targets, 'the king on e1 and the rook on a1');
  const harmless = analyseMove(rated(fen, 'h2h3', { ...lines, replyLine: ['Nc2+', 'Kd2', 'Nb4', 'Kc3', 'Nc6'] }));
  assert.notEqual(harmless.problem.kind, 'allowsFork');
});

test('a missed fork is recognised', () => {
  const facts = analyseMove(rated('r3k3/8/8/1N6/8/8/7P/4K3 w - - 0 20', 'h2h3', {
    best: 'Nc7+', bestLine: ['Nc7+', 'Kd7', 'Nxa8', 'Kc6', 'Kd2'], replyLine: ['Kd7', 'Kd2', 'Kc6'],
  }));
  assert.deepEqual(kinds(facts), ['missedFork', 'fork']);
});

test('material is only counted once the exchanges are over', () => {
  const { game } = parsePgn('[SetUp "1"]\n[FEN "3rk3/8/8/3p4/8/8/8/3QK3 w - - 0 1"]\n\n1. Qxd5 Rxd5 2. Kf2');
  const steps = game.history.map((h) => ({ move: h.move, state: applyMove(h.state, h.move) }));
  const start = game.history[0].state;
  assert.equal(settledGain(start, steps.slice(0, 1), 'w'), 0, 'cut off straight after a capture');
  assert.equal(settledGain(start, steps.slice(0, 2), 'w'), 0, 'still nothing quiet after it');
  assert.equal(settledGain(start, steps, 'w'), -8);
  assert.equal(describeMaterial(1), 'a pawn');
  assert.equal(describeMaterial(3), '3 points of material');
});

test('forkTargets ignores pieces that are defended and not worth more', () => {
  const state = parseFen('4k3/8/2p5/1b1b4/2N5/8/8/4K3 b - - 0 1');
  assert.deepEqual(forkTargets(state, squareIndex('c6')), []);
});

test('quieter reasons are recognised', () => {
  const quiet = { classification: 'inaccuracy', after: cp(-60), drop: 5 };
  const start = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2';
  assert.deepEqual(kinds(analyseMove(rated(start, 'd1h5', { ...quiet, best: 'Nf3' }))), ['earlyQueen', 'develop']);
  assert.deepEqual(kinds(analyseMove(rated(start, 'e1e2', { ...quiet, best: 'd4' }))), ['kingWalk', 'centre']);
  assert.deepEqual(kinds(analyseMove(rated(start, 'g1h3', { ...quiet, best: 'Nc3' }))), ['knightRim', 'develop']);
  assert.deepEqual(kinds(analyseMove(rated(start, 'a2a3', { ...quiet, best: 'c3' }))), ['positional', 'quiet']);
});

test('a dealt pool does not repeat until it is used up, and follows its seed', () => {
  const pool = ['a', 'b', 'c', 'd', 'e'];
  const deal = (seed) => {
    const dealer = createDealer(seed);
    return Array.from({ length: 20 }, () => dealer.pick(pool));
  };
  const cards = deal(7);
  for (let i = 0; i < 20; i += 5) assert.equal(new Set(cards.slice(i, i + 5)).size, 5);
  cards.slice(1).forEach((card, i) => assert.notEqual(card, cards[i], 'no immediate repeat'));
  assert.deepEqual(deal(7), cards);
  assert.notDeepEqual(deal(8), cards);
});

const allPhrases = () => {
  const found = [];
  const walk = (value) => (typeof value === 'string' ? found.push(value) : Object.values(value).forEach(walk));
  for (const [name, value] of Object.entries(book)) if (name !== 'STANDINGS') walk(value);
  return found;
};

test('the phrasebook is large, without duplicates or unknown placeholders', () => {
  const phrases = allPhrases();
  assert.ok(phrases.length >= 650, `only ${phrases.length} phrases`);
  assert.equal(new Set(phrases).size, phrases.length);
  const known = new Set(['side', 'opp', 'move', 'best', 'reply', 'piece', 'square', 'material', 'targets', 'n', 'from', 'to']);
  for (const phrase of phrases) {
    for (const [, name] of phrase.matchAll(/\{(\w+)\}/g)) assert.ok(known.has(name), phrase);
  }
});

// A long review made of repeated quiet moves, the case where repetition shows.
function longReview(count, extra) {
  const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 20';
  const moves = Array.from({ length: count }, (_, i) =>
    rated(fen, 'a2a3', { best: 'c3', replyLine: ['d5'], ply: i + 1, ...extra }));
  return { moves };
}

test('narration is varied, complete and two to four sentences on errors', () => {
  const review = longReview(30, { classification: 'inaccuracy', after: cp(-90), drop: 8 });
  const { moments, summary } = narrateReview(review, 'w');
  assert.equal(moments.size, 30);
  const texts = [...moments.values()];
  assert.equal(new Set(texts).size, 30, 'thirty identical situations, thirty different comments');
  for (const text of texts) {
    assert.ok(sentences(text) >= 2 && sentences(text) <= 4, text);
    assert.doesNotMatch(text, /\{|\}|undefined|NaN|null/);
    assert.doesNotMatch(text, /(^|[.!?] )(A3|C3|D5)\b/, 'pawn moves keep their small letter');
  }
  assert.equal(new Set(summary).size, 3);
});

test('approved moves get a short remark too', () => {
  const review = longReview(20, { classification: 'good', after: cp(-5), drop: 0.5 });
  const texts = [...narrateReview(review).moments.values()];
  assert.ok(new Set(texts).size >= 19);
  for (const text of texts) assert.ok(sentences(text) <= 3, text);
});

test('narration is stable for one game and differs between games', () => {
  const { game } = parsePgn('1. f3 e5 2. g4 Qh4# 0-1');
  const review = {
    moves: game.history.map((h, i) => rated(toFen(h.state), `${'f2f3 e7e5 g2g4 d8h4'.split(' ')[i]}`, {
      classification: 'good', after: cp(0), drop: 1, ply: i + 1,
    })),
  };
  assert.deepEqual(narrateReview(review), narrateReview(review));
  assert.match(narrateReview(review).moments.get(4), /mate/i);
  const shorter = { moves: review.moves.slice(0, 3) };
  assert.notDeepEqual([...narrateReview(shorter).moments], [...narrateReview(review).moments].slice(0, 3));
});

test('the summary draws on what went wrong for the reviewed side', () => {
  const hung = rated('4k3/8/4p3/8/8/2N5/8/4K3 w - - 0 20', 'c3d5', {
    best: 'Ne4', bestLine: ['Ne4', 'Kd7', 'Kd2'], replyLine: ['exd5', 'Kd2', 'Kd7'],
  });
  const { summary } = narrateReview({ moves: [hung] }, 'w');
  assert.ok(book.LESSONS.hangs.includes(summary[0]), summary[0]);
  const clean = narrateReview({ moves: [hung] }, 'b').summary;
  assert.ok(book.LESSONS.clean.includes(clean[0]), clean[0]);
});
