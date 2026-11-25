// When an attacking piece reaches the piece it captures. Pure math.

// How close two piece centres are when their bases first touch, in squares.
const TOUCH = 0.62;

// The time at which easeInOut() reaches `progress`.
export function easeInOutInverse(progress) {
  return progress < 0.5 ? Math.cbrt(progress / 4) : 1 - Math.cbrt(2 * (1 - progress)) / 2;
}

// The fraction of a slide, in time, at which the attacker meets the victim
// `distance` squares from where it started. A leaping knight meets its victim
// only as it comes down.
export function contactFraction(distance, leaps = false) {
  if (leaps) return 0.78;
  const progress = Math.min(0.92, Math.max(0.08, 1 - TOUCH / distance));
  return easeInOutInverse(progress);
}
