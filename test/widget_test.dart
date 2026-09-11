import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:diagonal/camera_service.dart';
import 'package:diagonal/main.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';

/// In-memory fake: returns a pre-created file, no I/O at tap time
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

void main() {
  const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  late final String photoPath;

  setUpAll(() async {
    // Runs outside the fake-async zone: real file I/O works here.
    final file = File(
      '${Directory.systemTemp.path}/widget_test_photo.png',
    );
    await file.writeAsBytes(base64Decode(pngBase64), flush: true);
    photoPath = file.path;
  });

  testWidgets('capture button takes a pic (fake camera)', (tester) async {
    await tester.pumpWidget(
      DiagonalApp(cameras: StaticPathCameraService(photoPath)),
    );
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('fakePreview')), findsOneWidget);
    expect(find.byKey(const Key('captureButton')), findsOneWidget);

    await tester.tap(find.byKey(const Key('captureButton')));
    await tester.pumpAndSettle();

    expect(find.byKey(const Key('lastPhoto')), findsOneWidget);
    expect(find.byKey(const Key('lastPhotoPath')), findsOneWidget);
  });
}
