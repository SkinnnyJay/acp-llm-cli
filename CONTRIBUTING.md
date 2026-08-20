# Contributing to `@simpill/acp-llm-cli`

Thank you for helping improve this project. This document covers workflow, branching, and what we expect in pull requests.

## Code of conduct

Be respectful and constructive. See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## Before you start

1. **Search existing issues and PRs** to avoid duplicate work.
2. For larger changes, **open an issue first** to align on design (optional but recommended).
3. **Set up locally:**
   - Node.js **20+**
   - `npm ci`
   - `npm run verify` (lint, typecheck, build, test) — use `npm run verify:coverage` for the coverage gate

## Source layout and file naming

- **`src/domain/`** — constants, shared types, model enums (no runtime I/O).
- **`src/runtime/`** — harness, connections, registry, factories, ports.
- **`src/providers/`** — one folder per CLI provider (adapter + schema + constants + CLI spec).
- **`src/cli/`** — generic CLI building blocks shared across providers.
- **`src/bootstrap.ts`** — registers default adapters and exposes default registry/factory helpers.

Filenames use **dot-separated** segments (`env.keys.ts`, `provider.factory.ts`). See [`src/README.md`](./src/README.md).

## Branching

This repository uses **GitHub Flow** (`main` + feature branches):

| Branch | Role |
|--------|------|
| **`main`** | Integration and release branch. Keep green. |
| **`feat/<short-name>`** / **`feature/<short-name>`** | Branched from `main`. One topic per branch. |

**Typical feature contribution:**

1. `git checkout main && git pull`
2. `git checkout -b feat/my-change`
3. Commit with clear messages (see below).
4. Open a **PR into `main`**.

If a `develop` branch is introduced later, maintainers will document Git Flow targets then.

### Optional Git Flow

Larger teams may use `develop` + `release/*` + `hotfix/*`. That is acceptable when those branches exist and are documented.

## Pull requests

- **One logical change per PR** when possible.
- **Describe the problem and the solution** in the PR body (use the template if present).
- **Update tests** when behavior changes; keep `npm run verify` passing.
- **Link related issues** (`Fixes #123`).

## Commits

- Prefer **imperative, present tense** subjects: `Add stream envelope guard`, not `Added`.
- Optional: [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `docs:`, `chore:`) for clearer changelogs.

## Publishing (maintainers)

- Bump version in `package.json` per semver.
- Tag releases on `main` (e.g. `v0.2.0`).
- `npm publish` (requires npm org access to `@simpill`).
- Ensure `package.json` `repository`, `bugs`, and `homepage` match the actual GitHub URL (update if the canonical repo moves).

### GitHub repository settings (recommended)

- **Branch protection** on `main` (and optionally `develop`): require PR before merge, require status checks (`CI` / `verify`), require branches up to date before merge.
- **Dependabot security updates** (enable in repo **Settings → Code security**).
- **Private vulnerability reporting** (Security tab) aligned with [SECURITY.md](./SECURITY.md).

## Security

Do not report vulnerabilities in public issues. See [SECURITY.md](./SECURITY.md).

## Project layout (contributors)

Provider modules live under `src/providers/<name>/` with `adapter.ts`, `schema.ts`, `constants.ts`, and `cli.definition.ts`. See the [README](./README.md) “Provider structure” section.
