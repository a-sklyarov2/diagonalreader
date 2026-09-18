import 'package:diagonal/billing_service.dart';
import 'package:diagonal/diagonal_proxy_client.dart';
import 'package:diagonal/quota.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:purchases_flutter/purchases_flutter.dart';

DiagonalProxyClient quotaClient(Map<String, dynamic> quotaJson) {
  final mock = MockClient(
    (_) async => http.Response(
      '{"freeUsed":${quotaJson['freeUsed']},'
      '"freeTotal":${quotaJson['freeTotal']},'
      '"paidBalance":${quotaJson['paidBalance']},'
      '"pro":${quotaJson['pro']}}',
      200,
    ),
  );
  return DiagonalProxyClient(
    baseUrl: 'https://api.test',
    proxyToken: 'secret',
    httpClient: mock,
  );
}

const fullQuota = {
  'freeUsed': 3,
  'freeTotal': 10,
  'paidBalance': 0,
  'pro': false
};
const emptyQuota = {
  'freeUsed': 10,
  'freeTotal': 10,
  'paidBalance': 0,
  'pro': false
};

void main() {
  test('quota-only mode allows when pages remain', () async {
    final billing = RevenueCatBilling(
      quotaClient: quotaClient(fullQuota),
      userId: 'android:test',
      apiKey: '', // no key → no store, no paywall
    );
    await billing.init();
    expect(billing.ready, isTrue);
    expect(billing.quota?.freeLeft, 7);
    expect(await billing.ensureAllowance(), isTrue);
  });

  test('quota-only mode denies when exhausted', () async {
    var paywallShown = false;
    final billing = RevenueCatBilling(
      quotaClient: quotaClient(emptyQuota),
      userId: 'android:test',
      apiKey: '',
      paywallPresenter: (_) async {
        paywallShown = true;
        throw StateError('must not present without a store');
      },
    );
    await billing.init();
    expect(await billing.ensureAllowance(), isFalse);
    expect(paywallShown, isFalse);
  });

  test('paywall denial names the missing offering', () async {
    final billing = RevenueCatBilling(
      quotaClient: quotaClient(emptyQuota),
      userId: 'android:test',
      apiKey: 'test-key',
      forceStoreEnabled: true,
      offeringsLoader: () async => null,
      paywallPresenter: (_) async {
        throw StateError('must not present without an offering');
      },
    );
    await billing.init();
    expect(await billing.ensureAllowance(), isFalse);
    expect(billing.lastError, contains('no "pages" offering'));
  });

  test('tier mapping covers every store variant', () {
    expect(tierOfRcProduct('pagesLow_monthly'), PlanTier.low);
    expect(tierOfRcProduct('pageslow_monthly'), PlanTier.low);
    expect(
        tierOfRcProduct('pages_monthly:monthly-low'), PlanTier.low);
    expect(tierOfRcProduct('pagesMid_monthly'), PlanTier.mid);
    expect(
        tierOfRcProduct('pages_monthly:monthly-mid'), PlanTier.mid);
    expect(tierOfRcProduct('pagesMax_monthly'), PlanTier.max);
    expect(
        tierOfRcProduct('pages_monthly:monthly-max'), PlanTier.max);
    expect(tierOfRcProduct('nope'), isNull);
    expect(PlanTier.low.pages, 100);
    expect(PlanTier.mid.pages, 500);
    expect(PlanTier.max.pages, 3000);
    expect(PlanTier.low.rank < PlanTier.max.rank, isTrue);
  });

  Package fakePackage(String productId, String price) => Package(
        'pkg-$productId',
        PackageType.custom,
        StoreProduct(
          productId,
          'desc',
          'title',
          3.0,
          price,
          'USD',
        ),
        const PresentedOfferingContext('pages', null, null),
      );

  Offering fakeOffering() => Offering(
        'pages',
        'desc',
        const {},
        [
          fakePackage('pages_monthly:monthly-low', '\$3.00'),
          fakePackage('pages_monthly:monthly-mid', '\$5.00'),
          fakePackage('pages_monthly:monthly-max', '\$10.00'),
        ],
      );

  RevenueCatBilling planBilling({
    required void Function(Package, StoreProductChangeInfo?) onBuy,
  }) {
    var calls = 0;
    final mock = MockClient((_) async {
      calls++;
      // First fetch (gate check): exhausted. Polls after the
      // purchase see the credited balance.
      final paid = calls == 1 ? 0 : 500;
      return http.Response(
        '{"freeUsed":10,"freeTotal":10,'
        '"paidBalance":$paid,"pro":false}',
        200,
      );
    });
    return RevenueCatBilling(
      quotaClient: DiagonalProxyClient(
        baseUrl: 'https://api.test',
        proxyToken: 'secret',
        httpClient: mock,
      ),
      userId: 'android:test',
      apiKey: 'test-key',
      forceStoreEnabled: true,
      offeringsLoader: () async => fakeOffering(),
      purchaseFn: (package, info) async => onBuy(package, info),
    );
  }

  test('loadPlans lists tiers with prices, current marked', () async {
    final billing = planBilling(onBuy: (p, i) {});
    await billing.init();
    billing.seedEntitlement(
        active: true, productId: 'pages_monthly:monthly-mid');
    expect(billing.currentTier, PlanTier.mid);
    final plans = await billing.loadPlans();
    expect(plans.map((p) => p.tier).toList(),
        [PlanTier.low, PlanTier.mid, PlanTier.max]);
    expect(plans.map((p) => p.priceString).toList(),
        ['\$3.00', '\$5.00', '\$10.00']);
    expect(plans.map((p) => p.isCurrent).toList(),
        [false, true, false]);
  });

  test('upgrade uses time proration, downgrade is deferred', () async {
    StoreProductChangeInfo? seenInfo;
    Package? seenPackage;
    final billing = planBilling(
      onBuy: (package, info) {
        seenPackage = package;
        seenInfo = info;
      },
    );
    await billing.init();
    billing.seedEntitlement(
        active: true, productId: 'pages_monthly:monthly-mid');

    await billing.changePlan(PlanTier.max);
    expect(billing.lastError, isNull);
    expect(seenPackage?.storeProduct.identifier,
        'pages_monthly:monthly-max');
    // Off-Android no replacement info is attached (there is no Play
    // billing to inform); the upgrade-vs-downgrade mode choice itself
    // is covered by the replacementModeFor test below.
    expect(seenInfo, isNull);
    // Purchase completed and the credited balance unlocked the gate.
    expect(billing.quota?.paidBalance, 500);
  });

  test('changePlan refuses without an active subscription', () async {
    final billing = planBilling(onBuy: (p, i) {
      throw StateError('must not buy blindly');
    });
    await billing.init();
    await billing.changePlan(PlanTier.max);
    expect(billing.lastError, contains('no active subscription'));
  });

  test('changePlan to the current tier is refused', () async {
    final billing = planBilling(onBuy: (p, i) {
      throw StateError('must not rebuy the current tier');
    });
    await billing.init();
    billing.seedEntitlement(
        active: true, productId: 'pages_monthly:monthly-low');
    await billing.changePlan(PlanTier.low);
    expect(billing.lastError, contains('already on Low'));
  });

  test('replacement modes: upgrade prorates, downgrade defers', () {
    expect(
      RevenueCatBilling.replacementModeFor(PlanTier.low, PlanTier.max),
      StoreReplacementMode.withTimeProration,
    );
    expect(
      RevenueCatBilling.replacementModeFor(PlanTier.mid, PlanTier.max),
      StoreReplacementMode.withTimeProration,
    );
    expect(
      RevenueCatBilling.replacementModeFor(PlanTier.max, PlanTier.mid),
      StoreReplacementMode.deferred,
    );
    expect(
      RevenueCatBilling.replacementModeFor(PlanTier.low, PlanTier.low),
      StoreReplacementMode.deferred,
    );
  });

  test('resolveTier prefers RC, falls back to server plan', () {
    expect(
      RevenueCatBilling.resolveTier(
        subscriber: true,
        rcProduct: 'pages_monthly:monthly-mid',
        serverPlan: PlanTier.low,
      ),
      PlanTier.mid,
    );
    // Unrecognized entitlement shape (e.g. bare 'pages_monthly')
    // falls back to the server's last-credited tier.
    expect(
      RevenueCatBilling.resolveTier(
        subscriber: true,
        rcProduct: 'pages_monthly',
        serverPlan: PlanTier.mid,
      ),
      PlanTier.mid,
    );
    expect(
      RevenueCatBilling.resolveTier(
        subscriber: true,
        rcProduct: null,
        serverPlan: PlanTier.max,
      ),
      PlanTier.max,
    );
    expect(
      RevenueCatBilling.resolveTier(
        subscriber: false,
        rcProduct: 'pages_monthly:monthly-mid',
        serverPlan: PlanTier.mid,
      ),
      isNull,
    );
    expect(
      RevenueCatBilling.resolveTier(
        subscriber: true,
        rcProduct: 'pages_monthly',
        serverPlan: null,
      ),
      isNull,
    );
  });

  test('FakeBilling gates on quota by default', () async {
    final billing = FakeBilling(
      quota: const QuotaStatus(
        freeUsed: 10,
        freeTotal: 10,
        paidBalance: 5,
        pro: false,
      ),
    );
    expect(await billing.ensureAllowance(), isTrue);
    billing.quota = const QuotaStatus(
      freeUsed: 10,
      freeTotal: 10,
      paidBalance: 0,
      pro: false,
    );
    expect(await billing.ensureAllowance(), isFalse);
    billing.ensureResult = true; // explicit override wins
    expect(await billing.ensureAllowance(), isTrue);
  });
}
