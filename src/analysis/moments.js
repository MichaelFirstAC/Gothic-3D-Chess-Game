// Chooses which reviewed moves are worth explaining, and describes them with the
// engine's findings. Pure functions: the engine has already judged every move.
import { parseFen } from '../engine.js';
import { formatScore } from './score.js';

export const MAX_MOMENTS = 6;
const BIG_SWINGS = 3;
const PIECE_POINTS = { n: 3, b: 3, r: 5, q: 9 };
const ENDGAME_POINTS = 24; // pieces left on the board, both sides, out of 62

export function gamePhase(fen) {
  const state = parseFen(fen);
  const points = state.board.reduce((sum, p) => sum + (PIECE_POINTS[p?.toLowerCase()] || 0), 0);
  if (points <= ENDGAME_POINTS) return 'endgame';
  return state.fullmove <= 10 ? 'opening' : 'middlegame';
}

// The reviewed side's mistakes and blunders, plus the largest swings by either
// side. `side` is 'w', 'b', or null to review both. Returned in game order.
export function selectKeyMoments(moves, { side = null, limit = MAX_MOMENTS } = {}) {
  // Moves the engine approved of are never put forward for explanation.
  const flagged = moves.filter((m) => !['brilliant', 'best', 'good'].includes(m.classification));
  const bySwing = [...flagged].sort((a, b) => b.drop - a.drop);
  const errors = flagged
    .filter((m) => (!side || m.color === side)
      && (m.classification === 'mistake' || m.classification === 'blunder'))
    // A missed mate can be a blunder with a small drop, so blunders go first.
    .sort((a, b) => (b.classification === 'blunder') - (a.classification === 'blunder') || b.drop - a.drop);

  const chosen = new Set([...bySwing.slice(0, BIG_SWINGS), ...errors]);
  return [...chosen].slice(0, limit).sort((a, b) => a.ply - b.ply);
}

// The request body for the commentary endpoint.
export function buildCommentaryRequest(review, side = null) {
  return {
    reviewedSide: side,
    moments: selectKeyMoments(review.moves, { side }).map((m) => ({
      ply: m.ply,
      moveNumber: m.moveNumber,
      color: m.color,
      phase: gamePhase(m.fen),
      classification: m.classification,
      fen: m.fen,
      played: m.san,
      best: m.best?.san ?? null,
      bestLine: m.bestLine,
      replyLine: m.replyLine,
      evalBefore: formatScore(m.whiteBefore),
      evalAfter: formatScore(m.whiteAfter),
    })),
  };
}
