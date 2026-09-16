import 'dart:async';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:purchases_flutter/purchases_flutter.dart';
import 'package:purchases_ui_flutter/purchases_ui_flutter.dart';

import 'diagonal_proxy_client.dart';
import 'quota.dart';

/// RevenueCat entitlement guarding paid pages.
const proEntitlementId = 'pro_pages';

/// RevenueCat offering carrying the Low/Mid/Max packages.
const pagesOfferingId = 'pages';

/// What the UI needs: page allowance + a gate shown before spending one.
///
/// [ensureAllowance] returns true when the user may summarize now.
/// When the allowance is exhausted it presents the paywall (on
/// store-capable platforms) and returns whether that unlocked anything.
abstract class BillingApi extends ChangeNotifier {
  QuotaStatus? get quota;

  /// True once the first quota fetch completed.
  bool get ready;

  /// True when the RevenueCat `pro_pages` entitlement is active.
  bool get isSubscriber;

  Future<void> refreshQuota();
  Future<bool> ensureAllowance();
}

/// RevenueCat + Worker-quota implementation.
///
/// [apiKey] arrives via `--dart-define=REVENUECAT_KEY=…`. With an empty
/// key, or on platforms without a store (Linux dev, tests), it runs in
/// quota-only mode: the server allowance is enforced, no paywall shown.
class RevenueCatBilling extends ChangeNotifier implements BillingApi {
  RevenueCatBilling({
    required DiagonalProxyClient quotaClient,
    required String userId,
    required String apiKey,
    Future<PaywallResult> Function(Offering? offering)? paywallPresenter,
  })  : _quotaClient = quotaClient, // ignore: prefer_initializing_formals
        _userId = userId, // ignore: prefer_initializing_formals
        _apiKey = apiKey, // ignore: prefer_initializing_formals
        _paywallPresenter = paywallPresenter ??
            ((offering) => RevenueCatUI.presentPaywall(
                  offering: offering,
                  displayCloseButton: true,
                ));

  final DiagonalProxyClient _quotaClient;
  final String _userId;
  final String _apiKey;
  final Future<PaywallResult> Function(Offering? offering)
      _paywallPresenter;

  bool _rcEnabled = false;
  bool _ready = false;
  bool _subscriber = false;
  QuotaStatus? _quota;
  bool _refreshing = false;

  @override
  QuotaStatus? get quota => _quota;

  @override
  bool get ready => _ready;

  @override
  bool get isSubscriber => _subscriber;

  /// Configure the SDK (no-op without key/store) and fetch quota once.
  Future<void> init() async {
    if (_apiKey.isNotEmpty &&
        (Platform.isAndroid || Platform.isIOS)) {
      try {
        await Purchases.configure(
          PurchasesConfiguration(_apiKey)..appUserID = _userId,
        );
        Purchases.addCustomerInfoUpdateListener(_onCustomerInfo);
        await _readEntitlement();
        _rcEnabled = true;
      } catch (e) {
        debugPrint('RevenueCat unavailable, quota-only mode: $e');
      }
    }
    await refreshQuota();
    _ready = true;
    notifyListeners();
  }

  Future<void> _readEntitlement() async {
    try {
      _onCustomerInfo(await Purchases.getCustomerInfo());
    } catch (e) {
      debugPrint('RevenueCat customer info failed: $e');
    }
  }

  void _onCustomerInfo(CustomerInfo info) {
    final active =
        info.entitlements.all[proEntitlementId]?.isActive ?? false;
    if (active != _subscriber) {
      _subscriber = active;
      notifyListeners();
    }
  }

  @override
  Future<void> refreshQuota() async {
    if (_refreshing) return;
    _refreshing = true;
    try {
      final fresh = await _quotaClient.fetchQuota(_userId);
      _quota = fresh;
      notifyListeners();
    } catch (e) {
      debugPrint('Quota refresh failed: $e');
    } finally {
      _refreshing = false;
    }
  }

  @override
  Future<bool> ensureAllowance() async {
    await refreshQuota();
    if (_quota != null && _quota!.canSummarize) return true;
    if (!_rcEnabled) return false;
    Offering? offering;
    try {
      offering =
          (await Purchases.getOfferings()).all[pagesOfferingId];
    } catch (e) {
      debugPrint('Offerings fetch failed: $e');
    }
    PaywallResult result;
    try {
      result = await _paywallPresenter(offering);
    } catch (e) {
      debugPrint('Paywall failed: $e');
      return false;
    }
    if (result != PaywallResult.purchased &&
        result != PaywallResult.restored) {
      return false;
    }
    // The purchase webhook credits the server balance asynchronously —
    // poll briefly before deciding the paywall didn't help.
    await _readEntitlement();
    for (var i = 0; i < 6; i++) {
      await refreshQuota();
      if (_quota != null && _quota!.canSummarize) return true;
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    return false;
  }
}

/// Deterministic stand-in for widget/unit tests and previews.
class FakeBilling extends BillingApi {
  FakeBilling({
    QuotaStatus? quota,
    this.ensureResult,
    this.isSubscriber = false,
  }) : _quota = quota; // ignore: prefer_initializing_formals

  QuotaStatus? _quota;

  /// If set, [ensureAllowance] returns this instead of consulting quota.
  bool? ensureResult;

  @override
  bool isSubscriber;

  @override
  QuotaStatus? get quota => _quota;

  @override
  bool get ready => true;

  set quota(QuotaStatus? value) {
    _quota = value;
    notifyListeners();
  }

  @override
  Future<void> refreshQuota() async {}

  @override
  Future<bool> ensureAllowance() async {
    if (ensureResult != null) return ensureResult!;
    return _quota?.canSummarize ?? true;
  }
}
