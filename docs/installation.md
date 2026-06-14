# Installation Guide

Mint is designed to be run without a permanent install.

## Requirements

- Node.js 20 or newer
- pnpm 10 or newer, or npm 10 or newer
- Git
- Supabase account
- RevenueCat account
- PostHog account
- Expo account with an access token for EAS

Mint can use provider CLIs through `npx`, so users do not need to globally install Supabase or EAS before starting.

## Run With pnpm dlx

```bash
pnpm dlx mint-kit@latest new dreamcoach
```

## Run With npx

```bash
npx mint-kit@latest new dreamcoach
```

## Global Install

```bash
pnpm add -g mint-kit
mint new dreamcoach
```

## Local Development Install

For contributors:

```bash
git clone https://github.com/shubhdeep128/mint-kit.git
cd mint-kit
pnpm install
pnpm dev new dreamcoach --dry-run
pnpm verify
```

## First App Setup

The cleanest flow is the single app creation command:

```bash
pnpm dlx mint-kit@latest new dreamcoach
```

If provider access is missing, Mint pauses, tells you exactly what to run or paste, and re-validates when you return. It does not create provider resources until Supabase, RevenueCat, PostHog, and Expo/EAS are all ready.

You can also pre-seed credentials first:

```bash
mint connect supabase --login
mint connect revenuecat --api-key <sk_or_atk>
mint connect posthog --personal-api-key <phx_or_pat>
mint connect expo --expo-token <expo_token>
mint new dreamcoach
```

If all provider credentials are already present in the shell, you can skip the connect commands:

```bash
export REVENUECAT_API_KEY=<sk_or_atk>
export POSTHOG_PERSONAL_API_KEY=<phx_or_pat>
export EXPO_TOKEN=<expo_token>
mint new dreamcoach
```

Supabase still needs an authenticated CLI session because project creation and linking go through the Supabase CLI.

## Generated App Verification

After Mint completes:

```bash
cd dreamcoach
pnpm install
pnpm typecheck
pnpm lint
pnpm test
pnpm start
```

Run Mint's app-aware doctor from inside the generated app:

```bash
mint doctor
```

## Troubleshooting

If provider access is missing, run the relevant connect command and retry `mint new`.

If a provider apply fails, Mint attempts rollback for resources created in that run and removes the generated app directory. Fix the credential or provider limit, then run the same `mint new <app-name>` command again.

If EAS fails before install, update Mint. Current Mint uses `eas-cli@latest` and temporarily strips Expo config plugins while EAS initializes, then restores them.
