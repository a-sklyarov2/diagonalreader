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
 *   POST /stripe/recovery-code { userId, email?, rotate? } → { recoveryCode } (legacy code path)
 *   POST /stripe/recover { email, invoiceNumber?, code?, newUserId } → { recovered: true } (restore on new device)
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
  getSubscription,
  transferSubscription,
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

/** Latest-invoice id on a checkout session (`in_…` or expanded { id }). */
function invoiceRef(obj: unknown): string {
  if (obj !== null && typeof obj === 'object' && 'invoice' in obj) {
    const ref = stripeId(obj.invoice);
    if (ref !== '') return ref;
  }
  return '';
}

/** First-invoice id off the subscription (`latest_invoice`), ID or expanded. */
function latestInvoiceRef(sub: unknown): string {
  if (sub !== null && typeof sub === 'object' && 'latest_invoice' in sub) {
    const ref = stripeId(sub.latest_invoice);
    if (ref !== '') return ref;
  }
  return '';
}

/** Human invoice/receipt number (`2433-4817`, `0F0KKPT7-0005`) from invoice JSON. */
function invoiceDisplayNumber(invoice: unknown): string {
  if (invoice === null || typeof invoice !== 'object') return '';
  if ('number' in invoice && typeof invoice.number === 'string') {
    return invoice.number.trim();
  }
  return '';
}

/** Normalize an invoice/receipt number a user typed from their email. */
export function normalizeInvoiceNumber(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function subscriptionStatus(obj: unknown): string {
  if (obj !== null && typeof obj === 'object' && 'status' in obj) {
    const candidate = obj.status;
    if (typeof candidate === 'string') return candidate;
  }
  return '';
}

function periodSeconds(value: unknown): number | null {
  if (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0
  ) {
    return value;
  }
  return null;
}

/**
 * Subscription period end (ms). Since the 2025-03-31 Basil release
 * Stripe serves it on subscription items
 * (`items.data[].current_period_end`), not on the subscription
 * itself — old accounts may still send the top-level field, so both
 * are accepted and the earliest item end wins for multi-item
 * subscriptions.
 */
function periodEndMs(obj: unknown): number | null {
  if (obj === null || typeof obj !== 'object') return null;
  let best: number | null = null;
  if ('current_period_end' in obj) {
    const top = periodSeconds(obj.current_period_end);
    if (top !== null) best = top;
  }
  if ('items' in obj) {
    const items = obj.items;
    if (items !== null && typeof items === 'object' && 'data' in items) {
      const data = items.data;
      if (Array.isArray(data)) {
        for (const entry of data) {
          if (
            entry !== null &&
            typeof entry === 'object' &&
            'current_period_end' in entry
          ) {
            const end = periodSeconds(entry.current_period_end);
            if (end !== null && (best === null || end < best)) best = end;
          }
        }
      }
    }
  }
  return best === null ? null : Math.floor(best * 1000);
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

/** Purchase emails are matched case-insensitively (SQLite PKs are not). */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Recovery codes are shown grouped but entered freely. */
export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 12 unambiguous chars (~60 bits), displayed XXXX-XXXX-XXXX. */
export function newRecoveryCode(): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let raw = '';
  for (let i = 0; i < bytes.length; i++) {
    raw += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

/** One-way hash stored in D1; plaintext only ever lives in Stripe metadata/invoice. */
export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  const bytes = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Link email → UID with the checkout hash, or a fresh one for legacy events. Returns the normalized email. */
async function linkRecoveryEmail(
  db: D1Db,
  email: string,
  userId: string,
): Promise<string | null> {
  const emailNorm = normalizeEmail(email);
  if (emailNorm === '') return null;
  const pendingRow = await db
    .prepare('SELECT recovery_hash FROM recovery_pending WHERE user_id = ?')
    .bind(userId)
    .first<{ recovery_hash: string }>();
  const linkHash =
    pendingRow?.recovery_hash ??
    (await sha256Hex(normalizeCode(newRecoveryCode())));
  await db
    .prepare(
      'INSERT INTO recovery_links (email, user_id, recovery_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, recovery_hash = excluded.recovery_hash, updated_at = CURRENT_TIMESTAMP',
    )
    .bind(emailNorm, userId, linkHash)
    .run();
  await db
    .prepare('DELETE FROM recovery_pending WHERE user_id IN (?, ?)')
    .bind(userId, userId)
    .run();
  return emailNorm;
}

/** Normalized email currently linked to this UID, if any. */
async function recoveryEmailForUser(
  db: D1Db,
  userId: string,
): Promise<string | null> {
  const row = await db
    .prepare('SELECT email FROM recovery_links WHERE user_id = ?')
    .bind(userId)
    .first<{ email: string }>();
  return row?.email ?? null;
}

/**
 * Late email arrival: if this UID still has no link row, pull the
 * customer email from Stripe once and link it. Best-effort — a miss
 * just waits for the next event or the recovery-code endpoint.
 */
async function backfillRecoveryLink(
  env: StripeEnv,
  db: D1Db,
  customerId: string,
  userId: string,
): Promise<void> {
  if (customerId === '') return;
  if (await recoveryEmailForUser(db, userId)) return;
  let email = '';
  try {
    const customer = await stripeApi(env, 'GET', `/customers/${customerId}`);
    if (
      customer.status === 200 &&
      customer.json !== null &&
      typeof customer.json === 'object' &&
      'email' in customer.json &&
      typeof customer.json.email === 'string' &&
      normalizeEmail(customer.json.email) !== ''
    ) {
      email = customer.json.email.trim();
    }
  } catch {
    // Best-effort: a later event or the recovery-code endpoint retries.
    return;
  }
  if (email === '') return;
  if (await recoveryEmailForUser(db, userId)) return;
  await linkRecoveryEmail(db, email, userId);
}

/** Checkout-session buyer email, trying the likely fields in order. */
function sessionEmail(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') return '';
  if ('customer_details' in obj) {
    const details = obj.customer_details;
    if (
      details !== null &&
      typeof details === 'object' &&
      'email' in details &&
      typeof details.email === 'string'
    ) {
      return details.email;
    }
  }
  if ('customer_email' in obj && typeof obj.customer_email === 'string') {
    return obj.customer_email;
  }
  return '';
}

/**
 * POST /stripe/checkout { userId } → { url }. Recovery needs no
 * pre-purchase secret: any invoice/receipt number from the buyer's
 * payment emails plus the purchase email restores access.
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
        'INSERT INTO stripe_customers (user_id, customer_id, subscription_id) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET customer_id = excluded.customer_id, subscription_id = excluded.subscription_id',
      )
      .bind(userId, customerId, subscriptionId)
      .run();
  } else {
    await db
      .prepare(
        'UPDATE stripe_customers SET subscription_id = ? WHERE user_id = ?',
      )
      .bind(subscriptionId, userId)
      .run();
  }
  let email = sessionEmail(obj).trim();
  if (email === '' && customerId !== '') {
    try {
      const customer = await stripeApi(env, 'GET', `/customers/${customerId}`);
      if (
        customer.status === 200 &&
        customer.json !== null &&
        typeof customer.json === 'object' &&
        'email' in customer.json &&
        typeof customer.json.email === 'string'
      ) {
        email = customer.json.email.trim();
      }
    } catch {
      // Test doubles (and link-less legacy webhooks) may not stub the
      // customer GET; activation still succeeds and a later event
      // backfills the email.
      email = '';
    }
  }
  await linkRecoveryEmail(db, email, userId);
  // The receipt/invoice number the buyer already sees becomes the
  // recovery credential: fetch the first invoice, store its display
  // number. No footer hack, no new email content.
  const invoiceId =
    invoiceRef(obj) || latestInvoiceRef(result.json);
  if (invoiceId !== '' && email !== '') {
    try {
      const invoice = await stripeApi(env, 'GET', `/invoices/${invoiceId}`);
      if (invoice.status === 200 && invoice.json !== null) {
        const display = invoiceDisplayNumber(invoice.json);
        const norm = normalizeInvoiceNumber(display);
        if (norm !== '') {
          const emailNorm = normalizeEmail(email);
          await db
            .prepare(
              'INSERT INTO recovery_invoices (invoice_norm, email, user_id) VALUES (?, ?, ?) ON CONFLICT(invoice_norm) DO UPDATE SET email = excluded.email, user_id = excluded.user_id',
            )
            .bind(norm, emailNorm, userId)
            .run();
        }
      }
    } catch {
      // Activation already succeeded; a later invoice event retries.
    }
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
    await backfillRecoveryLink(env, db, link.customerId, link.userId);
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

/**
 * Every paid invoice (first + renewals) becomes a recovery credential:
 * store its display number against the owning UID + email. Best-effort;
 * unknown customers just wait for a checkout event.
 */
async function recordPaidInvoice(
  env: StripeEnv,
  db: D1Db,
  invoice: unknown,
): Promise<void> {
  const display = invoiceDisplayNumber(invoice);
  const norm = normalizeInvoiceNumber(display);
  if (norm === '') return;
  const customerId = customerRef(invoice);
  if (customerId === '') return;
  const userRow = await db
    .prepare('SELECT user_id FROM stripe_customers WHERE customer_id = ?')
    .bind(customerId)
    .first<{ user_id: string }>();
  if (!userRow) return;
  let email = '';
  if (invoice !== null && typeof invoice === 'object' && 'customer_email' in invoice) {
    const candidate = invoice.customer_email;
    if (typeof candidate === 'string') email = candidate.trim();
  }
  if (email === '') {
    try {
      const customer = await stripeApi(env, 'GET', `/customers/${customerId}`);
      if (
        customer.status === 200 &&
        customer.json !== null &&
        typeof customer.json === 'object' &&
        'email' in customer.json &&
        typeof customer.json.email === 'string'
      ) {
        email = customer.json.email.trim();
      }
    } catch {
      return;
    }
  }
  const emailNorm = normalizeEmail(email);
  if (emailNorm === '') return;
  await db
    .prepare(
      'INSERT INTO recovery_invoices (invoice_norm, email, user_id) VALUES (?, ?, ?) ON CONFLICT(invoice_norm) DO UPDATE SET email = excluded.email, user_id = excluded.user_id',
    )
    .bind(norm, emailNorm, userRow.user_id)
    .run();
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

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (body !== null && typeof body === 'object') {
      return body as Record<string, unknown>;
    }
  } catch {
    // Fall through to null below.
  }
  return null;
}

/**
 * POST /stripe/recovery-code { userId, email?, rotate? } → { recoveryCode }.
 * Re-viewing (`{ userId }` alone) never rotates: the endpoint can only
 * return a code it minted in this same process lifetime, otherwise 404
 * `{ error: 'code unavailable, rotate to generate a new one' }`.
 * Pass `rotate: true` (or a fresh `email`) to generate a new code and
 * invalidate the old one. Only the latest code ever works.
 */
export async function handleRecoveryCode(
  request: Request,
  env: StripeEnv,
): Promise<Response> {
  const body = await readJson(request);
  const userId =
    body !== null && typeof body.userId === 'string'
      ? body.userId.trim()
      : '';
  if (userId === '') {
    return Response.json({ error: 'missing userId' }, { status: 400 });
  }
  if (!env.STRIPE_SECRET_KEY) {
    return misconfigured('missing STRIPE_SECRET_KEY');
  }
  if (!env.DB) {
    return misconfigured('missing DB binding');
  }
  const db = env.DB;
  const live = await getSubscription(db, userId, Date.now());
  if (!live) {
    return Response.json(
      { error: 'no subscription found' },
      { status: 404 },
    );
  }
  const emailParam =
    body !== null && typeof body.email === 'string' ? body.email : '';
  let targetEmail: string | null = null;
  if (emailParam.trim() !== '') {
    targetEmail = await linkRecoveryEmail(db, emailParam, userId);
  } else {
    targetEmail = await recoveryEmailForUser(db, userId);
  }
  if (targetEmail === null) {
    return Response.json({ error: 'no email linked' }, { status: 404 });
  }
  const rotate =
    emailParam.trim() !== '' ||
    (body !== null && body.rotate === true);
  if (!rotate) {
    return Response.json(
      { error: 'code unavailable, rotate to generate a new one' },
      { status: 404 },
    );
  }
  const recoveryCode = newRecoveryCode();
  const hash = await sha256Hex(normalizeCode(recoveryCode));
  await db
    .prepare(
      'INSERT INTO recovery_links (email, user_id, recovery_hash) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET user_id = excluded.user_id, recovery_hash = excluded.recovery_hash, updated_at = CURRENT_TIMESTAMP',
    )
    .bind(targetEmail, userId, hash)
    .run();
  return Response.json({ recoveryCode });
}

const MAX_RECOVERY_FAILS = 10;
const RECOVERY_WINDOW_SEC = 3600;

async function recoveryThrottled(
  db: D1Db,
  email: string,
  nowSec: number,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT fails, window_start FROM recovery_attempts WHERE email = ?')
    .bind(email)
    .first<{ fails: number; window_start: number }>();
  if (!row) return false;
  if (nowSec - row.window_start >= RECOVERY_WINDOW_SEC) return false;
  return row.fails >= MAX_RECOVERY_FAILS;
}

async function recordRecoveryFail(
  db: D1Db,
  email: string,
  nowSec: number,
): Promise<void> {
  const row = await db
    .prepare('SELECT fails, window_start FROM recovery_attempts WHERE email = ?')
    .bind(email)
    .first<{ fails: number; window_start: number }>();
  if (!row || nowSec - row.window_start >= RECOVERY_WINDOW_SEC) {
    await db
      .prepare(
        'INSERT INTO recovery_attempts (email, fails, window_start) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start',
      )
      .bind(email, 1, nowSec)
      .run();
    return;
  }
  await db
    .prepare(
      'INSERT INTO recovery_attempts (email, fails, window_start) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET fails = excluded.fails, window_start = excluded.window_start',
    )
    .bind(email, row.fails + 1, row.window_start)
    .run();
}

/**
 * POST /stripe/recover { email, code?, invoiceNumber?, newUserId } →
 * { recovered: true }. The credential is any invoice/receipt number from
 * the buyer's payment emails (e.g. `2433-4817`, `0F0KKPT7-0005`) plus the
 * purchase email. Legacy `code` credentials keep working. Moves the
 * subscription to the caller's UID; exactly one UID stays active.
 */
export async function handleRecover(
  request: Request,
  env: StripeEnv,
): Promise<Response> {
  const body = await readJson(request);
  const emailRaw =
    body !== null && typeof body.email === 'string' ? body.email : '';
  const codeRaw =
    body !== null && typeof body.code === 'string' ? body.code : '';
  const invoiceRaw =
    body !== null &&
    (typeof body.invoiceNumber === 'string' || typeof body.receiptNumber === 'string')
      ? `${body.invoiceNumber ?? ''}${body.receiptNumber ?? ''}`
      : '';
  const newUserId =
    body !== null && typeof body.newUserId === 'string'
      ? body.newUserId.trim()
      : '';
  if (emailRaw.trim() === '' || newUserId === '') {
    return Response.json({ error: 'missing email or newUserId' }, { status: 400 });
  }
  const email = normalizeEmail(emailRaw);
  if (!email.includes('@')) {
    return Response.json({ error: 'missing email or newUserId' }, { status: 400 });
  }
  const invoiceNorm = normalizeInvoiceNumber(invoiceRaw);
  const hasInvoice = invoiceNorm !== '';
  const hasCode = codeRaw.trim() !== '';
  if (!hasInvoice && !hasCode) {
    return Response.json({ error: 'missing invoice number or code' }, { status: 400 });
  }
  if (!env.DB) {
    return misconfigured('missing DB binding');
  }
  const db = env.DB;
  const nowSec = Math.floor(Date.now() / 1000);
  if (await recoveryThrottled(db, email, nowSec)) {
    return Response.json(
      { error: 'too many attempts, try again later' },
      { status: 429 },
    );
  }
  let ownerId: string | null = null;
  if (hasInvoice) {
    const row = await db
      .prepare('SELECT email, user_id FROM recovery_invoices WHERE invoice_norm = ?')
      .bind(invoiceNorm)
      .first<{ email: string; user_id: string }>();
    if (!row || row.email !== email) {
      await recordRecoveryFail(db, email, nowSec);
      return Response.json(
        { error: 'invalid email or invoice number' },
        { status: 404 },
      );
    }
    ownerId = row.user_id;
  } else {
    const link = await db
      .prepare('SELECT user_id, recovery_hash FROM recovery_links WHERE email = ?')
      .bind(email)
      .first<{ user_id: string; recovery_hash: string }>();
    const candidateHash = await sha256Hex(normalizeCode(codeRaw));
    if (!link || link.recovery_hash !== candidateHash) {
      await recordRecoveryFail(db, email, nowSec);
      return Response.json(
        { error: 'invalid email or code' },
        { status: 404 },
      );
    }
    ownerId = link.user_id;
  }
  const live = await getSubscription(db, ownerId, Date.now());
  if (!live) {
    await recordRecoveryFail(db, email, nowSec);
    return Response.json(
      { error: 'subscription expired' },
      { status: 410 },
    );
  }
  if (ownerId !== newUserId) {
    await transferSubscription(db, ownerId, newUserId);
    // Keep the invoice trail pointing at the live UID.
    await db
      .prepare('UPDATE recovery_invoices SET user_id = ? WHERE user_id = ?')
      .bind(newUserId, ownerId)
      .run()
      .catch(() => undefined);
  } else {
    await db
      .prepare('DELETE FROM recovery_pending WHERE user_id IN (?, ?)')
      .bind(ownerId, newUserId)
      .run();
  }
  await db
    .prepare('DELETE FROM recovery_attempts WHERE email = ?')
    .bind(email)
    .run();
  return Response.json({ recovered: true });
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
  if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
    await recordPaidInvoice(env, db, obj);
    return Response.json({ received: true });
  }
  if (type === 'customer.subscription.updated') {
    return subscriptionUpdated(env, db, obj);
  }
  if (type === 'customer.subscription.deleted') {
    return subscriptionDeleted(db, obj);
  }
  return Response.json({ ignored: type });
}
