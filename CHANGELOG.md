# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Fixed

- **The declared zod peer range was false.** `peerDependencies` advertised
  `"^3.25.0 || ^4.0.0"`, but the package only ever compiled against zod 3 - under zod 4 the
  typecheck failed in 15 places. Nothing caught it because vitest does not typecheck. It
  mattered because zod is a peer, so the consumer's copy wins, and `@simpill/async.utils`
  already requires `zod@^4.3.6`.
- **`tsconfig` did not declare `types: ["node"]`.** TypeScript 6 and 7 stop picking up
  `@types/node` without it and fail with 36 "Cannot find name" errors across `process`,
  `crypto`, `setTimeout` and the `node:` specifiers - identically on `@types/node` 22 and 26,
  so it reads like a types-package problem and is not.
- **Provider config was silently discarded.** `resolveBaseConfig` returns only
  `command`/`args`/`cwd`/`env`, and both adapter paths handed that reduced object to
  `schema.parse`, dropping every other field before it could reach the CLI. Cursor's `trust`,
  `mode`, `model`, `workspacePath` and `approvalTimeoutMs`, and `model` on the ACP providers,
  were all accepted, validated and then ignored.
- **Restart could kill its own replacement.** `StdioConnection.disconnect()` armed a 500 ms
  force-kill timer that was never cleared and re-read the current child when it fired, so any
  restart completing in under 500 ms - the normal path - SIGKILLed the newly spawned child.
- **Streams dropped their tail.** The prompt queue checked its terminal state before draining,
  so an update pushed while the consumer was between reads was discarded, and the stream then
  reported a normal finish.
- **Cursor sessions could cross.** The cursor chat id was process-wide while mode and model were
  per session, so prompting one session could deliver its text to another session's chat.
- **Cursor shutdown bookkeeping could break permanently.** Overlapping disconnects could drive
  the in-flight counter negative, after which every shutdown skipped its grace period.
- `streamPrompt` released its concurrency lock when the reader loop ended rather than when the
  prompt settled, so abandoning a stream allowed a second concurrent prompt on the same session.
- The ACP client kept its RPC link after the transport reported a terminal state, and built a
  second reader loop on the same stream if `connect()`/`open()` was called twice.
- `getDefaultFactory({ collectMetrics })` threw when an unrelated accessor had initialised the
  shared factory first. The option is removed; construct `ProviderFactory` directly to opt out.
- `createHarness` did not default `providerId`, so a custom registry using session persistence
  threw where the equivalent `createRuntime` call succeeded.
- `restart()` restored a session's `cwd` but left it unset in memory, so the next vendor
  notification persisted `cwd: undefined` and the following restart resumed in the wrong directory.
- Claude's flag map claimed a `--trust` flag that neither its own flag table nor the binary has.
- `ACP_LLM_CLI_DEBUG=yes` was truthy via `config.env` but falsy from the shell; both paths now
  use one parser.
- Connection `error`/`exit` events were emitted before the state they describe was updated.

### Changed

- **Breaking (extension API):** `LifecycleSupervisorOptions` groups session persistence into one
  optional `persistence: { store, providerId, workspace?, resumeOnRestart? }` object.
  `AcpSharedRuntimeOptions` - the surface the factories and adapters use - is unchanged.
- `ProviderClientFactory.listProviders()` now returns only providers the injected factory has
  actually registered, instead of the full static enum. The default factory registers all four, so
  the common path is unchanged; a factory built over a partial registry no longer advertises ids
  that `getClient` would reject.
- Removed the unused `ENV_KEY.RUN_INTEGRATION` constant, which narrows the exported `EnvKey`
  union. Nothing in this package read it. Added `ACP_LLM_CLI_LIVE`, `ACP_LLM_CLI_PROVIDER` and
  `ACP_LLM_CLI_MODELS_DRY_RUN`, which were previously read as raw strings.
- `HarnessRegistry` is now a value export from the package root, so `new HarnessRegistry()` works
  from `.` as the custom-registry docs describe. `HelpExtractorOptions` is exported from the root.
- The ACP runtime builders moved to `src/runtime/`, so the runtime layer no longer imports the
  providers layer. Import paths for consumers are unchanged.
- Connection event payloads are declared once in `ConnectionEvents`.
- The model generator now fails on a constant-name collision instead of renaming an existing
  entry, which could have silently repointed a published `*_MODEL_IDS` key at a different model.
- `model` on an ACP provider labels OpenAI-style stream envelopes; select the agent's model with
  `setSessionConfigOption` or by passing the flag your CLI expects in `args`.
- The test suite is type-checked (`tsconfig.test.json`), and provider adapters are no longer
  excluded from coverage.

- **Breaking:** `IAgentPort.setSessionModel` is now `setSessionConfigOption`. ACP SDK 1.x
  removed `session/set_model` in favour of the general `session/set_config_option`, where the
  model selector is an option carrying `category: "model"`. It takes `configId` + `value` and
  returns the full option set. Note the compiler suggests `SetSessionMode*` here and is wrong -
  mode and model are sibling categories, not the same concept.
- **Breaking:** minimum Node is 22. Node 20 reached EOL on 2026-04-30, so CI had been verifying
  an unsupported runtime.
- `@agentclientprotocol/sdk` 0.12 -> 1.3; `KillTerminalCommandRequest`/`Response` are now
  `KillTerminalRequest`/`Response`.
- `ICliSpec.buildArgs` takes the new exported `CliArgsInput<TConfig>`: generic options are
  spelled out, and `args`/`env` are optional. A spec reached through the registry erases to
  `ICliSpec<BaseCliConfig>`, which previously rejected the very options the builder maps - the
  arg-building example in the README had never compiled.
- Biome 1.9 -> 2.5 with a migrated config. TypeScript stays at 5.9: with the tsconfig fixed, 6
  and 7 typecheck clean but cannot emit declarations, because tsup 8.5.1 (already latest)
  bundles rollup-plugin-dts 6.1.1, which crashes on 7 and errors on 6. `@types/node` tracks the
  engines floor rather than latest, since types ahead of the supported runtime compile code that
  throws for consumers on that floor. `.github/dependabot.yml` records all three pins.

### Added

- `peer-zod` CI matrix, which typechecks *and* tests against both ends of the declared zod
  range. Nothing else can catch a type-level regression here.
- `ConfigSchema`, `ConfigSchemaError`, `ConfigSchemaIssue` and `ConfigSchemaResult` are exported.
  `ConfigSchema` is declared structurally rather than as `z.ZodType<...>` because no spelling of
  that type compiles under both majors: `z.ZodType<T, z.ZodTypeDef, unknown>` fails on 4, and
  `z.ZodType<T>` fails on 3, where `Input` defaults to `Output` and rejects `.default()`.
- `CliArgsInput` is exported and describes what `ICliSpec.buildArgs` accepts.

### Deprecated

- `GENERIC_OPTION_DEFAULTS` and the four `*_MODEL_ID_LIST` exports. Unread and misleading; they
  will be removed together in the next major.

### Upgrading

Fixing the config drop means `trust: true` now genuinely reaches `cursor-agent` as `--trust` on
every spawn. It previously did nothing, so a config that already sets it will start granting
that permission on upgrade. Check for existing `trust: true` before deploying.

- CI: `verify` is lint/typecheck/build/test; coverage + pack smoke run on Node 22 only.
- StreamAgentPort owns streaming only; restart/open/close remain on LifecycleAgentPort.
- Validation failures log at `warn` (not `error`); shared test helpers for fake children / mock ports.
- Stream queue uses O(1) read-index dequeue; OpenAI chunk ids/timestamps reused per stream.

## [0.2.0] - 2026-07-30

### Changed

- **Breaking:** Default permission handler cancels when no `permissionHandler` is configured (no longer auto-selects the first option).
- **Breaking:** Cursor CLI no longer hardcodes `--trust`; pass `trust: true` in config to enable it.
  (Note: `trust: true` was discarded before reaching the CLI until the Unreleased fix above.)
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
  (Note: an abandoned stream released the lock early until the Unreleased fix above.)
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
