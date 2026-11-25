// Decides when the frame rate has calmed down after start-up. Pure logic.

// Calm means a run of recent frames with no hitch among them. It is judged
// against their own median, so a machine that is slow but even also counts.
export function createSettleWatch({ run = 30 } = {}) {
  const recent = [];
  return {
    // Takes the time since the previous frame, in milliseconds. True once the
    // last `run` frames were steady.
    frame(milliseconds) {
      recent.push(milliseconds);
      if (recent.length > run) recent.shift();
      if (recent.length < run) return false;
      const sorted = [...recent].sort((a, b) => a - b);
      const median = sorted[Math.floor(run / 2)];
      return sorted[run - 1] <= Math.min(250, median * 1.8 + 8);
    },
  };
}
