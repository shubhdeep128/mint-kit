# Generated App Guide

Mint creates a small but complete Expo app shell.

## Structure

```text
app.json
eas.json
src/app
src/onboarding
src/providers
server/src
CLAUDE.md
AGENTS.md
```

## Expo Router

Routes live in `src/app`.

The generated app starts with:

- `src/app/_layout.tsx`
- `src/app/index.tsx`
- `src/app/onboarding.tsx`

The structure is intentionally simple so agents and non-developers can extend it without fighting a large starter template.

## Onboarding

Onboarding is driven by `src/onboarding/onboardingMachine.ts`.

Add steps to the machine instead of hard-coding screen order in route files. The default flow includes a paywall-ready step so RevenueCat can be attached without rewriting navigation.

## Providers

Provider helpers live in `src/providers`:

- `supabase.ts`
- `revenuecat.ts`
- `posthog.ts`

App code should import these helpers instead of creating provider clients throughout the app.

## Backend

Mint includes a Hono TypeScript server in `server/src`.

Commands:

```bash
pnpm server:dev
pnpm server:typecheck
```

Use the server for server-only Supabase work and API routes. Keep client-safe env vars in `.env.local` with the `EXPO_PUBLIC_` prefix.

## Agent Rules

Mint writes:

- `CLAUDE.md`
- `AGENTS.md`

These files tell future coding agents to preserve the Expo Router structure, extend onboarding through the state machine, use Supabase/RevenueCat/PostHog helpers, and run quality gates before handing back changes.

## Quality Gates

Generated app commands:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm format:check
```

Before shipping:

```bash
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm start
```
