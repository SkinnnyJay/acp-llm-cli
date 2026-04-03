# Agent / automation notes

- Follow [CONTRIBUTING.md](./CONTRIBUTING.md) for branches (Git Flow: PRs to `develop` when present) and PR expectations.
- Run `npm run verify` before proposing changes (typecheck, build, test).
- TypeScript **strict** mode; avoid `any` and unnecessary type assertions.
- Prefer existing patterns under `src/providers/` and `src/runtime/` when adding behavior.
- Library code should not rely on undocumented globals; use injected config where applicable.
