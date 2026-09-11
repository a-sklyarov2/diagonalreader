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
