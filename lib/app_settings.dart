import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'openrouter_client.dart';

/// User settings, persisted on-device. In-memory default when constructed
/// directly (tests); use [load] in the real app entrypoint.
class AppSettings extends ChangeNotifier {
  AppSettings({String? modelId})
      : _modelId = _sanitize(modelId);

  static const prefsKeyModel = 'diagonal.model';

  String _modelId;
  String get modelId => _modelId;

  static String _sanitize(String? id) =>
      id != null && OpenRouterClient.availableModels.contains(id)
          ? id
          : OpenRouterClient.defaultModel;

  static Future<AppSettings> load() async {
    final prefs = await SharedPreferences.getInstance();
    return AppSettings(modelId: prefs.getString(prefsKeyModel));
  }

  Future<void> setModel(String id) async {
    if (id == _modelId) return;
    assert(OpenRouterClient.availableModels.contains(id));
    _modelId = id;
    notifyListeners();
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(prefsKeyModel, id);
  }
}
