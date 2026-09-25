/**
 * Diagonal API — PWA backend: thin streaming proxy in front of
 * OpenRouter, page quota in D1, Stripe billing for unlimited.
 *
 * POST /summarize (multipart: image=<jpeg>, level=low|high|max;
 *   header X-User-Id) → spends one page of quota (100 free/month or
 *   subscriber guardrails), then builds the prompt server-side,
 *   calls OpenRouter with the secret key, and streams the SSE
 *   response straight back. 402 quota_exhausted (subscribe) or 429
 *   daily/monthly caps (wait it out).
 * GET /quota?user=<id> → { freeUsed, freeTotal, paidBalance, pro,
 *   unlimited, paidUsed, paidCap, dailyUsed, dailyCap, month }
 * GET /stripe/status?user=<id> → same quota view (PWA pill source).
 * POST /stripe/checkout { userId } → { url } (hosted Checkout page).
 * POST /stripe/portal { userId } → { url } (billing portal).
 * POST /stripe/recover { email, invoiceNumber, newUserId } → { recovered: true } (restore on new device).
 * POST /stripe/webhook (Stripe-signed) → activates/deactivates access.
 * GET /health → { ok: true, model }
 * GET /privacy-policy, GET /data-deletion → static pages.
 * GET / → apex landing or app PWA; GET /sw.js → apex retirement worker or app asset.
 *
 * The app PWA and API share a Worker and origin, so there is no CORS
 * or proxy-token auth — quota-per-user-ID plus Stripe is the abuse control.
 *
 * NOTE: only a default export here — extra value exports break the
 * Workers runtime. Shared code lives in summarize.ts / quota.ts /
 * stripe.ts.
 *
 * Secrets (never committed — `wrangler secret put` / local `.dev.vars`):
 *   OPENROUTER_KEY, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
 * Vars (wrangler.toml [vars]):
 *   MODEL, OPENROUTER_BASE (default https://openrouter.ai/api/v1),
 *   STRIPE_PRICE_MONTHLY (price ids are not secret)
 * Bindings: D1 database `diagonal` as DB (see migrations/) and static ASSETS.
 */

import {
  DEFAULT_MODEL,
  summarize,
  type Env,
} from './summarize';
import { defaultFreeTotal, getQuota } from './quota';
import {
  handleCheckout,
  handlePortal,
  handleRecover,
  handleStripeWebhook,
  type StripeEnv,
} from './stripe';
import { deletionHtml, landingHtml, privacyPolicyHtml } from './site';

type AssetBinding = { fetch(request: Request): Promise<Response> };

function asset(request: Request, binding: AssetBinding | undefined): Promise<Response> | Response {
  if (!binding) {
    return new Response('server misconfigured: missing ASSETS binding', { status: 500 });
  }
  return binding.fetch(request);
}

function html(body: string, head = false): Response {
  return new Response(head ? null : body, {
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

const apexRetirementWorker = `self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', event => {
  event.waitUntil(self.clients.claim().then(() => self.registration.unregister()));
});
`;
async function quotaJson(
  db: Env['DB'],
  url: URL,
  freeTotal: number,
): Promise<Response> {
  if (!db) {
    return Response.json(
      { error: 'server misconfigured: missing DB binding' },
      { status: 500 },
    );
  }
  const userId = (url.searchParams.get('user') ?? '').trim();
  if (!userId) {
    return Response.json({ error: 'missing ?user=' }, { status: 400 });
  }
  return Response.json(await getQuota(db, userId, freeTotal));
}


export default {
  async fetch(
    request: Request,
    env: Env & StripeEnv & { ASSETS?: AssetBinding },
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
      return quotaJson(env.DB, url, defaultFreeTotal(env));
    }
    if (request.method === 'GET' && url.pathname === '/stripe/status') {
      return quotaJson(env.DB, url, defaultFreeTotal(env));
    }
    if (request.method === 'POST' && url.pathname === '/stripe/checkout') {
      return handleCheckout(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/stripe/portal') {
      return handlePortal(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/stripe/recover') {
      return handleRecover(request, env);
    }
    if (request.method === 'POST' && url.pathname === '/stripe/webhook') {
      if (!env.DB) {
        return Response.json(
          { error: 'server misconfigured: missing DB binding' },
          { status: 500 },
        );
      }
      return handleStripeWebhook(request, env, env.DB);
    }
    if (request.method === 'GET' && url.pathname === '/privacy-policy') {
      return html(privacyPolicyHtml);
    }
    if (request.method === 'GET' && url.pathname === '/data-deletion') {
      return html(deletionHtml);
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/') {
      if (url.hostname === 'diagonalreader.com' && url.protocol === 'http:') {
        url.protocol = 'https:';
        return Response.redirect(url.toString(), 308);
      }
      if (url.hostname === 'diagonalreader.com' || url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
        return html(landingHtml, request.method === 'HEAD');
      }
      return asset(request, env.ASSETS);
    }
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/sw.js') {
      if (url.hostname === 'diagonalreader.com') {
        return new Response(request.method === 'HEAD' ? null : apexRetirementWorker, {
          headers: {
            'content-type': 'application/javascript; charset=utf-8',
            'cache-control': 'no-store',
          },
        });
      }
      return asset(request, env.ASSETS);
    }
    // Other PWA assets are served before this Worker runs.
    return new Response('Not found', { status: 404 });
  },
};
