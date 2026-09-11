import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:diagonal/camera_service.dart';
import 'package:diagonal/main.dart';
import 'package:diagonal/openrouter_client.dart';
import 'package:diagonal/reading_session.dart';
import 'package:diagonal/summary_level.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

/// In-memory camera: returns a pre-created file, no I/O at tap time
/// (widget tests run in a fake-async zone where real I/O stalls).
class StaticPathCameraService implements CameraService {
  StaticPathCameraService(this.path);

  final String path;

  @override
  CameraController? get controller => null;

  @override
  Future<void> init() async {}

  @override
  Future<String?> takePicture() async => path;

  @override
  Future<void> dispose() async {}
}

class ScriptedSummarizer implements Summarizer {
  int calls = 0;

  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
  }) async* {
    calls++;
    yield 'Summary $calls.';
  }
}

void main() {
  const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  late final String photoPath;

  setUpAll(() async {
    // Runs outside the fake-async zone: real file I/O works here.
    final file =
        File('${Directory.systemTemp.path}/widget_test_photo.png');
    await file.writeAsBytes(base64Decode(pngBase64), flush: true);
    photoPath = file.path;
  });

  Future<void> pumpApp(WidgetTester tester) async {
    await tester.pumpWidget(
      DiagonalApp(
        session: ReadingSession(
          summarizer: ScriptedSummarizer(),
          prepareImage: (_) async => [1, 2, 3],
        ),
        cameras: StaticPathCameraService(photoPath),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets('capture → streaming summary → next page → history',
      (tester) async {
    await pumpApp(tester);

    // Camera screen: level control + big shutter button.
    expect(find.text('Low'), findsOneWidget);
    expect(find.text('Max'), findsOneWidget);
    expect(find.byKey(const Key('captureButton')), findsOneWidget);

    // Switch level, then capture.
    await tester.tap(find.text('High'));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('captureButton')));
    await tester.pumpAndSettle();

    // Reader: first summary streamed, counter 1/1.
    expect(find.byKey(const Key('summaryText')), findsOneWidget);
    expect(find.text('Summary 1.'), findsOneWidget);
    expect(find.text('1 / 1'), findsOneWidget);

    // Back to camera, capture page 2.
    await tester.tap(find.byKey(const Key('nextPageButton')));
    await tester.pumpAndSettle();
    expect(find.byKey(const Key('captureButton')), findsOneWidget);
    await tester.tap(find.byKey(const Key('captureButton')));
    await tester.pumpAndSettle();

    expect(find.text('Summary 2.'), findsOneWidget);
    expect(find.text('2 / 2'), findsOneWidget);

    // Scroll up to the previous summary (TikTok-style history).
    await tester.fling(
      find.byKey(const Key('readerPage_1')),
      const Offset(0, 500),
      800,
    );
    await tester.pumpAndSettle();
    expect(find.text('Summary 1.'), findsOneWidget);
    expect(find.text('1 / 2'), findsOneWidget);
  });

  testWidgets('failed summary shows retry', (tester) async {
    await tester.pumpWidget(
      DiagonalApp(
        session: ReadingSession(
          summarizer: _FailingSummarizer(),
          prepareImage: (_) async => [1],
        ),
        cameras: StaticPathCameraService(photoPath),
      ),
    );
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('captureButton')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('summaryError')), findsOneWidget);
    expect(find.byKey(const Key('retryButton')), findsOneWidget);
  });
}

class _FailingSummarizer implements Summarizer {
  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
  }) async* {
    throw Exception('no network');
  }
}
