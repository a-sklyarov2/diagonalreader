import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';

import worker from '../src/index';
import {
  activateSubscription,
  consumePage,
  getQuota,
  PAID_PAGES_PER_DAY,
  PAID_PAGES_PER_MONTH,
  type D1Db,
  type D1Statement,
} from '../src/quota';
import type { Env } from '../src/summarize';

/** In-memory D1 covering the statements quota.ts / stripe.ts issue. */
function makeFakeDb() {
  const subs = new Map<string, { product_id: string; expires_at: number }>();
  const usage = new Map<string, { free_used: number; paid_used: number }>();
  const customers = new Map<string, string>();
  const key = (u: string, m: string, d: string) => `${u}|${m}|${d}`;
  const db: D1Db = {
    prepare(query: string): D1Statement {
      const q = query.replace(/\s+/g, ' ').trim();
      let bound: unknown[] = [];
      const stmt: D1Statement = {
        bind(...values: unknown[]) {
          bound = values;
          return stmt;
        },
        async first<T>() {
          if (q.startsWith('SELECT product_id, expires_at')) {
            const row = subs.get(bound[0] as string);
            return (row ? { ...row } : null) as T | null;
          }
          if (q.includes('COALESCE(SUM(free_used),0)')) {
            const [u, m] = bound as string[];
            let free_used = 0;
            let paid_used = 0;
            for (const [k, v] of usage) {
              if (k.startsWith(`${u}|${m}|`)) {
                free_used += v.free_used;
                paid_used += v.paid_used;
              }
            }
            return { free_used, paid_used } as T;
          }
          if (q.startsWith('SELECT paid_used FROM usage')) {
            const row = usage.get(
              key(bound[0] as string, bound[1] as string, bound[2] as string),
            );
            return (row ? { paid_used: row.paid_used } : null) as T | null;
          }
          if (q.startsWith('SELECT customer_id FROM stripe_customers')) {
            const customerId = customers.get(bound[0] as string);
            return (
              customerId ? { customer_id: customerId } : null
            ) as T | null;
          }
          if (q.startsWith('SELECT user_id FROM stripe_customers')) {
            const wanted = bound[0] as string;
            for (const [userId, customerId] of customers) {
              if (customerId === wanted) {
                return { user_id: userId } as T;
              }
            }
            return null as T | null;
          }
          throw new Error(`fake D1: unexpected SELECT: ${q}`);
        },
        async run() {
          if (q.startsWith('INSERT INTO subscriptions')) {
            subs.set(bound[0] as string, {
              product_id: bound[1] as string,
              expires_at: bound[2] as number,
            });
            return {};
          }
          if (q.startsWith('UPDATE subscriptions SET expires_at')) {
            const row = subs.get(bound[1] as string);
            if (row) row.expires_at = bound[0] as number;
            return {};
          }
          if (q.startsWith('DELETE FROM subscriptions')) {
            subs.delete(bound[0] as string);
            return {};
          }
          if (q.startsWith('INSERT INTO stripe_customers')) {
            customers.set(bound[0] as string, bound[1] as string);
            return {};
          }
          if (q.startsWith('INSERT INTO usage')) {
            const k = key(
              bound[0] as string,
              bound[1] as string,
              bound[2] as string,
            );
            if (!usage.has(k)) usage.set(k, { free_used: 0, paid_used: 0 });
            return {};
          }
          if (q.startsWith('UPDATE usage SET free_used')) {
            const row = usage.get(
              key(bound[2] as string, bound[3] as string, bound[4] as string),
            )!;
            row.free_used = Math.max(0, row.free_used + (bound[0] as number));
            return {};
          }
          if (q.startsWith('UPDATE usage SET paid_used')) {
            const row = usage.get(
              key(bound[2] as string, bound[3] as string, bound[4] as string),
            )!;
            row.paid_used = Math.max(0, row.paid_used + (bound[0] as number));
            return {};
          }
          throw new Error(`fake D1: unexpected write: ${q}`);
        },
      };
      return stmt;
    },
  };
  return { db, subs, customers };
}

const STRIPE_SECRET = 'sk-test';
const WEBHOOK_SECRET = 'whsec-test';
const PRICE = 'price_monthly';

const baseEnv: Env = {
  OPENROUTER_KEY: 'or-test-key',
  STRIPE_SECRET_KEY: STRIPE_SECRET,
  STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
  STRIPE_PRICE_MONTHLY: PRICE,
};

const sept = new Date('2026-09-15T12:00:00Z');
const oct = new Date('2026-10-02T12:00:00Z');

function summarizeRequest(userId?: string): Request {
  const form = new FormData();
  form.set('level', 'high');
  form.set(
    'image',
    new File([new Uint8Array([1, 2, 3])], 'page.jpg', {
      type: 'image/jpeg',
    }),
  );
  const headers: Record<string, string> = {};
  if (userId !== undefined) headers['X-User-Id'] = userId;
  return new Request('https://api.test/summarize', {
    method: 'POST',
    headers,
    body: form,
  });
}

function sign(raw: string, secret: string, t: number): string {
  return createHmac('sha256', secret).update(`${t}.${raw}`, 'utf8').digest('hex');
}

function stripeWebhookRequest(
  payload: unknown,
  opts?: { secret?: string; t?: number; raw?: string },
): Request {
  const raw =
    opts?.raw ??
    (typeof payload === 'string' ? payload : JSON.stringify(payload));
  const t = opts?.t ?? Math.floor(Date.now() / 1000);
  const v1 = sign(raw, opts?.secret ?? WEBHOOK_SECRET, t);
  return new Request('https://api.test/stripe/webhook', {
    method: 'POST',
    headers: { 'Stripe-Signature': `t=${t},v1=${v1}` },
    body: raw,
  });
}

function subscriptionJson(overrides?: {
  customer?: string;
  periodEndSec?: number;
  priceId?: string;
  status?: string;
}) {
  return {
    id: 'sub_123',
    customer: overrides?.customer ?? 'cus_123',
    current_period_end:
      overrides?.periodEndSec ?? Math.floor(Date.now() / 1000) + 30 * 86400,
    status: overrides?.status ?? 'active',
    items: {
      data: [{ price: { id: overrides?.priceId ?? PRICE } }],
    },
  };
}

describe('free monthly quota', () => {
  it('grants 100/month, resets next month, 402 when spent', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('data: [DONE]\n\n', {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        }),
    );

    for (let i = 0; i < 100; i++) {
      expect((await consumePage(db, 'u1', 100, sept)).ok).toBe(true);
    }
    const spent = await consumePage(db, 'u1', 100, sept);
    expect(spent).toEqual({ ok: false, code: 'quota_exhausted' });

    // New month → fresh 100.
    expect(await consumePage(db, 'u1', 100, oct)).toEqual({
      ok: true,
      kind: 'free',
    });

    // HTTP layer maps exhaustion to 402 + legacy compat fields.
    for (let i = 0; i < 99; i++) await consumePage(db, 'u2', 100, sept);
    const res = await worker.fetch(summarizeRequest('u2'), env);
    expect(res.status).toBe(200);
    const res2 = await worker.fetch(summarizeRequest('u2'), env);
    expect(res2.status).toBe(402);
    expect(await res2.json()).toEqual({ error: 'quota_exhausted' });
  });

  it('requires X-User-Id and refunds on upstream failure', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    const noUser = await worker.fetch(summarizeRequest(), env);
    expect(noUser.status).toBe(400);

    vi.stubGlobal(
      'fetch',
      async () => new Response('boom', { status: 503 }),
    );
    const res = await worker.fetch(summarizeRequest('u1'), env);
    expect(res.status).toBe(502);
    expect((await getQuota(db, 'u1', 100, sept)).freeUsed).toBe(0);
  });
});

describe('subscriber guardrails', () => {
  it('enforces 500/day then 10k/month', async () => {
    const { db } = makeFakeDb();
    await activateSubscription(
      db,
      'sub1',
      PRICE,
      Date.now() + 30 * 24 * 3600 * 1000,
    );
    for (let i = 0; i < PAID_PAGES_PER_DAY; i++) {
      expect((await consumePage(db, 'sub1', 100, sept)).ok).toBe(true);
    }
    expect(await consumePage(db, 'sub1', 100, sept)).toEqual({
      ok: false,
      code: 'daily_limit_reached',
    });
    // Next day the daily window reopens, monthly keeps counting.
    const tomorrow = new Date('2026-09-16T12:00:00Z');
    expect(await consumePage(db, 'sub1', 100, tomorrow)).toEqual({
      ok: true,
      kind: 'paid',
    });
    expect(
      (await getQuota(db, 'sub1', 100, tomorrow)).paidUsed,
    ).toBe(PAID_PAGES_PER_DAY + 1);
  }, 30000);

  it('monthly cap stops at 10k', async () => {
    const { db } = makeFakeDb();
    await activateSubscription(
      db,
      'whale',
      PRICE,
      Date.now() + 60 * 24 * 3600 * 1000,
    );
    // 20 days × 500/day.
    for (let d = 1; d <= 20; d++) {
      const day = new Date(`2026-09-${String(d).padStart(2, '0')}T12:00:00Z`);
      for (let i = 0; i < PAID_PAGES_PER_DAY; i++) {
        await consumePage(db, 'whale', 100, day);
      }
    }
    const capped = new Date('2026-09-21T12:00:00Z');
    expect(await consumePage(db, 'whale', 100, capped)).toEqual({
      ok: false,
      code: 'monthly_cap_reached',
    });
    expect(
      (await getQuota(db, 'whale', 100, capped)).paidUsed,
    ).toBe(PAID_PAGES_PER_MONTH);
  }, 60000);

  it('expired subscriptions fall back to free', async () => {
    const { db } = makeFakeDb();
    await activateSubscription(
      db,
      'ex',
      PRICE,
      sept.getTime() - 1000,
    );
    const q = await getQuota(db, 'ex', 100, sept);
    expect(q.unlimited).toBe(false);
    expect(q.freeUsed).toBe(0);
  });
});

describe('GET /quota + /stripe/status', () => {
  it('reports the new shape + legacy compat', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    await consumePage(db, 'u1', 100, sept);
    const res = await worker.fetch(
      new Request('https://api.test/quota?user=u1'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.freeUsed).toBe(1);
    expect(body.freeTotal).toBe(100);
    expect(body.paidBalance).toBe(99); // legacy: free remainder
    expect(body.unlimited).toBe(false);
    expect(body.paidUsed).toBe(0);
    expect(body.paidCap).toBe(PAID_PAGES_PER_MONTH);
    expect(body.dailyUsed).toBe(0);
    expect(body.dailyCap).toBe(PAID_PAGES_PER_DAY);
    expect(body.month).toBe('2026-09');
  });

  it('stripe status mirrors quota', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    await consumePage(db, 'u9', 100, sept);
    const res = await worker.fetch(
      new Request('https://api.test/stripe/status?user=u9'),
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.freeUsed).toBe(1);
    expect(body.unlimited).toBe(false);
  });
});

describe('POST /stripe/checkout + /stripe/portal', () => {
  it('creates a checkout session and maps Stripe errors to 502', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    let seenBody = '';
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (`${url}`.endsWith('/checkout/sessions')) {
        seenBody = `${init.body ?? ''}`;
        return new Response(
          JSON.stringify({ url: 'https://checkout.stripe.com/c/pay_123' }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected Stripe call: ${url}`);
    });
    const res = await worker.fetch(
      new Request('https://api.test/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u-checkout' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: 'https://checkout.stripe.com/c/pay_123',
    });
    expect(seenBody).toContain(PRICE);
    expect(seenBody).toContain('u-checkout');

    const missing = await worker.fetch(
      new Request('https://api.test/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ userId: '' }),
      }),
      env,
    );
    expect(missing.status).toBe(400);

    vi.stubGlobal(
      'fetch',
      async () => new Response('card declined', { status: 402 }),
    );
    const failed = await worker.fetch(
      new Request('https://api.test/stripe/checkout', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u-checkout' }),
      }),
      env,
    );
    expect(failed.status).toBe(502);
    expect(await failed.json()).toEqual({
      error: 'stripe 402: card declined',
    });
  });

  it('opens the portal for known customers, 404 otherwise', async () => {
    const { db, customers } = makeFakeDb();
    customers.set('u-portal', 'cus_portal');
    const env = { ...baseEnv, DB: db };
    vi.stubGlobal('fetch', async (url: string) => {
      if (`${url}`.endsWith('/billing_portal/sessions')) {
        return new Response(
          JSON.stringify({ url: 'https://billing.stripe.com/p/sess_1' }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected Stripe call: ${url}`);
    });
    const res = await worker.fetch(
      new Request('https://api.test/stripe/portal', {
        method: 'POST',
        body: JSON.stringify({ userId: 'u-portal' }),
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: 'https://billing.stripe.com/p/sess_1',
    });

    const unknown = await worker.fetch(
      new Request('https://api.test/stripe/portal', {
        method: 'POST',
        body: JSON.stringify({ userId: 'nobody' }),
      }),
      env,
    );
    expect(unknown.status).toBe(404);
  });
});

describe('POST /stripe/webhook (subscription access)', () => {
  it('activates unlimited on checkout, keeps paid time on cancel/failure, drops on delete', async () => {
    const { db, customers } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    const sub = subscriptionJson();
    vi.stubGlobal('fetch', async (url: string) => {
      if (`${url}`.endsWith('/subscriptions/sub_123')) {
        return new Response(JSON.stringify(sub), { status: 200 });
      }
      throw new Error(`unexpected Stripe call: ${url}`);
    });

    const buy = await worker.fetch(
      stripeWebhookRequest({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            client_reference_id: 'u1',
            metadata: { userId: 'u1' },
            subscription: 'sub_123',
            customer: 'cus_123',
          },
        },
      }),
      env,
    );
    expect(buy.status).toBe(200);
    expect(await buy.json()).toEqual({ received: true });
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(true);
    expect(customers.get('u1')).toBe('cus_123');

    const failedInvoice = await worker.fetch(
      stripeWebhookRequest({
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_123' } },
      }),
      env,
    );
    expect(failedInvoice.status).toBe(200);
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(true);

    const canceled = await worker.fetch(
      stripeWebhookRequest({
        type: 'customer.subscription.updated',
        data: { object: { ...sub, status: 'canceled' } },
      }),
      env,
    );
    expect(canceled.status).toBe(200);
    // Paid period still runs — access remains until period end.
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(true);

    const deleted = await worker.fetch(
      stripeWebhookRequest({
        type: 'customer.subscription.deleted',
        data: { object: { customer: 'cus_123' } },
      }),
      env,
    );
    expect(deleted.status).toBe(200);
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(false);
  });

  it('ignores unknown events, rejects bad signatures and malformed bodies', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    vi.stubGlobal('fetch', async () => {
      throw new Error('Stripe API must not be called');
    });

    const ignored = await worker.fetch(
      stripeWebhookRequest({
        type: 'customer.created',
        data: { object: { id: 'cus_x' } },
      }),
      env,
    );
    expect(ignored.status).toBe(200);
    expect(await ignored.json()).toEqual({ ignored: 'customer.created' });

    const badSig = await worker.fetch(
      stripeWebhookRequest(
        {
          type: 'checkout.session.completed',
          data: { object: {} },
        },
        { secret: 'wrong-secret' },
      ),
      env,
    );
    expect(badSig.status).toBe(401);

    const stale = await worker.fetch(
      stripeWebhookRequest(
        {
          type: 'checkout.session.completed',
          data: { object: {} },
        },
        { t: Math.floor(Date.now() / 1000) - 3600 },
      ),
      env,
    );
    expect(stale.status).toBe(401);

    const empty = await worker.fetch(
      stripeWebhookRequest({ event: {} }),
      env,
    );
    expect(empty.status).toBe(400);
  });

  it('resolves the user from metadata and pins past-due expiry', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    const sub = subscriptionJson();
    vi.stubGlobal('fetch', async (url: string) => {
      if (`${url}`.endsWith('/subscriptions/sub_123')) {
        return new Response(JSON.stringify(sub), { status: 200 });
      }
      throw new Error(`unexpected Stripe call: ${url}`);
    });
    const buy = await worker.fetch(
      stripeWebhookRequest({
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_9',
            metadata: { userId: 'u-meta' },
            subscription: 'sub_123',
            customer: 'cus_123',
          },
        },
      }),
      env,
    );
    expect(buy.status).toBe(200);
    expect((await getQuota(db, 'u-meta', 100, sept)).unlimited).toBe(true);

    const pastDue = await worker.fetch(
      stripeWebhookRequest({
        type: 'customer.subscription.updated',
        data: {
          object: {
            ...sub,
            status: 'past_due',
            current_period_end: Math.floor(sept.getTime() / 1000) - 10,
          },
        },
      }),
      env,
    );
    expect(pastDue.status).toBe(200);
    expect((await getQuota(db, 'u-meta', 100, sept)).unlimited).toBe(false);
  });
});
