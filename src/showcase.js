// Behind the starting page: famous moments, one after another in a random order,
// with the camera drifting round each. Each is set up just before its celebrated
// move, which is then played.
import { inCheck, parsePgn } from './engine.js';
import { MOMENTS } from './famousMoments.js';

export const SECONDS_EACH = 30;
export const MOVE_AT = 7; // when the celebrated move is made
export const FADE = 1.3; // the dark between one moment and the next

// Deals the numbers 0 to count-1 in a random order, all of them before any comes
// round again, and never the same one twice running.
export function createDeck(count, random = Math.random) {
  let pile = [];
  let last = -1;
  return () => {
    if (!pile.length) {
      pile = Array.from({ length: count }, (_, i) => i);
      for (let i = pile.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [pile[i], pile[j]] = [pile[j], pile[i]];
      }
      // The next dealt is taken from the end.
      if (count > 1 && pile.at(-1) === last) pile.unshift(pile.pop());
    }
    last = pile.pop();
    return last;
  };
}

// A moment played through the rules: the moves before the celebrated one, and it.
export function stage(moment) {
  const { game } = parsePgn(moment.moves);
  const entry = game.history.at(-1);
  const number = `${entry.state.fullmove}${entry.state.turn === 'w' ? '.' : '…'}`;
  return {
    before: entry.state,
    after: game.state,
    history: game.history,
    entry,
    move: `${number} ${entry.san}`,
  };
}

const ease = (t) => t * t * (3 - 2 * t);

// view: { sync(state, history), animate(move, history), mark(marks),
//   camera({ azimuth, polar, distance }), caption(details | null), veil(dark) }
export function createShowcase(view, { random = Math.random, reducedMotion = () => false } = {}) {
  const deal = createDeck(MOMENTS.length, random);
  let current = null; // { moment, scene, time, played, leaving, start, drift }

  function next() {
    const moment = MOMENTS[deal()];
    const scene = stage(moment);
    // Seen from behind the side about to move, and off to one flank of it,
    // drifting across toward the other.
    const behind = scene.before.turn === 'w' ? 0 : Math.PI;
    const drift = random() < 0.5 ? -1 : 1;
    current = { moment, scene, time: 0, played: false, leaving: false, start: behind - drift * 0.75, drift };
    view.sync(scene.before, scene.history.slice(0, -1));
    view.mark([]);
    view.caption({ title: moment.title, who: moment.who, note: moment.note, move: scene.move, played: false });
    view.veil(false);
  }

  function play() {
    const { scene, moment } = current;
    current.played = true;
    const { move } = scene.entry;
    view.animate(move, scene.history);
    const marks = [{ square: move.from, style: 'last' }, { square: move.to, style: 'last' }];
    if (inCheck(scene.after)) {
      marks.push({ square: scene.after.board.indexOf(scene.after.turn === 'w' ? 'K' : 'k'), style: 'check' });
    }
    view.mark(marks);
    view.caption({ title: moment.title, who: moment.who, note: moment.note, move: scene.move, played: true });
  }

  function aim() {
    const { time, start, drift } = current;
    // With reduced motion the camera stands still.
    const t = reducedMotion() ? 0.5 : Math.min(1, time / SECONDS_EACH);
    view.camera({
      azimuth: start + drift * 1.5 * t,
      polar: 1.02 - 0.16 * Math.sin(Math.PI * t),
      // Drawing closer as the moment goes on.
      distance: 1 - 0.13 * ease(t),
    });
  }

  return {
    get running() { return Boolean(current); },
    get current() { return current && { title: current.moment.title, time: current.time, played: current.played }; },
    start() {
      if (!current) {
        next();
        aim();
      }
    },
    stop() {
      if (!current) return;
      current = null;
      view.caption(null);
      view.veil(false);
      view.mark([]);
    },
    update(seconds) {
      if (!current) return;
      // A long gap between frames (a hidden tab) does not skip whole moments.
      current.time += Math.min(seconds, 1);
      if (!current.played && current.time >= MOVE_AT) play();
      if (!current.leaving && current.time >= SECONDS_EACH - FADE) {
        current.leaving = true;
        view.veil(true);
      }
      if (current.time >= SECONDS_EACH) next();
      aim();
    },
  };
}
