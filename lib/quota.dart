/// Page allowance for one user, as reported by the Worker.
///
/// Free: 100 pages per calendar month (reset, no rollover).
/// Subscribed: unlimited* — 5000 guaranteed/month with 500/day and
/// 10000/month guardrails.
class QuotaStatus {
  const QuotaStatus({
    required this.freeUsed,
    required this.freeTotal,
    required this.paidBalance,
    required this.pro,
    required this.unlimited,
    required this.paidUsed,
    required this.paidCap,
    required this.dailyUsed,
    required this.dailyCap,
    required this.month,
  });

  factory QuotaStatus.fromJson(Map<String, dynamic> json) {
    int asInt(Object? v) => v is int ? v : int.tryParse('$v') ?? 0;
    bool asBool(Object? v) => v == true;
    return QuotaStatus(
      freeUsed: asInt(json['freeUsed']),
      freeTotal: asInt(json['freeTotal']),
      paidBalance: asInt(json['paidBalance']),
      pro: asBool(json['pro']),
      unlimited: asBool(json['unlimited']),
      paidUsed: asInt(json['paidUsed']),
      paidCap: asInt(json['paidCap']),
      dailyUsed: asInt(json['dailyUsed']),
      dailyCap: asInt(json['dailyCap']),
      month: '${json['month'] ?? ''}',
    );
  }

  /// Monthly free pages consumed.
  final int freeUsed;

  /// Free pages per month (100).
  final int freeTotal;

  /// Legacy compat: remaining monthly allowance.
  final int paidBalance;

  /// RevenueCat `pro_pages` entitlement currently active (unused;
  /// the server is the source of truth for access).
  final bool pro;

  /// True while a subscription is live.
  final bool unlimited;

  /// Paid pages consumed this calendar month.
  final int paidUsed;

  /// Paid hard cap per month (10000).
  final int paidCap;

  /// Paid pages consumed today (UTC).
  final int dailyUsed;

  /// Paid daily cap (500).
  final int dailyCap;

  /// Current billing window, YYYY-MM.
  final String month;

  int get freeLeft => freeTotal - freeUsed < 0 ? 0 : freeTotal - freeUsed;

  bool get canSummarize {
    if (unlimited) {
      return dailyUsed < dailyCap && paidUsed < paidCap;
    }
    return freeLeft > 0;
  }

  /// Why summarizing is blocked right now (null when allowed):
  /// free exhaustion → paywall; daily/monthly caps → wait it out.
  String? get denial {
    if (canSummarize) return null;
    if (!unlimited) return 'free';
    if (dailyUsed >= dailyCap) return 'daily';
    return 'monthly';
  }

  String get denialMessage {
    if (denial == null) return '';
    return switch (denial) {
      'daily' => 'Daily limit reached — new pages tomorrow.',
      'monthly' => 'Monthly cap reached — new pages next month.',
      _ => 'Out of pages — subscribe for unlimited.',
    };
  }

  /// Pill label: used/total — "5/100" free, "5/∞" unlimited.
  String get pillLabel =>
      unlimited ? '$paidUsed/∞' : '$freeUsed/$freeTotal';
}
