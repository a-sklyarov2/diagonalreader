package com.diagonalreader.app

import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity (not FlutterActivity): RevenueCat's paywall
// presents as an Android Fragment and crashes without a fragment host.
class MainActivity : FlutterFragmentActivity()
