import 'dart:async';
import 'dart:convert';

import 'package:diagonal/openrouter_client.dart';
import 'package:diagonal/summary_level.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

String _event(String content) =>
    'data: {"choices":[{"delta":{"content":"$content"}}]}\n\n';

void main() {
  group('deltaFromLine', () {
    test('extracts content', () {
      expect(
        OpenRouterClient.deltaFromLine(_event('Hello').trim()),
        'Hello',
      );
    });

    test('ignores [DONE], comments and empty lines', () {
      expect(OpenRouterClient.deltaFromLine('data: [DONE]'), isNull);
      expect(OpenRouterClient.deltaFromLine(': OPENROUTER PROCESSING'),
          isNull);
      expect(OpenRouterClient.deltaFromLine(''), isNull);
      expect(OpenRouterClient.deltaFromLine('event: message'), isNull);
    });

    test('tolerates malformed JSON and role-only deltas', () {
      expect(OpenRouterClient.deltaFromLine('data: {oops'), isNull);
      expect(
        OpenRouterClient.deltaFromLine(
            'data: {"choices":[{"delta":{"role":"assistant"}}]}'),
        isNull,
      );
    });

    test('throws the real message on SSE error payloads', () {
      expect(
        () => OpenRouterClient.deltaFromLine(
          'data: {"error":{"message":"No endpoints found","code":404}}',
        ),
        throwsA(isA<OpenRouterException>().having(
          (e) => e.toString(),
          'message',
          contains('No endpoints found'),
        )),
      );
    });

    test('accepts full message objects and records stats', () {
      final stats = SseStats();
      final text = OpenRouterClient.deltaFromLine(
        'data: {"choices":[{"message":{"content":"Hi"},"finish_reason":"stop"}]}',
        stats: stats,
      );
      expect(text, 'Hi');
      expect(stats.dataEvents, 1);
      expect(stats.finishReason, 'stop');
    });
  });

  group('parseSse', () {
    test('reassembles chunks split mid-line and mid-JSON', () async {
      final chunks = Stream<String>.fromIterable([
        'data: {"choices":[{"delta":{"con',
        'tent":"Hello"}}]}\n\ndata: {"choices":',
        '[{"delta":{"content":" world"}}]}\n\ndata: [DONE]\n\n',
      ]);
      final out = await OpenRouterClient.parseSse(chunks).toList();
      expect(out.join(), 'Hello world');
    });
  });

  group('prompt', () {
    test('encodes level target + style preservation', () {
      final prompt =
          OpenRouterClient.buildUserPrompt(SummaryLevel.max);
      expect(prompt, contains('single sentence'));
      expect(prompt, contains("author's original style"));
      expect(prompt, contains('ONLY the summary'));
    });
  });

  group('summarize', () {
    test('streams deltas from SSE response', () async {
      final mock = MockClient((request) async {
        expect(request.url.path, contains('chat/completions'));
        final body = 'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'
            'data: {"choices":[{"delta":{"content":" there"}}]}\n\n'
            'data: [DONE]\n\n';
        return http.Response(body, 200,
            headers: {'content-type': 'text/event-stream'});
      });
      final client = OpenRouterClient(
        apiKey: 'test',
        httpClient: mock,
      );
      final out = await client
          .summarize(jpeg: [1, 2, 3], level: SummaryLevel.high)
          .toList();
      expect(out.join(), 'Hi there');
    });

    test('throws OpenRouterException on non-200', () async {
      final mock = MockClient((_) async =>
          http.Response('{"error":"no credits"}', 402));
      final client =
          OpenRouterClient(apiKey: 'test', httpClient: mock);
      expect(
        () => client
            .summarize(jpeg: [1], level: SummaryLevel.high)
            .toList(),
        throwsA(isA<OpenRouterException>()),
      );
    });

    test('falls back to secondary model on empty primary stream',
        () async {
      final seenModels = <String>[];
      final mock = MockClient((request) async {
        final body = jsonDecode(request.body) as Map<String, dynamic>;
        seenModels.add(body['model'] as String);
        if ((body['model'] as String).contains('muse-spark')) {
          // Reasoning budget exhausted: role event + length finish.
          return http.Response(
            'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n'
            'data: {"choices":[{"finish_reason":"length"}]}\n\n'
            'data: [DONE]\n\n',
            200,
            headers: {'content-type': 'text/event-stream'},
          );
        }
        return http.Response(
          'data: {"choices":[{"delta":{"content":"fallback text"}}]}\n\n'
          'data: [DONE]\n\n',
          200,
          headers: {'content-type': 'text/event-stream'},
        );
      });
      final client = OpenRouterClient(
        apiKey: 'test',
        httpClient: mock,
        fallbackModel: 'google/gemini-3.8-flash',
      );
      final out = await client
          .summarize(jpeg: [1], level: SummaryLevel.high)
          .toList();
      expect(out, ['fallback text']);
      expect(seenModels, [
        OpenRouterClient.defaultModel,
        'google/gemini-3.8-flash',
      ]);
    });

    test('sends low reasoning effort + temperature', () async {
      Map<String, dynamic>? sent;
      final mock = MockClient((request) async {
        sent = jsonDecode(request.body) as Map<String, dynamic>;
        return http.Response('data: [DONE]\n\n', 200);
      });
      // Empty stream would trigger fallback; disable it here.
      final client = OpenRouterClient(
        apiKey: 'test',
        httpClient: mock,
        fallbackModel: null,
      );
      await expectLater(
        () =>
            client.summarize(jpeg: [1], level: SummaryLevel.high).toList(),
        throwsA(isA<OpenRouterException>()),
      );
      expect(sent?['reasoning'], {'effort': 'low'});
      expect(sent?['temperature'], 0.3);
      expect(sent?['max_tokens'], SummaryLevel.high.maxTokens);
    });
  });
}
