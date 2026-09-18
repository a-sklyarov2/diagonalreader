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

/// Subscription tier. Rank orders upgrade (higher) vs downgrade.
enum PlanTier { low, mid, max }

extension PlanTierInfo on PlanTier {
  int get rank => index;
  String get name => toString().split('.').last;
  String get title => '${name[0].toUpperCase()}${name.substring(1)}';
  int get pages => switch (this) {
        PlanTier.low => 100,
        PlanTier.mid => 500,
        PlanTier.max => 3000,
      };
}

/// RevenueCat product id (every store variant) → tier.
PlanTier? tierOfRcProduct(String productId) {
  switch (productId) {
    case 'pagesLow_monthly':
    case 'pageslow_monthly':
    case 'pages_monthly:monthly-low':
      return PlanTier.low;
    case 'pagesMid_monthly':
    case 'pagesmid_monthly':
    case 'pages_monthly:monthly-mid':
      return PlanTier.mid;
    case 'pagesMax_monthly':
    case 'pagesmax_monthly':
    case 'pages_monthly:monthly-max':
      return PlanTier.max;
    default:
      return null;
  }
}

/// One purchasable tier for the plan picker UI.
class PlanOption {
  const PlanOption({
    required this.tier,
    required this.priceString,
    required this.isCurrent,
  });

  final PlanTier tier;
  final String priceString;
  final bool isCurrent;
}

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

  /// Active subscription tier, null when not subscribed.
  PlanTier? get currentTier;

  /// Tiers available for purchase/change, with store prices.
  Future<List<PlanOption>> loadPlans();

  /// Switch to [tier]: upgrades take effect immediately (prorated),
  /// downgrades at the next renewal. Records failures in [lastError].
  Future<void> changePlan(PlanTier tier);
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
    Future<void> Function(Package, StoreProductChangeInfo?)? purchaseFn,
    bool forceStoreEnabled = false,
  })  : _quotaClient = quotaClient, // ignore: prefer_initializing_formals
        _userId = userId, // ignore: prefer_initializing_formals
        _apiKey = apiKey, // ignore: prefer_initializing_formals
        _forceStoreEnabled = forceStoreEnabled, // ignore: prefer_initializing_formals
        _offeringsLoader = offeringsLoader ?? _loadPagesOffering,
        _purchaseFn = purchaseFn ?? _buyWithStore,
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
  final Future<void> Function(Package, StoreProductChangeInfo?)
      _purchaseFn;
  final Future<PaywallResult> Function(Offering? offering)
      _paywallPresenter;

  bool _rcEnabled = false;
  bool _ready = false;
  bool _subscriber = false;
  String? _currentProductId;
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

  @override
  PlanTier? get currentTier => _subscriber && _currentProductId != null
      ? tierOfRcProduct(_currentProductId!)
      : null;

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
    final entitlement = info.entitlements.all[proEntitlementId];
    final active = entitlement?.isActive ?? false;
    final productId = active ? entitlement?.productIdentifier : null;
    if (active != _subscriber || productId != _currentProductId) {
      _subscriber = active;
      _currentProductId = productId;
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
  Future<List<PlanOption>> loadPlans() async {
    final offering = await _offeringsLoader();
    if (offering == null) {
      _deny('no "$pagesOfferingId" offering in RevenueCat');
      return const [];
    }
    final current = currentTier;
    final plans = <PlanOption>[];
    for (final package in offering.availablePackages) {
      final tier = tierOfRcProduct(package.storeProduct.identifier);
      if (tier == null) continue;
      plans.add(PlanOption(
        tier: tier,
        priceString: package.storeProduct.priceString,
        isCurrent: tier == current,
      ));
    }
    plans.sort((a, b) => a.tier.rank.compareTo(b.tier.rank));
    if (plans.isEmpty) {
      _deny('offering "$pagesOfferingId" has no known packages');
    }
    return plans;
  }

  @override
  Future<void> changePlan(PlanTier tier) async {
    if (!_rcEnabled) {
      _deny('purchases unavailable on this build');
      return;
    }
    final from = currentTier;
    final oldProduct = _currentProductId;
    if (from == null || oldProduct == null) {
      _deny('no active subscription — subscribe from the paywall');
      return;
    }
    if (tier == from) {
      _deny('already on ${tier.title}');
      return;
    }
    final offering = await _offeringsLoader();
    Package? package;
    if (offering != null) {
      for (final p in offering.availablePackages) {
        if (tierOfRcProduct(p.storeProduct.identifier) == tier) {
          package = p;
          break;
        }
      }
    }
    if (package == null) {
      _deny('${tier.title} is not offered right now');
      return;
    }
    // Upgrades apply immediately (prorated); downgrades wait for the
    // next renewal. On Android the replacement info keeps this a plan
    // change on one subscription instead of a second subscription.
    final mode = replacementModeFor(from, tier);
    try {
      await _purchaseFn(
        package,
        Platform.isAndroid
            ? StoreProductChangeInfo(oldProduct,
                replacementMode: mode)
            : null,
      );
    } catch (e) {
      _deny(_isCancelled(e) ? null : 'plan change failed: $e');
      return;
    }
    await _awaitCredit();
  }

  /// Upgrades prorate immediately; downgrades (and laterals) wait for
  /// the next renewal.
  @visibleForTesting
  static StoreReplacementMode replacementModeFor(
    PlanTier from,
    PlanTier to,
  ) =>
      to.rank > from.rank
          ? StoreReplacementMode.withTimeProration
          : StoreReplacementMode.deferred;

  static bool _isCancelled(Object e) =>
      e.toString().contains('purchaseCancelled');
  /// Test-only: seed entitlement state (the real source is the
  /// RevenueCat CustomerInfo listener, unreachable off-device).
  @visibleForTesting
  void seedEntitlement({required bool active, String? productId}) {
    _subscriber = active;
    _currentProductId = active ? productId : null;
    notifyListeners();
  }

  static Future<void> _buyWithStore(
    Package package,
    StoreProductChangeInfo? info,
  ) async {
    await Purchases.purchase(
      PurchaseParams.package(package, productChangeInfo: info),
    );
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
    this.stubTier,
  }) : _quota = quota; // ignore: prefer_initializing_formals

  PlanTier? stubTier;

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
  PlanTier? get currentTier => isSubscriber ? stubTier : null;

  @override
  Future<List<PlanOption>> loadPlans() async => [
        for (final tier in PlanTier.values)
          PlanOption(
            tier: tier,
            priceString: '\$${tier == PlanTier.low
                ? 3
                : tier == PlanTier.mid
                    ? 5
                    : 10}.00',
            isCurrent: tier == currentTier,
          ),
      ];

  @override
  Future<void> changePlan(PlanTier tier) async {
    stubTier = tier;
    notifyListeners();
  }

  @override
  Future<bool> ensureAllowance() async {
    if (ensureResult != null) return ensureResult!;
    return _quota?.canSummarize ?? true;
  }
}
