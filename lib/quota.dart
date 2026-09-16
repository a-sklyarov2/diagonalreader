/// Page allowance for one user, as reported by the Worker.
class QuotaStatus {
  const QuotaStatus({
    required this.freeUsed,
    required this.freeTotal,
    required this.paidBalance,
    required this.pro,
  });

  factory QuotaStatus.fromJson(Map<String, dynamic> json) {
    int asInt(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;
    return QuotaStatus(
      freeUsed: asInt(json['freeUsed']),
      freeTotal: asInt(json['freeTotal']),
      paidBalance: asInt(json['paidBalance']),
      pro: json['pro'] == true,
    );
  }

  /// Free pages consumed out of the initial allowance.
  final int freeUsed;

  /// Initial free allowance (10).
  final int freeTotal;

  /// Purchased pages still unspent (credited per subscription period).
  final int paidBalance;

  /// RevenueCat `pro_pages` entitlement currently active.
  final bool pro;

  int get freeLeft => freeTotal - freeUsed < 0 ? 0 : freeTotal - freeUsed;
  int get totalLeft => freeLeft + paidBalance;
  bool get canSummarize => totalLeft > 0;
}
