import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import 'openrouter_client.dart';
import 'quota.dart';
import 'summary_level.dart';

/// Summarizer that talks to our Cloudflare Worker instead of OpenRouter
/// directly. The OpenRouter key lives only as a Worker secret; the app
/// carries a revocable proxy token. SSE parsing is shared with
/// [OpenRouterClient].
class DiagonalProxyClient implements Summarizer {
  DiagonalProxyClient({
    required String baseUrl,
    required String proxyToken,
    http.Client? httpClient,
  })  : _base = baseUrl,
        _token = proxyToken,
        _http = httpClient ?? http.Client();

  final String _base;
  final String _token;
  final http.Client _http;

  /// Current page allowance for [userId] (free + purchased).
  Future<QuotaStatus> fetchQuota(String userId) async {
    final uri = Uri.parse(
      '$_base/quota?user=${Uri.encodeComponent(userId)}',
    );
    final response = await _http.get(
      uri,
      headers: {'Authorization': 'Bearer $_token'},
    );
    if (response.statusCode != 200) {
      final excerpt = response.body.length > 300
          ? '${response.body.substring(0, 300)}…'
          : response.body;
      throw OpenRouterException(response.statusCode, excerpt);
    }
    return QuotaStatus.fromJson(
      jsonDecode(response.body) as Map<String, dynamic>,
    );
  }

  @override
  Stream<String> summarize({
    required List<int> jpeg,
    required SummaryLevel level,
    String? userId,
  }) async* {
    final request = http.MultipartRequest(
      'POST',
      Uri.parse('$_base/summarize'),
    );
    request.headers['Authorization'] = 'Bearer $_token';
    if (userId != null && userId.isNotEmpty) {
      request.headers['X-User-Id'] = userId;
    }
    request.fields['level'] = level.name;
    request.files.add(
      http.MultipartFile.fromBytes(
        'image',
        jpeg,
        filename: 'page.jpg',
        contentType: MediaType('image', 'jpeg'),
      ),
    );

    final response = await _http.send(request);
    if (response.statusCode != 200) {
      final body = await response.stream.bytesToString();
      final excerpt = body.length > 300 ? '${body.substring(0, 300)}…' : body;
      throw OpenRouterException(response.statusCode, excerpt);
    }
    final stats = SseStats();
    var yielded = 0;
    await for (final text in OpenRouterClient.parseSse(
      response.stream.transform(utf8.decoder),
      stats: stats,
    )) {
      yielded++;
      yield text;
    }
    if (yielded == 0) {
      throw OpenRouterException.stream(
        'Empty response from proxy ($stats)',
      );
    }
  }
}
