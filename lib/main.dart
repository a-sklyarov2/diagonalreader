import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'camera_screen.dart';
import 'camera_service.dart';
import 'openrouter_client.dart';
import 'reading_session.dart';

/// Build-time config. The key is baked into the binary via
/// `--dart-define=OPENROUTER_KEY=...` and never committed to the repo.
/// [mockApi] points at a local stub server for automated E2E tests.
const openRouterKey = String.fromEnvironment('OPENROUTER_KEY');
const mockApi = String.fromEnvironment('MOCK_API');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final settings = await AppSettings.load();
  runApp(DiagonalApp(settings: settings));
}

class DiagonalApp extends StatelessWidget {
  const DiagonalApp({
    super.key,
    this.session,
    this.cameras,
    this.settings,
    this.client,
  });

  final ReadingSession? session;
  final CameraService? cameras;
  final AppSettings? settings;
  final OpenRouterClient? client;

  @override
  Widget build(BuildContext context) {
    final effectiveSettings = settings ?? AppSettings();
    final effectiveClient = client ??
        OpenRouterClient(
          apiKey: openRouterKey,
          model: effectiveSettings.modelId,
          baseUrl: mockApi.isNotEmpty
              ? mockApi
              : OpenRouterClient.defaultBaseUrl,
        );
    return MaterialApp(
      title: 'Diagonal',
      theme: ThemeData.dark(useMaterial3: true).copyWith(
        colorScheme: .fromSeed(
          seedColor: Colors.teal,
          brightness: Brightness.dark,
        ),
      ),
      home: CameraScreen(
        session: session ?? ReadingSession(summarizer: effectiveClient),
        cameras: cameras,
        settings: effectiveSettings,
        client: effectiveClient,
      ),
    );
  }
}
