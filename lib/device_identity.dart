import 'dart:io';
import 'dart:math';

import 'package:device_info_plus/device_info_plus.dart';
import 'package:path_provider/path_provider.dart';

/// How to read the platform's stable device id (injectable for tests).
typedef AndroidIdReader = Future<String?> Function();

/// Stable per-device user id, used both as the RevenueCat appUserID and
/// as the server-side quota key.
///
/// Android: Settings.Secure ANDROID_ID — app-scoped, **survives
/// uninstall/reinstall** (resets only on factory reset). So the 10 free
/// pages can't be farmed by reinstalling the app.
/// Everywhere else (iOS later, Linux dev, tests): a random id persisted
/// to the app support dir.
class DeviceIdentity {
  DeviceIdentity({
    AndroidIdReader? androidIdReader,
    Future<Directory> Function()? supportDir,
    String Function()? randomId,
  })  : _androidIdReader = androidIdReader ?? _readAndroidId,
        _supportDir = supportDir ?? getApplicationSupportDirectory,
        _randomId = randomId ?? _newRandomId;

  final AndroidIdReader _androidIdReader;
  final Future<Directory> Function() _supportDir;
  final String Function() _randomId;

  static Future<String?> _readAndroidId() async {
    try {
      if (!Platform.isAndroid) return null;
      final id = (await DeviceInfoPlugin().androidInfo).id;
      return id.isEmpty ? null : id;
    } catch (_) {
      return null;
    }
  }

  static String _newRandomId() {
    final rng = Random.secure();
    final bytes = List<int>.generate(16, (_) => rng.nextInt(256));
    return bytes
        .map((b) => b.toRadixString(16).padLeft(2, '0'))
        .join();
  }

  /// Returns e.g. `android:8f3a…` or `uuid:…`. Stable across restarts
  /// (and, on Android, across reinstalls).
  Future<String> userId() async {
    final androidId = await _androidIdReader();
    if (androidId != null && androidId.isNotEmpty) {
      return 'android:$androidId';
    }
    final file = File('${(await _supportDir()).path}/diagonal_user_id');
    if (await file.exists()) {
      final stored = (await file.readAsString()).trim();
      if (stored.isNotEmpty) return stored;
    }
    final id = 'uuid:${_randomId()}';
    await file.create(recursive: true);
    await file.writeAsString(id);
    return id;
  }
}
