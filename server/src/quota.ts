/**
 * Page quota: 100 free pages per calendar month (reset, no rollover),
 * or unlimited* with an active subscription.
 *
 * Unlimited = 5000 guaranteed pages/month with guardrails against
 * margin destruction: 500 pages/day, 10000 pages/month hard cap.
 *
 * State (Cloudflare D1):
 *   subscriptions(user_id, product_id, expires_at) — maintained from
 *     Stripe webhooks; access is live while expires_at > now.
 *   usage(user_id, month, day, free_used, paid_used) — one row per
 *     user per day; monthly windows fall out naturally.
 *
 * D1 access stays behind narrow structural interfaces so unit tests
 * can substitute an in-memory fake.
 */

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(column?: string): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface D1Db {
  prepare(query: string): D1Statement;
}

export interface QuotaView {
  /** Legacy compat: monthly free pages consumed. */
  freeUsed: number;
  /** Free pages per month (100). */
  freeTotal: number;
  /**
   * Legacy compat for old app builds: remaining monthly allowance
   * (free remainder, or remaining paid cap when subscribed).
   */
  paidBalance: number;
  /** Legacy compat: always false; live access is `unlimited`. */
  pro: false;
  /** True while a subscription is live (expires_at > now). */
  unlimited: boolean;
  /** Paid pages consumed in this calendar month. */
  paidUsed: number;
  /** Paid hard cap per month (10000). */
  paidCap: number;
  /** Paid pages consumed today (UTC). */
  dailyUsed: number;
  /** Paid daily cap (500). */
  dailyCap: number;
  /** Current billing window, YYYY-MM (UTC). */
  month: string;
}

export const FREE_PAGES_PER_MONTH = 100;
export const PAID_PAGES_PER_MONTH = 10000;
export const PAID_PAGES_PER_DAY = 500;

export function defaultFreeTotal(env: { FREE_PAGES?: string }): number {
  const n = parseInt(env.FREE_PAGES ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : FREE_PAGES_PER_MONTH;
}

export function monthOf(date: Date): string {
  return date.toISOString().slice(0, 7);
}

export function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

interface SubRow {
  product_id: string;
  expires_at: number;
}

/** Live subscription for the user, if any. */
export async function getSubscription(
  db: D1Db,
  userId: string,
  nowMs: number,
): Promise<SubRow | null> {
  const row = await db
    .prepare('SELECT product_id, expires_at FROM subscriptions WHERE user_id = ?')
    .bind(userId)
    .first<SubRow>();
  if (!row || row.expires_at <= nowMs) return null;
  return row;
}

async function monthSums(
  db: D1Db,
  userId: string,
  month: string,
): Promise<{ free_used: number; paid_used: number }> {
  const row = await db
    .prepare(
      'SELECT COALESCE(SUM(free_used),0) AS free_used, COALESCE(SUM(paid_used),0) AS paid_used FROM usage WHERE user_id = ? AND month = ?',
    )
    .bind(userId, month)
    .first<{ free_used: number; paid_used: number }>();
  return {
    free_used: row?.free_used ?? 0,
    paid_used: row?.paid_used ?? 0,
  };
}

async function todayPaid(
  db: D1Db,
  userId: string,
  month: string,
  day: string,
): Promise<number> {
  const row = await db
    .prepare(
      'SELECT paid_used FROM usage WHERE user_id = ? AND month = ? AND day = ?',
    )
    .bind(userId, month, day)
    .first<{ paid_used: number }>();
  return row?.paid_used ?? 0;
}

async function bump(
  db: D1Db,
  userId: string,
  month: string,
  day: string,
  column: 'free_used' | 'paid_used',
  delta: 1 | -1,
): Promise<void> {
  await db
    .prepare(
      'INSERT INTO usage (user_id, month, day, free_used, paid_used) VALUES (?, ?, ?, 0, 0) ON CONFLICT(user_id, month, day) DO NOTHING',
    )
    .bind(userId, month, day)
    .run();
  await db
    .prepare(
      column === 'free_used'
        ? 'UPDATE usage SET free_used = CASE WHEN free_used + ? < 0 THEN 0 ELSE free_used + ? END WHERE user_id = ? AND month = ? AND day = ?'
        : 'UPDATE usage SET paid_used = CASE WHEN paid_used + ? < 0 THEN 0 ELSE paid_used + ? END WHERE user_id = ? AND month = ? AND day = ?',
    )
    .bind(delta, delta, userId, month, day)
    .run();
}

/** Current allowance (+ legacy fields for old app builds). */
export async function getQuota(
  db: D1Db,
  userId: string,
  freeTotal: number,
  now: Date = new Date(),
): Promise<QuotaView> {
  const month = monthOf(now);
  const day = dayOf(now);
  const sub = await getSubscription(db, userId, now.getTime());
  const sums = await monthSums(db, userId, month);
  const daily = await todayPaid(db, userId, month, day);
  const unlimited = sub !== null;
  const freeLeft = Math.max(0, freeTotal - sums.free_used);
  return {
    freeUsed: sums.free_used,
    freeTotal,
    paidBalance: unlimited
      ? Math.max(0, PAID_PAGES_PER_MONTH - sums.paid_used)
      : freeLeft,
    pro: false,
    unlimited,
    paidUsed: sums.paid_used,
    paidCap: PAID_PAGES_PER_MONTH,
    dailyUsed: daily,
    dailyCap: PAID_PAGES_PER_DAY,
    month,
  };
}

export type SpendOutcome =
  | { ok: true; kind: 'free' | 'paid' }
  | { ok: false; code: 'quota_exhausted' | 'daily_limit_reached' | 'monthly_cap_reached' };

/** Spend one page. Monthly/daily windows fall out of the date keys. */
export async function consumePage(
  db: D1Db,
  userId: string,
  freeTotal: number,
  now: Date = new Date(),
): Promise<SpendOutcome> {
  const month = monthOf(now);
  const day = dayOf(now);
  const sub = await getSubscription(db, userId, now.getTime());
  if (sub !== null) {
    const sums = await monthSums(db, userId, month);
    if (sums.paid_used >= PAID_PAGES_PER_MONTH) {
      return { ok: false, code: 'monthly_cap_reached' };
    }
    const daily = await todayPaid(db, userId, month, day);
    if (daily >= PAID_PAGES_PER_DAY) {
      return { ok: false, code: 'daily_limit_reached' };
    }
    await bump(db, userId, month, day, 'paid_used', 1);
    return { ok: true, kind: 'paid' };
  }
  const sums = await monthSums(db, userId, month);
  if (sums.free_used >= freeTotal) {
    return { ok: false, code: 'quota_exhausted' };
  }
  await bump(db, userId, month, day, 'free_used', 1);
  return { ok: true, kind: 'free' };
}

/** Give back a spent page (upstream failed before streaming). */
export async function refundPage(
  db: D1Db,
  userId: string,
  kind: 'free' | 'paid',
  now: Date = new Date(),
): Promise<void> {
  await bump(
    db,
    userId,
    monthOf(now),
    dayOf(now),
    kind === 'free' ? 'free_used' : 'paid_used',
    -1,
  );
}

/** Mark a subscription live until expiresAtMs (insert or extend). */
export async function activateSubscription(
  db: D1Db,
  userId: string,
  productId: string,
  expiresAtMs: number,
): Promise<void> {
  await db
    .prepare(
      "INSERT INTO subscriptions (user_id, product_id, expires_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET product_id = excluded.product_id, expires_at = excluded.expires_at, updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))",
    )
    .bind(userId, productId, expiresAtMs)
    .run();
}

/** Drop subscription access (on EXPIRATION; cancellations keep access
 *  until expires_at, so they need no state change). */
export async function deactivateSubscription(
  db: D1Db,
  userId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM subscriptions WHERE user_id = ?')
    .bind(userId)
    .run();
}

/**
 * Move a subscription from one device UID to another. Exactly one UID
 * stays active: any rows already on the target are cleared first.
 * Usage rows stay put (fresh guardrails on the new device, still
 * Stripe-bounded).
 */
export async function transferSubscription(
  db: D1Db,
  fromUserId: string,
  toUserId: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM subscriptions WHERE user_id = ?')
    .bind(toUserId)
    .run();
  await db
    .prepare('DELETE FROM stripe_customers WHERE user_id = ?')
    .bind(toUserId)
    .run();
  await db
    .prepare('UPDATE subscriptions SET user_id = ? WHERE user_id = ?')
    .bind(toUserId, fromUserId)
    .run();
  await db
    .prepare('UPDATE stripe_customers SET user_id = ? WHERE user_id = ?')
    .bind(toUserId, fromUserId)
    .run();
}
