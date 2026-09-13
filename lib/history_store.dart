import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

import 'reading_session.dart';

/// Permanent on-device history: page photos in `<dir>/photos/<id>.jpg`
/// plus a `pages.json` index. Construct with any directory in tests;
/// use [load] in the real app (application documents directory).
class HistoryStore {
  HistoryStore(this.dir);

  final Directory dir;

  static Future<HistoryStore> load() async {
    final docs = await getApplicationDocumentsDirectory();
    final store = HistoryStore(Directory(p.join(docs.path, 'diagonal')));
    await store.dir.create(recursive: true);
    await Directory(p.join(store.dir.path, 'photos'))
        .create(recursive: true);
    return store;
  }

  Directory get _photosDir => Directory(p.join(dir.path, 'photos'));
  File get _index => File(p.join(dir.path, 'pages.json'));

  /// Copy a fresh capture into permanent storage. Returns the new path.
  /// Deletes the source unless it's already the stored copy.
  Future<String> keepPhoto(String srcPath, String id) async {
    await _photosDir.create(recursive: true);
    final dest = File(p.join(_photosDir.path, '$id.jpg'));
    if (srcPath != dest.path) {
      await File(srcPath).copy(dest.path);
      try {
        await File(srcPath).delete();
      } catch (_) {
        // Temp cleanup is best-effort (e.g. camera-owned files).
      }
    }
    return dest.path;
  }

  Future<void> savePages(List<SummaryPage> pages) async {
    final entries = [
      for (final page in pages)
        {
          'id': page.id,
          'photo': page.photoPath,
          'level': page.level.name,
          'text': page.text,
        },
    ];
    await _index.writeAsString(jsonEncode(entries), flush: true);
  }

  /// Load saved pages, skipping entries whose photo file is gone.
  Future<List<StoredPage>> loadPages() async {
    if (!await _index.exists()) return [];
    Object? decoded;
    try {
      decoded = jsonDecode(await _index.readAsString());
    } catch (_) {
      return [];
    }
    if (decoded is! List) return [];
    final out = <StoredPage>[];
    for (final entry in decoded) {
      if (entry is! Map) continue;
      final photo = entry['photo'];
      if (photo is! String || !await File(photo).exists()) continue;
      out.add(
        StoredPage(
          id: '${entry['id'] ?? ''}',
          photoPath: photo,
          levelName: '${entry['level'] ?? ''}',
          text: '${entry['text'] ?? ''}',
        ),
      );
    }
    return out;
  }
}

class StoredPage {
  StoredPage({
    required this.id,
    required this.photoPath,
    required this.levelName,
    required this.text,
  });

  final String id;
  final String photoPath;
  final String levelName;
  final String text;
}
