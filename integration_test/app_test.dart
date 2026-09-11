import 'package:diagonal/main.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

/// E2E driver: runs the real compiled app (Linux desktop in CI:
/// `flutter test integration_test -d linux`). Uses the fake camera
/// on Linux, real camera on Android/iOS.
void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('E2E: take a pic', (tester) async {
    await tester.pumpWidget(const DiagonalApp());
    await tester.pumpAndSettle();

    final capture = find.byKey(const Key('captureButton'));
    expect(capture, findsOneWidget);

    await tester.tap(capture);
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('lastPhoto')), findsOneWidget);
  });
}
