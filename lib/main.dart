import 'package:flutter/material.dart';

import 'billing_service.dart';
import 'camera_screen.dart';
import 'camera_service.dart';
import 'device_identity.dart';
import 'diagonal_proxy_client.dart';
import 'history_store.dart';
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

/// RevenueCat public SDK key (`test_…` for the Test Store, `goog_…`
/// for Play). Empty → billing runs in quota-only mode (no paywall).
const revenueCatKey = String.fromEnvironment('REVENUECAT_KEY');

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final history = await HistoryStore.load();
  final userId = await DeviceIdentity().userId();
  final summarizer = buildSummarizer();
  final BillingApi billing;
  if (summarizer is DiagonalProxyClient) {
    final rc = RevenueCatBilling(
      quotaClient: summarizer,
      userId: userId,
      apiKey: revenueCatKey,
    );
    await rc.init();
    billing = rc;
  } else {
    billing = FakeBilling();
  }
  final session = ReadingSession(
    summarizer: summarizer,
    history: history,
    userId: userId,
  );
  await session.restore();
  runApp(DiagonalApp(session: session, billing: billing));
}

class DiagonalApp extends StatelessWidget {
  const DiagonalApp({
    super.key,
    this.session,
    this.cameras,
    this.billing,
  });

  final ReadingSession? session;
  final CameraService? cameras;
  final BillingApi? billing;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Diagonal Reader',
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
        billing: billing ?? FakeBilling(),
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
