// Manual live check against the real OpenRouter API.
//
// Reads the key from the OPENROUTER_KEY env var (never committed),
// downscales test_images/page1.jpg exactly like the app does, and
// streams a Mid summary to stdout. Costs a few cents per run.
//
// Usage: OPENROUTER_KEY=sk-or-... dart run tool/live_check.dart [level]
import 'dart:io';

import 'package:diagonal/image_prep.dart';
import 'package:diagonal/openrouter_client.dart';
import 'package:diagonal/summary_level.dart';

Future<void> main(List<String> args) async {
  final key = Platform.environment['OPENROUTER_KEY'] ?? '';
  if (key.isEmpty) {
    stderr.writeln('Set OPENROUTER_KEY env var first.');
    exit(2);
  }
  final level = SummaryLevel.values.firstWhere(
    (l) => l.name == (args.isNotEmpty ? args.first : 'high'),
    orElse: () => SummaryLevel.high,
  );

  final jpeg = await preparePageImage('test_images/page1.jpg');
  stdout.writeln(
      'Uploading ${(jpeg.length / 1024).toStringAsFixed(0)}KB, level=${level.label}…');
  final client = OpenRouterClient(apiKey: key);
  final sw = Stopwatch()..start();
  var firstTokenMs = -1;
  var chars = 0;
  try {
    await for (final delta
        in client.summarize(jpeg: jpeg, level: level)) {
      if (firstTokenMs < 0) {
        firstTokenMs = sw.elapsedMilliseconds;
        stdout.writeln('First token after ${firstTokenMs}ms');
      }
      chars += delta.length;
      stdout.write(delta);
    }
    stdout.writeln('\n---\nDone in ${sw.elapsedMilliseconds}ms, $chars chars.');
  } catch (e) {
    stderr.writeln('\nFAILED: $e');
    exit(1);
  }
}
