import 'package:flutter/material.dart';

/// App-wide theme configuration.
///
/// Customize the seed color, typography, and shape here.
/// All screens must derive colors from [Theme.of(context).colorScheme]
/// and never use hardcoded Color values.
abstract final class AppTheme {
  /// Light theme — change [seedColor] to match the brief.
  static ThemeData light({Color seedColor = const Color(0xFF6750A4)}) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: seedColor,
        brightness: Brightness.light,
      ),
      typography: Typography.material2021(),
    );
  }

  /// Dark theme.
  static ThemeData dark({Color seedColor = const Color(0xFF6750A4)}) {
    return ThemeData(
      useMaterial3: true,
      colorScheme: ColorScheme.fromSeed(
        seedColor: seedColor,
        brightness: Brightness.dark,
      ),
      typography: Typography.material2021(),
    );
  }
}
