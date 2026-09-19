import 'dart:io';

import 'package:diagonal/history_store.dart';
import 'package:diagonal/openrouter_client.dart';
import 'package:diagonal/reading_session.dart';
import 'package:diagonal/summary_level.dart';
import 'package:flutter_test/flutter_test.dart';

class FakeSummarizer implements Summarizer {
  FakeSummarizer({this.chunks = const ['Hello ', 'world'], this.fail = false});

  final List<String> chunks;
  final bool fail;
  final List<SummaryLevel> seenLevels = [];

  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
  }) async* {
    seenLevels.add(level);
    if (fail) throw Exception('boom');
    for (final c in chunks) {
      yield c;
    }
  }
}

void main() {
  test('startPage streams summary into the page', () async {
    final summarizer = FakeSummarizer();
    final session = ReadingSession(
      summarizer: summarizer,
      prepareImage: (_) async => [1, 2, 3],
    );
    final page = await session.startPage('/tmp/x.jpg', SummaryLevel.high);
    expect(session.pages, [page]);
    // Let the background stream finish.
    await Future.delayed(Duration.zero);
    await Future.delayed(Duration.zero);
    expect(page.text, 'Hello world');
    expect(page.done, isTrue);
    expect(page.error, isNull);
    expect(summarizer.seenLevels, [SummaryLevel.high]);
  });

  test('empty stream becomes a retryable error, not a blank page',
      () async {
    final session = ReadingSession(
      summarizer: FakeSummarizer(chunks: const []),
      prepareImage: (_) async => [1],
    );
    final page = await session.startPage('/tmp/x.jpg', SummaryLevel.high);
    await Future.delayed(Duration.zero);
    await Future.delayed(Duration.zero);
    expect(page.hasContent, isFalse);
    expect(page.error, contains('Empty response'));
  });

  test('failure is captured on the page + retry works', () async {
    var fail = true;
    final summarizer = _ToggleSummarizer(() => fail);
    final session = ReadingSession(
      summarizer: summarizer,
      prepareImage: (_) async => [1],
    );
    final page = await session.startPage('/tmp/x.jpg', SummaryLevel.low);
    await Future.delayed(Duration.zero);
    await Future.delayed(Duration.zero);
    expect(page.error, contains('boom'));
    expect(page.done, isTrue);

    fail = false;
    await session.retry(page);
    expect(page.text, 'recovered');
    expect(page.error, isNull);
    expect(page.done, isTrue);
  });

  test('resummarize switches level and resubmits', () async {
    final summarizer = FakeSummarizer();
    final session = ReadingSession(
      summarizer: summarizer,
      prepareImage: (_) async => [1],
    );
    final page = await session.startPage('/tmp/x.jpg', SummaryLevel.high);
    await Future.delayed(Duration.zero);
    await Future.delayed(Duration.zero);
    expect(page.text, 'Hello world');

    await session.resummarize(page, SummaryLevel.low);
    expect(page.level, SummaryLevel.low);
    // Fresh run replaces the old text.
    expect(page.text, 'Hello world');
    expect(summarizer.seenLevels,
        [SummaryLevel.high, SummaryLevel.low]);
  });

  test('history persists photos + index and restores them', () async {
    final dir = await Directory.systemTemp.createTemp('session_test_');
    try {
      final src = File('${dir.path}/capture.jpg');
      await src.writeAsBytes([7, 8, 9]);
      final history = HistoryStore(dir);
      final session = ReadingSession(
        summarizer: FakeSummarizer(chunks: const ['saved']),
        prepareImage: (_) async => [1],
        history: history,
      );
      final page = await session.startPage(src.path, SummaryLevel.max);
      // Let the unawaited streaming run finish (load-sensitive).
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await Future.delayed(Duration.zero);
      await Future.delayed(Duration.zero);
      expect(page.text, 'saved');
      expect(page.photoPath, startsWith('${dir.path}/photos/'));
      expect(File('${dir.path}/pages.json').existsSync(), isTrue);

      final fresh = ReadingSession(
        summarizer: FakeSummarizer(),
        history: history,
      );
      await fresh.restore();
      expect(fresh.pages.length, 1);
      expect(fresh.pages.single.text, 'saved');
      expect(fresh.pages.single.level, SummaryLevel.max);
      expect(fresh.pages.single.done, isTrue);
    } finally {
      await dir.delete(recursive: true);
    }
  });
}

class _ToggleSummarizer implements Summarizer {
  _ToggleSummarizer(this.shouldFail);

  final bool Function() shouldFail;

  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
  }) async* {
    if (shouldFail()) throw Exception('boom');
    yield 'recovered';
  }
}
