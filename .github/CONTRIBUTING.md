# Contributing to firebase-storage-kit

Thanks for your interest in contributing! This guide covers local development and the pull request process.

## Prerequisites

- [Bun](https://bun.sh) `1.3.13` (see `packageManager` in the root `package.json`)

## Getting started

```bash
git clone https://github.com/marknesh/firebase-storage-kit.git
cd firebase-storage-kit
bun install --frozen-lockfile
```

## Monorepo layout

This is a Bun + Turbo monorepo. The published package lives at:

```
packages/firebase-storage-kit/
```

All library source, tests, and the package README are in that directory.

## Development commands

From the repo root:

```bash
bun run test       # run tests across packages
bun run build      # build all packages
bun run typecheck  # type-check all packages
bun run dev        # watch mode (via Turbo)
```

To run tests for the library only:

```bash
cd packages/firebase-storage-kit
bun test
```

## Making changes

1. Fork the repo and create a branch from `main`.
2. Keep each PR focused, and follow the style of the existing code.
3. Add or update tests in `packages/firebase-storage-kit/tests/` when behavior changes.
4. Ensure CI passes locally:

   ```bash
   bun run test
   bun run typecheck
   ```

5. Open a pull request to `main`.

## Versioning with Changesets

Changes that affect the published package require a [changeset](https://github.com/changesets/changesets). From the repo root:

```bash
bun run changeset
```

Choose the appropriate bump:

- **patch** — bug fixes
- **minor** — new features, backward compatible
- **major** — breaking API changes

Docs-only or internal refactors that don't affect the published package do not need a changeset.

## Pull request checklist

- [ ] I have linked the related issue (if applicable)
- [ ] I have written tests
- [ ] I have verified typecheck passes (`bun run typecheck`)
- [ ] I have added a changeset if this PR affects the published version

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Questions

Open an [issue](https://github.com/marknesh/firebase-storage-kit/issues) for bugs or feature requests. For usage help, see the [README](../packages/firebase-storage-kit/README.md).
