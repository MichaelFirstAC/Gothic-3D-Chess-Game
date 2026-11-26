// Finds moves that give up material on purpose. The engine says whether a move
// is good; this says, from the board alone, whether it is a sacrifice.
import { applyMove, colorOf, inCheck, legalMoves } from '../engine.js';

const POINTS = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const worth = (piece) => (piece ? POINTS[piece.toLowerCase()] : 0);
// The king is the last piece anyone would choose to capture with.
const reluctance = (piece) => (piece.toLowerCase() === 'k' ? 100 : worth(piece));

// A move is a sacrifice when it comes out at least this many points down.
export const SACRIFICE = 2;
// A side this far ahead is winning easily, and may give things back freely.
const FAR_AHEAD = 5;

const taken = (move) => (move.flag === 'ep' ? POINTS.p : worth(move.captured));

// What the side to move can win by capturing on `square` and trading there for
// as long as it pays, each side using its least valuable piece first.
export function exchangeGain(state, square) {
  const [capture] = legalMoves(state)
    .filter((m) => m.to === square && m.captured)
    .sort((a, b) => reluctance(a.piece) - reluctance(b.piece));
  if (!capture) return 0;
  return Math.max(0, taken(capture) - exchangeGain(applyMove(state, capture), square));
}

// What the side to move can win at once by capturing anywhere but `square`.
function winElsewhere(state, square) {
  return legalMoves(state)
    .filter((m) => m.captured && m.to !== square)
    .reduce((most, m) => Math.max(most, taken(m) - exchangeGain(applyMove(state, m), m.to)), 0);
}

function lead(state) {
  return state.board.reduce((sum, piece) => (
    piece ? sum + (colorOf(piece) === state.turn ? worth(piece) : -worth(piece)) : sum), 0);
}

// The points a move gives up by putting a knight, bishop, rook or queen where it
// can be won, or 0 if it is no sacrifice. Only the piece moved is considered.
export function sacrificeOf(state, move) {
  const type = move.piece.toLowerCase();
  if (type === 'p' || type === 'k' || move.promotion) return 0;
  // Nothing forced is given on purpose, and nor is much when far ahead.
  if (legalMoves(state).length === 1 || lead(state) >= FAR_AHEAD) return 0;

  const after = applyMove(state, move);
  let given = exchangeGain(after, move.to) - taken(move);
  if (given < SACRIFICE) return 0;

  // Not if taking the piece would let as much be won straight back elsewhere.
  const [capture] = legalMoves(after)
    .filter((m) => m.to === move.to)
    .sort((a, b) => reluctance(a.piece) - reluctance(b.piece));
  given -= winElsewhere(applyMove(after, capture), move.to);
  if (given < SACRIFICE) return 0;

  // Nor if the piece could already have been won where it stood.
  if (!inCheck(state)) {
    const passed = { ...state, turn: state.turn === 'w' ? 'b' : 'w', ep: -1 };
    if (exchangeGain(passed, move.from) >= given) return 0;
  }
  return given;
}
