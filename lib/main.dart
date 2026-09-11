import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';

import 'camera_service.dart';

void main() {
  runApp(const DiagonalApp());
}

class DiagonalApp extends StatelessWidget {
  const DiagonalApp({super.key, this.cameras});

  final CameraService? cameras;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'diagonal hello camera',
      theme: ThemeData(colorScheme: .fromSeed(seedColor: Colors.teal)),
      home: CameraPage(cameras: cameras),
    );
  }
}

class CameraPage extends StatefulWidget {
  const CameraPage({super.key, this.cameras});

  final CameraService? cameras;

  @override
  State<CameraPage> createState() => _CameraPageState();
}

class _CameraPageState extends State<CameraPage> {
  late final CameraService _cameras;
  bool _ready = false;
  String? _error;
  String? _lastPhotoPath;
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _cameras = widget.cameras ?? createCameraService();
    _init();
  }

  Future<void> _init() async {
    try {
      await _cameras.init();
      setState(() => _ready = true);
    } catch (e) {
      setState(() => _error = e.toString());
    }
  }

  Future<void> _takePicture() async {
    setState(() => _busy = true);
    try {
      final path = await _cameras.takePicture();
      setState(() => _lastPhotoPath = path);
      if (mounted && path != null) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Pic saved: $path')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Capture failed: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  void dispose() {
    _cameras.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final CameraController? controller = _cameras.controller;
    final bool showPreview =
        controller != null && _ready && controller.value.isInitialized;

    return Scaffold(
      appBar: AppBar(title: const Text('diagonal hello camera')),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            mainAxisAlignment: .center,
            children: [
              if (_error != null)
                Text('Camera error: $_error',
                    key: const Key('cameraError')),
              if (_error == null && !_ready)
                const CircularProgressIndicator(
                    key: Key('cameraLoading')),
              if (_error == null && _ready) ...[
                if (showPreview)
                  AspectRatio(
                    aspectRatio: controller.value.aspectRatio,
                    child: CameraPreview(controller),
                  )
                else
                  Container(
                    key: const Key('fakePreview'),
                    height: 240,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      border: Border.all(),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: const Text(
                      'Fake camera preview (Linux/test)\nPress the button to take a pic',
                      textAlign: TextAlign.center,
                    ),
                  ),
                const SizedBox(height: 16),
                ElevatedButton.icon(
                  key: const Key('captureButton'),
                  onPressed: _busy ? null : _takePicture,
                  icon: const Icon(Icons.camera_alt),
                  label: Text(_busy ? 'Taking pic…' : 'Take a pic'),
                ),
                const SizedBox(height: 16),
                if (_lastPhotoPath != null) ...[
                  const Text('Last pic:'),
                  const SizedBox(height: 8),
                  Image.file(
                    File(_lastPhotoPath!),
                    key: const Key('lastPhoto'),
                    height: 240,
                  ),
                  const SizedBox(height: 8),
                  Text(_lastPhotoPath!,
                      key: const Key('lastPhotoPath'),
                      style: Theme.of(context).textTheme.bodySmall),
                ],
              ],
            ],
          ),
        ),
      ),
    );
  }
}
