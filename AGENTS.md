# Agent / automation notes

- **Cursor / VS Code Git:** If this repo still lives under the `@simpill` monorepo path, open [`acp-llm-cli.utils.code-workspace`](./acp-llm-cli.utils.code-workspace) (or rely on [`.vscode/settings.json`](./.vscode/settings.json)) so Source Control uses this repo only; `git.ignoredRepositories` excludes the parent checkout. After changing settings, reload the window. If `${workspaceFolder}` is not expanded on your build, add User setting `git.ignoredRepositories` with the **absolute** path to the monorepo root (parent of `utils/`).
- Follow [CONTRIBUTING.md](./CONTRIBUTING.md) for branches (Git Flow: PRs to `develop` when present) and PR expectations.
- Run `npm run verify` before proposing changes (typecheck, build, test).
- TypeScript **strict** mode; avoid `any` and unnecessary type assertions.
- Prefer existing patterns under `src/providers/` and `src/runtime/` when adding behavior.
- Library code should not rely on undocumented globals; use injected config where applicable.
