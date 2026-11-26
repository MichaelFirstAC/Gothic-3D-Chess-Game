// "The Inquisition": review mode. Runs the analysis, steps the 3D board through
// the game and fills the side panel. The live game is never modified.
import { inCheck, moveToUci, toFen } from './engine.js';
import { createStockfish, DEFAULT_DEPTH } from './analysis/stockfish.js';
import { createStockfishWorker } from './analysis/stockfishWorker.js';
import { reviewGame } from './analysis/review.js';
import { formatScore, scoreCp, winPercent } from './analysis/score.js';
import { buildCommentaryRequest } from './analysis/moments.js';
import { fetchCommentary } from './analysis/commentary.js';
import { narrateReview } from './analysis/narrator.js';

const NAMES = { w: 'White', b: 'Black' };
const MARKS = { brilliant: '!!', best: '★', good: '', inaccuracy: '?!', mistake: '?', blunder: '??' };
const LABELS = {
  brilliant: 'Brilliant', best: 'Best move', good: 'Good move', inaccuracy: 'Inaccuracy', mistake: 'Mistake', blunder: 'Blunder',
};

const $ = (id) => document.getElementById(id);

// Search depth can be changed with ?depth=N in the address bar.
function searchDepth() {
  const wanted = Number(new URLSearchParams(window.location.search).get('depth'));
  return Number.isInteger(wanted) && wanted >= 6 && wanted <= 22 ? wanted : DEFAULT_DEPTH;
}

// The engine's move where it is worth showing beside the one played.
const better = (rated) => (['brilliant', 'best'].includes(rated.classification) ? null : rated.best);

// One entry of the key to what is marked on the board.
function keyEntry(kind, text) {
  const entry = element('span', `arrow-key ${kind}`);
  entry.append(element('i'), text);
  return entry;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// view: { sync(state, history), animate(move, history) => Promise,
//         unanimate(entry, history) => Promise, mark(marks), arrow(move | null),
//         moveList(history, decorate), exit() }
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
    if (last) marks.push({ square: last.move.from, style: 'played' }, { square: last.move.to, style: 'played' });
    if (inCheck(state)) {
      marks.push({ square: state.board.indexOf(state.turn === 'w' ? 'K' : 'k'), style: 'check' });
    }
    view.mark(marks);
    // The squares above show the move made. The arrow is for what the engine
    // would rather have seen, unless the move was approved as it stood (before
    // the first move, it is the engine's suggested opening).
    const rated = review?.moves[Math.max(0, cursor - 1)];
    view.arrow((cursor ? rated && better(rated) : rated?.best) ?? null);
  }

  // Walks the pieces to the cursor: a single step either way is animated, and
  // longer jumps go straight there.
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
      } else if (own.cursor === own.shown - 1) {
        const ply = own.shown - 1;
        own.shown = ply;
        await view.unanimate(history[ply], history.slice(0, ply));
        // A safety net, unless review has been left in the meantime.
        if (session === own) view.sync(stateAt(ply), history.slice(0, ply));
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
    // Stepping through the game is read against the move list.
    session.tab = 'moves';
    if (next === session.cursor) {
      renderPanel();
      return;
    }
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
      if (session.commentary?.aiPlies.has(index + 1)) button.classList.add('key');
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

  // How many moves of each kind each side made: White, the kind, Black.
  function renderTally() {
    const { review } = session;
    $('tally').replaceChildren(...(review ? Object.entries(LABELS) : []).map(([kind, label]) => {
      const row = element('div', kind);
      const count = (color) => review.moves.filter((m) => m.color === color && m.classification === kind).length;
      row.append(
        element('strong', '', String(count('w'))),
        element('span', '', label),
        element('strong', '', String(count('b'))),
      );
      return row;
    }));
  }

  // One of the two lower views: the move list, or the verdict on the whole game.
  function renderTabs() {
    const report = session.tab === 'report' && Boolean(session.review);
    $('moves').hidden = report;
    $('report').hidden = !report;
    $('tab-moves').setAttribute('aria-selected', String(!report));
    $('tab-report').setAttribute('aria-selected', String(report));
    $('tab-report').disabled = !session.review;
  }

  function renderVerdict() {
    const { cursor, review, commentary } = session;
    const rated = review?.moves[cursor - 1];
    const head = [];
    const after = [];
    if (rated) {
      const number = `${rated.moveNumber}${rated.color === 'w' ? '.' : '…'}`;
      const title = element('p', `verdict-title ${rated.classification}`,
        `${number} ${rated.san}: ${LABELS[rated.classification]}`);
      const row = element('div', 'verdict-head');
      row.append(title, element('span', 'verdict-score', formatScore(rated.whiteAfter)));
      head.push(row);
      const key = element('p', 'arrow-keys');
      key.append(keyEntry('played', `Played ${rated.san}`));
      const other = better(rated);
      if (other) key.append(keyEntry('best', `Engine's choice ${other.san}`));
      after.push(key);
      if (commentary?.aiPlies.has(cursor)) {
        after.push(element('p', 'verdict-detail', 'Explained by AI (via Groq). It can get the chess wrong.'));
      }
    } else if (review) {
      head.push(element('p', 'verdict-detail', 'Step through the game with the arrow keys, or choose a move.'));
    }
    $('verdict').replaceChildren(...head);
    $('verdict-extra').replaceChildren(...after);
    $('insight').dataset.kind = rated?.classification ?? '';
    // Nothing to say yet while the engine is still at work. The verdict on the
    // whole game has the panel to itself.
    $('insight').hidden = !review || session.tab === 'report';
  }

  // The comment on the move shown, and the game's three lessons.
  function renderCommentary() {
    const { cursor, commentary } = session;
    const text = commentary?.moments.get(cursor) || '';
    if ($('explanation').textContent !== text) {
      $('explanation').textContent = text;
      $('insight').scrollTop = 0;
    }

    const summary = commentary?.summary;
    $('summary').hidden = !summary?.length;
    $('summary-list').replaceChildren(...(summary || []).map((line) => element('li', '', line)));

    let note = '';
    if (commentary?.status === 'loading') {
      note = 'Asking Groq for a closer reading of the key moments…';
    } else if (commentary?.status === 'ai') {
      note = 'Dotted underlines mark moves explained by AI (via Groq) from the engine\'s findings. '
        + 'AI can still get the chess wrong; ratings and arrows come from Stockfish. Other notes are written without AI.';
    } else if (commentary?.status === 'local') {
      note = ['Written without AI, from the engine\'s findings.', commentary.reason].filter(Boolean).join(' ');
    }
    $('commentary-note').textContent = note;
  }

  // Comments on every move are written here at once, without AI. If Groq is set
  // up, its explanations then replace the ones on the key moments. A successful
  // answer is kept with the cached review; failures are retried next visit.
  async function narrate(own) {
    const { review } = own;
    if (review.commentary) {
      own.commentary = review.commentary;
      renderPanel();
      return;
    }
    const side = own.record.side ?? null;
    const local = { ...narrateReview(review, side), aiPlies: new Set() };
    const request = buildCommentaryRequest(review, side);
    if (!request.moments.length) {
      own.commentary = { ...local, status: 'local' };
      renderPanel();
      return;
    }
    own.commentary = { ...local, status: 'loading' };
    renderPanel();
    try {
      const ai = await fetchCommentary(request, { signal: own.controller.signal });
      const aiSummary = ai.summary.length === 3;
      const used = ai.moments.size > 0 || aiSummary;
      review.commentary = {
        status: used ? 'ai' : 'local',
        reason: used ? '' : 'The AI reply did not match the engine\'s lines, so it was set aside.',
        moments: new Map([...local.moments, ...ai.moments]),
        summary: aiSummary ? ai.summary : local.summary,
        aiPlies: new Set(ai.moments.keys()),
      };
      own.commentary = review.commentary;
    } catch (error) {
      if (own.controller.signal.aborted) return;
      if (error.name !== 'CommentaryUnavailable') console.error(error);
      own.commentary = { ...local, status: 'local', reason: error.message };
    }
    if (session === own) renderPanel();
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
    renderTally();
    renderTabs();
    renderVerdict();
    renderCommentary();
    // Last, because it scrolls the list to the move shown: by now the list is
    // showing, and the comment above it has taken the height it is going to.
    renderMoves();
    renderEval();
    $('step-first').disabled = $('step-back').disabled = cursor === 0;
    $('step-next').disabled = $('step-last').disabled = cursor === total();
  }

  // ---------------------------------------------------------------- session

  async function analyse(own) {
    const { record } = own;
    const depth = searchDepth();
    // The coached side is part of the key because the commentary depends on it.
    const key = [depth, record.side, record.result?.reason, toFen(record.history[0].state),
      ...record.history.map((h) => moveToUci(h.move))].join(' ');
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

  // record: { history, finalState, result, title, resultText?, players?, side? }
  // `side` is the player being coached ('w' or 'b'); omit it to review both.
  async function open(record) {
    if (session || !record.history.length) return;
    const own = {
      record,
      cursor: record.history.length,
      shown: record.history.length,
      moving: false,
      review: null,
      commentary: null,
      progress: '',
      error: '',
      tab: 'moves',
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
      // The verdict on the whole game comes first, unless it is being stepped
      // through already.
      if (own.cursor === 0) own.tab = 'report';
      renderBoard();
      renderPanel();
      await narrate(own);
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
    for (const id of ['accuracy', 'tally', 'verdict', 'explanation', 'verdict-extra', 'summary-list',
      'commentary-note']) $(id).replaceChildren();
    // The live game's move list is shown again, whichever tab was left open.
    $('moves').hidden = false;
    $('report').hidden = true;
    $('summary').hidden = true;
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
  for (const tab of ['moves', 'report']) {
    $(`tab-${tab}`).addEventListener('click', () => {
      session.tab = tab;
      renderPanel();
    });
  }
  $('exit-review').addEventListener('click', close);
  $('cancel-review').addEventListener('click', close);

  window.addEventListener('keydown', (event) => {
    if (!session || event.altKey || event.ctrlKey || event.metaKey
        || document.querySelector('dialog[open]')) return;
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
