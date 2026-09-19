import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'dart:async';

import 'billing_service.dart';
import 'camera_service.dart';
import 'reader_screen.dart';
import 'reading_session.dart';
import 'summary_level.dart';

/// Fullscreen camera: pick a compression level, hit the big button,
/// and the page is captured + sent for summarization immediately.
class CameraScreen extends StatefulWidget {
  const CameraScreen({
    super.key,
    required this.session,
    this.cameras,
    this.billing,
  });

  final ReadingSession session;
  final CameraService? cameras;
  final BillingApi? billing;

  @override
  State<CameraScreen> createState() => _CameraScreenState();
}

class _CameraScreenState extends State<CameraScreen> {
  static final BillingApi _allowAll = FakeBilling();
  BillingApi get _billing => widget.billing ?? _allowAll;

  late final CameraService _cameras;
  bool _ready = false;
  String? _error;
  bool _capturing = false;
  SummaryLevel _level = SummaryLevel.high;

  @override
  void initState() {
    super.initState();
    _cameras = widget.cameras ?? createCameraService();
    _init();
  }

  Future<void> _init() async {
    try {
      await _cameras.init();
      if (mounted) setState(() => _ready = true);
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  /// Long-press on the quota pill reveals the anonymous device id so
  /// users can reference it in privacy/deletion requests. [error]
  /// carries the last quota failure, if any.
  void _showDeviceId(BuildContext context, String? userId,
      [String? error]) {
    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Device ID'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SelectableText(userId ?? 'unknown'),
            if (error != null) ...[
              const SizedBox(height: 12),
              SelectableText(
                error,
                style: const TextStyle(fontSize: 12),
              ),
            ],
          ],
        ),
        actions: [
          TextButton(
            onPressed: () {
              if (userId != null) {
                Clipboard.setData(ClipboardData(text: userId));
              }
              Navigator.of(context).pop();
            },
            child: const Text('Copy'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('Close'),
          ),
        ],
      ),
    );
  }

  Future<void> _capture() async {
    if (_capturing) return;
    // Allowance (and the paywall) first, outside the capture spinner:
    // buying pages can take a while and shouldn't look like a stuck
    // photo capture.
    if (!await _billing.ensureAllowance()) {
      if (mounted) {
        final reason = _billing.lastError;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text(reason == null
                ? 'Out of pages — subscribe to keep reading.'
                : 'Cannot subscribe yet: $reason'),
          ),
        );
      }
      return;
    }
    setState(() => _capturing = true);
    try {
      final path = await _cameras.takePicture();
      if (path == null) throw StateError('No picture returned');
      final page = await widget.session.startPage(path, _level);
      if (!mounted) return;
      final index = widget.session.pages.indexOf(page);
      await Navigator.of(context).push(
        MaterialPageRoute(
          builder: (_) => ReaderScreen(
            session: widget.session,
            initialIndex: index,
            billing: _billing,
          ),
        ),
      );
      // The page was paid for while the reader was open — re-fetch
      // so the pill increments the moment we return, not on the
      // next capture.
      unawaited(_billing.refreshQuota());
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Capture failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _capturing = false);
    }
  }

  @override
  void dispose() {
    _cameras.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = _cameras.controller;
    final showPreview =
        controller != null && _ready && controller.value.isInitialized;

    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          if (_error != null)
            Center(
              child: Text(
                'Camera error: $_error',
                key: const Key('cameraError'),
                style: const TextStyle(color: Colors.white),
              ),
            )
          else if (!_ready)
            const Center(
              child: CircularProgressIndicator(key: Key('cameraLoading')),
            )
          else if (showPreview)
            _CoverPreview(controller: controller)
          else
            Container(
              key: const Key('fakePreview'),
              color: Colors.grey.shade900,
              child: const Center(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.menu_book,
                        size: 64, color: Colors.white54),
                    SizedBox(height: 12),
                    Text(
                      'Demo camera — sample page photo',
                      style: TextStyle(color: Colors.white54),
                    ),
                  ],
                ),
              ),
            ),
          // Title.
          const Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Center(
                child: Text(
                  'DIAGONAL READER',
                  style: TextStyle(
                    color: Colors.white,
                    letterSpacing: 4,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ),
          ),
          // Pages-left pill (top right). Subscribers see their
          // balance too; hidden until the first quota fetch lands.
          Positioned(
            top: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding: const EdgeInsets.only(top: 8, right: 12),
                child: ListenableBuilder(
                  listenable: _billing,
                  builder: (context, _) {
                    final quota = _billing.quota;
                    if (!_billing.ready) {
                      return const SizedBox.shrink();
                    }
                    // Quota unknown (backend unreachable, wrong token,
                    // …): show a tappable placeholder that reveals the
                    // reason instead of failing silently.
                    final label = quota?.pillLabel ?? '…';
                    return InkWell(
                      key: const Key('quotaPill'),
                      borderRadius: BorderRadius.circular(12),
                      onTap: () async {
                        // No usable quota (backend unreachable, wrong
                        // token, …) — show the reason, not the paywall.
                        if (_billing.quota == null) {
                          if (context.mounted) {
                            _showDeviceId(
                              context,
                              widget.session.userId,
                              _billing.quotaError ?? 'quota unavailable',
                            );
                          }
                          return;
                        }
                        final billing = _billing;
                        final billing = _billing;
                        // Subscribers manage in the store (single plan —
                        // nothing to switch); everyone else subscribes.
                        if (billing.isSubscriber ||
                            (billing.quota?.unlimited ?? false)) {
                          await billing.manageSubscription();
                        } else {
                          final before = billing.lastError;
                          await billing.showPaywall();
                          final error = billing.lastError;
                          if (context.mounted &&
                              error != null &&
                              error != before) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(error)),
                            );
                          }
                        }
                      },
                      onLongPress: () =>
                          _showDeviceId(context, widget.session.userId),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 4),
                        decoration: BoxDecoration(
                          color: Colors.black54,
                          borderRadius: BorderRadius.circular(12),
                        ),
                        child: Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              label,
                              style: const TextStyle(
                                color: Colors.white,
                                fontSize: 12,
                                fontWeight: FontWeight.w600,
                              ),
                            ),
                            const Padding(
                              padding: EdgeInsets.only(left: 4),
                              child: Icon(
                                Icons.settings,
                                size: 12,
                                color: Colors.white70,
                              ),
                            ),
                          ],
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
          ),
          // Bottom controls: compression levels + big shutter button.
          if (_error == null && _ready)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: Container(
                padding:
                    const EdgeInsets.fromLTRB(16, 24, 16, 32),
                decoration: const BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    colors: [Colors.transparent, Colors.black87],
                  ),
                ),
                child: SafeArea(
                  top: false,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SegmentedButton<SummaryLevel>(
                        segments: const [
                          ButtonSegment(
                              value: SummaryLevel.low, label: Text('Low')),
                          ButtonSegment(
                              value: SummaryLevel.high,
                              label: Text('High')),
                          ButtonSegment(
                              value: SummaryLevel.max, label: Text('Max')),
                        ],
                        selected: {_level},
                        onSelectionChanged: (selected) =>
                            setState(() => _level = selected.first),
                        style: SegmentedButton.styleFrom(
                          foregroundColor: Colors.white,
                          selectedForegroundColor: Colors.black,
                          selectedBackgroundColor: Colors.white,
                        ),
                      ),
                      const SizedBox(height: 20),
                      GestureDetector(
                        key: const Key('captureButton'),
                        onTap: _capturing ? null : _capture,
                        child: Container(
                          width: 78,
                          height: 78,
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            border: Border.all(
                                color: Colors.white, width: 4),
                            color: _capturing
                                ? Colors.white38
                                : Colors.transparent,
                          ),
                          child: _capturing
                              ? const Padding(
                                  padding: EdgeInsets.all(20),
                                  child: CircularProgressIndicator(
                                    color: Colors.white,
                                    strokeWidth: 3,
                                  ),
                                )
                              : Center(
                                  child: Container(
                                    width: 60,
                                    height: 60,
                                    decoration: const BoxDecoration(
                                      shape: BoxShape.circle,
                                      color: Colors.white,
                                    ),
                                  ),
                                ),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

/// Full-bleed camera preview (cover fit, may crop edges).
class _CoverPreview extends StatelessWidget {
  const _CoverPreview({required this.controller});

  final CameraController controller;

  @override
  Widget build(BuildContext context) {
    final previewSize = controller.value.previewSize;
    if (previewSize == null) {
      return const ColoredBox(color: Colors.black);
    }
    return SizedBox.expand(
      child: FittedBox(
        fit: BoxFit.cover,
        child: SizedBox(
          width: previewSize.height,
          height: previewSize.width,
          child: CameraPreview(controller),
        ),
      ),
    );
  }
}
