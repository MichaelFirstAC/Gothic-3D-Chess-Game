// Watches frame times and steps detail down on machines that cannot keep up.
// Pure logic: the caller decides what each level means.

export const MAX_LEVEL = 3;

export function createQualityGovernor(apply, {
  budget = 20, warmup = 90, sample = 90, maxLevel = MAX_LEVEL, level = 0,
} = {}) {
  let current = level;
  let pace = { warmup, sample };
  let skip = warmup;
  let times = [];
  let passed = false;
  apply(current);
  return {
    get level() { return current; },
    // True once the current level has proved fast enough, or there is nothing
    // lower to go to.
    get settled() { return passed || current >= maxLevel; },
    // While loading, judge on far fewer frames, so that any step down happens
    // out of sight. Passing false returns to the usual, patient pace.
    hurry(on) {
      pace = on ? { warmup: 12, sample: 24 } : { warmup, sample };
      skip = pace.warmup;
      times = [];
    },
    // Call once per frame with the time since the last one, in milliseconds.
    frame(milliseconds) {
      // Long gaps mean a hidden tab or a one-off stall, not a slow machine.
      if (current >= maxLevel || milliseconds > 250) return;
      if (skip > 0) {
        skip--;
        return;
      }
      times.push(milliseconds);
      if (times.length < pace.sample) return;
      // The median ignores the odd hitch, such as a shader compiling.
      const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
      times = [];
      passed = median <= budget;
      if (passed) return;
      current++;
      skip = pace.warmup;
      apply(current);
    },
  };
}
