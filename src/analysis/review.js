// Rates every move of a game from engine evaluations. The engine is passed in as
// `evaluate`, so this module has no worker or DOM code.
import { applyMove, inCheck, legalMoves, moveToUci, toFen, toSan, uciToMove } from '../engine.js';
import { abortError } from './stockfish.js';
import { accuracy, classify, flipScore, fromEngine, moveAccuracy, winDrop } from './score.js';
import { sacrificeOf } from './sacrifice.js';

const LINE_LENGTH = 6; // half-moves of each engine line that are kept
const AUTOMATIC_DRAW = /dead position|fivefold|seventy-five/;

// Writes a line of UCI moves in SAN, stopping at the first one that is not legal.
export function lineToSan(state, uciLine, limit = LINE_LENGTH) {
  const line = [];
  let position = state;
  for (const uci of uciLine.slice(0, limit)) {
    const moves = legalMoves(position);
    const move = uciToMove(position, uci, moves);
    if (!move) break;
    line.push(toSan(position, move, moves));
    position = applyMove(position, move);
  }
  return line;
}

// Positions that are over need no engine: it has no move to search there.
function settledScore(state, result) {
  if (!legalMoves(state).length) return inCheck(state) ? { mate: 0, pv: [] } : { cp: 0, pv: [] };
  if (result && result.winner === null && AUTOMATIC_DRAW.test(result.reason)) return { cp: 0, pv: [] };
  return null;
}

// record: { history, finalState, result }, as held by a Game.
// evaluate: (fen, { signal }) => Promise<{ cp | mate, bestmove, pv }>.
export async function reviewGame({ history, finalState, result = null }, { evaluate, onProgress, signal } = {}) {
  const check = () => {
    if (signal?.aborted) throw abortError();
  };
  const look = async (state, over) => {
    check();
    const found = (over !== undefined && settledScore(state, over)) || await evaluate(toFen(state), { signal });
    check();
    return found;
  };

  const moves = [];
  let current = history.length ? await look(history[0].state) : null;
  for (let i = 0; i < history.length; i++) {
    onProgress?.(i + 1, history.length);
    const { state, move, san } = history[i];
    const last = i === history.length - 1;
    // Each position is searched once: it ends one move and starts the next.
    const next = last ? await look(finalState, result) : await look(history[i + 1].state);

    const white = state.turn === 'w';
    const before = fromEngine(current);
    const after = flipScore(fromEngine(next));
    const isBest = moveToUci(move) === current.bestmove;
    const best = current.bestmove ? uciToMove(state, current.bestmove) : null;
    const drop = winDrop(before, after);

    moves.push({
      ply: i + 1,
      color: state.turn,
      moveNumber: state.fullmove,
      san,
      uci: moveToUci(move),
      fen: toFen(state),
      before, // mover's point of view
      after, // mover's point of view
      whiteBefore: white ? before : flipScore(before),
      whiteAfter: white ? after : flipScore(after),
      drop,
      accuracy: moveAccuracy(drop),
      classification: classify({ isBest, before, after, sacrifice: sacrificeOf(state, move) > 0 }),
      best: best && { from: best.from, to: best.to, san: toSan(state, best) },
      bestLine: lineToSan(state, current.pv),
      replyLine: lineToSan(applyMove(state, move), next.pv),
    });
    current = next;
  }

  const sideAccuracy = (color) => accuracy(moves.filter((m) => m.color === color).map((m) => m.drop));
  return { moves, accuracy: { w: sideAccuracy('w'), b: sideAccuracy('b') } };
}
