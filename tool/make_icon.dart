// Icon prep: converts the designer master (1024x1024, already padded
// safe-zone aware) straight to assets/icon.png with NO resampling,
// so the master's crispness carries through untouched.
//
// Usage: dart run tool/make_icon.dart [src] [dest]
import 'dart:io';

import 'package:image/image.dart' as img;

Future<void> main(List<String> args) async {
  final srcPath = args.isNotEmpty
      ? args[0]
      : '/home/pencho/Downloads/diagonalreader-icon-1024x1024.jpeg';
  final destPath = args.length > 1 ? args[1] : 'assets/icon.png';

  final srcBytes = await File(srcPath).readAsBytes();
  final src = img.decodeImage(srcBytes);
  if (src == null || src.width != 1024 || src.height != 1024) {
    stderr.writeln('Expected a 1024x1024 image at $srcPath');
    exit(2);
  }
  final oriented = img.bakeOrientation(src);

  await File(destPath).create(recursive: true);
  await File(destPath).writeAsBytes(img.encodePng(oriented));
  stdout.writeln('Wrote $destPath');
}
