/**
 * Diagonal API — thin streaming proxy in front of OpenRouter.
 *
 * POST /summarize (multipart: image=<jpeg>, level=low|high|max;
 *   header X-User-Id) → spends one page of quota (100 free/month or
 *   subscriber guardrails), then builds the prompt server-side,
 *   calls OpenRouter with the secret key, and streams the SSE
 *   response straight back. 402 quota_exhausted (paywall) or 429
 *   daily/monthly caps (wait it out).
 * GET /quota?user=<id> → { freeUsed, freeTotal, paidBalance, pro,
 *   unlimited, paidUsed, paidCap, dailyUsed, dailyCap, month }
 * POST /rc-webhook (RevenueCat events) → credits purchased pages.
 * GET /health → { ok: true, model }
 * GET /privacy-policy → static privacy policy page (apex domain).
 * GET / → minimal landing page (apex domain).
 *
 * NOTE: only a default export here — extra value exports break the
 * Workers runtime. Shared code lives in summarize.ts / quota.ts /
 * webhook.ts.
 *
 * Secrets (never committed — `wrangler secret put` / local `.dev.vars`):
 *   OPENROUTER_KEY, PROXY_TOKEN, RC_WEBHOOK_SECRET
 * Vars (wrangler.toml [vars]):
 *   MODEL, OPENROUTER_BASE (default https://openrouter.ai/api/v1)
 * Binding: D1 database `diagonal` as DB (see migrations/).
 */

import {
  DEFAULT_MODEL,
  summarize,
  type Env,
} from './summarize';
import { defaultFreeTotal, getQuota } from './quota';
import { handleWebhook } from './webhook';
import { deletionHtml, landingHtml, privacyPolicyHtml } from './site';

function html(body: string): Response {
  return new Response(body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

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
    if (request.method === 'GET' && url.pathname === '/quota') {
      if (
        request.headers.get('Authorization') !==
        `Bearer ${env.PROXY_TOKEN}`
      ) {
        return Response.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (!env.DB) {
        return Response.json(
          { error: 'server misconfigured: missing DB binding' },
          { status: 500 },
        );
      }
      const userId = (url.searchParams.get('user') ?? '').trim();
      if (!userId) {
        return Response.json(
          { error: 'missing ?user=' },
          { status: 400 },
        );
      }
      return Response.json(
        await getQuota(env.DB, userId, defaultFreeTotal(env)),
      );
    }
    if (request.method === 'POST' && url.pathname === '/rc-webhook') {
      if (!env.DB) {
        return Response.json(
          { error: 'server misconfigured: missing DB binding' },
          { status: 500 },
        );
      }
      return handleWebhook(
        request,
        { RC_WEBHOOK_SECRET: env.RC_WEBHOOK_SECRET ?? '' },
        env.DB,
      );
    }
    if (request.method === 'GET' && url.pathname === '/privacy-policy') {
      return html(privacyPolicyHtml);
    }
    if (request.method === 'GET' && url.pathname === '/data-deletion') {
      return html(deletionHtml);
    }
    if (request.method === 'GET' && url.pathname === '/') {
      return html(landingHtml);
    }
    return new Response('Not found', { status: 404 });
  },
};
