import 'dart:io';

import 'package:diagonal/device_identity.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('uses the platform id when available', () async {
    final identity = DeviceIdentity(
      androidIdReader: () async => 'abc123',
      supportDir: () async =>
          Directory.systemTemp.createTemp('id_test_'),
    );
    expect(await identity.userId(), 'android:abc123');
  });

  test('falls back to a persisted random id', () async {
    final dir = await Directory.systemTemp.createTemp('id_test_');
    var calls = 0;
    final identity = DeviceIdentity(
      androidIdReader: () async => null,
      supportDir: () async => dir,
      randomId: () {
        calls++;
        return 'fixed-$calls';
      },
    );
    final first = await identity.userId();
    expect(first, 'uuid:fixed-1');
    // Second call (even a fresh instance) reuses the stored id —
    // the generator must not run again.
    final again = await DeviceIdentity(
      androidIdReader: () async => null,
      supportDir: () async => dir,
    ).userId();
    expect(again, first);
    expect(calls, 1);
  });
}
