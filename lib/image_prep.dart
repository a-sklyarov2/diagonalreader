import 'dart:io';
import 'dart:math';

import 'package:image/image.dart' as img;

/// Downscale a captured page photo for upload: bakes EXIF orientation,
/// limits the long edge to [maxEdge] and re-encodes as JPEG.
///
/// Phone photos are ~4000px / 2.5MB; at 1600px/q75 they are ~300-500KB
/// with text still legible to the model — much faster to upload.
Future<List<int>> preparePageImage(
  String path, {
  int maxEdge = 1600,
  int quality = 75,
}) async {
  final bytes = await File(path).readAsBytes();
  final decoded = img.decodeImage(bytes);
  if (decoded == null) {
    throw StateError('Could not decode image: $path');
  }
  final oriented = img.bakeOrientation(decoded);
  final longest = max(oriented.width, oriented.height);
  final resized = longest > maxEdge
      ? img.copyResize(
          oriented,
          width: oriented.width >= oriented.height ? maxEdge : null,
          height: oriented.height > oriented.width ? maxEdge : null,
        )
      : oriented;
  return img.encodeJpg(resized, quality: quality);
}
