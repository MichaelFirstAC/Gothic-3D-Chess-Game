// "The Inquisition": review mode. Runs the analysis, steps the 3D board through
// the game and fills the side panel. The live game is never modified.
import { inCheck, moveToUci } from './engine.js';
import { createStockfish, DEFAULT_DEPTH } from './analysis/stockfish.js';
import { createStockfishWorker } from './analysis/stockfishWorker.js';
import { reviewGame } from './analysis/review.js';
import { formatScore, scoreCp, winPercent } from './analysis/score.js';

const NAMES = { w: 'White', b: 'Black' };
const MARKS = { best: '★', good: '', inaccuracy: '?!', mistake: '?', blunder: '??' };
const LABELS = {
  best: 'Best move', good: 'Good move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder',
};

const $ = (id) => document.getElementById(id);

// Search depth can be changed with ?depth=N in the address bar.
function searchDepth() {
  const wanted = Number(new URLSearchParams(window.location.search).get('depth'));
  return Number.isInteger(wanted) && wanted >= 6 && wanted <= 22 ? wanted : DEFAULT_DEPTH;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// view: { sync(state, history), animate(move, history) => Promise, mark(marks),
//         arrow(move | null), moveList(history, decorate), exit() }
export function createReviewMode(view) {
  const cache = new Map(); // finished reviews, so reopening a game is instant
  let session = null;

  const stateAt = (ply) => session.record.history[ply]?.state ?? session.record.finalState;
  const total = () => session.record.history.length;

  // ---------------------------------------------------------------- board

  function renderBoard() {
    const { cursor, review } = session;
    const state = stateAt(cursor);
    const marks = [];
    const last = session.record.history[cursor - 1];
    if (last) marks.push({ square: last.move.from, style: 'last' }, { square: last.move.to, style: 'last' });
    if (inCheck(state)) {
      marks.push({ square: state.board.indexOf(state.turn === 'w' ? 'K' : 'k'), style: 'check' });
    }
    view.mark(marks);
    // The arrow shows what the engine would have played for the move on screen
    // (before the first move, what it suggests as the opening move).
    view.arrow(review?.moves[Math.max(0, cursor - 1)]?.best ?? null);
  }

  // Walks the pieces to the cursor: one step forward is animated, jumps are not.
  async function drive() {
    const own = session;
    if (own.moving) return;
    own.moving = true;
    while (session === own && own.shown !== own.cursor) {
      const { history } = own.record;
      if (own.cursor === own.shown + 1) {
        const ply = own.shown;
        own.shown = ply + 1;
        await view.animate(history[ply].move, history.slice(0, ply + 1));
      } else {
        own.shown = own.cursor;
        view.sync(stateAt(own.shown), history.slice(0, own.shown));
      }
    }
    own.moving = false;
  }

  function goTo(ply) {
    if (!session) return;
    const next = Math.max(0, Math.min(total(), ply));
    if (next === session.cursor) return;
    session.cursor = next;
    renderBoard();
    renderPanel();
    drive();
  }

  // ---------------------------------------------------------------- panel

  function renderEval() {
    const { cursor, review } = session;
    const rated = cursor ? review?.moves[cursor - 1]?.whiteAfter : review?.moves[0]?.whiteBefore;
    $('eval-bar').hidden = !rated;
    if (!rated) return;
    const share = winPercent(scoreCp(rated));
    $('eval-fill').style.height = `${share}%`;
    $('eval-label').textContent = formatScore(rated);
    $('eval-bar').setAttribute('aria-label', `Evaluation ${formatScore(rated)}, from White's side`);
  }

  function renderMoves() {
    view.moveList(session.record.history, (index, san) => {
      const rated = session.review?.moves[index];
      const button = element('button', 'move', san);
      button.type = 'button';
      if (rated) {
        button.classList.add(rated.classification);
        button.title = LABELS[rated.classification];
        if (MARKS[rated.classification]) button.append(element('span', 'mark', MARKS[rated.classification]));
      }
      if (index === session.cursor - 1) {
        button.classList.add('current');
        button.setAttribute('aria-current', 'step');
      }
      button.addEventListener('click', () => goTo(index + 1));
      return button;
    });
    // Keep the current move visible without scrolling the whole page.
    const list = $('moves');
    const current = list.querySelector('.current');
    if (!current) list.scrollTop = 0;
    else {
      const top = current.offsetTop - list.offsetTop;
      if (top < list.scrollTop) list.scrollTop = top;
      else if (top + current.offsetHeight > list.scrollTop + list.clientHeight) {
        list.scrollTop = top + current.offsetHeight - list.clientHeight;
      }
    }
  }

  function renderAccuracy() {
    const { review, record } = session;
    $('accuracy').replaceChildren(...(review ? ['w', 'b'].map((color) => {
      const box = element('div');
      const score = review.accuracy[color];
      box.append(
        element('span', '', record.players?.[color] || NAMES[color]),
        element('strong', '', score === null ? '–' : `${score.toFixed(1)}%`),
      );
      return box;
    }) : []));
  }

  function renderVerdict() {
    const { cursor, review } = session;
    const rated = review?.moves[cursor - 1];
    const lines = [];
    if (rated) {
      const number = `${rated.moveNumber}${rated.color === 'w' ? '.' : '…'}`;
      lines.push(element('p', `verdict-title ${rated.classification}`,
        `${number} ${rated.san}: ${LABELS[rated.classification]}`));
      if (rated.best && rated.classification !== 'best') {
        lines.push(element('p', 'verdict-detail', `The engine preferred ${rated.best.san} (green arrow).`));
      }
    } else if (review) {
      lines.push(element('p', 'verdict-detail', 'Step through the game with the arrow keys, or choose a move.'));
    }
    $('verdict').replaceChildren(...lines);
  }

  function renderPanel() {
    if (!session) return;
    const { cursor, record, progress, error } = session;
    $('status-main').textContent = 'The Inquisition';
    $('status-detail').textContent = cursor === total() && record.resultText
      ? record.resultText
      : record.title;
    $('status').classList.remove('alert');

    $('progress').hidden = !progress && !error;
    $('progress-text').textContent = error || progress || '';
    $('cancel-review').hidden = Boolean(error);

    renderAccuracy();
    renderMoves();
    renderVerdict();
    renderEval();
    $('step-first').disabled = $('step-back').disabled = cursor === 0;
    $('step-next').disabled = $('step-last').disabled = cursor === total();
  }

  // ---------------------------------------------------------------- session

  async function analyse(own) {
    const { record } = own;
    const depth = searchDepth();
    const key = [depth, ...record.history.map((h) => moveToUci(h.move)), record.result?.reason,
      record.history[0].state.board.join('')].join(' ');
    if (cache.has(key)) return cache.get(key);

    let engine = null;
    try {
      engine = createStockfish(createStockfishWorker(), { depth });
      own.progress = 'Summoning Stockfish…';
      renderPanel();
      await engine.newGame();
      const review = await reviewGame(record, {
        signal: own.controller.signal,
        evaluate: (fen, options) => engine.analyse(fen, options),
        onProgress(done, count) {
          if (session !== own) return;
          own.progress = `Weighing move ${done} of ${count}…`;
          $('progress-text').textContent = own.progress;
        },
      });
      cache.set(key, review);
      return review;
    } finally {
      engine?.dispose();
    }
  }

  // record: { history, finalState, result, title, resultText?, players? }
  async function open(record) {
    if (session || !record.history.length) return;
    const own = {
      record,
      cursor: record.history.length,
      shown: record.history.length,
      moving: false,
      review: null,
      progress: '',
      error: '',
      controller: new AbortController(),
    };
    session = own;
    document.body.classList.add('reviewing');
    // Start from the first move so the review can be replayed from the top.
    own.cursor = own.shown = 0;
    view.sync(stateAt(0), []);
    renderBoard();
    renderPanel();

    try {
      const review = await analyse(own);
      if (session !== own) return;
      own.review = review;
      own.progress = '';
      renderBoard();
      renderPanel();
    } catch (error) {
      if (session !== own || error.name === 'AbortError') return;
      console.error(error);
      own.progress = '';
      own.error = `The engine could not finish: ${error.message}`;
      renderPanel();
    }
  }

  function close() {
    if (!session) return;
    session.controller.abort();
    session = null;
    document.body.classList.remove('reviewing');
    for (const id of ['accuracy', 'verdict']) $(id).replaceChildren();
    $('progress').hidden = true;
    $('eval-bar').hidden = true;
    view.arrow(null);
    view.exit();
  }

  // ---------------------------------------------------------------- input

  $('step-first').addEventListener('click', () => goTo(0));
  $('step-back').addEventListener('click', () => goTo(session.cursor - 1));
  $('step-next').addEventListener('click', () => goTo(session.cursor + 1));
  $('step-last').addEventListener('click', () => goTo(total()));
  $('exit-review').addEventListener('click', close);
  $('cancel-review').addEventListener('click', close);

  window.addEventListener('keydown', (event) => {
    if (!session || event.altKey || event.ctrlKey || event.metaKey || $('dialog').open) return;
    const target = {
      ArrowLeft: () => session.cursor - 1,
      ArrowRight: () => session.cursor + 1,
      ArrowUp: () => 0,
      ArrowDown: () => total(),
      Home: () => 0,
      End: () => total(),
    }[event.key];
    if (!target) return;
    event.preventDefault();
    goTo(target());
  });

  return {
    open,
    close,
    get active() { return Boolean(session); },
    // Development aid.
    get session() { return session; },
  };
}
