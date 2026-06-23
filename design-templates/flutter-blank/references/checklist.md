# Flutter Blank — Pre-Build Checklist

Run this before triggering the daemon build.

## P0 — Will it compile?

- [ ] `pubspec.yaml` has correct `sdk` constraint (`>=3.2.0`)
- [ ] All imports reference real files that exist in `lib/`
- [ ] No `Navigator.push` / `Navigator.pop` — using GoRouter everywhere
- [ ] `main()` wraps `MyApp` in `ProviderScope`
- [ ] `appRouterProvider` is a Riverpod `Provider<GoRouter>`
- [ ] Every screen path is registered in `app_router.dart`

## P1 — Architecture

- [ ] No `setState` inside `ConsumerWidget` (only `ConsumerStatefulWidget`)
- [ ] All state mutations go through a Riverpod notifier
- [ ] `Theme.of(context).colorScheme.*` used — no hardcoded `Color(0xFF...)`
- [ ] All widgets use `const` constructors where possible

## P2 — UX quality

- [ ] App title set in `main.dart` (`title: 'My App'`)
- [ ] `AppTheme.light()` seed color matches the brief's palette
- [ ] Home screen is not still the placeholder — real content is there
- [ ] FloatingActionButton present if the screen supports item creation
- [ ] Error and loading states handled in every `AsyncValue.when()`

## Quick fixes

| Problem | Fix |
|---------|-----|
| `Navigator.push` compile error | Replace with `context.go('/route')` |
| `ProviderScope` missing | Wrap `runApp()` argument in `ProviderScope(child: ...)` |
| Unknown route | Add `GoRoute(path: '/route', ...)` to `appRouterProvider` |
| Hardcoded color | `Color(0xFFABCDEF)` → `theme.colorScheme.primary` |
| Missing `const` | Add `const` keyword before widget constructor |
