import 'dart:io';
import 'dart:ui';

import 'package:flutter/material.dart';

import 'reading_session.dart';
import 'summary_level.dart';

/// Vertical pager over summarized pages (newest last). The current page
/// shows the captured photo blurred into the background with the
/// streaming summary on top; scroll up for previous summaries.
class ReaderScreen extends StatefulWidget {
  const ReaderScreen({
    super.key,
    required this.session,
    required this.initialIndex,
  });

  final ReadingSession session;
  final int initialIndex;

  @override
  State<ReaderScreen> createState() => _ReaderScreenState();
}

class _ReaderScreenState extends State<ReaderScreen> {
  late final PageController _controller;
  late int _current;

  List<SummaryPage> get _pages => widget.session.pages;

  @override
  void initState() {
    super.initState();
    _current = widget.initialIndex;
    _controller = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          PageView.builder(
            scrollDirection: Axis.vertical,
            controller: _controller,
            itemCount: _pages.length,
            onPageChanged: (i) => setState(() => _current = i),
            itemBuilder: (context, index) => _ReaderPage(
              key: Key('readerPage_$index'),
              page: _pages[index],
              session: widget.session,
            ),
          ),
          // Top bar: back to camera + position.
          Positioned(
            top: 0,
            left: 0,
            right: 0,
            child: SafeArea(
              child: Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8),
                child: Row(
                  children: [
                    IconButton(
                      key: const Key('readerBack'),
                      icon: const Icon(Icons.arrow_back,
                          color: Colors.white),
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                    const Spacer(),
                    Container(
                      key: const Key('pageCounter'),
                      padding: const EdgeInsets.symmetric(
                          horizontal: 12, vertical: 6),
                      decoration: BoxDecoration(
                        color: Colors.black54,
                        borderRadius: BorderRadius.circular(16),
                      ),
                      child: Text(
                        '${_current + 1} / ${_pages.length}',
                        style: const TextStyle(color: Colors.white),
                      ),
                    ),
                    const Spacer(),
                    const SizedBox(width: 48),
                  ],
                ),
              ),
            ),
          ),
          // Bottom: next page button → back to fullscreen camera.
          Positioned(
            left: 0,
            right: 0,
            bottom: 0,
            child: SafeArea(
              child: Center(
                child: Padding(
                  padding: const EdgeInsets.only(bottom: 20),
                  child: ElevatedButton.icon(
                    key: const Key('nextPageButton'),
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.camera_alt),
                    label: const Text('Next page'),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: Colors.white,
                      foregroundColor: Colors.black,
                      padding: const EdgeInsets.symmetric(
                          horizontal: 28, vertical: 14),
                      textStyle: const TextStyle(fontSize: 17),
                    ),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _ReaderPage extends StatelessWidget {
  const _ReaderPage({
    super.key,
    required this.page,
    required this.session,
  });

  final SummaryPage page;
  final ReadingSession session;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: page,
      builder: (context, _) {
        final waiting =
            !page.hasContent && !page.done && page.error == null;
        return Stack(
          fit: StackFit.expand,
          children: [
            // Sharp photo while waiting…
            AnimatedOpacity(
              opacity: waiting ? 1 : 0,
              duration: const Duration(milliseconds: 500),
              child: Image.file(
                File(page.photoPath),
                fit: BoxFit.cover,
              ),
            ),
            // …crossfades to heavily blurred background on first tokens.
            AnimatedOpacity(
              opacity: waiting ? 0 : 1,
              duration: const Duration(milliseconds: 500),
              child: ImageFiltered(
                imageFilter: ImageFilter.blur(
                    sigmaX: 22, sigmaY: 22),
                child: Image.file(
                  File(page.photoPath),
                  fit: BoxFit.cover,
                ),
              ),
            ),
            if (waiting)
              const ScanOverlay(key: Key('scanOverlay'))
            else
              // Book pages blur to near-white, so the scrim must be
              // dark enough for white text to stay readable.
              Container(color: Colors.black.withValues(alpha: 0.68)),
            SafeArea(
              child: Padding(
                padding: const EdgeInsets.fromLTRB(24, 64, 24, 96),
                child: _body(context),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _body(BuildContext context) {
    if (page.error != null) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.cloud_off,
                color: Colors.white70, size: 48),
            const SizedBox(height: 12),
            Text(
              'Summary failed:\n${page.error}',
              key: const Key('summaryError'),
              textAlign: TextAlign.center,
              style: const TextStyle(color: Colors.white),
            ),
            const SizedBox(height: 16),
            ElevatedButton(
              key: const Key('retryButton'),
              onPressed: () => session.retry(page),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }
    if (!page.hasContent) {
      return const SizedBox.shrink();
    }
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            padding: const EdgeInsets.symmetric(
                horizontal: 10, vertical: 4),
            decoration: BoxDecoration(
              color: Colors.black54,
              borderRadius: BorderRadius.circular(12),
            ),
            child: Text(
              page.level.label,
              style: const TextStyle(
                  color: Colors.white, fontSize: 12),
            ),
          ),
          const SizedBox(height: 12),
          Text(
            page.done ? page.text : '${page.text}▍',
            key: const Key('summaryText'),
            style: const TextStyle(
              color: Colors.white,
              fontSize: 21,
              height: 1.55,
              shadows: [
                Shadow(
                  color: Colors.black87,
                  blurRadius: 8,
                  offset: Offset(0, 1),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// "Scanning" shimmer shown over the photo while the first tokens arrive.
class ScanOverlay extends StatefulWidget {
  const ScanOverlay({super.key});

  @override
  State<ScanOverlay> createState() => _ScanOverlayState();
}

class _ScanOverlayState extends State<ScanOverlay>
    with SingleTickerProviderStateMixin {
  late final AnimationController _controller;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 1600),
    )..repeat();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AnimatedBuilder(
      animation: _controller,
      builder: (context, _) => CustomPaint(
        painter: _ScanPainter(progress: _controller.value),
      ),
    );
  }
}

class _ScanPainter extends CustomPainter {
  _ScanPainter({required this.progress});

  final double progress;

  @override
  void paint(Canvas canvas, Size size) {
    final y = size.height * progress;
    final band = Rect.fromLTWH(0, y - 60, size.width, 120);
    final paint = Paint()
      ..shader = LinearGradient(
        begin: Alignment.topCenter,
        end: Alignment.bottomCenter,
        colors: [
          Colors.tealAccent.withValues(alpha: 0.0),
          Colors.tealAccent.withValues(alpha: 0.25),
          Colors.tealAccent.withValues(alpha: 0.0),
        ],
      ).createShader(band);
    canvas.drawRect(band, paint);
    canvas.drawLine(
      Offset(0, y),
      Offset(size.width, y),
      Paint()
        ..color = Colors.tealAccent
        ..strokeWidth = 3,
    );
  }

  @override
  bool shouldRepaint(_ScanPainter old) => old.progress != progress;
}
