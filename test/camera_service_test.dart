import 'dart:io';

import 'package:diagonal/camera_service.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('fake camera returns an existing file', () async {
    final cameras = FakeCameraService();
    await cameras.init();
    final path = await cameras.takePicture();
    expect(path, isNotNull);
    expect(File(path!).existsSync(), isTrue);
    await cameras.dispose();
  });
}
