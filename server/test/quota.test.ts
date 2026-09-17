import { describe, expect, it, vi, beforeEach } from 'vitest';

import worker from '../src/index';
import {
  consumePage,
  creditPages,
  getQuota,
  type D1Db,
  type D1Statement,
} from '../src/quota';
import type { Env } from '../src/summarize';

/** Minimal in-memory D1 covering exactly the statements quota.ts /
 *  webhook.ts issue. */
function makeFakeDb() {
  const users = new Map<string, { free_used: number; paid_balance: number }>();
  const grants = new Set<string>();
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
          if (q.startsWith('SELECT free_used, paid_balance')) {
            const row = users.get(bound[0] as string);
            return (row ? { ...row } : null) as T | null;
          }
          if (q.startsWith('SELECT rc_event_id')) {
            return (grants.has(bound[0] as string)
              ? { rc_event_id: bound[0] }
              : null) as T | null;
          }
          throw new Error(`fake D1: unexpected SELECT: ${q}`);
        },
        async run() {
          if (q.startsWith('INSERT INTO users')) {
            users.set(bound[0] as string, {
              free_used: 0,
              paid_balance: 0,
            });
            return {};
          }
          if (q.startsWith('INSERT INTO grants')) {
            grants.add(bound[0] as string);
            return {};
          }
          if (q.startsWith('UPDATE users SET free_used = free_used + 1')) {
            users.get(bound[0] as string)!.free_used += 1;
            return {};
          }
          if (
            q.startsWith('UPDATE users SET paid_balance = paid_balance - 1')
          ) {
            users.get(bound[0] as string)!.paid_balance -= 1;
            return {};
          }
          if (
            q.startsWith('UPDATE users SET paid_balance = paid_balance + ?')
          ) {
            users.get(bound[1] as string)!.paid_balance +=
              bound[0] as number;
            return {};
          }
          if (q.includes('free_used = CASE WHEN')) {
            const row = users.get(bound[0] as string)!;
            row.free_used = Math.max(0, row.free_used - 1);
            return {};
          }
          if (
            q.startsWith('UPDATE users SET paid_balance = paid_balance + 1')
          ) {
            users.get(bound[0] as string)!.paid_balance += 1;
            return {};
          }
          throw new Error(`fake D1: unexpected UPDATE/INSERT: ${q}`);
        },
      };
      return stmt;
    },
  };
  return { db, users };
}

const baseEnv: Env = {
  OPENROUTER_KEY: 'or-test-key',
  PROXY_TOKEN: 'proxy-test-token',
  RC_WEBHOOK_SECRET: 'rc-test-secret',
};

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

function rcEvent(
  type: string,
  eventId: string,
  userId: string,
  productId: string,
) {
  return new Request('https://api.test/rc-webhook', {
    method: 'POST',
    headers: { Authorization: 'Bearer rc-test-secret' },
    body: JSON.stringify({
      event: {
        type,
        id: eventId,
        app_user_id: userId,
        product_id: productId,
      },
    }),
  });
}

describe('quota storage', () => {
  it('starts every user at 10 free, spends free first then paid', async () => {
    const { db } = makeFakeDb();
    expect(await getQuota(db, 'u1', 10)).toEqual({
      freeUsed: 0,
      freeTotal: 10,
      paidBalance: 0,
      pro: false,
    });
    for (let i = 0; i < 10; i++) {
      expect(await consumePage(db, 'u1', 10)).toBe('free');
    }
    expect(await consumePage(db, 'u1', 10)).toBeNull();
    await creditPages(db, 'u1', 500);
    expect(await consumePage(db, 'u1', 10)).toBe('paid');
    expect((await getQuota(db, 'u1', 10)).paidBalance).toBe(499);
  });
});

describe('metered summarize', () => {
  beforeEach(() => vi.unstubAllGlobals());

  it('requires X-User-Id and spends a page per summary', async () => {
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

    const noUser = await worker.fetch(summarizeRequest(), env);
    expect(noUser.status).toBe(400);

    const ok = await worker.fetch(summarizeRequest('u1'), env);
    expect(ok.status).toBe(200);
    expect((await getQuota(db, 'u1', 10)).freeUsed).toBe(1);
  });

  it('returns 402 when exhausted, without calling upstream', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    for (let i = 0; i < 10; i++) await consumePage(db, 'u1', 10);
    let upstreamCalls = 0;
    vi.stubGlobal('fetch', async () => {
      upstreamCalls++;
      return new Response('x', { status: 200 });
    });

    const res = await worker.fetch(summarizeRequest('u1'), env);
    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({ error: 'quota_exhausted' });
    expect(upstreamCalls).toBe(0);
  });

  it('refunds the page when upstream fails before streaming', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    vi.stubGlobal(
      'fetch',
      async () => new Response('boom', { status: 503 }),
    );
    const res = await worker.fetch(summarizeRequest('u1'), env);
    expect(res.status).toBe(502);
    expect((await getQuota(db, 'u1', 10)).freeUsed).toBe(0);
  });
});

describe('GET /quota', () => {
  it('reports the allowance', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    await consumePage(db, 'u1', 10);
    const res = await worker.fetch(
      new Request('https://api.test/quota?user=u1', {
        headers: { Authorization: 'Bearer proxy-test-token' },
      }),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      freeUsed: 1,
      freeTotal: 10,
      paidBalance: 0,
      pro: false,
    });
  });

  it('rejects bad auth and missing user', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    const noAuth = await worker.fetch(
      new Request('https://api.test/quota?user=u1'),
      env,
    );
    expect(noAuth.status).toBe(401);
    const noUser = await worker.fetch(
      new Request('https://api.test/quota', {
        headers: { Authorization: 'Bearer proxy-test-token' },
      }),
      env,
    );
    expect(noUser.status).toBe(400);
  });
});

describe('POST /rc-webhook', () => {
  it('credits tier pages, idempotently', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };

    const first = await worker.fetch(
      rcEvent('INITIAL_PURCHASE', 'evt-1', 'u1', 'pagesMid_monthly'),
      env,
    );
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({
      credited: 500,
      user: 'u1',
      product: 'pagesMid_monthly',
    });
    expect((await getQuota(db, 'u1', 10)).paidBalance).toBe(500);

    const replay = await worker.fetch(
      rcEvent('INITIAL_PURCHASE', 'evt-1', 'u1', 'pagesMid_monthly'),
      env,
    );
    expect(replay.status).toBe(200);
    expect(await replay.json()).toEqual({ duplicate: true });
    expect((await getQuota(db, 'u1', 10)).paidBalance).toBe(500);

    const renewal = await worker.fetch(
      rcEvent('RENEWAL', 'evt-2', 'u1', 'pagesLow_monthly'),
      env,
    );
    expect(renewal.status).toBe(200);
    expect((await getQuota(db, 'u1', 10)).paidBalance).toBe(600);

    const upgrade = await worker.fetch(
      rcEvent('PRODUCT_CHANGE', 'evt-3', 'u1', 'pagesMax_monthly'),
      env,
    );
    expect(upgrade.status).toBe(200);
    expect(await upgrade.json()).toEqual({
      credited: 3000,
      user: 'u1',
      product: 'pagesMax_monthly',
    });
    expect((await getQuota(db, 'u1', 10)).paidBalance).toBe(3600);
  });

  it('ignores non-credit events without touching balance', async () => {
    const { db } = makeFakeDb();
    const env = { ...baseEnv, DB: db };
    const res = await worker.fetch(
      rcEvent('CANCELLATION', 'evt-9', 'u1', 'pagesLow_monthly'),
      env,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: 'CANCELLATION' });
    expect((await getQuota(db, 'u1', 10)).paidBalance).toBe(0);
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
      rcEvent('INITIAL_PURCHASE', 'evt-x', 'u1', 'pagesUltra_monthly'),
      env,
    );
    expect(unknown.status).toBe(400);

    // Play's lowercase product IDs credit identically to the
    // Test Store mixed-case ones.
    const playCased = await worker.fetch(
      rcEvent('INITIAL_PURCHASE', 'evt-y', 'u2', 'pagesmid_monthly'),
      env,
    );
    expect(playCased.status).toBe(200);
    expect(await playCased.json()).toEqual({
      credited: 500,
      user: 'u2',
      product: 'pagesmid_monthly',
    });

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
