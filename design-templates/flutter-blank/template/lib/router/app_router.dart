import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../screens/home_screen.dart';

/// The application router — add new GoRoute entries here.
final appRouterProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    debugLogDiagnostics: false,
    routes: [
      GoRoute(
        path: '/',
        name: 'home',
        builder: (context, state) => const HomeScreen(),
      ),
      // TODO: add more routes here
      // GoRoute(
      //   path: '/detail/:id',
      //   name: 'detail',
      //   builder: (context, state) => DetailScreen(id: state.pathParameters['id']!),
      // ),
    ],
  );
});
