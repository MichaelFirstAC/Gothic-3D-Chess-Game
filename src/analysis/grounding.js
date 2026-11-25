// Facts worked out by the rules engine, used on the server for AI commentary:
// first spelled out for the model, then used to check what it wrote. Language
// models misread compact notation, so they are not left to decode it.
import { parseFen, applyMove, sanToMove, inCheck, legalMoves, squareName, colorOf, other } from '../engine.js';
import { playLine, settledGain } from './narrator.js';

const NAMES = { w: 'White', b: 'Black' };
const PIECES = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' };

const nameOf = (piece) => PIECES[piece.toLowerCase()];

// "White: king g1, queen d4, rooks a1 f1, ..." for each side.
export function describePosition(state) {
  return ['w', 'b'].map((color) => {
    const groups = Object.entries(PIECES).map(([type, name]) => {
      const squares = state.board.flatMap((p, sq) =>
        (p && colorOf(p) === color && p.toLowerCase() === type ? [squareName(sq)] : []));
      return squares.length ? `${name}${squares.length > 1 ? 's' : ''} ${squares.join(' ')}` : '';
    });
    return `${NAMES[color]}: ${groups.filter(Boolean).join(', ')}`;
  }).join('\n');
}

function describeStep(before, { move, state, san }) {
  const mover = `${NAMES[before.turn]} ${nameOf(move.piece)}`;
  let text;
  if (move.flag?.startsWith('castle')) text = `${NAMES[before.turn]} castles`;
  else if (move.captured) {
    const square = move.flag === 'ep' ? move.to + (before.turn === 'w' ? -8 : 8) : move.to;
    text = `${mover} takes ${NAMES[other(before.turn)]} ${nameOf(move.captured)} on ${squareName(square)}`;
  } else text = `${mover} ${squareName(move.from)} to ${squareName(move.to)}`;
  if (move.promotion) text += `, becoming a ${PIECES[move.promotion]}`;
  if (inCheck(state)) text += legalMoves(state).length ? ', check' : ', checkmate';
  return `  ${san}: ${text}`;
}

function describeMoves(start, steps) {
  return steps.map((step, i) => describeStep(i ? steps[i - 1].state : start, step)).join('\n');
}

function describeBalance(gain, color) {
  if (!gain) return `no material gain or loss for ${NAMES[color]} is established`;
  const points = Math.abs(gain);
  return `${NAMES[color]} ${gain > 0 ? 'comes out ahead' : 'ends up behind'} by ${points} point${points > 1 ? 's' : ''}`
    + ' (pawn 1, knight or bishop 3, rook 5, queen 9)';
}

// Replays one flagged move of a request. Both lines come with every position.
export function groundMoment(moment) {
  const state = parseFen(moment.fen);
  const played = sanToMove(state, moment.played);
  const reply = played
    ? [{ move: played, state: applyMove(state, played), san: moment.played }] : [];
  if (played) reply.push(...playLine(reply[0].state, moment.replyLine));
  const best = playLine(state, moment.bestLine);
  const replyGain = settledGain(state, reply, state.turn);
  const bestGain = settledGain(state, best, state.turn);
  const positions = [state, ...reply.map((s) => s.state), ...best.map((s) => s.state)];
  return { state, reply, best, replyGain, bestGain, positions };
}

export function describeFacts(moment) {
  const { state, reply, best, replyGain, bestGain } = groundMoment(moment);
  return [
    'Pieces before the move:',
    describePosition(state),
    `Engine's best line, move by move:\n${describeMoves(state, best) || '  none'}`,
    `Material along the best line: ${describeBalance(bestGain, state.turn)}.`,
    `The move played and the engine's continuation, move by move:\n${describeMoves(state, reply) || '  none'}`,
    `Material along that continuation: ${describeBalance(replyGain, state.turn)}.`,
  ].join('\n');
}

// ---------------------------------------------------------------- checking

const PIECE = 'pawn|knight|bishop|rook|queen|king';
const LOSES_PIECE = /\b(loses|losing|lose|drops|dropping|hangs|hanging|gives up|sacrifices)\s+(a|an|the|its|his|her|their)?\s*(white |black )?(knight|bishop|rook|queen|piece|exchange)\b/i;
const MATERIAL_TALK = /\b(wins|winning|win|loses|losing|lose|gains|gaining|gain)\s+(a pawn|material)\b|\bmaterial (edge|advantage|gain|loss)\b|\b(up|down) (a pawn|material|a piece)\b/i;

const PIECE_DOWN = /\b(a piece down|down a (piece|knight|bishop|rook|queen)|a (knight|bishop|rook|queen) down)\b/i;

// Why a text contradicts what the engine's lines show, or null if no problem is
// found. This catches only some mistakes: it cannot judge strategic reasoning.
export function contradiction(text, { replyGain, bestGain, positions }) {
  if (LOSES_PIECE.test(text) && replyGain > -2) return 'claims a piece is lost';
  // Being a whole piece behind takes at least three points in one of the lines.
  if (PIECE_DOWN.test(text) && replyGain > -3 && bestGain > -3) return 'claims a side is a piece down';
  if (MATERIAL_TALK.test(text) && replyGain >= 0 && bestGain <= 0) return 'claims a change in material';

  // "the e5 pawn" and "pawn on e5" must describe a piece that is really there
  // at some point in the position or its lines.
  const mentions = [
    ...[...text.matchAll(new RegExp(`\\b([a-h][1-8])[ -](${PIECE})s?\\b`, 'gi'))].map((m) => [m[1], m[2]]),
    ...[...text.matchAll(new RegExp(`\\b(${PIECE}) (?:on|at) ([a-h][1-8])\\b`, 'gi'))].map((m) => [m[2], m[1]]),
  ];
  for (const [square, name] of mentions) {
    const there = positions.some(({ board }) => board.some((p, sq) =>
      p && squareName(sq) === square.toLowerCase() && nameOf(p) === name.toLowerCase()));
    if (!there) return `puts a ${name} on ${square}`;
  }
  return null;
}
