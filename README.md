# Diagonal — speed-read books via page summaries

Launch → fullscreen camera → capture a book page → streams back a
style-preserving summary in the page's own language (OpenRouter
multimodal, `google/gemini-3.5-flash-lite`) → next page.
History scrolls vertically, TikTok-style; red bin deletes summaries.

Compression toggle: Low / High / Max.

## Run / build (key never committed — only via --dart-define)

```sh
flutter test                                       # mocked, no spend
xvfb-run -a flutter test integration_test -d linux \
  --dart-define=MOCK_API=http://127.0.0.1:18080    # E2E, no spend
OPENROUTER_KEY=sk-or-... dart run tool/live_check.dart high  # live, cents
flutter build apk --release --dart-define=OPENROUTER_KEY=$OPENROUTER_KEY
```

## How it works
- `lib/camera_screen.dart` — fullscreen camera + Low/High/Max slider.
- `lib/image_prep.dart` — EXIF bake + downscale to 1600px/q75 (~300KB).
- `lib/openrouter_client.dart` — OpenRouter SSE streaming; prompt pins
  the page's language and the author's style.
- `lib/reading_session.dart` — ordered page history, background streaming.
- `lib/reader_screen.dart` — scan shimmer → blur-to-background → streamed text.
