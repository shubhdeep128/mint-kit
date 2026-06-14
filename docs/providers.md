# Provider Setup

Mint keeps provider setup strict: it validates every provider before creating resources, then applies resources together. This avoids half-configured app shells.

The normal path is `mint new <app-name>`. The `mint connect ...` commands below are useful for pre-seeding credentials, repairing a failed setup, or checking a single provider.

## Supabase

Mint uses Supabase for auth, database, storage, and server-side data access.

Pre-seed or repair the Supabase CLI session:

```bash
mint connect supabase --login
```

Mint can inspect the local state:

```bash
mint connect supabase
```

During `mint new`, Mint creates a project, links it locally, fetches API keys, writes `.env.local`, writes `server/.env`, and records state in `.mint/connect-state.json`.

If your Supabase account has multiple organizations, future Mint versions should expose explicit org selection in the main `new` flow. Today the repair command supports:

```bash
mint connect supabase --create --org-id <org-id-or-slug>
```

## RevenueCat

Mint uses RevenueCat for purchases, entitlements, and paywall-ready onboarding.

Accepted credentials:

- OAuth access token: `atk_...`
- API v2 secret key: `sk_...`

Rejected credentials:

- iOS public SDK keys: `appl_...`
- Android public SDK keys: `goog_...`
- Other public runtime keys

Pre-seed or repair:

```bash
mint connect revenuecat --api-key <sk_or_atk>
```

Behavior:

- `atk_...`: Mint can create a new RevenueCat project.
- `sk_...`: Mint uses the accessible existing RevenueCat project and creates iOS/Android app records inside it.

If a later provider fails, Mint deletes RevenueCat app records it created in that run. RevenueCat API v2 does not document project deletion, so project cleanup is manual when a newly created RevenueCat project is involved.

## PostHog

Mint uses PostHog for analytics.

Pre-seed or repair:

```bash
mint connect posthog --personal-api-key <phx_or_pat>
```

Optional host:

```bash
POSTHOG_HOST=https://us.posthog.com mint new dreamcoach
```

Behavior:

- Mint creates a PostHog project when the account allows it.
- If project creation is blocked by plan limits, Mint uses an accessible existing project and writes the public project token.
- If Mint created a PostHog project in the current run and a later provider fails, Mint deletes that project during rollback.

## Expo and EAS

Mint uses Expo account access to create or link the EAS project.

Create an Expo access token, then pre-seed or repair:

```bash
mint connect expo --expo-token <expo_token>
```

Mint runs:

```bash
npx --yes eas-cli@latest project:init --non-interactive --force
```

Because the generated app has config plugins before dependencies are installed, Mint temporarily removes `expo.plugins` from `app.json`, runs EAS init, then restores the plugins while keeping `extra.eas.projectId`.

## Environment Files

Generated app:

- `.env.local`: public Expo client variables only.
- `server/.env`: server-only Supabase values.
- `.mint/connect-state.json`: provider state and IDs, never provider management secrets.

Do not commit `.env.local`, `server/.env`, or `.mint`.
