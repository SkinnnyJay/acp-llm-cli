# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `peer-zod` CI matrix typechecks and tests against both ends of the declared zod peer range.
- `ConfigSchema`, `ConfigSchemaError`, `ConfigSchemaIssue`, and `ConfigSchemaResult` are exported.
- `CliArgsInput` is exported and describes what `ICliSpec.buildArgs` accepts.

### Changed

- **Breaking:** `IAgentPort.setSessionModel` is now `setSessionConfigOption`, following
  `@agentclientprotocol/sdk` 1.x, which replaced the removed `session/set_model` with the general
  `session/set_config_option`. It takes `configId` + `value` and returns the full option set.
- **Breaking:** minimum Node is 22. Node 20 reached EOL on 2026-04-30.
- `@agentclientprotocol/sdk` 0.12 -> 1.3. `KillTerminalCommandRequest`/`Response` are now
  `KillTerminalRequest`/`Response`.
- The declared zod peer range is now honoured: the package compiles against zod 3 and 4. It had
  only ever compiled against 3, and the test suite could not catch it because vitest does not
  typecheck.
- `ICliSpec.buildArgs` accepts generic options and treats `args`/`env` as optional, so a spec
  reached through the registry can build the arguments it documents.
- Biome 1.9 -> 2.5, TypeScript pinned at 5.9 pending tsup declaration-emit support for 6/7,
  and `@types/node` tracks the engines floor rather than latest.
- CI: `verify` is lint/typecheck/build/test; coverage + pack smoke run on Node 22 only.
- StreamAgentPort owns streaming only; restart/open/close remain on LifecycleAgentPort.
- Validation failures log at `warn` (not `error`); shared test helpers for fake children / mock ports.
- Stream queue uses O(1) read-index dequeue; OpenAI chunk ids/timestamps reused per stream.

### Fixed

- `tsconfig` declares `types: ["node"]`; without it TypeScript 6 and 7 drop the Node types entirely.

## [0.2.0] - 2026-07-30

### Changed

- **Breaking:** Default permission handler cancels when no `permissionHandler` is configured (no longer auto-selects the first option).
- **Breaking:** Cursor CLI no longer hardcodes `--trust`; pass `trust: true` in config to enable it.
- Session persistence saves from inbound `sessionUpdate` events and stores session `cwd` for resume.
- Memory persistence keys are length-prefixed to avoid `providerId`/`workspace` collisions.
- Help extraction and Cursor disconnect force-kill orphaned child processes.
- Public API exports `createAcpCliHarnessRuntime`, `createStandardAcpRuntime`, and session persistence types.
- Factory / adapters accept `AcpSharedRuntimeOptions` (`sessionPersistence`, permissions, envelope); ACP ports always get lifecycle wrap.
- Kept `@simpill/errors.utils`, `@simpill/patterns.utils`, and `@simpill/protocols.utils` as direct deps so packed installs resolve transitive requirements from env/logger/async utils.
- Zod peer aligned with ACP SDK (`^3.25.0 || ^4.0.0`).
- Public types use `ProcessEnv` / `string` instead of bare `NodeJS.*` namespaces.
- CI: Node 20+22 matrix, coverage artifact, `npm pack` smoke + publint; stub release workflow on `v*` tags (no publish until requested).
- Stream isolation: `streamPrompt` filters by `sessionId` and rejects concurrent calls on one port.
- Stderr in thrown errors is redacted/truncated unless debug is enabled; examples + `docs/api.md`.
- Subpath export is `./runtime` only (the former `./core` alias was removed).
- README / CONTRIBUTING / AGENTS / `.env.sample` aligned with real defaults and GitHub Flow.

## [0.1.2] - 2026-07-29

### Added

- Live provider matrix test (`ACP_LLM_CLI_LIVE=1`) for Claude / Codex / Cursor.
- Unit assertion that defaults stay aligned with ACPX preferred binaries.
- README section documenting mesh/ACPX vs this package's Cursor print-mode split.

## [0.1.1] - 2026-07-29

### Changed

- Default Claude ACP binary: `claude-agent-acp` (was `claude-code-acp`).
- Default Codex ACP binary: `codex-acp` with no args (was `codex --experimental-acp`).
- Cursor remains `cursor-agent` print/stream-json in this package.

## [0.1.0] - 2026-04-02

### Added

- Initial release: ACP LLM CLI harness layer, provider adapters, and documentation.
