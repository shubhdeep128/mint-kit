# Mint

Mint creates and connects opinionated Expo app shells with Supabase, RevenueCat, PostHog, EAS, onboarding, auth, and agent rules.

## Usage

```bash
pnpm dlx @usemint/cli@latest new dream-coach
npx @usemint/cli@latest new dream-coach
```

After global install:

```bash
pnpm add -g @usemint/cli
mint new dream-coach
```

## Local Verification

```bash
pnpm verify
```

## Supabase Connect

Connect the Supabase CLI to your account:

```bash
mint connect supabase --login
```

Create a Supabase project, link it locally, fetch API keys, and write Expo env:

```bash
mint connect supabase --create
```

Dry-run the exact commands first:

```bash
mint connect supabase --create --project-name dream-coach --org-id your-org-slug --dry-run
```

Mint uses `supabase` when the CLI is available and falls back to `npx --yes supabase` otherwise. The create flow runs `projects create`, links the created project, fetches project API keys, writes `.env.local`, and records Supabase in `.mint/connect-state.json`.

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
