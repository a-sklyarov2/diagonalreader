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

  final int statusCode;
  final String bodyExcerpt;

  @override
  String toString() =>
      'OpenRouter error $statusCode: $bodyExcerpt';
}

/// OpenRouter chat-completions client (OpenAI-compatible + SSE streaming).
class OpenRouterClient implements Summarizer {
  OpenRouterClient({
    required this.apiKey,
    this.model = defaultModel,
    this.baseUrl = defaultBaseUrl,
    http.Client? httpClient,
  }) : _http = httpClient ?? http.Client();

  static const defaultModel = 'meta/muse-spark-1.3-contributor';
  static const defaultBaseUrl = 'https://openrouter.ai/api/v1';

  final String apiKey;
  final String model;
  final String baseUrl;
  final http.Client _http;

  static String buildUserPrompt(SummaryLevel level) =>
      'Summarize the text on this book page to ${level.target}. '
      "Preserve the author's original style, voice, tone and terminology — "
      'write the summary as if the author wrote a shorter version themselves. '
      'Output ONLY the summary, no preamble, no commentary.';

  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
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
    request.headers['X-Title'] = 'Diagonal MVP';
    request.body = jsonEncode({
      'model': model,
      'stream': true,
      'max_tokens': level.maxTokens,
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
    yield* parseSse(response.stream.transform(utf8.decoder));
  }

  /// Parse an SSE event stream into text deltas. Tolerates chunks split
  /// anywhere (mid-line, mid-JSON) and ignores non-data lines / [DONE].
  static Stream<String> parseSse(Stream<String> chunks) async* {
    var buffer = '';
    await for (final chunk in chunks) {
      buffer += chunk;
      var newline = buffer.indexOf('\n');
      while (newline >= 0) {
        final line = buffer.substring(0, newline);
        buffer = buffer.substring(newline + 1);
        final text = deltaFromLine(line);
        if (text != null && text.isNotEmpty) yield text;
        newline = buffer.indexOf('\n');
      }
    }
  }

  /// Extract the text delta from one SSE line, or null if not content.
  static String? deltaFromLine(String rawLine) {
    final line = rawLine.trim();
    if (!line.startsWith('data:')) return null;
    final data = line.substring('data:'.length).trim();
    if (data.isEmpty || data == '[DONE]') return null;
    try {
      final json = jsonDecode(data) as Map<String, dynamic>;
      final choices = json['choices'] as List<dynamic>?;
      if (choices == null || choices.isEmpty) return null;
      final delta =
          (choices.first as Map<String, dynamic>)['delta']
              as Map<String, dynamic>?;
      final content = delta?['content'];
      return content is String ? content : null;
    } catch (_) {
      return null; // never let a malformed event kill the stream
    }
  }
}
