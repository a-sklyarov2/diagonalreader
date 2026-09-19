import { describe, expect, it, vi, beforeEach } from 'vitest';

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

/** In-memory D1 covering the statements quota.ts / webhook.ts issue. */
function makeFakeDb() {
  const subs = new Map<string, { product_id: string; expires_at: number }>();
  const usage = new Map<string, { free_used: number; paid_used: number }>();
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
          if (q.startsWith('DELETE FROM subscriptions')) {
            subs.delete(bound[0] as string);
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
  return { db };
}

const baseEnv: Env = {
  OPENROUTER_KEY: 'or-test-key',
  PROXY_TOKEN: 'proxy-test-token',
  RC_WEBHOOK_SECRET: 'rc-test-secret',
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
  const headers: Record<string, string> = {
    Authorization: 'Bearer proxy-test-token',
  };
  if (userId !== undefined) headers['X-User-Id'] = userId;
  return new Request('https://api.test/summarize', {
    method: 'POST',
    headers,
    body: form,
  });
}

function rcEvent(type: string, userId: string, productId: string) {
  return new Request('https://api.test/rc-webhook', {
    method: 'POST',
    headers: { Authorization: 'Bearer rc-test-secret' },
    body: JSON.stringify({
      event: {
        type,
        id: `evt-${type}-${userId}`,
        app_user_id: userId,
        product_id: productId,
        expiration_at_ms: Date.now() + 30 * 24 * 3600 * 1000,
      },
    }),
  });
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
      'pages_monthly:monthly-max',
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
      'pages_monthly:monthly-max',
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
      'pages_monthly:monthly-max',
      sept.getTime() - 1000,
    );
    const q = await getQuota(db, 'ex', 100, sept);
    expect(q.unlimited).toBe(false);
    expect(q.freeUsed).toBe(0);
  });
});

describe('GET /quota', () => {
  it('reports the new shape + legacy compat', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    await consumePage(db, 'u1', 100, sept);
    const res = await worker.fetch(
      new Request('https://api.test/quota?user=u1', {
        headers: { Authorization: 'Bearer proxy-test-token' },
      }),
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
});

describe('POST /rc-webhook (subscription access)', () => {
  it('activates unlimited on purchase, keeps it on cancel, drops on expiry', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };

    const buy = await worker.fetch(
      rcEvent('INITIAL_PURCHASE', 'u1', 'pages_monthly:monthly-max'),
      env,
    );
    expect(buy.status).toBe(200);
    const bought = (await buy.json()) as Record<string, unknown>;
    expect(bought.unlimited).toBe(true);
    expect(bought.product).toBe('pages_monthly:monthly-max');
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(true);

    const cancel = await worker.fetch(
      rcEvent('CANCELLATION', 'u1', 'pages_monthly:monthly-max'),
      env,
    );
    expect(cancel.status).toBe(200);
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(true);

    const expired = await worker.fetch(
      rcEvent('EXPIRATION', 'u1', 'pages_monthly:monthly-max'),
      env,
    );
    expect(expired.status).toBe(200);
    expect(await expired.json()).toEqual({ expired: true, user: 'u1' });
    expect((await getQuota(db, 'u1', 100, sept)).unlimited).toBe(false);
  });

  it('legacy product ids also unlock', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    for (const product of [
      'pagesMax_monthly',
      'pagesMid_monthly',
      'pagesLow_monthly',
    ]) {
      const res = await worker.fetch(
        rcEvent('INITIAL_PURCHASE', `u-${product}`, product),
        env,
      );
      expect(res.status).toBe(200);
      expect(
        (await getQuota(db, `u-${product}`, 100, sept)).unlimited,
      ).toBe(true);
    }
  });

  it('rejects bad secret, unknown products, malformed bodies', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };

    const badSecret = await worker.fetch(
      new Request('https://api.test/rc-webhook', {
        method: 'POST',
        headers: { Authorization: 'Bearer wrong' },
        body: JSON.stringify({ event: {} }),
      }),
      env,
    );
    expect(badSecret.status).toBe(401);

    const unknown = await worker.fetch(
      rcEvent('INITIAL_PURCHASE', 'u1', 'pagesUltra_monthly'),
      env,
    );
    expect(unknown.status).toBe(400);

    const empty = await worker.fetch(
      new Request('https://api.test/rc-webhook', {
        method: 'POST',
        headers: { Authorization: 'Bearer rc-test-secret' },
        body: JSON.stringify({ event: {} }),
      }),
      env,
    );
    expect(empty.status).toBe(400);
  });
});
