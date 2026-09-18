import 'package:flutter/material.dart';

import 'billing_service.dart';

/// In-app plan switching (upgrades, downgrades, crossgrades).
///
/// Google Play offers no self-serve tier change across products/plans
/// from its management page for our setup, so subscribers switch here:
/// upgrades apply immediately (prorated), downgrades at next renewal.
/// A "Manage in Play Store" row opens RevenueCat's Customer Center
/// for cancel / payment methods.
class PlanScreen extends StatefulWidget {
  const PlanScreen({super.key, required this.billing});

  final BillingApi billing;

  static Future<void> show(BuildContext context, BillingApi billing) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.grey.shade900,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      builder: (_) => PlanScreen(billing: billing),
    );
  }

  @override
  State<PlanScreen> createState() => _PlanScreenState();
}

class _PlanScreenState extends State<PlanScreen> {
  late Future<List<PlanOption>> _plans;
  PlanTier? _switching;

  @override
  void initState() {
    super.initState();
    _plans = widget.billing.loadPlans();
  }

  Future<void> _switchTo(PlanOption plan) async {
    setState(() => _switching = plan.tier);
    await widget.billing.changePlan(plan.tier);
    if (!mounted) return;
    final error = widget.billing.lastError;
    if (error == null) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Switched to ${plan.tier.title}.')),
      );
    } else {
      setState(() => _switching = null);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text(error)),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Center(
              child: Container(
                width: 40,
                height: 4,
                decoration: BoxDecoration(
                  color: Colors.white24,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Your plan',
              key: Key('planTitle'),
              style: TextStyle(
                color: Colors.white,
                fontSize: 20,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            const Text(
              'Upgrades apply immediately. Downgrades take effect at the next renewal.',
              style: TextStyle(color: Colors.white60, fontSize: 13),
            ),
            const SizedBox(height: 12),
            FutureBuilder<List<PlanOption>>(
              future: _plans,
              builder: (context, snapshot) {
                if (!snapshot.hasData) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                final plans = snapshot.data!;
                if (plans.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.symmetric(vertical: 24),
                    child: Text(
                      'Plans unavailable right now — try again later.',
                      style: TextStyle(color: Colors.white70),
                    ),
                  );
                }
                return Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    for (final plan in plans) _planRow(plan),
                  ],
                );
              },
            ),
            const SizedBox(height: 8),
            TextButton.icon(
              key: const Key('manageInStoreButton'),
              onPressed: () async {
                Navigator.of(context).pop();
                await widget.billing.manageSubscription();
              },
              icon: const Icon(Icons.storefront,
                  size: 16, color: Colors.white70),
              label: const Text(
                'Manage in Play Store (cancel, payment)',
                style: TextStyle(color: Colors.white70),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _planRow(PlanOption plan) {
    final busy = _switching == plan.tier;
    return Card(
      key: Key('planRow_${plan.tier.name}'),
      color: plan.isCurrent ? Colors.teal.shade800 : Colors.white10,
      child: ListTile(
        enabled: !plan.isCurrent && _switching == null,
        title: Text(
          '${plan.tier.title} · ${plan.tier.pages} pages/mo',
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w600,
          ),
        ),
        subtitle: Text(
          plan.isCurrent ? 'Current plan' : plan.priceString,
          style: const TextStyle(color: Colors.white60),
        ),
        trailing: plan.isCurrent
            ? const Icon(Icons.check_circle, color: Colors.white)
            : busy
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.arrow_forward, color: Colors.white70),
        onTap:
            plan.isCurrent || _switching != null ? null : () => _switchTo(plan),
      ),
    );
  }
}
