// Writes commentary without AI. For each move it works out what the engine's
// findings show (a lost piece, a fork, a missed mate and so on), then words it
// from the phrasebook. Pure functions: no network or DOM code.
import {
  parseFen, applyMove, legalMoves, inCheck, isAttacked, uciToMove, sanToMove, moveToUci,
  squareName, fileOf, rankOf, colorOf, other,
} from '../engine.js';
import { isMate } from './score.js';
import { gamePhase } from './moments.js';
import * as book from './phrasebook.js';

const NAMES = { w: 'White', b: 'Black' };
const PIECES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const CENTRE = [27, 28, 35, 36]; // d4 e4 d5 e5
const ERRORS = ['inaccuracy', 'mistake', 'blunder'];

const typeOf = (piece) => piece.toLowerCase();
const pieceName = (piece) => PIECES[typeOf(piece)];

// ---------------------------------------------------------------- phrase picking

function hash(text) {
  let value = 2166136261;
  for (let i = 0; i < text.length; i++) value = Math.imul(value ^ text.charCodeAt(i), 16777619);
  return value >>> 0;
}

function randomFrom(seed) {
  let state = seed || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

// Deals each pool like a deck of cards: nothing repeats until every phrase in
// the pool has been used. The same seed always deals the same way.
export function createDealer(seed) {
  const random = randomFrom(seed);
  const decks = new Map(); // pool -> { cards, last }
  return {
    random,
    pick(pool) {
      let deck = decks.get(pool);
      if (!deck) decks.set(pool, deck = { cards: [], last: null });
      if (!deck.cards.length) {
        deck.cards = [...pool];
        for (let i = deck.cards.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [deck.cards[i], deck.cards[j]] = [deck.cards[j], deck.cards[i]];
        }
        // A fresh deck must not start with the card just dealt.
        if (deck.cards.length > 1 && deck.cards.at(-1) === deck.last) deck.cards.unshift(deck.cards.pop());
      }
      deck.last = deck.cards.pop();
      return deck.last;
    },
  };
}

// A pawn move such as "e4" or "exd5" keeps its small letter at the start of a sentence.
const PAWN_MOVE = /^[a-h](x[a-h])?[1-8]/;

function fill(template, values) {
  const text = template.replace(/\{(\w+)\}/g, (match, name) => values[name] ?? match);
  return PAWN_MOVE.test(text) ? text : text.charAt(0).toUpperCase() + text.slice(1);
}

// ---------------------------------------------------------------- facts

function balance(board, color) {
  return board.reduce((sum, p) => {
    if (!p || typeOf(p) === 'k') return sum;
    return sum + (colorOf(p) === color ? VALUES[typeOf(p)] : -VALUES[typeOf(p)]);
  }, 0);
}

// Plays a SAN line, returning each move with the position it leads to.
export function playLine(state, line) {
  const steps = [];
  let position = state;
  for (const san of line) {
    const move = sanToMove(position, san);
    if (!move) break;
    position = applyMove(position, move);
    steps.push({ move, san, state: position });
  }
  return steps;
}

// Material gained or lost by `color` along the moves, read only at settled
// points: where the next move in the line is not a capture or promotion. A line
// cut off in the middle of an exchange proves nothing.
export function settledGain(start, steps, color) {
  const base = balance(start.board, color);
  let gain = 0;
  steps.forEach((step, i) => {
    const next = steps[i + 1]?.move;
    const over = !legalMoves(step.state).length;
    if (over || (next && !next.captured && !next.promotion)) {
      gain = balance(step.state.board, color) - base;
    }
  });
  return gain;
}

// Enemy pieces that the piece on `from` threatens in a way that matters: the
// king, something worth more than itself, or something left undefended.
export function forkTargets(state, from) {
  const attacker = state.board[from];
  const color = colorOf(attacker);
  const moves = legalMoves({ ...state, turn: color, ep: -1 }).filter((m) => m.from === from && m.captured);
  const targets = new Map();
  for (const { to, captured } of moves) {
    const type = typeOf(captured);
    const matters = type === 'k' || VALUES[type] > VALUES[typeOf(attacker)]
      || (type !== 'p' && !isAttacked(state.board, to, other(color)));
    if (matters) targets.set(to, type);
  }
  return [...targets].sort((a, b) => VALUES[b[1]] - VALUES[a[1]]);
}

function describeTargets(targets) {
  const names = targets.slice(0, 3).map(([square, type]) => `the ${PIECES[type]} on ${squareName(square)}`);
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

export function describeMaterial(points) {
  return points === 1 ? 'a pawn' : `${points} points of material`;
}

function standing(score) {
  const cp = isMate(score) ? (score.wins ? 10000 : -10000) : score.cp;
  const limits = [300, 150, 60, -60, -150, -300];
  const index = limits.findIndex((limit) => cp > limit);
  return book.STANDINGS[index < 0 ? book.STANDINGS.length - 1 : index];
}

function isShieldPawn(state, move) {
  if (typeOf(move.piece) !== 'p') return false;
  const white = state.turn === 'w';
  const king = state.board.indexOf(white ? 'K' : 'k');
  const home = white ? 0 : 7;
  // A castled king: on its back rank, over on a wing.
  if (rankOf(king) !== home || (fileOf(king) > 2 && fileOf(king) < 6)) return false;
  return Math.abs(fileOf(move.from) - fileOf(king)) <= 1 && rankOf(move.from) === (white ? 1 : 6);
}

function isDevelopment(state, move) {
  return ['n', 'b'].includes(typeOf(move.piece)) && rankOf(move.from) === (state.turn === 'w' ? 0 : 7);
}

// Why the move played was worse. Returns { kind, values }.
function findProblem({ state, move, rated, replies, replyGain, bestGain, bestFork, phase }) {
  const { before, after } = rated;
  const reply = replies[0];
  if (isMate(after) && !after.wins && !(isMate(before) && !before.wins)) {
    const oneMove = after.mate === 1 && reply;
    return { kind: oneMove ? 'matedAtOnce' : 'allowsMate', values: { n: after.mate, reply: reply?.san } };
  }
  const next = applyMove(state, move);
  if (!legalMoves(next).length && !inCheck(next)) return { kind: 'stalemate', values: {} };
  if (isMate(before) && before.wins && !(isMate(after) && after.wins)) {
    return { kind: 'missedMate', values: { n: before.mate } };
  }

  // Material is only blamed on the move if the engine's choice would have done better.
  if (reply && replyGain <= -1 && replyGain < bestGain) {
    if (replyGain <= -2) {
      const fork = forkTargets(reply.state, reply.move.to);
      if (fork.length >= 2) return { kind: 'allowsFork', values: { reply: reply.san, targets: describeTargets(fork) } };
      if (reply.move.captured && typeOf(reply.move.captured) !== 'p') {
        const square = reply.move.flag === 'ep' ? reply.move.to + (state.turn === 'w' ? 8 : -8) : reply.move.to;
        return {
          kind: 'hangs',
          values: { reply: reply.san, piece: pieceName(reply.move.captured), square: squareName(square) },
        };
      }
    }
    return { kind: 'losesMaterial', values: { reply: reply.san, material: describeMaterial(-replyGain) } };
  }
  if (bestFork) return { kind: 'missedFork', values: { targets: describeTargets(bestFork) } };
  if (bestGain >= 1 && bestGain > replyGain) {
    return { kind: 'missedMaterial', values: { material: describeMaterial(bestGain) } };
  }

  const type = typeOf(move.piece);
  if (type === 'q' && phase === 'opening' && state.fullmove <= 8 && !move.captured) {
    return { kind: 'earlyQueen', values: {} };
  }
  const rights = state.turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
  if (type === 'k' && !move.flag && phase !== 'endgame' && rights.some((r) => state.castling[r])) {
    return { kind: 'kingWalk', values: {} };
  }
  if (phase !== 'endgame' && isShieldPawn(state, move)) return { kind: 'shieldPawn', values: {} };
  if (type === 'n' && !move.captured && (fileOf(move.to) === 0 || fileOf(move.to) === 7)) {
    return { kind: 'knightRim', values: {} };
  }
  return { kind: 'positional', values: {} };
}

// What the engine's move would have achieved. Returns { kind, values } or null.
function findIdea({ state, best, rated, bestGain, bestFork, phase }) {
  if (!best) return null;
  const { before } = rated;
  if (isMate(before) && before.wins) return { kind: 'mate', values: { n: before.mate } };
  if (bestFork) return { kind: 'fork', values: { targets: describeTargets(bestFork) } };
  if (bestGain >= 1) return { kind: 'winsMaterial', values: { material: describeMaterial(bestGain) } };
  if (best.promotion) return { kind: 'promote', values: {} };
  if (best.flag?.startsWith('castle')) return { kind: 'castle', values: {} };
  if (best.captured) {
    const square = best.flag === 'ep' ? best.to + (state.turn === 'w' ? -8 : 8) : best.to;
    return { kind: 'capture', values: { piece: pieceName(best.captured), square: squareName(square) } };
  }
  const next = applyMove(state, best);
  if (inCheck(next)) return { kind: 'check', values: {} };
  const enemy = other(state.turn);
  const type = typeOf(best.piece);
  if (type !== 'p' && type !== 'k' && isAttacked(state.board, best.from, enemy)
      && !isAttacked(state.board, best.from, state.turn) && !isAttacked(next.board, best.to, enemy)) {
    return { kind: 'escape', values: { piece: pieceName(best.piece) } };
  }
  if (phase === 'opening' && isDevelopment(state, best)) {
    return { kind: 'develop', values: { piece: pieceName(best.piece) } };
  }
  if (CENTRE.includes(best.to) && type !== 'k') return { kind: 'centre', values: {} };
  return { kind: 'quiet', values: {} };
}

// Everything the wording needs to know about one rated move.
export function analyseMove(rated) {
  const state = parseFen(rated.fen);
  const moves = legalMoves(state);
  const move = uciToMove(state, rated.uci, moves);
  const next = applyMove(state, move);
  const phase = gamePhase(rated.fen);
  const best = rated.best ? sanToMove(state, rated.best.san, moves) : null;

  const replies = playLine(next, rated.replyLine);
  const replyGain = settledGain(state, [{ move, state: next }, ...replies], state.turn);
  const bestSteps = playLine(state, rated.bestLine);
  const bestGain = settledGain(state, bestSteps, state.turn);
  // A fork is only claimed when the engine's line shows it winning material.
  let bestFork = null;
  if (best && bestGain >= 2) {
    const targets = forkTargets(applyMove(state, best), best.to);
    if (targets.length >= 2) bestFork = targets;
  }

  const facts = { state, move, moves, next, best, rated, replies, replyGain, bestGain, bestFork, phase };
  const isError = ERRORS.includes(rated.classification);
  return {
    ...facts,
    problem: isError ? findProblem(facts) : null,
    idea: isError && best && moveToUci(best) !== rated.uci ? findIdea(facts) : null,
  };
}

// ---------------------------------------------------------------- wording

function praiseKind({ state, move, moves, next, rated, phase }) {
  if (!legalMoves(next).length && inCheck(next)) return 'mateDelivered';
  if (moves.length === 1) return 'only';
  if (isMate(rated.after) && rated.after.wins) return 'keepsMate';
  if (move.promotion) return 'promote';
  if (move.flag?.startsWith('castle')) return 'castle';
  if (move.captured) return 'capture';
  if (inCheck(next)) return 'check';
  if (phase === 'opening' && isDevelopment(state, move)) return 'develop';
  const type = typeOf(move.piece);
  if (CENTRE.includes(move.to) && type !== 'k') return 'centre';
  return type === 'p' ? 'pawn' : 'quiet';
}

function praise(facts, base, dealer) {
  const { move, state, rated, best } = facts;
  const kind = praiseKind(facts);
  const values = { ...base };
  if (kind === 'capture') {
    values.piece = pieceName(move.captured);
    values.square = squareName(move.flag === 'ep' ? move.to + (state.turn === 'w' ? -8 : 8) : move.to);
  }
  if (kind === 'develop') values.piece = pieceName(move.piece);
  const sentences = [fill(dealer.pick(book.PRAISE[kind]), values)];
  if (!['mateDelivered', 'only'].includes(kind)) {
    if (rated.classification === 'best') {
      if (dealer.random() < 0.55) sentences.push(dealer.pick(book.BEST_TAGS));
    } else if (best) sentences.push(fill(dealer.pick(book.GOOD_TAGS), values));
  }
  return sentences.join(' ');
}

// Two to four sentences on a move the engine marked down.
function critique(facts, base, dealer) {
  const { rated, problem, idea, replies } = facts;
  const values = { ...base, ...problem.values };
  const sentences = [fill(dealer.pick(book.PROBLEMS[problem.kind]), values)];
  if (problem.kind === 'positional' && replies[0] && dealer.random() < 0.5) {
    sentences.push(fill(dealer.pick(book.REPLY_NOTES), { ...values, reply: replies[0].san }));
  }
  if (idea) sentences.push(fill(dealer.pick(book.IDEAS[idea.kind]), { ...base, ...idea.values }));

  // How much it mattered. Mates speak for themselves.
  const mate = ['matedAtOnce', 'allowsMate', 'stalemate'].includes(problem.kind);
  if (!mate && sentences.length < 4) {
    const from = standing(rated.before);
    const to = standing(rated.after);
    if (from !== to) sentences.push(fill(dealer.pick(book.SWINGS), { ...base, from, to }));
    else if (rated.drop >= 3) sentences.push(fill(dealer.pick(book.COSTS), { ...base, n: Math.round(rated.drop) }));
  }
  const room = sentences.length < 4;
  if (room && (sentences.length < 2 || dealer.random() < 0.6)) {
    sentences.unshift(dealer.pick(book.OPENERS[rated.classification]));
  }
  return sentences.join(' ');
}

// Three lessons drawn from what actually went wrong for the reviewed side.
function summarise(analysed, side, dealer) {
  const errors = analysed.filter((a) => a.problem && (!side || a.rated.color === side))
    .sort((a, b) => b.rated.drop - a.rated.drop);
  const serious = errors.filter((a) => a.rated.classification !== 'inaccuracy');
  const themeOf = {
    matedAtOnce: 'matedAtOnce', allowsMate: 'allowsMate', missedMate: 'missedMate', stalemate: 'endgame',
    hangs: 'hangs', allowsFork: 'forks', missedFork: 'forks', losesMaterial: 'material',
    missedMaterial: 'material', earlyQueen: 'opening', kingWalk: 'opening', shieldPawn: 'positional',
    knightRim: 'positional', positional: 'positional',
  };
  // Mates first, then whatever cost the most.
  const rank = (a) => (['matedAtOnce', 'allowsMate', 'missedMate'].includes(a.problem.kind) ? 1 : 0);
  const themes = [...new Set([...serious].sort((a, b) => rank(b) - rank(a)).map((a) => themeOf[a.problem.kind]))];

  const lessons = themes.slice(0, 2).map((theme) => dealer.pick(book.LESSONS[theme]));
  if (!errors.length) lessons.push(dealer.pick(book.LESSONS.clean));
  else if (lessons.length < 2) {
    const phases = {};
    for (const a of errors) phases[a.phase] = (phases[a.phase] || 0) + 1;
    const [worst] = Object.entries(phases).sort((a, b) => b[1] - a[1])[0];
    lessons.push(dealer.pick(book.LESSONS[worst]));
  }
  if (lessons.length < 3 && side && serious.length) {
    const pool = serious.length === 1 ? book.LESSONS.tally.single : book.LESSONS.tally.errors;
    lessons.push(fill(dealer.pick(pool), { side: NAMES[side], n: serious.length }));
  }
  while (lessons.length < 3) {
    const lesson = dealer.pick(book.LESSONS.closing);
    if (!lessons.includes(lesson)) lessons.push(lesson);
  }
  return lessons;
}

// Commentary for every move of a review, plus three lessons. Returns the same
// shape as the commentary service: { moments: Map<ply, text>, summary }.
export function narrateReview(review, side = null) {
  // Seeded by the game itself: stable on every visit, different between games.
  const dealer = createDealer(hash(review.moves.map((m) => m.uci).join(' ')));
  const moments = new Map();
  const analysed = review.moves.map((rated) => {
    const facts = analyseMove(rated);
    const base = {
      side: NAMES[rated.color], opp: NAMES[other(rated.color)], move: rated.san, best: rated.best?.san,
    };
    moments.set(rated.ply, facts.problem ? critique(facts, base, dealer) : praise(facts, base, dealer));
    return facts;
  });
  return { moments, summary: summarise(analysed, side, dealer) };
}
