import 'package:diagonal/billing_service.dart';
import 'package:diagonal/diagonal_proxy_client.dart';
import 'package:diagonal/quota.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

QuotaStatus quota({
  int freeUsed = 0,
  int freeTotal = 100,
  bool unlimited = false,
  int paidUsed = 0,
  int dailyUsed = 0,
}) =>
    QuotaStatus(
      freeUsed: freeUsed,
      freeTotal: freeTotal,
      paidBalance: 0,
      pro: false,
      unlimited: unlimited,
      paidUsed: paidUsed,
      paidCap: 10000,
      dailyUsed: dailyUsed,
      dailyCap: 500,
      month: '2026-09',
    );

DiagonalProxyClient quotaClient(QuotaStatus Function() current) {
  final mock = MockClient((request) async {
    final q = current();
    return http.Response(
      '{"freeUsed":${q.freeUsed},"freeTotal":${q.freeTotal},'
      '"paidBalance":${q.paidBalance},"pro":false,'
      '"unlimited":${q.unlimited},"paidUsed":${q.paidUsed},'
      '"paidCap":${q.paidCap},"dailyUsed":${q.dailyUsed},'
      '"dailyCap":${q.dailyCap},"month":"${q.month}"}',
      200,
    );
  });
  return DiagonalProxyClient(
    baseUrl: 'https://api.test',
    proxyToken: 'secret',
    httpClient: mock,
  );
}

void main() {
  test('quota pill labels + denials', () {
    expect(quota(freeUsed: 5).pillLabel, '5/100');
    expect(quota(unlimited: true, paidUsed: 5).pillLabel, '5/∞');
    expect(quota(unlimited: true).pillLabel, '0/∞');

    expect(quota(freeUsed: 5).canSummarize, isTrue);
    expect(quota(freeUsed: 5).denial, isNull);
    expect(quota(freeUsed: 100).canSummarize, isFalse);
    expect(quota(freeUsed: 100).denial, 'free');
    expect(
      quota(unlimited: true, paidUsed: 3, dailyUsed: 500).canSummarize,
      isFalse,
    );
    expect(
      quota(unlimited: true, dailyUsed: 500).denial,
      'daily',
    );
    expect(
      quota(unlimited: true, paidUsed: 10000).denial,
      'monthly',
    );
    expect(
      quota(unlimited: true, paidUsed: 3).denialMessage,
      isEmpty,
    );
    expect(
      quota(freeUsed: 100).denialMessage,
      contains('subscribe'),
    );
  });

  test('quota fromJson parses the new shape', () {
    final q = QuotaStatus.fromJson({
      'freeUsed': 7,
      'freeTotal': 100,
      'paidBalance': 93,
      'pro': false,
      'unlimited': true,
      'paidUsed': 12,
      'paidCap': 10000,
      'dailyUsed': 12,
      'dailyCap': 500,
      'month': '2026-09',
    });
    expect(q.pillLabel, '12/∞');
    expect(q.canSummarize, isTrue);
    expect(QuotaStatus.fromJson({}).pillLabel, '0/0');
  });

  test('allows when free pages remain', () async {
    final billing = RevenueCatBilling(
      quotaClient: quotaClient(() => quota(freeUsed: 5)),
      userId: 'android:test',
      apiKey: '',
    );
    await billing.init();
    expect(billing.ready, isTrue);
    expect(billing.quota?.pillLabel, '5/100');
    expect(await billing.ensureAllowance(), isTrue);
  });

  test('exhausted free quota without a store denies (no paywall)', () async {
    var presented = false;
    final billing = RevenueCatBilling(
      quotaClient: quotaClient(() => quota(freeUsed: 100)),
      userId: 'android:test',
      apiKey: '',
      paywallPresenter: (_) async {
        presented = true;
        throw StateError('no store — must not present');
      },
    );
    await billing.init();
    expect(await billing.ensureAllowance(), isFalse);
    expect(presented, isFalse);
    expect(billing.lastError, contains('purchases unavailable'));
  });

  test('daily cap denies without paywall', () async {
    var presented = false;
    final billing = RevenueCatBilling(
      quotaClient: quotaClient(
        () => quota(unlimited: true, paidUsed: 500, dailyUsed: 500),
      ),
      userId: 'android:test',
      apiKey: 'test-key',
      forceStoreEnabled: true,
      paywallPresenter: (_) async {
        presented = true;
        throw StateError('cap — must not present paywall');
      },
    );
    await billing.init();
    expect(await billing.ensureAllowance(), isFalse);
    expect(presented, isFalse);
    expect(billing.lastError, contains('tomorrow'));
  });

  test('quota failure is recorded, not swallowed', () async {
    final failing = DiagonalProxyClient(
      baseUrl: 'https://api.test',
      proxyToken: 'wrong-token',
      httpClient: MockClient(
        (_) async => http.Response('{"error":"unauthorized"}', 401),
      ),
    );
    final billing = RevenueCatBilling(
      quotaClient: failing,
      userId: 'android:test',
      apiKey: '',
      retryDelay: Duration.zero,
    );
    await billing.init();
    expect(billing.quota, isNull);
    expect(billing.quotaError, contains('401'));
  });

  test('subscriber with unreachable server polls, never paywalls', () async {
    var presented = false;
    final failing = DiagonalProxyClient(
      baseUrl: 'https://api.test',
      proxyToken: 'wrong-token',
      httpClient: MockClient(
        (_) async => http.Response('{"error":"unauthorized"}', 401),
      ),
    );
    final billing = RevenueCatBilling(
      quotaClient: failing,
      userId: 'android:test',
      apiKey: 'test-key',
      forceStoreEnabled: true,
      retryDelay: Duration.zero,
      paywallPresenter: (_) async {
        presented = true;
        throw StateError('subscriber — must not present paywall');
      },
    );
    await billing.init();
    billing.seedSubscriber(true);
    expect(await billing.ensureAllowance(), isFalse);
    expect(presented, isFalse);
    expect(billing.lastError, contains('not yet active'));
  });

  test('FakeBilling gates on quota by default', () async {
    final billing = FakeBilling(quota: quota());
    expect(await billing.ensureAllowance(), isTrue);
    billing.quota = quota(freeUsed: 100);
    expect(await billing.ensureAllowance(), isFalse);
    billing.ensureResult = true;
    expect(await billing.ensureAllowance(), isTrue);
  });
}
