/**
 * RevenueCat webhook → page credits.
 *
 * Dashboard (user action): Integrations → Webhooks → URL
 * `https://<worker>/rc-webhook` with an Authorization header
 * `Bearer <RC_WEBHOOK_SECRET>`. The secret is generated once, stored
 * via `wrangler secret put RC_WEBHOOK_SECRET`, and pasted into the
 * RevenueCat dashboard — never committed.
 *
 * Each subscription period (initial purchase + every renewal) credits
 * the tier's page count as consumable balance. Cancellations and
 * expirations deliberately do NOT claw back: bought pages stay bought.
 */

import { creditPages, type D1Db } from './quota';

export interface Env {
  RC_WEBHOOK_SECRET: string;
}

/** Tier product id → pages credited per billing period. */
export const TIER_PAGES: Record<string, number> = {
  pagesLow_monthly: 100,
  pagesMid_monthly: 500,
  pagesMax_monthly: 3000,
};

/** Event types that grant a fresh period of pages. */
const CREDIT_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
]);

interface RcEvent {
  type?: unknown;
  id?: unknown;
  app_user_id?: unknown;
  product_id?: unknown;
}

export async function handleWebhook(
  request: Request,
  env: Env,
  db: D1Db,
): Promise<Response> {
  if (!env.RC_WEBHOOK_SECRET) {
    return Response.json(
      { error: 'server misconfigured: missing RC_WEBHOOK_SECRET' },
      { status: 500 },
    );
  }
  if (
    request.headers.get('Authorization') !==
    `Bearer ${env.RC_WEBHOOK_SECRET}`
  ) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  let body: { event?: RcEvent };
  try {
    body = (await request.json()) as { event?: RcEvent };
  } catch {
    return Response.json({ error: 'expected JSON body' }, { status: 400 });
  }
  const event = body.event ?? {};
  const type = typeof event.type === 'string' ? event.type : '';
  const eventId = typeof event.id === 'string' ? event.id : '';
  const userId =
    typeof event.app_user_id === 'string' ? event.app_user_id : '';
  const productId =
    typeof event.product_id === 'string' ? event.product_id : '';
  if (!type || !eventId || !userId) {
    return Response.json(
      { error: 'missing event.type/id/app_user_id' },
      { status: 400 },
    );
  }

  if (!CREDIT_EVENTS.has(type)) {
    return Response.json({ ignored: type }, { status: 200 });
  }
  const pages = TIER_PAGES[productId];
  if (pages === undefined) {
    return Response.json(
      { error: `unknown product_id: ${productId}` },
      { status: 400 },
    );
  }

  // Idempotent: RevenueCat retries deliveries; double-crediting a
  // renewal would hand out free pages.
  const seen = await db
    .prepare('SELECT rc_event_id FROM grants WHERE rc_event_id = ?')
    .bind(eventId)
    .first<{ rc_event_id: string }>();
  if (seen) {
    return Response.json({ duplicate: true }, { status: 200 });
  }
  await db
    .prepare(
      'INSERT INTO grants (rc_event_id, user_id, product_id, pages) VALUES (?, ?, ?, ?)',
    )
    .bind(eventId, userId, productId, pages)
    .run();
  await creditPages(db, userId, pages);
  return Response.json(
    { credited: pages, user: userId, product: productId },
    { status: 200 },
  );
}
