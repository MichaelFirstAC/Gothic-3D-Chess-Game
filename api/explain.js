// POST /api/explain: asks a model hosted by Groq to put already-flagged moves
// into plain words. Stockfish has done the judging; the model only explains what
// the engine found. The API key stays on the server. When this fails, the
// browser keeps the commentary it wrote without AI.
import {
  HttpError, sendJson, sendError, readJson, createRateLimiter, clientAddress, isCrossSite,
} from '../server/http.js';
import { describeFacts, groundMoment, contradiction } from '../src/analysis/grounding.js';

export const API_URL = 'https://api.groq.com/openai/v1/chat/completions';
export const DEFAULT_MODEL = 'openai/gpt-oss-120b';
// Models Groq lists as enforcing a JSON schema exactly. Others get plain JSON mode.
const STRICT_SCHEMA_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
const MAX_MOMENTS = 6;
const MAX_BODY_BYTES = 20000;
// Kept well under the free plan's tokens-per-minute allowance.
const MAX_OUTPUT_TOKENS = 4096;
const TIMEOUT_MS = 60000;

export const SYSTEM_PROMPT = `You are a chess coach talking to a club player about their game.
Stockfish has already analysed the game and flagged the moves below. Its findings are the ground truth: do not judge the positions yourself or disagree with its verdicts.

For each flagged move, write 2 to 4 sentences that explain why the move played was worse, naming the concrete idea (a hanging piece, a missed fork, a weakened king, a lost tempo and so on), and what the engine's move would have achieved.
The facts listed under each move (where every piece stands, what each move in the two lines does, and the material result) were worked out by a chess program. Take them as given and do not work out your own from the FEN or the notation. Say a piece is lost, won or attacking something only if those facts show it. If a line is an even trade, call it a trade.
Support what you say only with those facts and the two lines given: the engine's best line, and the engine's expected continuation after the move played. Do not invent other variations or mention moves outside those lines. If the lines do not show a clear concrete reason, say plainly what the evaluation change shows instead of guessing.

Evaluations are from White's side: positive favours White, negative favours Black. "M3" means White can force mate in 3, "-M3" means Black can, and "1-0" or "0-1" means checkmate is on the board.

Use plain language. When you name a move, write it exactly as it appears in the lines given.

Reply with JSON only, shaped as {"moments": [{"ply": number, "explanation": string}], "summary": [string]}. Return one entry in "moments" for every flagged move, with its "ply" number unchanged. In "summary", give exactly 3 short bullet points with the main lessons from these moments.`;

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
    describeFacts(m),
  ].join('\n'));
  return `${intro}\n\n${blocks.join('\n\n')}`;
}

// The body of the chat completion request.
export function buildParams(request, model) {
  const params = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(request) },
    ],
    max_completion_tokens: MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    response_format: STRICT_SCHEMA_MODELS.includes(model)
      ? { type: 'json_schema', json_schema: { name: 'commentary', strict: true, schema: OUTPUT_SCHEMA } }
      : { type: 'json_object' },
  };
  // Reasoning options differ between models, so only the gpt-oss ones get them.
  if (/^openai\/gpt-oss-(120|20)b$/.test(model)) {
    params.reasoning_effort = 'medium';
    params.include_reasoning = false;
  }
  return params;
}

// ---------------------------------------------------------------- the reply

// Piece moves, pawn captures and castling. A bare square such as "d5" is left
// alone, because it cannot be told apart from the name of a square.
const NAMED_MOVE = /(?<![A-Za-z0-9])(O-O-O|O-O|[KQRBN][a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?|[a-h]x[a-h][1-8](=[QRBN])?)(?![A-Za-z0-9])/g;

const bare = (san) => san.replace(/[+#]+$/, '');

const linesOf = (m) => [m.played, m.best, ...m.bestLine, ...m.replyLine].filter(Boolean).map(bare);

// True if the text names a move that is not in the engine's findings.
export function inventsMoves(text, allowed) {
  return (text.replace(/0-0/g, 'O-O').match(NAMED_MOVE) || []).some((move) => !allowed.has(move));
}

// Keeps only what was asked for. Drops any explanation that names an outside
// move or contradicts what the engine's lines show.
export function readReply(response, request) {
  const choice = response?.choices?.[0];
  if (choice?.finish_reason === 'length') {
    throw new HttpError(502, 'truncated', 'The AI commentary was cut off before it finished.');
  }
  let data;
  try {
    data = JSON.parse(choice.message.content);
  } catch {
    throw new HttpError(502, 'bad_reply', 'The AI commentary came back in an unreadable form.');
  }
  const asked = new Map(request.moments.map((m) => [m.ply, { moves: new Set(linesOf(m)), facts: groundMoment(m) }]));
  const trusted = (ply, text) => {
    const { moves, facts } = asked.get(ply);
    return !inventsMoves(text, moves) && !contradiction(text, facts);
  };
  const everything = new Set(request.moments.flatMap(linesOf));
  const list = (value) => (Array.isArray(value) ? value : []);
  return {
    moments: list(data?.moments)
      .filter((m) => asked.has(m?.ply) && typeof m.explanation === 'string' && m.explanation.trim()
        && trusted(m.ply, m.explanation))
      .map(({ ply, explanation }) => ({ ply, explanation })),
    summary: list(data?.summary)
      .filter((line) => typeof line === 'string' && line.trim() && !inventsMoves(line, everything))
      .slice(0, 3),
  };
}

function describeFailure(status) {
  if (status === 401 || status === 403) {
    return new HttpError(502, 'bad_api_key', 'The server\'s Groq API key was rejected.');
  }
  if (status === 404) {
    return new HttpError(502, 'bad_model', 'The configured Groq model was not found. Check GROQ_MODEL.');
  }
  if (status === 413 || status === 429) {
    return new HttpError(429, 'rate_limited', 'Groq\'s usage limit was reached. Try again later.');
  }
  return new HttpError(502, 'upstream', 'Groq could not complete the request just now.');
}

// ---------------------------------------------------------------- handler

export function createExplainHandler({
  env = process.env,
  fetchImpl = fetch,
  allow = createRateLimiter({ max: 10, windowMs: 10 * 60 * 1000 }),
  log = console.error,
} = {}) {
  async function askGroq(params) {
    let response;
    let body;
    try {
      response = await fetchImpl(API_URL, {
        method: 'POST',
        headers: { authorization: `Bearer ${env.GROQ_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      body = await response.json().catch(() => null);
    } catch (error) {
      log('explain: Groq could not be reached:', error.message);
      throw describeFailure(0);
    }
    if (!response.ok) {
      // Logged for the person running the server; never sent to the browser.
      log('explain: Groq request failed:', response.status, body?.error?.message ?? '');
      throw describeFailure(response.status);
    }
    return body;
  }

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
      if (!env.GROQ_API_KEY) {
        throw new HttpError(503, 'no_api_key', 'No Groq API key is set on the server.');
      }
      const request = validateRequest(await readJson(req, MAX_BODY_BYTES));
      if (!allow(clientAddress(req))) {
        throw new HttpError(429, 'rate_limited', 'Too many commentary requests. Try again in a few minutes.');
      }
      const reply = await askGroq(buildParams(request, env.GROQ_MODEL || DEFAULT_MODEL));
      sendJson(res, 200, readReply(reply, request));
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
