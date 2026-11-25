// Watches frame times and steps detail down on machines that cannot keep up.
// Pure logic: the caller decides what each level means.

export const MAX_LEVEL = 3;

export function createQualityGovernor(apply, {
  budget = 24, warmup = 90, sample = 90, maxLevel = MAX_LEVEL, level = 0,
} = {}) {
  let current = level;
  let skip = warmup;
  let times = [];
  apply(current);
  return {
    get level() { return current; },
    // Call once per frame with the time since the last one, in milliseconds.
    frame(milliseconds) {
      // Long gaps mean a hidden tab or a one-off stall, not a slow machine.
      if (current >= maxLevel || milliseconds > 250) return;
      if (skip > 0) {
        skip--;
        return;
      }
      times.push(milliseconds);
      if (times.length < sample) return;
      // The median ignores the odd hitch, such as a shader compiling.
      const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
      times = [];
      if (median <= budget) return;
      current++;
      skip = warmup;
      apply(current);
    },
  };
}
