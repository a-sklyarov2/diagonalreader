/**
 * Page quota storage (Cloudflare D1).
 *
 * Every user (stable device id, see app DeviceIdentity) starts with a
 * free allowance (default 10). Purchases credit a consumable page
 * balance via the RevenueCat webhook. Summarization spends free pages
 * first, then purchased ones.
 *
 * The D1 access is typed through narrow structural interfaces so unit
 * tests can substitute an in-memory fake — the real D1Database
 * satisfies them without adaptation.
 */

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(column?: string): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Db {
  prepare(query: string): D1Statement;
}

export interface QuotaRow {
  free_used: number;
  paid_balance: number;
}

export interface QuotaView {
  freeUsed: number;
  freeTotal: number;
  paidBalance: number;
  /** Server never sets this (entitlement lives in RevenueCat, checked
   *  client-side); kept so the app has one quota shape. */
  pro: false;
}

export const DEFAULT_FREE_PAGES = 10;

export function freeTotal(env: { FREE_PAGES?: string }): number {
  const n = parseInt(env.FREE_PAGES ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_FREE_PAGES;
}

/** Current allowance, creating the user row on first sight. */
export async function getQuota(
  db: D1Db,
  userId: string,
  total: number,
): Promise<QuotaView> {
  let row = await db
    .prepare('SELECT free_used, paid_balance FROM users WHERE user_id = ?')
    .bind(userId)
    .first<QuotaRow>();
  if (!row) {
    await db
      .prepare(
        'INSERT INTO users (user_id, free_used, paid_balance) VALUES (?, 0, 0)',
      )
      .bind(userId)
      .run();
    row = { free_used: 0, paid_balance: 0 };
  }
  return {
    freeUsed: row.free_used,
    freeTotal: total,
    paidBalance: row.paid_balance,
    pro: false,
  };
}

/**
 * Spend one page: free allowance first, then purchased balance.
 * Returns which pool was spent, or null when the user is exhausted
 * (caller maps that to HTTP 402).
 */
export async function consumePage(
  db: D1Db,
  userId: string,
  total: number,
): Promise<'free' | 'paid' | null> {
  const quota = await getQuota(db, userId, total);
  if (quota.freeUsed < total) {
    await db
      .prepare(
        "UPDATE users SET free_used = free_used + 1, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE user_id = ?",
      )
      .bind(userId)
      .run();
    return 'free';
  }
  if (quota.paidBalance > 0) {
    await db
      .prepare(
        "UPDATE users SET paid_balance = paid_balance - 1, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE user_id = ?",
      )
      .bind(userId)
      .run();
    return 'paid';
  }
  return null;
}

/** Give back a spent page (e.g. upstream failed before streaming). */
export async function refundPage(
  db: D1Db,
  userId: string,
  kind: 'free' | 'paid',
): Promise<void> {
  await getQuota(db, userId, DEFAULT_FREE_PAGES); // ensure row
  await db
    .prepare(
      kind === 'free'
        ? 'UPDATE users SET free_used = CASE WHEN free_used > 0 THEN free_used - 1 ELSE 0 END WHERE user_id = ?'
        : 'UPDATE users SET paid_balance = paid_balance + 1 WHERE user_id = ?',
    )
    .bind(userId)
    .run();
}

/** Credit purchased pages (idempotency is enforced by the caller via
 *  the grants table — see webhook.ts). */
export async function creditPages(
  db: D1Db,
  userId: string,
  pages: number,
): Promise<void> {
  await getQuota(db, userId, DEFAULT_FREE_PAGES); // ensure row
  await db
    .prepare(
      "UPDATE users SET paid_balance = paid_balance + ?, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE user_id = ?",
    )
    .bind(pages, userId)
    .run();
}
