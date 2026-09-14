// One-off icon prep: builds assets/icon.png (1024, padded safe-zone)
// from the designer's full-bleed JPEG.
//
// The artwork reaches the canvas edges, but Android masks launcher
// icons to circles/squircles — corners get clipped. So the art is
// scaled to ~84% and centered on a matching diagonal gradient rebuilt
// from the source's own corner colors.
//
// Usage: dart run tool/make_icon.dart [src] [dest]
import 'dart:io';

import 'package:image/image.dart' as img;

Future<void> main(List<String> args) async {
  const n = 1024;
  const artSize = 860;
  final srcPath =
      args.isNotEmpty ? args[0] : '/home/pencho/Downloads/diagonalreader-icon-1024x1024.jpeg';
  final destPath =
      args.length > 1 ? args[1] : 'assets/icon.png';

  final srcBytes = await File(srcPath).readAsBytes();
  final src = img.decodeImage(srcBytes);
  if (src == null || src.width != n || src.height != n) {
    stderr.writeln('Expected a 1024x1024 image at $srcPath');
    exit(2);
  }

  // Corner colors of the source gradient (inset to dodge JPEG noise).
  final cTopLeft = src.getPixel(8, 8);
  final cBottomRight = src.getPixel(n - 9, n - 9);

  final canvas = img.Image(width: n, height: n);
  for (var y = 0; y < n; y++) {
    for (var x = 0; x < n; x++) {
      final t = (x + y) / (2 * (n - 1));
      canvas.setPixel(
        x,
        y,
        img.ColorRgb8(
          _lerp(cTopLeft.r, cBottomRight.r, t),
          _lerp(cTopLeft.g, cBottomRight.g, t),
          _lerp(cTopLeft.b, cBottomRight.b, t),
        ),
      );
    }
  }

  final art = img.copyResize(src, width: artSize, height: artSize);
  const pad = (n - artSize) ~/ 2;
  const feather = 48;
  for (var y = 0; y < artSize; y++) {
    for (var x = 0; x < artSize; x++) {
      final edge = [x, y, artSize - 1 - x, artSize - 1 - y]
          .reduce((a, b) => a < b ? a : b);
      final a = (edge / feather).clamp(0.0, 1.0);
      final over = art.getPixel(x, y);
      final under = canvas.getPixel(pad + x, pad + y);
      canvas.setPixel(
        pad + x,
        pad + y,
        img.ColorRgb8(
          _lerp(under.r, over.r, a),
          _lerp(under.g, over.g, a),
          _lerp(under.b, over.b, a),
        ),
      );
    }
  }

  await File(destPath).create(recursive: true);
  await File(destPath).writeAsBytes(img.encodePng(canvas));
  stdout.writeln('Wrote $destPath');
}

int _lerp(num a, num b, double t) =>
    (a + (b - a) * t).round().clamp(0, 255);
