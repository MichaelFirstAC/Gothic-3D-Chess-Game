import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createChesscomHandler, trimGames, userAgent } from '../api/chesscom.js';

const ARCHIVE = 'https://api.chess.com/pub/player/erik/games/2026/10';
const pgn = readFileSync(new URL('./fixtures/chesscom-daily.pgn', import.meta.url), 'utf8');

const game = (endTime, extra = {}) => ({
  url: `https://www.chess.com/game/daily/${endTime}`,
  rules: 'chess',
  pgn,
  time_class: 'daily',
  end_time: endTime,
  white: { username: 'erik', rating: 1490, result: 'win', uuid: 'x' },
  black: { username: 'chrhanson', rating: 1094, result: 'resigned', uuid: 'y' },
  fen: 'unused',
  ...extra,
});

// Calls a handler without a network, returning the status and parsed body.
async function call(handler, url, { method = 'GET', headers = {} } = {}) {
  const res = {
    headers: {},
    setHeader(name, value) { res.headers[name] = value; },
    end(text) { res.body = JSON.parse(text); },
  };
  await handler({ method, url, headers, socket: { remoteAddress: '1.2.3.4' } }, res);
  return { status: res.statusCode, body: res.body };
}

function fakeApi(routes) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, headers: options.headers });
    const route = routes[url];
    if (route instanceof Error) throw route;
    return new Response(JSON.stringify(route ?? {}), { status: route ? 200 : 404 });
  };
  return { calls, fetchImpl };
}

const routes = {
  'https://api.chess.com/pub/player/erik/games/archives': {
    archives: ['https://api.chess.com/pub/player/erik/games/2026/09', ARCHIVE],
  },
  [ARCHIVE]: { games: [game(100), game(300, { accuracies: { white: 88.29, black: 80.95 } }), game(200, { rules: 'chess960' })] },
};

test('returns the newest month, trimmed and newest first', async () => {
  const { calls, fetchImpl } = fakeApi(routes);
  const handler = createChesscomHandler({ env: { CHESSCOM_CONTACT: 'https://example.test/repo' }, fetchImpl });
  const { status, body } = await call(handler, '/?user=Erik');
  assert.equal(status, 200);
  assert.equal(body.username, 'erik');
  assert.equal(body.month, '2026/10');
  assert.deepEqual(body.games.map((g) => g.endTime), [300, 100]);
  assert.deepEqual(body.games[0], {
    url: 'https://www.chess.com/game/daily/300',
    white: { username: 'erik', rating: 1490, result: 'win' },
    black: { username: 'chrhanson', rating: 1094, result: 'resigned' },
    result: '1-0',
    timeClass: 'daily',
    endTime: 300,
    pgn,
    accuracies: { white: 88.29, black: 80.95 },
  });
  assert.ok(!('accuracies' in body.games[1]));
  assert.deepEqual(calls.map((c) => c.url), Object.keys(routes));
  for (const { headers } of calls) {
    assert.equal(headers['user-agent'], 'gothic-chess/1.0 (contact: https://example.test/repo)');
  }
});

test('works with the Vercel and Vite request paths and caches replies', async () => {
  const { calls, fetchImpl } = fakeApi(routes);
  let time = 0;
  const handler = createChesscomHandler({ env: {}, fetchImpl, now: () => time });
  await call(handler, '/api/chesscom?user=erik');
  await call(handler, '/?user=erik');
  assert.equal(calls.length, 2, 'the second lookup came from the cache');
  time = 6 * 60 * 1000;
  await call(handler, '/?user=erik');
  assert.equal(calls.length, 4);
});

test('refuses bad usernames before contacting anyone', async () => {
  const handler = createChesscomHandler({ fetchImpl: () => assert.fail('no request expected') });
  for (const user of ['', 'a', '..%2F..%2Fcallback', 'erik/games', 'x%20y', 'e'.repeat(40)]) {
    assert.equal((await call(handler, `/?user=${user}`)).status, 400, user);
  }
  assert.equal((await call(handler, '/?user=erik', { method: 'POST' })).status, 405);
  const other = { origin: 'https://elsewhere.example', host: 'chess.example' };
  assert.equal((await call(handler, '/?user=erik', { headers: other })).status, 403);
});

test('reports unknown players, outages and odd replies', async () => {
  const unknown = createChesscomHandler({ fetchImpl: fakeApi({}).fetchImpl });
  const missing = await call(unknown, '/?user=nobody');
  assert.equal(missing.status, 404);
  assert.match(missing.body.message, /no player/);

  const down = fakeApi({ 'https://api.chess.com/pub/player/erik/games/archives': new Error('reset') });
  const offline = await call(createChesscomHandler({ fetchImpl: down.fetchImpl, log: () => {} }), '/?user=erik');
  assert.equal(offline.status, 502);
  assert.equal(down.calls.length, 2, 'retried once');

  const odd = fakeApi({
    'https://api.chess.com/pub/player/erik/games/archives': { archives: ['https://evil.example/2026/10'] },
  });
  const followed = await call(createChesscomHandler({ fetchImpl: odd.fetchImpl }), '/?user=erik');
  assert.equal(followed.status, 502);
  assert.equal(odd.calls.length, 1, 'the foreign address was not requested');

  const empty = fakeApi({ 'https://api.chess.com/pub/player/erik/games/archives': { archives: [] } });
  const none = await call(createChesscomHandler({ fetchImpl: empty.fetchImpl }), '/?user=erik');
  assert.deepEqual(none.body.games, []);
});

test('the User-Agent cannot carry extra header lines', () => {
  assert.equal(userAgent(''), 'gothic-chess/1.0');
  assert.equal(userAgent('me\r\nx-bad: 1'), 'gothic-chess/1.0 (contact: mex-bad: 1)');
});

test('the list is capped', () => {
  assert.equal(trimGames(Array.from({ length: 80 }, (_, i) => game(i))).length, 50);
});
