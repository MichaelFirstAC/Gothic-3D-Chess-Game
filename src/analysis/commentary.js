// Fetches plain-language commentary from our own server. The browser never sees
// an API key. Every failure becomes a CommentaryUnavailable with a readable
// message, so the engine review carries on without it.

const TIMEOUT_MS = 120000;

export class CommentaryUnavailable extends Error {
  constructor(message) {
    super(message);
    this.name = 'CommentaryUnavailable';
  }
}

// Resolves with { moments: Map<ply, explanation>, summary: string[] }.
export async function fetchCommentary(request, { signal, fetchImpl = fetch, url = '/api/explain' } = {}) {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new CommentaryUnavailable(timeout.aborted
      ? 'The commentary service took too long to answer.'
      : 'The commentary service could not be reached.');
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new CommentaryUnavailable(body?.message || `The commentary service is not available (${response.status}).`);
  }
  if (!Array.isArray(body?.moments) || !Array.isArray(body?.summary)) {
    throw new CommentaryUnavailable('The commentary service is not available here.');
  }
  return {
    moments: new Map(body.moments.map((m) => [m.ply, m.explanation])),
    summary: body.summary,
  };
}
