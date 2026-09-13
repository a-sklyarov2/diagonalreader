import 'dart:convert';
import 'dart:io';

import 'package:diagonal/history_store.dart';
import 'package:diagonal/reading_session.dart';
import 'package:diagonal/summary_level.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late Directory dir;

  setUp(() async {
    dir = await Directory.systemTemp.createTemp('history_test_');
  });

  tearDown(() async {
    await dir.delete(recursive: true);
  });

  test('keepPhoto copies into the store', () async {
    final src = File('${dir.path}/src.jpg');
    await src.writeAsBytes([1, 2, 3]);
    final store = HistoryStore(dir);
    final kept = await store.keepPhoto(src.path, 'abc');
    expect(kept, '${dir.path}/photos/abc.jpg');
    expect(File(kept).existsSync(), isTrue);
    expect(src.existsSync(), isFalse); // temp source cleaned up
  });

  test('save/load round-trips pages and prunes missing photos',
      () async {
    final store = HistoryStore(dir);
    final photo = File('${dir.path}/photos/p1.jpg')
      ..createSync(recursive: true)
      ..writeAsBytesSync([9]);
    await store.savePages([
      SummaryPage.restored(
        id: 'p1',
        photoPath: photo.path,
        level: SummaryLevel.high,
        text: 'hello',
      ),
      SummaryPage.restored(
        id: 'gone',
        photoPath: '${dir.path}/photos/gone.jpg',
        level: SummaryLevel.low,
        text: 'stale',
      ),
    ]);

    final raw =
        jsonDecode(await File('${dir.path}/pages.json').readAsString())
            as List;
    expect(raw.length, 2);

    final loaded = await store.loadPages();
    expect(loaded.length, 1);
    expect(loaded.single.id, 'p1');
    expect(loaded.single.levelName, 'high');
    expect(loaded.single.text, 'hello');
  });

  test('corrupt index loads as empty, not a crash', () async {
    await File('${dir.path}/pages.json').writeAsString('{oops');
    expect(await HistoryStore(dir).loadPages(), isEmpty);
  });
}
