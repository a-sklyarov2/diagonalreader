/**
 * Stripe billing: one monthly "Diagonal Unlimited" subscription.
 *
 * No `stripe` npm dependency (Node-only SDK, breaks `workerd`) — raw
 * `fetch` against https://api.stripe.com/v1/... plus a WebCrypto HMAC
 * check keeps the Worker dependency-free.
 *
 * Routes (wired in index.ts):
 *   POST /stripe/checkout { userId } → { url } (hosted Checkout page)
 *   POST /stripe/portal   { userId } → { url } (billing portal)
 *   POST /stripe/webhook (Stripe-Signature verified) → { received: true }
 *
 * Access model: checkout completion (or an active/trialing
 * subscription) marks the user unlimited until `current_period_end`;
 * deletion drops access; failed payments change nothing (access runs
 * to the end of the paid period). Unknown event types are
 * acknowledged, never 500 — Stripe retries 5xx deliveries.
 *
 * Secrets (`wrangler secret put`, never committed): STRIPE_SECRET_KEY,
 * STRIPE_WEBHOOK_SECRET. STRIPE_PRICE_MONTHLY is a [vars] price id.
 */

import {
  activateSubscription,
  deactivateSubscription,
  type D1Db,
} from './quota';

export interface StripeEnv {
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_MONTHLY?: string;
  DB?: D1Db;
}

const SUCCESS_URL = 'https://app.diagonalreader.com/?checkout=success';
const CANCEL_URL = 'https://app.diagonalreader.com/?checkout=cancelled';
const RETURN_URL = 'https://app.diagonalreader.com/';

/** Webhook signatures older/newer than this are rejected (seconds). */
const SIGNATURE_TOLERANCE_SEC = 300;

function excerpt(text: string): string {
  const cut = text.slice(0, 300);
  return text.length > 300 ? `${cut}…` : text;
}

function misconfigured(detail: string): Response {
  const error = `server misconfigured: ${detail}`;
  return Response.json({ error }, { status: 500 });
}

interface StripeApiResult {
  status: number;
  text: string;
  json: unknown;
}

async function stripeApi(
  env: StripeEnv,
  method: 'GET' | 'POST',
  path: string,
  params?: URLSearchParams,
): Promise<StripeApiResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  let res: Response;
  if (params === undefined) {
    res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers,
    });
  } else {
    res = await fetch(`https://api.stripe.com/v1${path}`, {
      method,
      headers,
      body: params.toString(),
    });
  }
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, text, json };
}

async function readUserId(request: Request): Promise<string> {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return '';
  }
  if (body !== null && typeof body === 'object' && 'userId' in body) {
    const candidate = body.userId;
    if (typeof candidate === 'string') return candidate.trim();
  }
  return '';
}

/** Stripe ids arrive as strings or expanded { id } objects. */
function stripeId(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value !== null && typeof value === 'object' && 'id' in value) {
    const candidate = value.id;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
}

function sessionRefUser(session: unknown): string {
  if (
    session !== null &&
    typeof session === 'object' &&
    'client_reference_id' in session
  ) {
    const candidate = session.client_reference_id;
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }
  return '';
}

function metadataUser(session: unknown): string {
  if (
    session !== null &&
    typeof session === 'object' &&
    'metadata' in session
  ) {
    const meta = session.metadata;
    if (meta !== null && typeof meta === 'object') {
      if (
        'userId' in meta &&
        typeof meta.userId === 'string' &&
        meta.userId.trim() !== ''
      ) {
        return meta.userId.trim();
      }
      if (
        'user_id' in meta &&
        typeof meta.user_id === 'string' &&
        meta.user_id.trim() !== ''
      ) {
        return meta.user_id.trim();
      }
    }
  }
  return '';
}

function subscriptionRef(obj: unknown): string {
  if (obj !== null && typeof obj === 'object' && 'subscription' in obj) {
    const ref = stripeId(obj.subscription);
    if (ref !== '') return ref;
  }
  return '';
}

function customerRef(obj: unknown): string {
  if (obj !== null && typeof obj === 'object' && 'customer' in obj) {
    const ref = stripeId(obj.customer);
    if (ref !== '') return ref;
  }
  return '';
}

function subscriptionStatus(obj: unknown): string {
  if (obj !== null && typeof obj === 'object' && 'status' in obj) {
    const candidate = obj.status;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
}

function periodEndMs(obj: unknown): number | null {
  if (
    obj !== null &&
    typeof obj === 'object' &&
    'current_period_end' in obj
  ) {
    const candidate = obj.current_period_end;
    if (
      typeof candidate === 'number' &&
      Number.isFinite(candidate) &&
      candidate > 0
    ) {
      return Math.floor(candidate * 1000);
    }
  }
  return null;
}

function subscriptionPriceId(sub: unknown, fallbackPrice: string): string {
  if (sub !== null && typeof sub === 'object' && 'items' in sub) {
    const items = sub.items;
    if (items !== null && typeof items === 'object' && 'data' in items) {
      const data = items.data;
      if (Array.isArray(data) && data.length > 0) {
        const first: unknown = data[0];
        if (
          first !== null &&
          typeof first === 'object' &&
          'price' in first
        ) {
          const price = first.price;
          if (price !== null && typeof price === 'object' && 'id' in price) {
            if (typeof price.id === 'string' && price.id !== '') {
              return price.id;
            }
          }
        }
      }
    }
  }
  if (fallbackPrice !== '') return fallbackPrice;
  return 'stripe';
}

function responseUrl(body: unknown): string | null {
  if (body !== null && typeof body === 'object' && 'url' in body) {
    const candidate = body.url;
    if (typeof candidate === 'string' && candidate !== '') return candidate;
  }
  return null;
}

function eventType(event: unknown): string {
  if (event !== null && typeof event === 'object' && 'type' in event) {
    const candidate = event.type;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
}

function eventObject(event: unknown): unknown {
  if (event !== null && typeof event === 'object' && 'data' in event) {
    const data = event.data;
    if (data !== null && typeof data === 'object' && 'object' in data) {
      return data.object;
    }
  }
  return null;
}

/**
 * POST /stripe/checkout { userId } → { url }. The PWA redirects to the
 * hosted page; no publishable key or client SDK needed.
 */
export async function handleCheckout(
  request: Request,
  env: StripeEnv,
): Promise<Response> {
  const userId = await readUserId(request);
  if (!userId) {
    return Response.json({ error: 'missing userId' }, { status: 400 });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return misconfigured('missing STRIPE_SECRET_KEY');
  }
  const price = (env.STRIPE_PRICE_MONTHLY ?? '').trim();
  if (!price) {
    return misconfigured('missing STRIPE_PRICE_MONTHLY');
  }
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', price);
  params.set('line_items[0][quantity]', '1');
  params.set('client_reference_id', userId);
  params.set('metadata[userId]', userId);
  params.set('success_url', SUCCESS_URL);
  params.set('cancel_url', CANCEL_URL);
  const result = await stripeApi(env, 'POST', '/checkout/sessions', params);
  const url = responseUrl(result.json);
  if (result.status !== 200 || url === null) {
    const error = `stripe ${result.status}: ${excerpt(result.text)}`;
    return Response.json({ error }, { status: 502 });
  }
  return Response.json({ url });
}

/** POST /stripe/portal { userId } → { url }. 404 when never subscribed. */
export async function handlePortal(
  request: Request,
  env: StripeEnv,
): Promise<Response> {
  const userId = await readUserId(request);
  if (!userId) {
    return Response.json({ error: 'missing userId' }, { status: 400 });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return misconfigured('missing STRIPE_SECRET_KEY');
  }
  if (!env.DB) {
    return misconfigured('missing DB binding');
  }
  const row = await env.DB.prepare(
    'SELECT customer_id FROM stripe_customers WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ customer_id: string }>();
  if (!row) {
    return Response.json(
      { error: 'no subscription found' },
      { status: 404 },
    );
  }
  const params = new URLSearchParams();
  params.set('customer', row.customer_id);
  params.set('return_url', RETURN_URL);
  const result = await stripeApi(
    env,
    'POST',
    '/billing_portal/sessions',
    params,
  );
  const url = responseUrl(result.json);
  if (result.status !== 200 || url === null) {
    const error = `stripe ${result.status}: ${excerpt(result.text)}`;
    return Response.json({ error }, { status: 502 });
  }
  return Response.json({ url });
}

function parseSignatureHeader(
  header: string,
): { t: number; v1: string[] } | null {
  let t = 0;
  const v1: string[] = [];
  const parts = header.split(',');
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') {
      const parsed = Number(v);
      if (Number.isFinite(parsed) && parsed > 0) t = parsed;
    } else if (k === 'v1' && v !== '') {
      v1.push(v.toLowerCase());
    }
  }
  if (t <= 0 || v1.length === 0) return null;
  return { t, v1 };
}

async function verifySignature(
  raw: string,
  header: string,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return false;
  if (Math.abs(nowMs / 1000 - parsed.t) > SIGNATURE_TOLERANCE_SEC) {
    return false;
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'HMAC',
    key,
    enc.encode(`${parsed.t}.${raw}`),
  );
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  for (let i = 0; i < parsed.v1.length; i++) {
    const candidate = parsed.v1[i];
    if (candidate.length === hex.length && candidate === hex) return true;
  }
  return false;
}

async function completeCheckout(
  env: StripeEnv,
  db: D1Db,
  obj: unknown,
): Promise<Response> {
  const userId = sessionRefUser(obj) || metadataUser(obj);
  const subscriptionId = subscriptionRef(obj);
  if (!userId || !subscriptionId) {
    return Response.json(
      { error: 'missing client_reference_id/subscription' },
      { status: 400 },
    );
  }
  const result = await stripeApi(
    env,
    'GET',
    `/subscriptions/${subscriptionId}`,
  );
  if (result.status !== 200 || result.json === null) {
    const error = `stripe ${result.status}: ${excerpt(result.text)}`;
    return Response.json({ error }, { status: 502 });
  }
  const periodEnd = periodEndMs(result.json);
  if (periodEnd === null) {
    return Response.json(
      { error: 'missing current_period_end' },
      { status: 400 },
    );
  }
  const fallbackPrice = (env.STRIPE_PRICE_MONTHLY ?? '').trim();
  const priceId = subscriptionPriceId(result.json, fallbackPrice);
  await activateSubscription(db, userId, priceId, periodEnd);
  const customerId = customerRef(result.json) || customerRef(obj);
  if (customerId !== '') {
    await db
      .prepare(
        'INSERT INTO stripe_customers (user_id, customer_id) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id',
      )
      .bind(userId, customerId)
      .run();
  }
  return Response.json({ received: true });
}

async function customerUserId(
  db: D1Db,
  obj: unknown,
): Promise<{ customerId: string; userId: string } | null> {
  const customerId = customerRef(obj);
  if (customerId === '') return null;
  const row = await db
    .prepare('SELECT user_id FROM stripe_customers WHERE customer_id = ?')
    .bind(customerId)
    .first<{ user_id: string }>();
  if (!row) return null;
  return { customerId, userId: row.user_id };
}

async function subscriptionUpdated(
  env: StripeEnv,
  db: D1Db,
  obj: unknown,
): Promise<Response> {
  const link = await customerUserId(db, obj);
  const periodEnd = periodEndMs(obj);
  if (!link || periodEnd === null) {
    return Response.json(
      { error: 'unknown customer/missing current_period_end' },
      { status: 400 },
    );
  }
  const status = subscriptionStatus(obj);
  if (status === 'active' || status === 'trialing') {
    const fallbackPrice = (env.STRIPE_PRICE_MONTHLY ?? '').trim();
    const priceId = subscriptionPriceId(obj, fallbackPrice);
    await activateSubscription(db, link.userId, priceId, periodEnd);
  } else {
    // Past-due/unpaid/canceled: keep the row so paid time remains, but
    // pin expiry to the last paid period end.
    await db
      .prepare('UPDATE subscriptions SET expires_at = ? WHERE user_id = ?')
      .bind(periodEnd, link.userId)
      .run();
  }
  return Response.json({ received: true });
}

async function subscriptionDeleted(
  db: D1Db,
  obj: unknown,
): Promise<Response> {
  const customerId = customerRef(obj);
  if (customerId === '') {
    return Response.json({ error: 'missing customer' }, { status: 400 });
  }
  // Deletes are idempotent: unknown customers are already gone.
  const row = await db
    .prepare('SELECT user_id FROM stripe_customers WHERE customer_id = ?')
    .bind(customerId)
    .first<{ user_id: string }>();
  if (row) await deactivateSubscription(db, row.user_id);
  return Response.json({ received: true });
}

/**
 * POST /stripe/webhook. The raw body is verified first (HMAC-SHA256 of
 * `<timestamp>.<body>` against STRIPE_WEBHOOK_SECRET, ±300 s) — never
 * JSON-parsed before the signature check.
 */
export async function handleStripeWebhook(
  request: Request,
  env: StripeEnv,
  db: D1Db,
): Promise<Response> {
  if (!env.STRIPE_WEBHOOK_SECRET) {
    return misconfigured('missing STRIPE_WEBHOOK_SECRET');
  }
  if (!env.STRIPE_SECRET_KEY) {
    return misconfigured('missing STRIPE_SECRET_KEY');
  }
  let raw = '';
  try {
    raw = await request.text();
  } catch {
    raw = '';
  }
  const signature = request.headers.get('Stripe-Signature') ?? '';
  const ok = await verifySignature(
    raw,
    signature,
    env.STRIPE_WEBHOOK_SECRET,
    Date.now(),
  );
  if (!ok) {
    return Response.json({ error: 'bad signature' }, { status: 401 });
  }
  let event: unknown = null;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ error: 'expected JSON body' }, { status: 400 });
  }
  const type = eventType(event);
  if (!type) {
    return Response.json({ error: 'missing event type' }, { status: 400 });
  }
  if (type === 'invoice.payment_failed') {
    // Access runs to the end of the paid period — no state change.
    return Response.json({ received: true });
  }
  const obj = eventObject(event);
  if (obj === null || typeof obj !== 'object') {
    return Response.json({ error: 'missing data.object' }, { status: 400 });
  }
  if (type === 'checkout.session.completed') {
    return completeCheckout(env, db, obj);
  }
  if (type === 'customer.subscription.updated') {
    return subscriptionUpdated(env, db, obj);
  }
  if (type === 'customer.subscription.deleted') {
    return subscriptionDeleted(db, obj);
  }
  return Response.json({ ignored: type });
}
