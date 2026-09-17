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

  /// Human-readable reason the last paywall attempt failed (null when
  /// the last attempt succeeded or none was made). Shown in the UI so
  /// paywall misconfiguration is diagnosable on-device.
  String? get lastError;

  Future<void> refreshQuota();
  Future<bool> ensureAllowance();

  /// Open subscription management (cancel / change tier / restore).
  /// No-op where purchases are unavailable.
  Future<void> manageSubscription();

  /// Present the subscription paywall unconditionally (re-subscribe
  /// after expiry, or top up while pages remain). Afterwards the
  /// server balance is refreshed.
  Future<void> showPaywall();
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
    Future<Offering?> Function()? offeringsLoader,
    bool forceStoreEnabled = false,
  })  : _quotaClient = quotaClient, // ignore: prefer_initializing_formals
        _userId = userId, // ignore: prefer_initializing_formals
        _apiKey = apiKey, // ignore: prefer_initializing_formals
        _forceStoreEnabled = forceStoreEnabled, // ignore: prefer_initializing_formals
        _offeringsLoader = offeringsLoader ?? _loadPagesOffering,
        _paywallPresenter = paywallPresenter ??
            ((offering) => RevenueCatUI.presentPaywall(
                  offering: offering,
                  displayCloseButton: true,
                ));

  final DiagonalProxyClient _quotaClient;
  final String _userId;
  final String _apiKey;
  final bool _forceStoreEnabled;
  final Future<Offering?> Function() _offeringsLoader;
  final Future<PaywallResult> Function(Offering? offering)
      _paywallPresenter;

  bool _rcEnabled = false;
  bool _ready = false;
  bool _subscriber = false;
  QuotaStatus? _quota;
  bool _refreshing = false;
  String? _lastError;

  @override
  QuotaStatus? get quota => _quota;

  @override
  String? get lastError => _lastError;

  @override
  bool get ready => _ready;

  @override
  bool get isSubscriber => _subscriber;

  /// Configure the SDK (no-op without key/store) and fetch quota once.
  Future<void> init() async {
    if (_forceStoreEnabled) {
      // Tests: store SDK skipped, paywall is injected.
      _rcEnabled = true;
    } else if (_apiKey.isNotEmpty &&
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
    if (_quota != null && _quota!.canSummarize) {
      _lastError = null;
      return true;
    }
    if (!_rcEnabled) {
      _lastError = 'purchases unavailable on this build';
      notifyListeners();
      return false;
    }
    if (!await _buyPages()) return false;
    return _awaitCredit();
  }

  @override
  Future<void> showPaywall() async {
    if (!_rcEnabled) {
      _deny('purchases unavailable on this build');
      return;
    }
    if (!await _buyPages()) return;
    await _awaitCredit();
  }

  /// Load the pages offering and present it. Returns true on
  /// purchase/restore; otherwise records the reason in [_lastError].
  Future<bool> _buyPages() async {
    Offering? offering;
    try {
      offering = await _offeringsLoader();
    } catch (e) {
      _deny('could not load offers: $e');
      return false;
    }
    if (offering == null) {
      _deny('no "$pagesOfferingId" offering in RevenueCat');
      return false;
    }
    if (offering.availablePackages.isEmpty) {
      _deny('offering "$pagesOfferingId" has no packages');
      return false;
    }
    PaywallResult result;
    try {
      result = await _paywallPresenter(offering);
    } catch (e) {
      _deny('paywall failed: $e');
      return false;
    }
    if (result != PaywallResult.purchased &&
        result != PaywallResult.restored) {
      _deny(
        result == PaywallResult.error
            ? 'store error during purchase'
            : null, // cancelled/dismissed: caller shows its own note
      );
      return false;
    }
    return true;
  }

  /// After a successful purchase/restore, the credit webhook lands
  /// asynchronously — poll up to ~30s. Returns true once the server
  /// balance covers another page.
  Future<bool> _awaitCredit() async {
    await _readEntitlement();
    for (var i = 0; i < 15; i++) {
      await refreshQuota();
      if (_quota != null && _quota!.canSummarize) {
        _lastError = null;
        notifyListeners();
        return true;
      }
      await Future<void>.delayed(const Duration(seconds: 2));
    }
    return _deny('purchase done, credit not yet received — retry soon');
  }

  @override
  Future<void> manageSubscription() async {
    if (!_rcEnabled ||
        !(Platform.isAndroid || Platform.isIOS)) {
      return;
    }
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (e) {
      _lastError = 'could not open subscription settings: $e';
      notifyListeners();
      return;
    }
    // A tier change credits via webhook — refresh everything on return.
    await _readEntitlement();
    await refreshQuota();
  }

  bool _deny(String? reason) {
    _lastError = reason;
    notifyListeners();
    return false;
  }

  static Future<Offering?> _loadPagesOffering() async {
    final offerings = await Purchases.getOfferings();
    return offerings.all[pagesOfferingId] ?? offerings.current;
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
  String? get lastError => null;

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
  Future<void> manageSubscription() async {}

  @override
  Future<void> showPaywall() async {}

  @override
  Future<bool> ensureAllowance() async {
    if (ensureResult != null) return ensureResult!;
    return _quota?.canSummarize ?? true;
  }
}
