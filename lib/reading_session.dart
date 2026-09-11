import 'package:flutter/foundation.dart';

import 'image_prep.dart';
import 'openrouter_client.dart';
import 'summary_level.dart';

/// One captured page + its (streaming) summary.
class SummaryPage extends ChangeNotifier {
  SummaryPage({required this.photoPath, required this.level});

  final String photoPath;
  final SummaryLevel level;

  final StringBuffer _buffer = StringBuffer();
  String get text => _buffer.toString();
  bool get hasContent => _buffer.isNotEmpty;
  bool done = false;
  String? error;

  void append(String delta) {
    _buffer.write(delta);
    notifyListeners();
  }

  void finish() {
    done = true;
    notifyListeners();
  }

  void fail(Object e) {
    error = e.toString();
    done = true;
    notifyListeners();
  }

  void reset() {
    _buffer.clear();
    error = null;
    done = false;
    notifyListeners();
  }
}

typedef ImagePreparer = Future<List<int>> Function(String path);

/// Ordered history of summarized pages (oldest first). New captures are
/// appended; the reader scrolls vertically through them TikTok-style.
class ReadingSession extends ChangeNotifier {
  ReadingSession({
    required Summarizer summarizer,
    ImagePreparer prepareImage = preparePageImage,
  })  : _summarizer = summarizer, // ignore: prefer_initializing_formals
        _prepareImage = prepareImage; // ignore: prefer_initializing_formals

  final Summarizer _summarizer;
  final ImagePreparer _prepareImage;

  final List<SummaryPage> pages = [];

  /// Capture a page: registers it immediately (UI can navigate to it)
  /// and streams the summary in the background.
  Future<SummaryPage> startPage(String photoPath, SummaryLevel level) async {
    final page = SummaryPage(photoPath: photoPath, level: level);
    pages.add(page);
    notifyListeners();
    // Don't await: streaming progresses while the UI is already showing.
    _run(page);
    return page;
  }

  Future<void> retry(SummaryPage page) {
    page.reset();
    return _run(page);
  }

  Future<void> _run(SummaryPage page) async {
    try {
      final jpeg = await _prepareImage(page.photoPath);
      await for (final delta in _summarizer.summarize(
        jpeg: jpeg,
        level: page.level,
      )) {
        page.append(delta);
      }
      page.finish();
    } catch (e) {
      page.fail(e);
    }
  }
}
