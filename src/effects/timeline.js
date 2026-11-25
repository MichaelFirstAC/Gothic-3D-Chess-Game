// A small scheduler for timed animations. Every effect is a function of the
// time since it began, with one clean-up that runs exactly once, whether the
// effect finishes or is cancelled. Pure logic: no renderer or DOM.

export const clamp01 = (t) => Math.min(1, Math.max(0, t));
// How far `t` has got through the window from `from` to `to`, as 0..1.
export const phase = (t, from, to) => clamp01((t - from) / (to - from));
export const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
export const easeOut = (t) => 1 - (1 - t) ** 3;
export const easeIn = (t) => t * t * t;

export function createTimeline() {
  const running = new Set();
  let clock = 0; // seconds of animation time

  function finish(effect, completed) {
    if (!running.delete(effect)) return;
    try {
      effect.end?.(completed);
    } finally {
      effect.resolve(completed);
    }
  }

  return {
    get size() { return running.size; },
    // For slowing animations down while inspecting them.
    speed: 1,

    // duration in seconds; update(t, dt) with t from 0 to duration.
    // Resolves with true when it ran to the end, false if it was cancelled.
    run({ duration, update, end }) {
      return new Promise((resolve) => {
        const effect = { start: clock, duration, update, end, resolve };
        running.add(effect);
        update?.(0, 0);
      });
    },

    // Advances every effect by the time passed, in seconds.
    advance(seconds) {
      // A long stall must not fling fragments across the board in one step.
      const dt = Math.min(0.1, Math.max(0, seconds)) * this.speed;
      clock += dt;
      for (const effect of [...running]) {
        if (!running.has(effect)) continue;
        const t = Math.min(effect.duration, clock - effect.start);
        effect.update?.(t, dt);
        if (t >= effect.duration) finish(effect, true);
      }
    },

    cancelAll() {
      for (const effect of [...running]) finish(effect, false);
    },
  };
}
