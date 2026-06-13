# Mint

Mint creates and connects opinionated Expo app shells with Supabase, RevenueCat, PostHog, EAS, onboarding, auth, and agent rules.

## Usage

```bash
pnpm dlx @usemint/cli@latest new dream-coach
npx @usemint/cli@latest new dream-coach
```

`mint new` is the happy path: it creates the app shell, collects provider access, validates every provider, then applies provider resources together. `mint connect` is for repair, resume, or connecting services later.

After global install:

```bash
pnpm add -g @usemint/cli
mint new dream-coach
```

To create only the local shell and leave services for later:

```bash
mint new dream-coach --no-connect
```

## Local Verification

```bash
pnpm verify
```

## Supabase Connect

Inspect local Supabase tooling and account login:

```bash
mint connect supabase
```

Mint reports whether the direct `supabase` CLI is installed, whether `npx` fallback is available, which command it will use, and whether an account login is active.

Connect the Supabase CLI to your account:

```bash
mint connect supabase --login
```

This is interactive: Supabase may open a browser or ask for an access token. Mint streams that prompt directly in your terminal.

Stage Supabase project settings:

```bash
mint connect supabase --create
```

This does not create a hosted Supabase project by itself. Mint-owned resources are created only during the all-provider apply phase, after Supabase, RevenueCat, PostHog, Expo, and EAS are configured.

Dry-run the exact commands first:

```bash
mint connect supabase --create --project-name dream-coach --org-id your-org-slug --dry-run
```

Mint uses `supabase` when the CLI is available and falls back to `npx --yes supabase` otherwise. During the apply phase, Mint runs `projects create`, links the created project, fetches project API keys, writes `.env.local`, and records Supabase in `.mint/connect-state.json`. If any later apply step fails, Mint attempts to delete resources it created in that run.

If your Supabase account has multiple organizations, pass the organization explicitly:

```bash
mint connect supabase --create --org-id your-org-slug
```

To link an existing Supabase project instead of creating one:

```bash
mint connect supabase --project-ref your-project-ref
```

## Publishing

Mint is published as `@usemint/cli` and exposes a `mint` binary.

Before publishing:

```bash
pnpm verify
npm login
npm whoami
npm publish --access public
```

Consumers run it without installing:

```bash
pnpm dlx @usemint/cli@latest new dream-coach
npx @usemint/cli@latest new dream-coach
```

The unscoped package names `mint` and `create-mint-app` are not used by this project.
