# Diagonal — speed-read books via page summaries

MVP: fullscreen camera → capture a book page → streams back a
style-preserving summary (OpenRouter multimodal) → next page.
History scrolls vertically, TikTok-style.

## Run / build (key never committed — only via --dart-define)

```sh
# unit + widget tests (mocked, no spend)
flutter test

# E2E on compiled Linux app (local mock SSE server, no spend)
xvfb-run -a flutter test integration_test -d linux \
  --dart-define=MOCK_API=http://127.0.0.1:18080

# live API check, a few cents (key from env, not the repo)
OPENROUTER_KEY=sk-or-... dart run tool/live_check.dart mid

# phone APK with key baked into the binary only
flutter build apk --debug --dart-define=OPENROUTER_KEY=$OPENROUTER_KEY
```

## How it works
- `lib/camera_screen.dart` — fullscreen camera + Low/Mid/High/Max slider.
- `lib/image_prep.dart` — EXIF bake + downscale to 1600px/q75 (~300KB).
- `lib/openrouter_client.dart` — OpenRouter SSE streaming
  (`meta/muse-spark-1.3-contributor`), prompt preserves author style.
- `lib/reading_session.dart` — ordered page history, background streaming.
- `lib/reader_screen.dart` — scan shimmer → blur-to-background → streamed text.
