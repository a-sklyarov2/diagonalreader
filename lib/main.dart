import 'package:flutter/material.dart';

import 'camera_screen.dart';
import 'camera_service.dart';
import 'diagonal_proxy_client.dart';
import 'openrouter_client.dart';
import 'reading_session.dart';

/// Build-time config. Secrets are baked into the binary via --dart-define
/// and never committed to the repo.
///
/// Preferred: [diagonalApi]+[proxyToken] route through our Cloudflare
/// Worker (OpenRouter key stays server-side). Fallback for local dev:
/// [openRouterKey] calls OpenRouter directly.
/// [mockApi] points OpenRouterClient at a local stub for E2E tests.
const openRouterKey = String.fromEnvironment('OPENROUTER_KEY');
const mockApi = String.fromEnvironment('MOCK_API');
const diagonalApi = String.fromEnvironment('DIAGONAL_API');
const proxyToken = String.fromEnvironment('PROXY_TOKEN');

void main() {
  runApp(const DiagonalApp());
}

class DiagonalApp extends StatelessWidget {
  const DiagonalApp({
    super.key,
    this.session,
    this.cameras,
  });

  final ReadingSession? session;
  final CameraService? cameras;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Diagonal',
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        colorScheme: .fromSeed(
          seedColor: Colors.teal,
          brightness: Brightness.dark,
        ),
      ),
      home: CameraScreen(
        session: session ??
            ReadingSession(summarizer: buildSummarizer()),
        cameras: cameras,
      ),
    );
  }
}

Summarizer buildSummarizer() {
  if (diagonalApi.isNotEmpty && proxyToken.isNotEmpty) {
    return DiagonalProxyClient(
      baseUrl: diagonalApi,
      proxyToken: proxyToken,
    );
  }
  return OpenRouterClient(
    apiKey: openRouterKey,
    baseUrl: mockApi.isNotEmpty
        ? mockApi
        : OpenRouterClient.defaultBaseUrl,
  );
}
