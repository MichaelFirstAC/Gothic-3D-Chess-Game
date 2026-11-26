import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MOMENTS } from '../src/famousMoments.js';
import { FADE, MOVE_AT, SECONDS_EACH, createDeck, createShowcase, stage } from '../src/showcase.js';

test('there are thirty moments, each with its own name and a few words about it', () => {
  assert.equal(MOMENTS.length, 30);
  assert.equal(new Set(MOMENTS.map((m) => m.title)).size, 30);
  for (const moment of MOMENTS) assert.ok(moment.title && moment.who && moment.note, moment.title);
});

test('every one is a duel between two players, with modern ones among them', () => {
  for (const moment of MOMENTS) {
    assert.match(moment.who, /^.+ – .+, .*\d{4}/, moment.title);
    // A whole game from the first move, not a set-up puzzle.
    assert.equal(moment.fen, undefined, moment.title);
  }
  const recent = MOMENTS.filter((m) => /\b20[12]\d\b/.test(m.who));
  assert.ok(recent.length >= 11, `only ${recent.length} from 2010 on`);
});

test('every moment can be played through the rules, as far as its last move', () => {
  for (const moment of MOMENTS) {
    const scene = stage(moment);
    // Written just as the engine writes it, checks and mates included.
    assert.equal(scene.entry.san, moment.moves.split(' ').at(-1), moment.title);
  }
});

test('all thirty are shown before any comes round again, and none twice running', () => {
  let seed = 1;
  const random = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  const deal = createDeck(30, random);
  const dealt = Array.from({ length: 30 * 40 }, deal);
  for (let round = 0; round < 40; round++) {
    assert.equal(new Set(dealt.slice(round * 30, round * 30 + 30)).size, 30);
  }
  assert.ok(dealt.every((value, i) => !i || value !== dealt[i - 1]));
});

test('the order differs from one visit to the next', () => {
  const visit = () => {
    const deal = createDeck(30);
    return Array.from({ length: 30 }, deal).join();
  };
  assert.notEqual(visit(), visit());
});

function watched() {
  const log = [];
  const view = {
    sync: () => log.push(['set up']),
    animate: () => log.push(['move']),
    mark: () => {},
    camera: (aim) => { view.aim = aim; },
    caption: (details) => { view.details = details; },
    veil: (dark) => log.push([dark ? 'dark' : 'light']),
  };
  return { view, log };
}

test('a moment is set up, makes its move, fades and gives way after thirty seconds', () => {
  const { view, log } = watched();
  const showcase = createShowcase(view);
  showcase.start();
  assert.deepEqual(log, [['set up'], ['light']]);
  assert.equal(view.details.played, false);
  const first = view.details.title;

  const pass = (seconds) => {
    for (let i = 0; i < Math.round(seconds * 10); i++) showcase.update(0.1);
  };
  log.length = 0;
  pass(MOVE_AT + 0.2);
  assert.deepEqual(log, [['move']]);
  assert.equal(view.details.played, true);

  log.length = 0;
  pass(SECONDS_EACH - FADE - MOVE_AT);
  assert.deepEqual(log, [['dark']]);

  log.length = 0;
  pass(FADE);
  assert.deepEqual(log, [['set up'], ['light']]);
  assert.notEqual(view.details.title, first);
  assert.equal(SECONDS_EACH, 30);
});

test('the camera keeps moving, and stands still when less motion is asked for', () => {
  for (const reduced of [false, true]) {
    const { view } = watched();
    const showcase = createShowcase(view, { reducedMotion: () => reduced });
    showcase.start();
    const before = { ...view.aim };
    for (let i = 0; i < 10; i++) showcase.update(1);
    if (reduced) assert.deepEqual(view.aim, before);
    else assert.notEqual(view.aim.azimuth, before.azimuth);
  }
});

test('stopping clears it away, and time then does nothing', () => {
  const { view, log } = watched();
  const showcase = createShowcase(view);
  showcase.start();
  showcase.stop();
  assert.equal(showcase.running, false);
  assert.equal(view.details, null);
  log.length = 0;
  showcase.update(100);
  assert.deepEqual(log, []);
});
