# Publishing Guide

Mint is published to npm as `mintstack`.

## Preflight

```bash
pnpm install
pnpm verify
npm pack --dry-run
```

`pnpm verify` runs:

- tests
- TypeScript typecheck
- production build
- dist smoke tests
- packed-package smoke tests

## Version

Use semantic versions:

```bash
npm version patch
```

For the first public release:

```bash
npm version 0.1.0
```

Do not reuse a version that has already been published to npm.

## Publish

```bash
npm login
npm whoami
npm publish --access public
```

If your npm account requires one-time passwords:

```bash
npm publish --access public --otp <code>
```

## Verify Install

After publishing:

```bash
pnpm dlx mintstack@latest new smoke-app --dry-run --plain
npx mintstack@latest doctor --json
```

## GitHub Release

After the npm package is live:

```bash
git push --follow-tags
gh release create v0.1.0 --generate-notes
```

Keep releases boring and clear: explain provider behavior changes, generated app changes, and any migration notes.
