// Pure scoring math for reviews. No engine, DOM or network code.
//
// A score is always from one named side's point of view:
//   { cp: number }                    centipawns, positive favours that side
//   { mate: number, wins: boolean }   forced mate in `mate` moves (0 = on the board);
//                                     `wins` says whether that side delivers it

export const MATE_CP = 10000;

// Converts engine output ({ cp } or { mate: signed moves }) into a score for the
// side to move. "mate 0" means the side to move has been mated.
export function fromEngine({ cp, mate }) {
  return mate === undefined || mate === null ? { cp } : { mate: Math.abs(mate), wins: mate > 0 };
}

export const isMate = (score) => score.mate !== undefined;

// The same position seen from the other side.
export function flipScore(score) {
  return isMate(score) ? { mate: score.mate, wins: !score.wins } : { cp: 0 - score.cp };
}

export function scoreCp(score) {
  if (isMate(score)) return score.wins ? MATE_CP : -MATE_CP;
  return score.cp;
}

export function winPercent(cp) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

// Percentage points of winning chance the mover gave up.
export function winDrop(before, after) {
  return Math.max(0, winPercent(scoreCp(before)) - winPercent(scoreCp(after)));
}

// Both scores are from the mover's point of view.
export function classify({ isBest, before, after }) {
  if (isBest) return 'best';
  const hadMate = isMate(before) && before.wins;
  const keptMate = isMate(after) && after.wins;
  const wasGettingMated = isMate(before) && !before.wins;
  const getsMated = isMate(after) && !after.wins;
  if ((hadMate && !keptMate) || (getsMated && !wasGettingMated)) return 'blunder';

  const drop = winDrop(before, after);
  if (drop < 2) return 'good';
  if (drop < 10) return 'inaccuracy';
  if (drop <= 20) return 'mistake';
  return 'blunder';
}

// Lichess-style accuracy for a single move, from 0 to 100.
export function moveAccuracy(drop) {
  return Math.min(100, Math.max(0, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

// Average accuracy over one side's moves, or null if it made none.
export function accuracy(drops) {
  if (!drops.length) return null;
  return drops.reduce((sum, drop) => sum + moveAccuracy(drop), 0) / drops.length;
}

// Label such as "+1.3", "-0.4", "M3" or "-M2", for a score from White's side.
export function formatScore(score) {
  if (isMate(score)) {
    if (score.mate === 0) return score.wins ? '1-0' : '0-1';
    return `${score.wins ? '' : '-'}M${score.mate}`;
  }
  const pawns = (score.cp / 100).toFixed(1);
  return score.cp > 0 && pawns !== '0.0' ? `+${pawns}` : pawns.replace('-0.0', '0.0');
}
