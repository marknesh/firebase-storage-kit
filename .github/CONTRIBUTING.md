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

This is a Bun + Turbo monorepo.

```
packages/firebase-storage-kit/   # published library
apps/docs/                       # documentation site (Fumadocs + Next.js)
```

All library source, tests, and the package README are in `packages/firebase-storage-kit/`.

The docs site lives in `apps/docs/`. Content is MDX under `apps/docs/content/docs/`.

## Development commands

From the repo root:

```bash
bun run check        # lint and format (runs prepare:docs first — see below)
bun run fix          # auto-fix lint and format issues
bun run prepare:docs # generate docs MDX and Next.js route types
bun run test         # run tests across packages
bun run build        # build all packages
bun run typecheck    # type-check all packages
bun run dev          # watch mode (via Turbo)
bun run dev:docs     # docs site only (http://localhost:3000/docs)
bun run changeset    # create a changeset for versioning
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
   bun run check
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

## Documentation site

The docs app uses [Fumadocs](https://www.fumadocs.dev/docs/) and deploys to Vercel.

### Why `prepare:docs` runs before `check`

`bun run check` runs `prepare:docs` before linting. The docs app depends on generated files that are not committed to git:

- `fumadocs-mdx` — compiles MDX content into the `.source` directory
- `next typegen` — generates Next.js route types (e.g. `PageProps`) in `apps/docs/.next/types`

Type-aware linting in `check` needs those files to resolve types in `apps/docs/`. Without running `prepare:docs` first, lint fails on a fresh clone even when the source code is correct.

To generate docs files without linting:

```bash
bun run prepare:docs
```

**Local development:**

```bash
bun run dev:docs
```

Open [http://localhost:3000/docs](http://localhost:3000/docs).

**Vercel project settings:**

- Root Directory: `apps/docs`
- Install Command: `cd ../.. && bun install`
- Build Command: `cd ../.. && bun run build --filter=docs`

Edit pages in `apps/docs/content/docs/`. Navigation is controlled by `meta.json` files in each folder.

## Pull request checklist

- [ ] I have linked the related issue (if applicable)
- [ ] I have written tests
- [ ] I have verified lint passes (`bun run check`)
- [ ] I have verified typecheck passes (`bun run typecheck`)
- [ ] I have added a changeset if this PR affects the published version

## Code of conduct

This project follows the [Contributor Covenant](/.github/CODE_OF_CONDUCT.md). By participating, you agree to uphold it.

## Questions

Open an [issue](https://github.com/marknesh/firebase-storage-kit/issues) for bugs or feature requests. For usage help, see the [documentation site](https://firebase-storage-kit.vercel.app/docs) or the [README](/packages/firebase-storage-kit/README.md).
