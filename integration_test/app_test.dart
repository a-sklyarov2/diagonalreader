import 'dart:convert';
import 'dart:io';

import 'package:diagonal/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// E2E against a local mock OpenRouter SSE server. The app is compiled
/// with `--dart-define=MOCK_API=http://127.0.0.1:18080` so no real API
/// key or spend is involved; the fake camera serves the real page photos.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('E2E mock: capture → stream → next page → history',
      (tester) async {
    var requests = 0;
    final server = await HttpServer.bind('127.0.0.1', 18080);
    addTearDown(() => server.close(force: true));
    server.listen((request) async {
      requests++;
      await request.drain();
      final n = requests;
      request.response.headers.contentType =
          ContentType('text', 'event-stream');
      for (final word in ['Mock summary $n, ', 'part one.']) {
        request.response.write(
          'data: ${jsonEncode({
                'choices': [
                  {
                    'delta': {'content': word}
                  }
                ]
              })}\n\n',
        );
        await request.response.flush();
        await Future.delayed(const Duration(milliseconds: 50));
      }
      request.response.write('data: [DONE]\n\n');
      await request.response.close();
    });

    await tester.pumpWidget(const DiagonalApp());
    await tester.pumpAndSettle();

    // Page 1.
    await tester.tap(find.byKey(const Key('captureButton')));
    await tester.pumpAndSettle();
    expect(
      find.text('Mock summary 1, part one.'),
      findsOneWidget,
    );
    expect(find.text('1 / 1'), findsOneWidget);

    // Page 2.
    await tester.tap(find.byKey(const Key('nextPageButton')));
    await tester.pumpAndSettle();
    await tester.tap(find.byKey(const Key('captureButton')));
    await tester.pumpAndSettle();
    expect(
      find.text('Mock summary 2, part one.'),
      findsOneWidget,
    );
    expect(find.text('2 / 2'), findsOneWidget);

    // Scroll up to page 1.
    await tester.fling(
      find.byKey(const Key('readerPage_1')),
      const Offset(0, 500),
      800,
    );
    await tester.pumpAndSettle();
    expect(
      find.text('Mock summary 1, part one.'),
      findsOneWidget,
    );
    expect(requests, 2);
  });
}
