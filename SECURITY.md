# Security

Mint handles provider management credentials locally. Do not commit provider tokens, generated app env files, or `.mint/connect-state.json`.

## Supported Versions

Mint is pre-1.0. Security fixes target the latest published version.

## Reporting

Please report security issues privately by opening a GitHub security advisory or contacting the repository owner.

Do not include live provider credentials in public issues.

## Credential Handling

Mint stores provider credentials in local ignored env files when you use `mint connect`.

Generated apps use:

- `.env.local` for Expo public runtime variables.
- `server/.env` for server-only Supabase values.
- `.mint/connect-state.json` for provider IDs and non-secret state.

These files are ignored by the generated app scaffold.
