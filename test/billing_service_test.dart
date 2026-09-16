import 'package:diagonal/billing_service.dart';
import 'package:diagonal/diagonal_proxy_client.dart';
import 'package:diagonal/quota.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

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
