// Helpers shared by the API handlers. They use only Node's request and response
// objects, so the same handler runs on Vercel and as Vite dev-server middleware.

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [name, value] of Object.entries(headers)) res.setHeader(name, value);
  res.end(JSON.stringify(body));
}

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const sendError = (res, error) => sendJson(res, error.status, { error: error.code, message: error.message });

// Vercel parses the body before calling the handler; Vite leaves it as a stream.
export async function readJson(req, limit) {
  const tooLarge = () => new HttpError(413, 'too_large', 'The request is too large.');
  const invalid = () => new HttpError(400, 'bad_json', 'The request body is not valid JSON.');
  let text;
  try {
    // On Vercel, reading `body` itself throws when the JSON is malformed.
    if (req.body !== undefined) {
      text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
  } catch {
    throw invalid();
  }
  if (text === undefined) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > limit) throw tooLarge();
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString('utf8');
  }
  if (Buffer.byteLength(text) > limit) throw tooLarge();
  try {
    return JSON.parse(text);
  } catch {
    throw invalid();
  }
}

// A small in-memory limiter. Each server instance keeps its own counts, so this
// slows abuse down rather than preventing it.
export function createRateLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map();
  return function allow(key) {
    const since = now() - windowMs;
    const recent = (hits.get(key) || []).filter((time) => time > since);
    if (hits.size > 5000) hits.clear();
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    hits.set(key, [...recent, now()]);
    return true;
  };
}

export const clientAddress = (req) =>
  String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

// Refuses calls made by pages on other sites.
export function isCrossSite(req) {
  const { origin, host } = req.headers;
  if (!origin) return false;
  try {
    return new URL(origin).host !== (req.headers['x-forwarded-host'] || host);
  } catch {
    return true;
  }
}
