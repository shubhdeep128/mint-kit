# Mint

Mint is an opinionated app-shell generator for people who want to build and ship mobile apps quickly without re-deciding the stack every time.

It creates an Expo Router app with Supabase, RevenueCat, PostHog, EAS, an extensible onboarding state machine, a TypeScript backend, quality tooling, and agent rules for future AI-assisted development.

## Quick Start

```bash
pnpm dlx mintstack@latest new dreamcoach
```

or:

```bash
npx mintstack@latest new dreamcoach
```

Mint validates provider access first, then applies provider resources together. If apply fails, Mint rolls back resources it created during that run and removes the generated local app directory.

If provider access is missing, the setup flow pauses, shows the exact command or credential it needs, and re-validates when you return. `mint connect` exists for pre-seeding credentials and repairs; `mint new` is the main path.

## What Mint Creates

- Expo SDK 56 app using Expo Router primitives.
- Supabase client env plus server env for auth, database, storage, and backend access.
- RevenueCat app SDK keys and app records.
- PostHog analytics env and project token.
- EAS project link in `app.json`.
- Extensible onboarding state machine with a paywall step.
- Hono TypeScript backend in `server/src`.
- ESLint, Prettier, TypeScript, Vitest, and quality scripts.
- `CLAUDE.md` and `AGENTS.md` rules so future agents know how to extend the app safely.

## Provider Access

Mint can use provider credentials from the shell, from saved local state, or from the guided setup flow inside `mint new`.

To pre-seed credentials before creating an app:

```bash
mint connect supabase --login
mint connect revenuecat --api-key <sk_or_atk>
mint connect posthog --personal-api-key <phx_or_pat>
mint connect expo --expo-token <expo_token>
```

Then run:

```bash
mint new dreamcoach
```

Provider behavior is intentionally conservative:

- Supabase projects are created only after all providers validate.
- RevenueCat OAuth tokens (`atk_...`) can create a new project. Project-scoped secret keys (`sk_...`) use an accessible existing project and create app records there.
- PostHog creates a project when the account allows it. If the account is capped, Mint uses an accessible existing project and writes its public project token.
- EAS uses `eas-cli@latest` and can initialize before dependencies are installed.

See [Provider Setup](docs/providers.md) for details.

## Generated App Commands

After `mint new` completes:

```bash
cd dreamcoach
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm start
```

The generated app also includes:

```bash
pnpm server:dev
pnpm server:typecheck
pnpm format
pnpm format:check
```

## CLI Commands

```bash
mint new <app-name>
mint doctor
mint connect
mint connect supabase
mint connect revenuecat
mint connect posthog
mint connect expo
```

Create only the local app shell, without provider setup:

```bash
mint new dreamcoach --no-connect
```

Render plain output for CI or non-interactive terminals:

```bash
mint new dreamcoach --plain
mint doctor --json
```

## Documentation

- [Installation Guide](docs/installation.md)
- [Provider Setup](docs/providers.md)
- [Generated App Guide](docs/generated-app.md)
- [Publishing Guide](docs/publishing.md)

## Local Development

```bash
pnpm install
pnpm dev new dreamcoach --dry-run
pnpm verify
```

`pnpm verify` runs tests, typecheck, build, dist smoke tests, and packed-package smoke tests.

## Publishing

Mint is published as `mintstack` and exposes the `mint` binary.

```bash
pnpm verify
npm login
npm publish --access public
```

See [Publishing Guide](docs/publishing.md) for the full release checklist.

## License

MIT
