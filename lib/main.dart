import 'package:flutter/material.dart';

import 'camera_screen.dart';
import 'camera_service.dart';
import 'openrouter_client.dart';
import 'reading_session.dart';

/// Build-time config. The key is baked into the binary via
/// `--dart-define=OPENROUTER_KEY=...` and never committed to the repo.
/// [mockApi] points at a local stub server for automated E2E tests.
const openRouterKey = String.fromEnvironment('OPENROUTER_KEY');
const mockApi = String.fromEnvironment('MOCK_API');

void main() {
  runApp(const DiagonalApp());
}

class DiagonalApp extends StatelessWidget {
  const DiagonalApp({super.key, this.session, this.cameras});

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
            ReadingSession(
              summarizer: OpenRouterClient(
                apiKey: openRouterKey,
                baseUrl: mockApi.isNotEmpty
                    ? mockApi
                    : OpenRouterClient.defaultBaseUrl,
              ),
            ),
        cameras: cameras,
      ),
    );
  }
}
