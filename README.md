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

Inspect what Mint needs:

```bash
mint connect supabase
```

Link an existing Supabase project:

```bash
mint connect supabase --project-ref your-project-ref
```

Mint runs `supabase link --project-ref <ref>` when the Supabase CLI is available. If it is not available directly, Mint falls back to `npx --yes supabase link --project-ref <ref>`. It writes `.mint/connect-state.json` only after the link command succeeds.

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
