# Flutter Screen Patterns

Six screen archetypes the agent can assemble. Each pattern maps to a
Flutter `ConsumerWidget` skeleton.

---

## A — List Screen

**Use when:** todos, tasks, inbox, feed, messages, notifications

```dart
class ListScreen extends ConsumerWidget {
  const ListScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final items = ref.watch(itemsProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('My List')),
      body: items.when(
        data: (data) => ListView.separated(
          padding: const EdgeInsets.symmetric(vertical: 8),
          itemCount: data.length,
          separatorBuilder: (_, __) => const Divider(height: 1),
          itemBuilder: (context, index) {
            final item = data[index];
            return ListTile(
              title: Text(item.title),
              subtitle: Text(item.subtitle),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => context.go('/detail/${item.id}'),
            );
          },
        ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('Error: $e')),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => context.push('/create'),
        child: const Icon(Icons.add),
      ),
    );
  }
}
```

---

## B — Detail Screen

**Use when:** article, product detail, user profile, item view

```dart
class DetailScreen extends ConsumerWidget {
  const DetailScreen({super.key, required this.id});
  final String id;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final item = ref.watch(itemProvider(id));

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            title: Text(item?.title ?? ''),
            expandedHeight: 240,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(color: theme.colorScheme.primaryContainer),
            ),
          ),
          SliverPadding(
            padding: const EdgeInsets.all(16),
            sliver: SliverList(
              delegate: SliverChildListDelegate([
                Text(item?.body ?? '', style: theme.textTheme.bodyLarge),
              ]),
            ),
          ),
        ],
      ),
    );
  }
}
```

---

## C — Auth / Onboarding Screen

**Use when:** login, sign-up, welcome, walkthrough

```dart
class OnboardingScreen extends StatelessWidget {
  const OnboardingScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Icon(Icons.star, size: 80, color: theme.colorScheme.primary),
              const SizedBox(height: 32),
              Text('Welcome', style: theme.textTheme.displaySmall),
              const SizedBox(height: 12),
              Text('Your app tagline here.', style: theme.textTheme.bodyLarge),
              const Spacer(),
              FilledButton(
                onPressed: () => context.go('/home'),
                child: const Text('Get Started'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: () => context.go('/login'),
                child: const Text('Sign In'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
```

---

## D — Settings Screen

**Use when:** preferences, account, configuration

```dart
class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        children: [
          const _SectionHeader('Account'),
          ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Profile'),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => context.push('/profile'),
          ),
          const Divider(),
          const _SectionHeader('Preferences'),
          SwitchListTile(
            title: const Text('Notifications'),
            secondary: const Icon(Icons.notifications_outlined),
            value: true,
            onChanged: (v) {},
          ),
        ],
      ),
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.title);
  final String title;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
      child: Text(title, style: Theme.of(context).textTheme.labelMedium),
    );
  }
}
```

---

## E — Dashboard / Home

**Use when:** overview, stats, multiple widgets on one screen

```dart
class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    return Scaffold(
      appBar: AppBar(
        title: const Text('Dashboard'),
        actions: [
          IconButton(icon: const Icon(Icons.notifications_outlined), onPressed: () {}),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Summary cards
            Row(children: [
              Expanded(child: _StatCard(label: 'Total', value: '42', icon: Icons.bar_chart)),
              const SizedBox(width: 12),
              Expanded(child: _StatCard(label: 'Done', value: '18', icon: Icons.check_circle_outline)),
            ]),
            const SizedBox(height: 24),
            Text('Recent', style: theme.textTheme.titleMedium),
            // ... recent items list
          ],
        ),
      ),
    );
  }
}
```

---

## F — Form / Input Screen

**Use when:** create, edit, new item, search with input

```dart
class FormScreen extends ConsumerStatefulWidget {
  const FormScreen({super.key});

  @override
  ConsumerState<FormScreen> createState() => _FormScreenState();
}

class _FormScreenState extends ConsumerState<FormScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();

  @override
  void dispose() {
    _titleController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('New Item'),
        actions: [
          TextButton(
            onPressed: _submit,
            child: const Text('Save'),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _titleController,
              decoration: const InputDecoration(
                labelText: 'Title',
                border: OutlineInputBorder(),
              ),
              validator: (v) => (v?.isEmpty ?? true) ? 'Required' : null,
            ),
          ],
        ),
      ),
    );
  }

  void _submit() {
    if (!_formKey.currentState!.validate()) return;
    // Save and navigate back
    context.pop();
  }
}
```

---

## Riverpod Provider patterns

```dart
// Simple list
final itemsProvider = FutureProvider<List<Item>>((ref) async {
  return ItemRepository().fetchAll();
});

// Single item
final itemProvider = FutureProvider.family<Item?, String>((ref, id) async {
  return ItemRepository().fetchById(id);
});

// Mutable state
class ItemsNotifier extends AsyncNotifier<List<Item>> {
  @override
  Future<List<Item>> build() => ItemRepository().fetchAll();

  Future<void> add(Item item) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final updated = [...(state.value ?? []), item];
      return updated;
    });
  }
}

final itemsNotifierProvider =
    AsyncNotifierProvider<ItemsNotifier, List<Item>>(ItemsNotifier.new);
```
