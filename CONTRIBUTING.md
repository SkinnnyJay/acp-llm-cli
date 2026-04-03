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
   - `npm run verify` (typecheck, build, tests)

## Source layout and file naming

- **`src/domain/`** — constants, shared types, model enums (no runtime I/O).
- **`src/runtime/`** — harness, connections, registry, factories, ports.
- **`src/providers/`** — one folder per CLI provider (adapter + schema + constants + CLI spec).
- **`src/cli/`** — generic CLI building blocks shared across providers.
- **`src/bootstrap.ts`** — registers default adapters and exposes default registry/factory helpers.

Filenames use **dot-separated** segments (`env.keys.ts`, `provider.factory.ts`). See [`src/README.md`](./src/README.md).

## Branching: Git Flow

This repository uses **[Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)**-style branches:

| Branch | Role |
|--------|------|
| **`main`** | Production-ready code. Releases are tagged from here. Only merge via `release/*` or `hotfix/*` (or maintainers’ release process). |
| **`develop`** | Integration branch for the next release. Default target for feature PRs. |
| **`feature/<short-name>`** | Branched from `develop`. One topic per branch (e.g. `feature/codex-flags`). |
| **`release/<version>`** | Branched from `develop` when preparing a release; final fixes only, then merge to `main` and back to `develop`. |
| **`hotfix/<short-name>`** | Branched from `main` for urgent production fixes; merge to `main` and `develop`. |

**Typical feature contribution:**

1. `git checkout develop && git pull`
2. `git checkout -b feature/my-change`
3. Commit with clear messages (see below).
4. Open a **PR into `develop`** (not `main`, unless maintainers ask otherwise).

**If your fork does not use `develop` yet:** open PRs against `main` and note in the description; maintainers may align branches when the repo is fully set up.

### Lighter alternative (GitHub Flow)

Smaller teams sometimes use only **`main`** + **`feature/*`** branches. That is acceptable if documented in the repo; still keep PRs small and `main` green.

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
