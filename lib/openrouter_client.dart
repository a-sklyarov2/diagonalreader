import 'dart:convert';

import 'package:http/http.dart' as http;

import 'summary_level.dart';

/// Minimal abstraction so the reading session can be tested without HTTP.
abstract class Summarizer {
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
  });
}

class OpenRouterException implements Exception {
  OpenRouterException(this.statusCode, this.bodyExcerpt);

  /// Errors detected inside an HTTP-200 SSE stream (error payload or
  /// stream that ends with no content).
  OpenRouterException.stream(this.bodyExcerpt) : statusCode = 0;

  final int statusCode;
  final String bodyExcerpt;

  @override
  String toString() => statusCode > 0
      ? 'OpenRouter error $statusCode: $bodyExcerpt'
      : bodyExcerpt;
}

/// Diagnostics collected while parsing an SSE stream. Surfaced in
/// failures so on-device reports say *why* a stream was empty.
class SseStats {
  int lines = 0;
  int dataEvents = 0;
  String? finishReason;

  @override
  String toString() =>
      'events=$dataEvents finish=${finishReason ?? 'none'}';
}

/// OpenRouter chat-completions client (OpenAI-compatible + SSE streaming).
class OpenRouterClient implements Summarizer {
  OpenRouterClient({
    required this.apiKey,
    this.model = defaultModel,
    this.baseUrl = defaultBaseUrl,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  static const defaultModel = 'google/gemini-3.5-flash-lite';
  static const defaultBaseUrl = 'https://openrouter.ai/api/v1';

  final String apiKey;
  final String model;
  final String baseUrl;
  final http.Client _http;

  static String buildUserPrompt(SummaryLevel level) =>
      'Summarize the text on this book page to ${level.target}. '
      'Write the summary in the same language as the text on the page. '
      "Preserve the author's original style, voice, tone and terminology — "
      'write the summary as if the author wrote a shorter version themselves. '
      'Output ONLY the summary, no preamble, no commentary.';

  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
  }) async* {
    yield* _streamOnce(jpeg: jpeg, level: level, model: model);
  }

  Stream<String> _streamOnce({
    required List<int> jpeg,
    required SummaryLevel level,
    required String model,
  }) async* {
    final request = http.Request(
      'POST',
      Uri.parse('$baseUrl/chat/completions'),
    );
    request.headers['Content-Type'] = 'application/json';
    if (apiKey.isNotEmpty) {
      request.headers['Authorization'] = 'Bearer $apiKey';
    }
    request.headers['HTTP-Referer'] = 'https://diagonal.app';
    request.headers['X-Title'] = 'Diagonal Reader';
    request.body = jsonEncode({
      'model': model,
      'stream': true,
      'max_tokens': level.maxTokens,
      'temperature': 0.3,
      // Summarization needs minimal thought; default reasoning effort
      // can burn the whole completion budget before answering
      // (empty stream with finish_reason=length).
      'reasoning': {'effort': 'low'},
      'messages': [
        {
          'role': 'system',
          'content':
              'You are a speed-reading assistant. You compress book pages to the requested length without losing the author\'s voice.',
        },
        {
          'role': 'user',
          'content': [
            {'type': 'text', 'text': buildUserPrompt(level)},
            {
              'type': 'image_url',
              'image_url': {
                'url':
                    'data:image/jpeg;base64,${base64Encode(jpeg)}',
              },
            },
          ],
        },
      ],
    });

    final response = await _http.send(request);
    if (response.statusCode != 200) {
      final body = await response.stream.bytesToString();
      final excerpt = body.length > 300 ? '${body.substring(0, 300)}…' : body;
      throw OpenRouterException(response.statusCode, excerpt);
    }
    final stats = SseStats();
    var yielded = 0;
    await for (final text
        in parseSse(response.stream.transform(utf8.decoder), stats: stats)) {
      yielded++;
      yield text;
    }
    if (yielded == 0) {
      throw OpenRouterException.stream(
        'Empty response from $model ($stats)',
      );
    }
  }

  /// Parse an SSE event stream into text deltas. Tolerates chunks split
  /// anywhere (mid-line, mid-JSON) and ignores non-data lines / [DONE].
  /// Throws [OpenRouterException.stream] if the stream carries an error
  /// payload (OpenRouter reports some failures as HTTP-200 SSE events).
  static Stream<String> parseSse(Stream<String> chunks,
      {SseStats? stats}) async* {
    var buffer = '';
    await for (final chunk in chunks) {
      buffer += chunk;
      var newline = buffer.indexOf('\n');
      while (newline >= 0) {
        final line = buffer.substring(0, newline);
        buffer = buffer.substring(newline + 1);
        final text = deltaFromLine(line, stats: stats);
        if (text != null && text.isNotEmpty) yield text;
        newline = buffer.indexOf('\n');
      }
    }
  }

  /// Extract the text delta from one SSE line, or null if not content.
  /// Never lets a malformed event kill the stream — except error
  /// payloads, which are thrown so callers see the real failure.
  static String? deltaFromLine(String rawLine, {SseStats? stats}) {
    final line = rawLine.trim();
    if (!line.startsWith('data:')) return null;
    final data = line.substring('data:'.length).trim();
    if (data.isEmpty || data == '[DONE]') return null;
    Map<String, dynamic> decoded;
    try {
      decoded = jsonDecode(data) as Map<String, dynamic>;
    } catch (_) {
      return null; // never let a malformed event kill the stream
    }
    if (decoded.containsKey('error')) {
      final err = decoded['error'];
      final message =
          err is Map ? '${err['message'] ?? err}' : '$err';
      throw OpenRouterException.stream('Model error: $message');
    }
    try {
      final choices = decoded['choices'] as List<dynamic>?;
      if (choices == null || choices.isEmpty) return null;
      stats?.dataEvents++;
      final first = choices.first as Map<String, dynamic>;
      final finish = first['finish_reason'];
      if (finish is String) stats?.finishReason = finish;
      // Streaming shape uses delta; be lenient and accept a full
      // message object too (some gateways return it with 200).
      final container = (first['delta'] ?? first['message'])
          as Map<String, dynamic>?;
      final content = container?['content'];
      return content is String ? content : null;
    } catch (_) {
      return null;
    }
  }
}
