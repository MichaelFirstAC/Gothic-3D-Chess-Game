// A promise wrapper around the UCI protocol spoken by Stockfish in a Web Worker.
// The worker is passed in, so this module also runs under Node in tests.

export const DEFAULT_DEPTH = 14;
const START_TIMEOUT_MS = 30000;

export function abortError() {
  const error = new Error('The analysis was cancelled.');
  error.name = 'AbortError';
  return error;
}

// Reads the score and principal variation from an "info" line. Returns null for
// lines without an exact score for the main line.
export function parseInfo(line) {
  if (!line.startsWith('info ') || / (lowerbound|upperbound)\b/.test(line)) return null;
  const multipv = line.match(/ multipv (\d+)/);
  if (multipv && multipv[1] !== '1') return null;
  const score = line.match(/ score (cp|mate) (-?\d+)/);
  if (!score) return null;
  const pv = line.match(/ pv (.+)$/);
  return { [score[1]]: Number(score[2]), pv: pv ? pv[1].trim().split(/\s+/) : [] };
}

// worker: anything with postMessage(), terminate(), onmessage and onerror.
export function createStockfish(worker, { depth: defaultDepth = DEFAULT_DEPTH } = {}) {
  let listener = null; // { onLine, reject } for the command in progress
  let failure = null;
  let queue = Promise.resolve();
  let started = null;

  const fail = (error) => {
    failure = error;
    listener?.reject(error);
    listener = null;
  };

  worker.onmessage = ({ data }) => {
    for (const line of String(data).split('\n')) listener?.onLine(line.trim());
  };
  worker.onerror = (event) => {
    event?.preventDefault?.();
    fail(new Error(`Stockfish could not run${event?.message ? `: ${event.message}` : '.'}`));
  };

  // Sends commands and collects output until `isDone` returns a value.
  function exchange(commands, isDone) {
    return new Promise((resolve, reject) => {
      if (failure) {
        reject(failure);
        return;
      }
      listener = {
        reject,
        onLine(line) {
          const value = isDone(line);
          if (value === undefined) return;
          listener = null;
          resolve(value);
        },
      };
      for (const command of commands) worker.postMessage(command);
    });
  }

  const waitFor = (command, reply) => exchange([command], (line) => (line === reply ? true : undefined));

  // One command at a time: UCI replies carry no request id.
  function enqueue(task) {
    const result = queue.then(task);
    queue = result.catch(() => {});
    return result;
  }

  function ready() {
    started ||= enqueue(async () => {
      const timer = setTimeout(() => fail(new Error('Stockfish did not start in time.')), START_TIMEOUT_MS);
      try {
        await waitFor('uci', 'uciok');
        await waitFor('isready', 'readyok');
      } finally {
        clearTimeout(timer);
      }
    });
    return started;
  }

  return {
    ready,

    async newGame() {
      await ready();
      await enqueue(() => {
        worker.postMessage('ucinewgame');
        return waitFor('isready', 'readyok');
      });
    },

    // Resolves with { cp | mate, bestmove, pv }, scored for the side to move.
    async analyse(fen, { depth = defaultDepth, signal } = {}) {
      await ready();
      return enqueue(async () => {
        if (signal?.aborted) throw abortError();
        // "stop" makes the engine send bestmove at once, which keeps us in step.
        const stop = () => worker.postMessage('stop');
        signal?.addEventListener('abort', stop, { once: true });
        let latest = null;
        try {
          const bestmove = await exchange([`position fen ${fen}`, `go depth ${depth}`], (line) => {
            latest = parseInfo(line) || latest;
            return line.startsWith('bestmove') ? line.split(/\s+/)[1] : undefined;
          });
          if (signal?.aborted) throw abortError();
          if (!latest) throw new Error('Stockfish returned no evaluation.');
          return { ...latest, bestmove: bestmove === '(none)' ? null : bestmove };
        } finally {
          signal?.removeEventListener('abort', stop);
        }
      });
    },

    dispose() {
      fail(new Error('Stockfish was shut down.'));
      worker.terminate();
    },
  };
}
