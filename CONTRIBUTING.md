# Contributing

Thanks for helping improve Mint.

## Local Setup

```bash
pnpm install
pnpm verify
```

## Development

Run the CLI from source:

```bash
pnpm dev new dreamcoach --dry-run
pnpm dev doctor
```

Run the packed CLI smoke test before publishing-facing changes:

```bash
pnpm build
pnpm smoke:pack
```

## Pull Requests

- Keep changes scoped.
- Add or update tests when behavior changes.
- Run `pnpm verify` before opening a PR.
- Never commit `.env.local`, `.mint`, generated app secrets, or provider management keys.

## Release Changes

For release-related changes, update:

- `README.md`
- `docs/publishing.md`
- `package.json`
