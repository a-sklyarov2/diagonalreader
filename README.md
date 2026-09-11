# diagonal
Flutter camera app — capture pics efficiently, upload to backend.

Hello-world milestone (`feat/camera-hello-world`): capture a pic with the
camera, show it on screen.

- Android/iOS: real `camera` plugin preview + capture.
- Linux desktop / tests: `FakeCameraService` (no hardware needed).

## Dev loop (this VM, no emulator needed)
- `flutter analyze`
- `flutter test` — unit + widget (fake camera via DI)
- `xvfb-run -a flutter test integration_test -d linux` — E2E, compiled app
- `flutter build linux --debug`
- `flutter build apk --debug` — real camera path compile check
