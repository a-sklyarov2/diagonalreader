/**
 * RevenueCat webhook → subscription access.
 *
 * Single-subscription model: any purchase/renewal of a known product
 * marks the user unlimited until expires_at; EXPIRATION revokes.
 * Cancellations deliberately change nothing — access continues until
 * the already-paid period ends.
 *
 * Dashboard (user action): Integrations → Webhooks → URL
 * `https://<worker>/rc-webhook` with an Authorization header
 * `Bearer <RC_WEBHOOK_SECRET>` (wrangler secret, never committed).
 */

import {
  activateSubscription,
  deactivateSubscription,
  type D1Db,
} from './quota';

export interface Env {
  RC_WEBHOOK_SECRET: string;
}

/**
 * Products that unlock unlimited. The `max` base plan is the live
 * product; every legacy id (Test Store tiers, retired standalone
 * Play subs) also unlocks — generous, harmless, and keeps old test
 * purchases working.
 */
export const UNLIMITED_PRODUCTS = new Set([
  'pages_monthly:monthly-max',
  'pagesMax_monthly',
  'pagesmax_monthly',
  'pagesMid_monthly',
  'pagesmid_monthly',
  'pagesLow_monthly',
  'pageslow_monthly',
  'pages_monthly:monthly-mid',
  'pages_monthly:monthly-low',
]);

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Event types that (re)activate unlimited access. */
const ACTIVATE_EVENTS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'PRODUCT_CHANGE',
]);

interface RcEvent {
  type?: unknown;
  id?: unknown;
  app_user_id?: unknown;
  product_id?: unknown;
  purchased_at_ms?: unknown;
  expiration_at_ms?: unknown;
}

function asMs(value: unknown): number | null {
  const n =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value !== ''
        ? Number(value)
        : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
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
  const userId =
    typeof event.app_user_id === 'string' ? event.app_user_id : '';
  const productId =
    typeof event.product_id === 'string' ? event.product_id : '';
  if (!type || !userId) {
    return Response.json(
      { error: 'missing event.type/app_user_id' },
      { status: 400 },
    );
  }

  if (type === 'EXPIRATION') {
    await deactivateSubscription(db, userId);
    return Response.json({ expired: true, user: userId }, { status: 200 });
  }
  if (!ACTIVATE_EVENTS.has(type)) {
    return Response.json({ ignored: type }, { status: 200 });
  }
  if (!UNLIMITED_PRODUCTS.has(productId)) {
    return Response.json(
      { error: `unknown product_id: ${productId}` },
      { status: 400 },
    );
  }
  const now = Date.now();
  const expiresAt =
    asMs(event.expiration_at_ms) ?? now + THIRTY_DAYS_MS;
  await activateSubscription(db, userId, productId, expiresAt);
  return Response.json(
    {
      unlimited: true,
      user: userId,
      product: productId,
      until: new Date(expiresAt).toISOString(),
    },
    { status: 200 },
  );
}
