import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

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

  Future<void> _capture() async {
    if (_capturing) return;
    setState(() => _capturing = true);
    try {
      if (!await _billing.ensureAllowance()) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(
              content: Text('Out of pages — subscribe to keep reading.'),
            ),
          );
        }
        return;
      }
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
                    if (!_billing.ready || quota == null) {
                      return const SizedBox.shrink();
                    }
                    final label = _billing.isSubscriber
                        ? '★ ${quota.totalLeft}'
                        : '${quota.totalLeft} pages';
                    return Container(
                      key: const Key('quotaPill'),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: Text(
                        label,
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
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
