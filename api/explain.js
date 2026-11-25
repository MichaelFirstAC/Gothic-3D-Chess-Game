// POST /api/explain: asks Claude to put already-flagged moves into plain words.
// Stockfish has done the judging; Claude only explains what the engine found.
// The API key stays on the server.
import Anthropic from '@anthropic-ai/sdk';
import {
  HttpError, sendJson, sendError, readJson, createRateLimiter, clientAddress, isCrossSite,
} from '../server/http.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
const MAX_MOMENTS = 6;
const MAX_BODY_BYTES = 20000;

export const SYSTEM_PROMPT = `You are a chess coach talking to a club player about their game.
Stockfish has already analysed the game and flagged the moves below. Its findings are the ground truth: do not judge the positions yourself or disagree with its verdicts.

For each flagged move, write 2 to 4 sentences that explain why the move played was worse, naming the concrete idea (a hanging piece, a missed fork, a weakened king, a lost tempo and so on), and what the engine's move would have achieved.
Support what you say only with the position given and the two lines given: the engine's best line, and the engine's expected continuation after the move played. Do not invent other variations or mention moves outside those lines. If the lines do not show a clear concrete reason, say plainly what the evaluation change shows instead of guessing.

Evaluations are from White's side: positive favours White, negative favours Black. "M3" means White can force mate in 3, "-M3" means Black can, and "1-0" or "0-1" means checkmate is on the board.

Use plain language. Return one entry in "moments" for every flagged move, with its "ply" number unchanged. In "summary", give exactly 3 short bullet points with the main lessons from these moments.`;

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    moments: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ply: { type: 'integer' }, explanation: { type: 'string' } },
        required: ['ply', 'explanation'],
        additionalProperties: false,
      },
    },
    summary: { type: 'array', items: { type: 'string' } },
  },
  required: ['moments', 'summary'],
  additionalProperties: false,
};

// ---------------------------------------------------------------- validation

// Only well-formed chess data is accepted, so the endpoint cannot be used to
// send arbitrary text to the model on the server's API key.
const SAN = /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?)[+#]?$/;
const FEN = /^([pnbrqkPNBRQK1-8]{1,8}\/){7}[pnbrqkPNBRQK1-8]{1,8} [wb] (-|[KQkq]{1,4}) (-|[a-h][36]) \d{1,3} \d{1,4}$/;
const SCORE = /^(1-0|0-1|-?M\d{1,3}|[+-]?\d{1,3}\.\d)$/;
const PHASES = ['opening', 'middlegame', 'endgame'];
const CLASSIFICATIONS = ['inaccuracy', 'mistake', 'blunder'];

const isSan = (value) => typeof value === 'string' && value.length <= 8 && SAN.test(value);
const isLine = (value) => Array.isArray(value) && value.length <= 8 && value.every(isSan);
const isCount = (value) => Number.isInteger(value) && value > 0 && value <= 2000;

function isMoment(m) {
  return Boolean(m)
    && isCount(m.ply) && isCount(m.moveNumber)
    && (m.color === 'w' || m.color === 'b')
    && PHASES.includes(m.phase)
    && CLASSIFICATIONS.includes(m.classification)
    && typeof m.fen === 'string' && m.fen.length <= 100 && FEN.test(m.fen)
    && isSan(m.played)
    && (m.best === null || isSan(m.best))
    && isLine(m.bestLine) && isLine(m.replyLine)
    && SCORE.test(String(m.evalBefore)) && SCORE.test(String(m.evalAfter));
}

export function validateRequest(body) {
  const moments = body?.moments;
  const valid = Array.isArray(moments) && moments.length >= 1 && moments.length <= MAX_MOMENTS
    && moments.every(isMoment)
    && new Set(moments.map((m) => m.ply)).size === moments.length
    && [null, 'w', 'b'].includes(body.reviewedSide ?? null);
  if (!valid) throw new HttpError(400, 'bad_request', 'The request is not a list of reviewed chess moves.');
  return { moments, reviewedSide: body.reviewedSide ?? null };
}

// ---------------------------------------------------------------- the request

const NAMES = { w: 'White', b: 'Black' };

export function buildPrompt({ moments, reviewedSide }) {
  const intro = reviewedSide
    ? `You are coaching the player with the ${NAMES[reviewedSide]} pieces. Some flagged moves may be their opponent's; explain those too, including what they gave your player.`
    : 'Both players are being reviewed.';
  const blocks = moments.map((m) => [
    `ply ${m.ply}: move ${m.moveNumber}, ${NAMES[m.color]} to play (${m.phase})`,
    `Position before the move (FEN): ${m.fen}`,
    `Move played: ${m.played} (engine verdict: ${m.classification})`,
    `Engine's best move: ${m.best ?? 'none'}`,
    `Engine's best line: ${m.bestLine.join(' ') || 'none'}`,
    `Expected continuation after ${m.played}: ${m.replyLine.join(' ') || 'none (the game ends here)'}`,
    `Evaluation before: ${m.evalBefore}   after: ${m.evalAfter}`,
  ].join('\n'));
  return `${intro}\n\n${blocks.join('\n\n')}`;
}

// Parameters for the Messages API call.
export function buildParams(request, model) {
  const params = {
    model,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(request) }],
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
  };
  // These two options are not accepted by every model, so a model chosen with
  // ANTHROPIC_MODEL gets only the parameters above.
  if (model === DEFAULT_MODEL) {
    params.output_config.effort = 'medium';
    // If a safety classifier declines, the API retries on a recommended model.
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }
  return params;
}

// Keeps only what was asked for from the model's reply.
export function readReply(response, request) {
  if (response.stop_reason === 'refusal') {
    throw new HttpError(502, 'refused', 'Claude declined to comment on this game.');
  }
  if (response.stop_reason === 'max_tokens') {
    throw new HttpError(502, 'truncated', 'The commentary was cut off before it finished.');
  }
  let data;
  try {
    data = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  } catch {
    throw new HttpError(502, 'bad_reply', 'The commentary came back in an unreadable form.');
  }
  const asked = new Set(request.moments.map((m) => m.ply));
  return {
    moments: (data.moments || []).filter((m) => asked.has(m.ply) && typeof m.explanation === 'string'),
    summary: (data.summary || []).filter((line) => typeof line === 'string').slice(0, 3),
  };
}

function describeFailure(error) {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new HttpError(502, 'bad_api_key', 'The server\'s Anthropic API key was rejected.');
  }
  if (error instanceof Anthropic.NotFoundError) {
    return new HttpError(502, 'bad_model', 'The configured Claude model was not found. Check ANTHROPIC_MODEL.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpError(429, 'rate_limited', 'Claude is rate limited just now. Try again in a minute.');
  }
  return new HttpError(502, 'upstream', 'Claude could not be reached just now.');
}

// ---------------------------------------------------------------- handler

export function createExplainHandler({
  env = process.env,
  createClient = (apiKey) => new Anthropic({ apiKey, timeout: 90000, maxRetries: 1 }),
  allow = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 }),
  log = console.error,
} = {}) {
  return async function handler(req, res) {
    try {
      if (req.method !== 'POST') {
        sendJson(res, 405, { error: 'method_not_allowed', message: 'Use POST.' }, { allow: 'POST' });
        return;
      }
      if (isCrossSite(req)) throw new HttpError(403, 'cross_site', 'Requests from other sites are not allowed.');
      if (!String(req.headers['content-type']).startsWith('application/json')) {
        throw new HttpError(415, 'bad_content_type', 'Send JSON.');
      }
      if (!env.ANTHROPIC_API_KEY) {
        throw new HttpError(503, 'no_api_key', 'No Anthropic API key is set on the server.');
      }
      const request = validateRequest(await readJson(req, MAX_BODY_BYTES));
      if (!allow(clientAddress(req))) {
        throw new HttpError(429, 'rate_limited', 'Too many commentary requests. Try again in a few minutes.');
      }
      const params = buildParams(request, env.ANTHROPIC_MODEL || DEFAULT_MODEL);
      let response;
      try {
        const client = createClient(env.ANTHROPIC_API_KEY);
        response = params.betas
          ? await client.beta.messages.create(params)
          : await client.messages.create(params);
      } catch (error) {
        log('explain: Claude request failed:', error.status ?? '', error.message);
        throw describeFailure(error);
      }
      sendJson(res, 200, readReply(response, request));
    } catch (error) {
      if (error instanceof HttpError) sendError(res, error);
      else {
        log('explain: unexpected error:', error);
        sendJson(res, 500, { error: 'internal', message: 'The commentary service failed.' });
      }
    }
  };
}

export default createExplainHandler();
