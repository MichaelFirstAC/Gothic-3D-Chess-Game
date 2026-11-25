// GET /api/chesscom?user=name: a player's recent games from Chess.com's official
// Published-Data API (https://api.chess.com/pub/...). No login, no scraping.
import {
  HttpError, sendJson, sendError, createRateLimiter, clientAddress, isCrossSite,
} from '../server/http.js';

const API = 'https://api.chess.com/pub/player/';
const USERNAME = /^[a-z0-9_-]{2,30}$/;
const MAX_GAMES = 50;
const CACHE_MS = 5 * 60 * 1000;
const CACHE_ENTRIES = 100;
const TIMEOUT_MS = 20000;

// Chess.com asks API clients to say who they are.
export function userAgent(contact) {
  const clean = String(contact || '').replace(/[^\x20-\x7e]/g, '').trim();
  return clean ? `gothic-chess/1.0 (contact: ${clean})` : 'gothic-chess/1.0';
}

function pgnResult(game) {
  if (game.white.result === 'win') return '1-0';
  return game.black.result === 'win' ? '0-1' : '1/2-1/2';
}

const player = ({ username, rating, result }) => ({ username, rating, result });

// Standard chess only, newest first, with just the fields the browser needs.
export function trimGames(games) {
  return games
    .filter((g) => g.rules === 'chess' && g.pgn && g.white && g.black)
    .sort((a, b) => b.end_time - a.end_time)
    .slice(0, MAX_GAMES)
    .map((g) => ({
      url: g.url,
      white: player(g.white),
      black: player(g.black),
      result: pgnResult(g),
      timeClass: g.time_class,
      endTime: g.end_time,
      pgn: g.pgn,
      ...(g.accuracies && { accuracies: g.accuracies }),
    }));
}

export function createChesscomHandler({
  env = process.env,
  fetchImpl = fetch,
  now = Date.now,
  allow = createRateLimiter({ max: 30, windowMs: 5 * 60 * 1000 }),
  log = console.error,
} = {}) {
  const cache = new Map(); // url -> { expires, data }

  async function request(url) {
    const options = () => ({
      headers: { 'user-agent': userAgent(env.CHESSCOM_CONTACT), accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    try {
      return await fetchImpl(url, options());
    } catch {
      // One retry: dropped connections do happen.
      return fetchImpl(url, options());
    }
  }

  async function getJson(url) {
    const hit = cache.get(url);
    if (hit && hit.expires > now()) return hit.data;
    let response;
    let data;
    try {
      response = await request(url);
      if (response.ok) data = await response.json();
    } catch (error) {
      log('chesscom: request failed:', error.message);
      throw new HttpError(502, 'upstream', 'The Chess.com API could not be reached. Try again shortly.');
    }
    if (response.status === 404 || response.status === 410) {
      throw new HttpError(404, 'not_found', 'Chess.com has no player with that username.');
    }
    if (response.status === 429) {
      throw new HttpError(429, 'rate_limited', 'Chess.com is limiting requests. Try again in a minute.');
    }
    if (!response.ok) {
      log('chesscom: unexpected status', response.status);
      throw new HttpError(502, 'upstream', `The Chess.com API returned an error (${response.status}).`);
    }
    cache.delete(url);
    cache.set(url, { expires: now() + CACHE_MS, data });
    if (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    return data;
  }

  return async function handler(req, res) {
    try {
      if (req.method !== 'GET') {
        sendJson(res, 405, { error: 'method_not_allowed', message: 'Use GET.' }, { allow: 'GET' });
        return;
      }
      if (isCrossSite(req)) throw new HttpError(403, 'cross_site', 'Requests from other sites are not allowed.');
      const username = (new URL(req.url, 'http://localhost').searchParams.get('user') || '').trim().toLowerCase();
      if (!USERNAME.test(username)) {
        throw new HttpError(400, 'bad_username', 'Enter a username using letters, numbers, "_" or "-".');
      }
      if (!allow(clientAddress(req))) {
        throw new HttpError(429, 'rate_limited', 'Too many lookups. Try again in a few minutes.');
      }

      const prefix = `${API}${username}/games/`;
      const { archives = [] } = await getJson(`${prefix}archives`);
      const newest = archives.at(-1);
      if (!newest) {
        sendJson(res, 200, { username, month: null, games: [] });
        return;
      }
      // The address comes from the API's reply, so check it before following it.
      const month = String(newest).toLowerCase().startsWith(prefix) && String(newest).slice(prefix.length);
      if (!month || !/^\d{4}\/\d{2}$/.test(month)) {
        throw new HttpError(502, 'upstream', 'The Chess.com API sent an unexpected archive address.');
      }
      const { games = [] } = await getJson(`${prefix}${month}`);
      sendJson(res, 200, { username, month, games: trimGames(games) });
    } catch (error) {
      if (error instanceof HttpError) sendError(res, error);
      else {
        log('chesscom: unexpected error:', error);
        sendJson(res, 500, { error: 'internal', message: 'The import service failed.' });
      }
    }
  };
}

export default createChesscomHandler();
