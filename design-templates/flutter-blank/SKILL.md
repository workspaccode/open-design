---
name: flutter-blank
description: |
  A Flutter mobile application template using GoRouter + Riverpod.
  Produces a real Flutter project with Dart source files that the daemon
  compiles to Flutter Web and previews in an iframe. Use when the brief
  asks for any Flutter, Dart, or mobile app built with Flutter technology.
triggers:
  - flutter dart app
  - build flutter screens
  - flutter todo
  - flutter mobile dart
  - "flutter"
  - "flutter app"
  - "dart"
  - "mobile app flutter"
  - "todo app flutter"
  - "flutter ui"
  - "premium ui flutter"
  - "primume ui flutter"
  - "flutter screens"
  - "تطبيق flutter"
  - "flutter移动应用"
anti_triggers:
  - DO NOT match if user asks for HTML prototype
  - DO NOT match if user says "web page"
od:
  mode: template
  output: dart
  runtime: flutter-web
  platform: mobile
  scenario: flutter
  preview:
    type: flutter
    entry: lib/main.dart
    build_command: flutter build web --release
    preview_route: /api/flutter/preview/{projectName}
  design_system:
    requires: false
  craft:
    requires: []
---

# Flutter Blank Template

## ⚠️ CRITICAL INSTRUCTION

DO NOT write HTML, CSS, or JavaScript.
DO NOT create prototype files.

You MUST:
1. Copy `design-templates/flutter-blank/template/` as the project seed
2. Write `.dart` files only inside `lib/`
3. Use GoRouter for navigation
4. Use Riverpod for state
5. After writing all files, emit ONE html artifact to trigger the build:
   <artifact identifier="flutter-build-trigger" type="text/html" title="Build Flutter Preview">
   <!doctype html>
   <html>
   <head>
     <meta charset="utf-8">
     <title>Building Flutter...</title>
     <style>body { font-family: sans-serif; padding: 2rem; color: white; background: #0f1117; }</style>
   </head>
   <body>
     <h2>🚀 Building Flutter App...</h2>
     <p>Please wait while the daemon compiles the web output.</p>
     <script>
       // 1. Trigger the backend build
       fetch('/api/flutter/build', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           projectPath: "{cwd}/{projectName}",
           projectName: "{projectName}"
         })
       }).then(() => {
         // 2. Poll status until ready
         const check = setInterval(() => {
           fetch('/api/flutter/status/{projectName}')
             .then(r => r.json())
             .then(data => {
               if (data.status === 'ready') {
                 clearInterval(check);
                 window.location.href = data.previewUrl;
               } else if (data.status === 'error') {
                 clearInterval(check);
                 document.body.innerHTML += '<p style="color:red">Build failed.</p>';
               }
             }).catch(e => console.error(e));
         }, 2000);
       }).catch(e => {
         document.body.innerHTML += '<p style="color:red">Failed to start build.</p>';
       });
     </script>
   </body>
   </html>
   </artifact>

Build a complete Flutter mobile application with **GoRouter** navigation
and **Riverpod** state management. The daemon compiles it with
`flutter build web` and serves it live in an iframe.

## Resource map

```
flutter-blank/
├── SKILL.md                      ← you are reading this
├── example.html                  ← gallery preview (HTML mockup)
├── references/
│   ├── patterns.md               ← screen archetypes & widget patterns
│   └── checklist.md              ← pre-build self-review
└── template/                     ← seed Flutter project (copy to CWD)
    ├── pubspec.yaml
    ├── lib/
    │   ├── main.dart
    │   ├── router/
    │   │   └── app_router.dart
    │   ├── theme/
    │   │   └── app_theme.dart
    │   ├── providers/
    │   │   └── app_providers.dart
    │   ├── screens/              ← add screens here
    │   │   └── home_screen.dart
    │   ├── widgets/              ← shared reusable widgets
    │   └── models/               ← data models
    └── web/
        └── index.html
```

## Workflow

### Step 0 — Understand the brief

Identify from the user's prompt:
- **App purpose** (todo, notes, e-commerce, social, etc.)
- **Screen count** — start with 2–4 screens maximum
- **Visual style** — light/dark, color palette, mood
- **Key features** — what the app must do on first run

### Step 1 — Copy the seed

Copy the entire `template/` directory into the project working directory
and rename it to match the app (e.g. `my_todo_app/`). This gives you a
valid Flutter project that the daemon can compile immediately.

### Step 2 — Plan the screens

Pick from `references/patterns.md`:

| Brief language | Screen type |
|---|---|
| list, tasks, todos, inbox, feed | A — List Screen |
| detail, view, article, item, profile | B — Detail Screen |
| sign-in, login, welcome, onboarding | C — Auth/Onboarding |
| settings, preferences, account | D — Settings |
| home, dashboard, overview | E — Dashboard |
| form, create, edit, new item | F — Form/Input |

### Step 3 — Implement screens

For each screen, create `lib/screens/<name>_screen.dart`:

```dart
// Pattern for every screen:
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

class HomeScreen extends ConsumerWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Scaffold(
      // ... implementation
    );
  }
}
```

### Step 4 — Wire routing

Add routes in `lib/router/app_router.dart`:

```dart
GoRoute(
  path: '/screen-name',
  builder: (context, state) => const ScreenNameScreen(),
),
```

Navigate with `context.go('/screen-name')` — never use Navigator.push.

### Step 5 — Style with the theme

- Use `Theme.of(context).colorScheme.*` for all colors — never hardcode
- Use `Theme.of(context).textTheme.*` for typography
- Customize `AppTheme` in `lib/theme/app_theme.dart` to match the brief

### Step 6 — Trigger the build

After writing all files, emit the build instruction artifact:

```
<artifact identifier="flutter-build-trigger" type="application/json" title="Build Flutter Preview">
{
  "action": "flutter_build",
  "projectPath": "{cwd}/{projectName}",
  "projectName": "{projectName}"
}
</artifact>
```

The daemon reads this artifact and calls `POST /api/flutter/build`
automatically, streaming the build log and showing the preview iframe
when ready.

## Hard rules

- **One feature per screen.** No god-widgets that do everything.
- **GoRouter only.** Never use `Navigator.push` or `Navigator.pop` —
  always `context.go()` or `context.push()`.
- **Riverpod for state.** Use `StateNotifierProvider` or
  `AsyncNotifierProvider` — never `setState` inside a `ConsumerWidget`
  unless it's purely local UI state (e.g. a form field focus).
- **const constructors everywhere.** Mark every widget `const` when
  possible for performance.
- **No hardcoded colors.** Always derive from `ColorScheme`.
- **No hardcoded sizes.** Use `MediaQuery` or layout widgets —
  `Flexible`, `Expanded`, `SizedBox` with `double.infinity`.
- **pubspec.yaml versions.** Keep Flutter SDK `>=3.16.0` and Dart
  SDK `>=3.2.0`. Use pinned versions for packages.
- **Single root widget.** `main.dart` calls `runApp(ProviderScope(child: MyApp()))`.

## Package versions (pinned)

```yaml
dependencies:
  flutter:
    sdk: flutter
  go_router: ^13.2.0
  flutter_riverpod: ^2.4.10
  riverpod_annotation: ^2.3.4

dev_dependencies:
  flutter_test:
    sdk: flutter
  flutter_lints: ^3.0.0
  build_runner: ^2.4.8
  riverpod_generator: ^2.3.9
```

## Common mistakes to avoid

- ❌ `Navigator.of(context).push(...)` → ✅ `context.go('/route')`
- ❌ `Color(0xFF...)` hardcoded → ✅ `theme.colorScheme.primary`
- ❌ `setState(() {...})` in ConsumerWidget → ✅ `ref.read(provider.notifier).method()`
- ❌ Missing `const` on leaf widgets → ✅ `const Text('Hello')`
- ❌ Forgetting `ProviderScope` at root → ✅ Always wrap `MyApp` in `ProviderScope`
