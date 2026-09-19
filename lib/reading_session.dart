import 'dart:async';

import 'package:flutter/foundation.dart';

import 'diagonal_proxy_client.dart';
import 'history_store.dart';
import 'image_prep.dart';
import 'openrouter_client.dart';
import 'summary_level.dart';

/// One captured page + its (streaming) summary.
class SummaryPage extends ChangeNotifier {
  SummaryPage({
    String? id,
    required this.photoPath,
    required this.level,
  }) : id = id ?? '${DateTime.now().microsecondsSinceEpoch}';

  /// Rebuild a finished page from permanent storage.
  SummaryPage.restored({
    required this.id,
    required this.photoPath,
    required this.level,
    required String text,
  }) {
    _buffer.write(text);
    done = true;
  }

  final String id;
  final String photoPath;
  SummaryLevel level;

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
/// With a [history] store, photos are kept permanently and the page
/// index survives app restarts.
class ReadingSession extends ChangeNotifier {
  ReadingSession({
    required Summarizer summarizer,
    ImagePreparer prepareImage = preparePageImage,
    HistoryStore? history,
    String? userId,
  })  : _summarizer = summarizer, // ignore: prefer_initializing_formals
        _prepareImage = prepareImage, // ignore: prefer_initializing_formals
        _history = history, // ignore: prefer_initializing_formals
        _userId = userId; // ignore: prefer_initializing_formals

  final Summarizer _summarizer;
  final ImagePreparer _prepareImage;
  final HistoryStore? _history;

  /// Stable device user id, forwarded to the proxy for quota metering.
  final String? _userId;

  final List<SummaryPage> pages = [];

  /// Load previously saved pages (call once at startup).
  Future<void> restore() async {
    final history = _history;
    if (history == null) return;
    for (final stored in await history.loadPages()) {
      final level = SummaryLevel.values.asNameMap()[stored.levelName] ??
          SummaryLevel.high;
      pages.add(
        SummaryPage.restored(
          id: stored.id,
          photoPath: stored.photoPath,
          level: level,
          text: stored.text,
        ),
      );
    }
    if (pages.isNotEmpty) notifyListeners();
  }

  /// Capture a page: registers it immediately (UI can navigate to it)
  /// and streams the summary in the background.
  Future<SummaryPage> startPage(String photoPath, SummaryLevel level) async {
    var stored = photoPath;
    final history = _history;
    final id = '${DateTime.now().microsecondsSinceEpoch}';
    if (history != null) {
      stored = await history.keepPhoto(photoPath, id);
    }
    final page = SummaryPage(id: id, photoPath: stored, level: level);
    pages.add(page);
    notifyListeners();
    // Don't await: streaming progresses while the UI is already showing.
    _run(page);
    return page;
  }

  Future<void> retry(SummaryPage page) =>
      resummarize(page, page.level);

  /// Re-run a summary, optionally at a different compression level.
  /// The kept photo is resubmitted, so this works for old pages too.
  Future<void> resummarize(SummaryPage page, SummaryLevel level) {
    page.level = level;
    page.reset();
    unawaited(_persist());
    return _run(page);
  }

  /// Remove a page from history (e.g. via the red bin button).
  void deletePage(SummaryPage page) {
    if (pages.remove(page)) {
      page.dispose();
      notifyListeners();
      unawaited(_persist());
    }
  }

  Future<void> _run(SummaryPage page) async {
    try {
      final jpeg = await _prepareImage(page.photoPath);
      final summarizer = _summarizer;
      final stream = summarizer is DiagonalProxyClient
          ? summarizer.summarize(
              jpeg: jpeg, level: page.level, userId: _userId)
          : summarizer.summarize(jpeg: jpeg, level: page.level);
      await for (final delta in stream) {
        page.append(delta);
      }
      if (!page.hasContent && page.error == null) {
        // Completing with zero content would leave a blank page
        // with no way forward — surface it as a retryable error.
        page.fail('Empty response from model');
      } else {
        page.finish();
      }
    } catch (e) {
      page.fail(_friendlyError(e));
    }
    unawaited(_persist());
  }

  /// Quota errors arrive as HTTP 402/429 from the proxy — translate
  /// them into actionable messages instead of raw status codes.
  static String _friendlyError(Object e) {
    if (e is OpenRouterException) {
      if (e.statusCode == 402) {
        return 'Out of pages — subscribe for unlimited.';
      }
      if (e.statusCode == 429) {
        final body = e.bodyExcerpt;
        if (body.contains('daily_limit_reached')) {
          return 'Daily limit reached — new pages tomorrow.';
        }
        return 'Monthly cap reached — new pages next month.';
      }
    }
    return e.toString();
  }

  Future<void> _persist() {
    final history = _history;
    if (history == null) return Future.value();
    return history.savePages(pages);
  }
}
