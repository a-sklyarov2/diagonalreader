import 'package:diagonal/image_prep.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'dart:typed_data';

void main() {
  test('downscales a real phone photo for upload', () async {
    final jpeg = await preparePageImage('test_images/page1.jpg');
    final originalSize = 2573573; // ~2.5MB on disk
    expect(jpeg.length, lessThan(originalSize ~/ 3));

    final decoded = img.decodeJpg(Uint8List.fromList(jpeg));
    expect(decoded, isNotNull);
    expect(decoded!.width <= 1600, isTrue);
    expect(decoded.height <= 1600, isTrue);
    // Still plenty of pixels for the model to read text.
    expect(decoded.width >= 1000, isTrue);
  });
}
