/**
 * Diagonal API — thin streaming proxy in front of OpenRouter.
 *
 * POST /summarize (multipart: image=<jpeg>, level=low|high|max)
 *   → builds the prompt server-side, calls OpenRouter with the secret
 *     key, and streams the SSE response straight back to the app.
 * GET /health → { ok: true, model }
 *
 * NOTE: only a default export here — extra value exports break the
 * Workers runtime. Shared code lives in summarize.ts.
 *
 * Secrets (never committed — `wrangler secret put` / local `.dev.vars`):
 *   OPENROUTER_KEY, PROXY_TOKEN
 * Vars (wrangler.toml [vars]):
 *   MODEL, OPENROUTER_BASE (default https://openrouter.ai/api/v1)
 */

import {
  DEFAULT_MODEL,
  summarize,
  type Env,
} from './summarize';

export default {
  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({
        ok: true,
        model: env.MODEL || DEFAULT_MODEL,
      });
    }
    if (request.method === 'POST' && url.pathname === '/summarize') {
      return summarize(request, env);
    }
    return new Response('Not found', { status: 404 });
  },
};
