import 'dart:convert';

import 'package:diagonal/diagonal_proxy_client.dart';
import 'package:diagonal/summary_level.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

void main() {
  test('posts multipart + streams SSE', () async {
    String? path;
    String? auth;
    String? contentType;
    String? body;
    final mock = MockClient((request) async {
      expect(request.url.path, '/summarize');
      path = request.url.path;
      auth = request.headers['Authorization'];
      contentType = request.headers['content-type'];
      // NOTE: MockClient finalizes multipart into a plain Request,
      // so assert on the encoded body (latin1 survives binary parts).
      body = latin1.decode(request.bodyBytes, allowInvalid: true);
      return http.Response(
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'
        'data: [DONE]\n\n',
        200,
        headers: {'content-type': 'text/event-stream'},
      );
    });
    final client = DiagonalProxyClient(
      baseUrl: 'https://api.test',
      proxyToken: 'secret',
      httpClient: mock,
    );
    final out = await client
        .summarize(jpeg: [1, 2, 3], level: SummaryLevel.high)
        .toList();
    expect(out, ['Hi']);
    expect(path, '/summarize');
    expect(auth, 'Bearer secret');
    expect(contentType, contains('multipart/form-data'));
    expect(body, contains('name="level"'));
    expect(body, contains('high'));
    expect(body, contains('filename="page.jpg"'));
  });

  test('throws on non-200', () async {
    final mock = MockClient(
      (_) async => http.Response('{"error":"unauthorized"}', 401),
    );
    final client = DiagonalProxyClient(
      baseUrl: 'https://api.test',
      proxyToken: 'bad',
      httpClient: mock,
    );
    expect(
      () => client
          .summarize(jpeg: [1], level: SummaryLevel.low)
          .toList(),
      throwsA(isA<Exception>()),
    );
  });
}
