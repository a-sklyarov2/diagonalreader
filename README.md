# Diagonal — speed-read books via page summaries

Launch → fullscreen camera → capture a book page → streams back a
style-preserving summary in the page's own language → next page.
History scrolls vertically, TikTok-style; red bin deletes summaries.

Compression toggle: Low / High / Max. Model: `google/gemini-3.5-flash-lite`.

## Architecture
- **App** (`lib/`): camera → downscale (1600px/q75) → `POST` JPEG to our
  Cloudflare Worker → streams SSE summary. The app never sees the
  OpenRouter key (only a revocable proxy token, `--dart-define`).
- **Server** (`server/`, `diagonal-api` worker): validates auth/level/
  image, builds the prompt, calls OpenRouter with the secret key,
  streams SSE back. `GET /health` for status.

## App dev (no secrets in repo — `--dart-define` only)
```sh
flutter test                                       # mocked, no spend
xvfb-run -a flutter test integration_test -d linux \
  --dart-define=DIAGONAL_API=http://127.0.0.1:18080 \
  --dart-define=PROXY_TOKEN=test                   # E2E via proxy path
OPENROUTER_KEY=sk-or-... dart run tool/live_check.dart high  # direct, cents
flutter build apk --release \
  --dart-define=DIAGONAL_API=https://diagonal-api.sasho-alex-sk.workers.dev \
  --dart-define=PROXY_TOKEN=$PROXY_TOKEN
```

## Server dev
```sh
cd server && npm install
npm test && npm run typecheck
printf 'OPENROUTER_KEY=%s\nPROXY_TOKEN=%s\n' "$OR_KEY" "$PROXY" > .dev.vars  # gitignored
npm run dev                        # local http://127.0.0.1:8787
CLOUDFLARE_API_TOKEN=... npm run deploy
printf '%s' "$OR_KEY" | npx wrangler secret put OPENROUTER_KEY
printf '%s' "$PROXY" | npx wrangler secret put PROXY_TOKEN
```
