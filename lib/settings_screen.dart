import 'package:flutter/material.dart';

import 'app_settings.dart';
import 'openrouter_client.dart';

/// Settings page: pick which OpenRouter model summarizes pages.
/// Applies to the next captured page; persisted on-device.
class SettingsScreen extends StatelessWidget {
  const SettingsScreen({
    super.key,
    required this.settings,
    required this.client,
  });

  final AppSettings settings;
  final OpenRouterClient client;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListenableBuilder(
        listenable: settings,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'Summary model',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
            ),
            const SizedBox(height: 8),
            DropdownButton<String>(
              key: const Key('modelDropdown'),
              value: settings.modelId,
              isExpanded: true,
              items: [
                for (final id in OpenRouterClient.availableModels)
                  DropdownMenuItem(
                    key: Key('model_$id'),
                    value: id,
                    child: Text(id,
                        style: const TextStyle(fontSize: 14)),
                  ),
              ],
              onChanged: (id) async {
                if (id == null) return;
                client.model = id;
                await settings.setModel(id);
              },
            ),
            const SizedBox(height: 12),
            Text(
              'If ${OpenRouterClient.defaultModel} returns nothing, '
              'the app automatically retries once with '
              '${OpenRouterClient.defaultFallbackModel}.',
              style: Theme.of(context).textTheme.bodySmall,
            ),
          ],
        ),
      ),
    );
  }
}
