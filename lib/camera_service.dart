import 'dart:convert';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;

/// Minimal seam so Linux desktop / integration tests can run without
/// real camera hardware. Android/iOS use [RealCameraService],
/// Linux (and tests) use [FakeCameraService].
abstract class CameraService {
  /// Returns a [CameraController] for live preview, or null when
  /// no preview is available (Linux fake).
  CameraController? get controller;

  Future<void> init();
  Future<String?> takePicture();
  Future<void> dispose();
}

class RealCameraService implements CameraService {
  CameraController? _controller;

  @override
  CameraController? get controller => _controller;

  @override
  Future<void> init() async {
    final cameras = await availableCameras();
    if (cameras.isEmpty) {
      throw StateError('No cameras found');
    }
    final first = cameras.first;
    _controller = CameraController(
      first,
      ResolutionPreset.medium,
      enableAudio: false,
    );
    await _controller!.initialize();
  }

  @override
  Future<String?> takePicture() async {
    final c = _controller;
    if (c == null || !c.value.isInitialized) {
      throw StateError('Camera not initialized');
    }
    final file = await c.takePicture();
    return file.path;
  }

  @override
  Future<void> dispose() async {
    await _controller?.dispose();
    _controller = null;
  }
}

/// Linux/test fake: writes a tiny 1x1 PNG to the temp dir and
/// returns its path, so capture → display → upload flows can be
/// tested E2E without hardware.
class FakeCameraService implements CameraService {
  static const _pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  @override
  CameraController? get controller => null;

  @override
  Future<void> init() async {}

  @override
  Future<String?> takePicture() async {
    // Directory.systemTemp works on all platforms incl. flutter test
    // (path_provider would need a platform channel + binding).
    final dir = Directory.systemTemp;
    final bytes = base64Decode(_pngBase64);
    final file = File(
      p.join(
        dir.path,
        'fake_${DateTime.now().millisecondsSinceEpoch}.png',
      ),
    );
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  }

  @override
  Future<void> dispose() async {}
}

/// Linux/dev fake: cycles through bundled asset photos (the real page
/// pictures in test_images/) so the full capture → summarize flow can be
/// exercised on desktop without camera hardware.
class AssetCycleCameraService implements CameraService {
  AssetCycleCameraService({required this.assetPaths});

  final List<String> assetPaths;
  int _next = 0;

  @override
  CameraController? get controller => null;

  @override
  Future<void> init() async {}

  @override
  Future<String?> takePicture() async {
    final asset = assetPaths[_next % assetPaths.length];
    _next++;
    final data = await rootBundle.load(asset);
    final file = File(
      p.join(
        Directory.systemTemp.path,
        'page_${DateTime.now().millisecondsSinceEpoch}.jpg',
      ),
    );
    await file.writeAsBytes(
      data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes),
      flush: true,
    );
    return file.path;
  }

  @override
  Future<void> dispose() async {}
}

/// Factory: real camera on Android/iOS, asset-cycling fake everywhere else
/// (Linux desktop, tests) unless [forceFake] is set.
CameraService createCameraService({bool forceFake = false}) {
  if (forceFake) return FakeCameraService();
  if (Platform.isAndroid || Platform.isIOS) return RealCameraService();
  return AssetCycleCameraService(assetPaths: const [
    'test_images/page1.jpg',
    'test_images/page2.jpg',
    'test_images/page3.jpg',
  ]);
}
