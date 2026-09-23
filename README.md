# Diagonal — speed-read books via page summaries

Launch → fullscreen camera → capture a book page → streams back a
style-preserving summary in the page's own language → next page.
History scrolls vertically, TikTok-style; red bin deletes summaries.

Compression toggle: Low / High / Max. Model: `google/gemini-3.5-flash-lite`.
PWA at `https://app.diagonalreader.com`; same Worker serves the app
shell and the API (same-origin, no CORS).

## Architecture
- **PWA** (`pwa/`, vanilla TS + Vite): camera → downscale (1600px/q75)
  → same-origin `POST /summarize` → streams SSE summary. Anonymous
  `uuid:` identity in `localStorage` (no login). Photos stay on-device
  (IndexedDB); checkout/portal are server-created URL redirects.
- **Server** (`server/`, `diagonal-api` worker): spends quota
  (100 free/month; subscribers 500/day + 10k/month guardrails), builds
  the prompt, calls OpenRouter with the secret key, streams SSE back.
  `GET /health` for status; `POST /stripe/checkout|portal|recovery-code|recover`,
  `GET /stripe/status`, `POST /stripe/webhook` for billing.

## PWA dev
```sh
cd pwa && npm install && npm run dev   # http://127.0.0.1:5173, proxies /quota /summarize /stripe → :8787
```

## Worker dev
```sh
cd server && npm install && npm test && npm run typecheck
printf 'OPENROUTER_KEY=%s\nSTRIPE_SECRET_KEY=%s\nSTRIPE_WEBHOOK_SECRET=%s\nSTRIPE_PRICE_MONTHLY=%s\n' \
  "$OR_KEY" "$SK" "$WHSEC" "$PRICE" > .dev.vars  # gitignored, never commit
npx wrangler dev                       # local http://127.0.0.1:8787
npx wrangler d1 migrations apply diagonal --local   # after pulling migrations
```

End-to-end (real model, real spend): `npx wrangler dev` (server dir),
`npm run dev` (pwa dir), open the PWA, tap "Use sample page photo"
(`pwa/e2e-fixtures/page1.jpg`, also shipped at
`public/e2e-fixtures/page1.jpg` for the built bundle).

## Deploy
```sh
cd pwa && npm run build                # → pwa/dist, consumed by the Worker
cd ../server && npm test && npm run typecheck && npx wrangler deploy
npx wrangler d1 migrations apply diagonal --remote
printf '%s' "$OR_KEY" | npx wrangler secret put OPENROUTER_KEY
printf '%s' "$SK" | npx wrangler secret put STRIPE_SECRET_KEY
printf '%s' "$WHSEC" | npx wrangler secret put STRIPE_WEBHOOK_SECRET
# STRIPE_PRICE_MONTHLY lives in wrangler.toml [vars] (price ids are not secret)
```

## Stripe setup (~10 min, dashboard/CLI in your browser)
1. Create product `Diagonal Unlimited`, one monthly recurring price
   (e.g. €4.99); copy the `price_…` id into `STRIPE_PRICE_MONTHLY`.
2. Webhook endpoint `https://api.diagonalreader.com/stripe/webhook`
   with events `checkout.session.completed`, `invoice.paid`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`; copy the `whsec_…` signing secret.
3. `sk_live_…` secret (or restricted key with
   `checkout.sessions:write`, `billing_portal.sessions:write`,
   `subscriptions:read`, `invoices:read`); paste all three only via
   `wrangler secret put`, never chat/email.
4. Local webhook test: `stripe listen --forward-to
   127.0.0.1:8787/stripe/webhook` while deploying with test-mode keys.
   No publishable key needed (no Stripe.js; redirect-to-URL flow).
5. In Dashboard Settings → Business → Customer emails, enable
   Successful payments so buyers keep getting payment emails (any
   invoice/receipt number in them restores access).
6. Apply the recovery migration everywhere the schema runs:
   `npx wrangler d1 migrations apply diagonal --local` and `--remote`.

## Subscription recovery (no login, no outbound email)
The webhook stores every paid invoice/receipt number against the paying
UID + purchase email. On a new/wiped device, Library →
`Already subscribed? Restore access` takes purchase email + any invoice
or receipt number from a payment email (e.g. `2433-4817`,
`0F0KKPT7-0005`) and moves Unlimited to the current UID (exactly one
active UID; invoice numbers never expire or rotate).
