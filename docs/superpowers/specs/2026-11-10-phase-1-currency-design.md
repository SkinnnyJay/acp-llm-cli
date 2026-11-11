# Phase 1: Currency (0.5.0)

Date: 2026-11-10
Roadmap: [2026-11-10-roadmap.md](./2026-11-10-roadmap.md)

## Purpose

Make the package match the CLIs and SDK as they exist today, so phases 2 to 4 are built on
current foundations. No session features are added in this phase.

## Decisions already made

| Question | Decision |
|---|---|
| Cursor | Move to native ACP (`cursor-agent acp`). Delete the print/stream-json port. |
| ACP SDK | `^2.5.0`, stable entrypoint only (`@agentclientprotocol/sdk`). No `/unstable` imports. |
| Flag tables | List only flags the spawned binary accepts. A test checks them against saved `--help` output. |
| Versioning | Breaking release, 0.5.0. Exports already marked deprecated are removed. |

## Current state

- `@agentclientprotocol/sdk` is `^1.4.0`. Version 2.x removes `ClientSideConnection`, which
  `src/runtime/acp.client.ts` is built on, and replaces named outbound methods with
  `request(methods.agent.session.new, params)` on a peer context.
- Gemini is spawned with `--experimental-acp`, which Gemini 0.33.2 marks deprecated for `--acp`.
- Docs name `@zed-industries/codex-acp`, which npm marks deprecated for
  `@agentclientprotocol/codex-acp`.
- Cursor uses a custom port (`src/providers/cursor/cursor.agent.port.ts` and three helpers) that
  has no restart, persistence, or streaming envelopes.
- Flag tables describe the underlying CLIs, not the binaries spawned. Codex's lists `--print`
  and `--verbose`, which `codex --help` does not show.

## Design

### 1. SDK migration

- Bump `@agentclientprotocol/sdk` to `^2.5.0`. The floor is 2.5.0 and not 2.6.0 because 2.6.0
  was published on the day this spec was written.
- Rewrite the `ACPClient` class in `src/runtime/acp.client.ts`:
  - Build a `client()` app once per instance. Register `onRequest` handlers for
    `session/request_permission`, `fs/read_text_file`, `fs/write_text_file` and the five
    `terminal/*` methods, and an `onNotification` handler for `session/update`. Each handler
    delegates to the existing method of the same purpose, so permission and tool-host behaviour
    is unchanged.
  - `connect()` calls the app's `connect(stream)` and stores the returned lifecycle handle with
    the stream it was built on, replacing the stored `ClientSideConnection`. The rule "do not
    attach twice to the same stream" is kept.
  - Outbound methods (`initialize`, `newSession`, `prompt`, `authenticate`, `setSessionMode`,
    `setSessionConfigOption`) call `handle.agent.request(methods.agent.…, params)`.
  - `detach()` drops the handle. The transport `EXIT` ownership check is unchanged.
- `IAgentPort` is unchanged. Type imports across `src/` keep their names where 2.x still exports
  them; any renamed type is fixed at its import site.
- `src/runtime/stdio.connection.ts` keeps using `ndJsonStream` if 2.x still exports it from the
  stable entrypoint, else the 2.x transport equivalent. This is checked in the first task.

### 2. Providers

| Provider | Default command | Default args | Change |
|---|---|---|---|
| Claude | `claude-agent-acp` | none | Docs name `@agentclientprotocol/claude-agent-acp`. |
| Codex | `codex-acp` | none | Docs name `@agentclientprotocol/codex-acp`. |
| Gemini | `gemini` | `--acp` | Was `--experimental-acp`. |
| Cursor | `cursor-agent` | `acp` | Was no args, with a custom port. |

Cursor:

- `src/providers/cursor/adapter.ts` calls `createStandardAcpRuntime` like the other three.
- `cursorConfigSchema` becomes `acpCliConfigSchema`. The fields `mode`, `workspacePath`,
  `force`, `browser`, `approveMcps` and `approvalTimeoutMs` are removed.
- Deleted: `cursor.agent.port.ts`, `cursor.mode.utils.ts`, `cursor.ndjson.utils.ts`,
  `cursor.spawn.utils.ts`, the print-mode constants, the ignored-options warning, and the tests
  `cursor.agent.port*.test.ts`, `cursor.mode.test.ts`, `cursor.ndjson.test.ts`,
  `cursor.runtime.options.test.ts`, `cursor.timeout.test.ts`, `helpers/cursor.config.ts`.
- Anything in `src/domain` used only by the deleted files (for example Cursor timeouts) is
  removed with them.

### 3. Flag tables and drift test

- Each `*_CLI_ARG` table lists only flags the spawned binary accepts in ACP mode. Entries are
  taken from that binary's `--help`, and for Cursor from `cursor-agent acp --help` plus any
  global flag confirmed to work before the `acp` subcommand.
- `GENERIC_OPTION_KEY` and `genericLlmCliOptionsSchema` lose keys that no provider maps after
  the tables are corrected.
- `__tests__/fixtures/help/<provider>.txt` holds saved `--help` output with the CLI version on
  the first line. A new `provider.flags.drift.test.ts` asserts every flag in each table appears
  in its fixture.
- `scripts/refresh-help-fixtures.mjs` regenerates the fixtures from the installed binaries and
  skips, with a message, any binary that is not installed.

### 4. Cleanup

- Remove `GENERIC_OPTION_DEFAULTS` and the `*_MODEL_ID_LIST` exports.
- Run `npm run update-models` and commit the refreshed model constants.
- Update dev dependencies to their latest compatible versions. A major bump that needs code
  changes is taken only if `verify` stays green; otherwise it is listed in the CHANGELOG as
  deferred.
- Update `README.md`, `docs/api.md`, `src/README.md`, `examples/` (replace `cursor-print.ts`
  with an ACP example), `.env.sample` and `CHANGELOG.md` for 0.5.0, including a migration note
  for Cursor callers.

### 5. Capability probe

- Add `scripts/probe-capabilities.mjs`: spawn each provider's default command, send
  `initialize`, and print the advertised `agentCapabilities` as JSON. It is a developer tool
  and is not part of the published package.
- Its output for the installed agents is saved to `docs/capabilities.md`. Phase 2 starts from
  that file.

## Error handling

No new error paths. The existing behaviours must hold after the client rewrite, and the
contract tests assert each one:

- Calling a method before `connect()` throws `ACP_CLIENT_NOT_CONNECTED`.
- A missing stream after transport connect disconnects the child and throws.
- A permission request with no handler returns `cancelled`.
- An fs or terminal request with no tool host is rejected with the existing messages.
- A child exit detaches the client only when the exited child owned the current stream.

## Testing

- `__tests__/acp.client.contract.test.ts` and `helpers/fake.acp.connection.ts` are rewritten
  against the 2.x API before the client is changed, and must fail for the right reason first.
- Unit tests for the default commands and for the Cursor adapter producing a lifecycle-wrapped
  ACP port.
- The flag drift test from section 3.
- `__tests__/live.providers.matrix.test.ts` runs Claude and Cursor end to end on a machine with
  both installed and authenticated. Gemini and Codex are covered by handshake where reachable.
- Coverage stays at or above the configured threshold.

## Done when

1. `npm run verify:coverage` passes.
2. `npm run pack:smoke` and `npm run publint` pass.
3. The live matrix passes for Claude and Cursor.
4. `docs/capabilities.md` holds probe output for every installed agent.
5. `grep -r "experimental-acp\|ClientSideConnection\|zed-industries" src examples README.md
   docs/api.md` returns nothing.

## Commit groups

Each group is reviewed before it is committed.

1. Specs (this file and the roadmap).
2. SDK 2.x migration: contract tests, then client.
3. Gemini `--acp` and package-name updates in docs.
4. Cursor on ACP, print port removed.
5. Flag tables, fixtures, drift test, refresh script.
6. Deprecated exports removed, models refreshed, dev dependencies updated.
7. Capability probe and `docs/capabilities.md`.
8. README, API docs, examples, CHANGELOG, version 0.5.0.

## Risks

- **Codex wrapper.** `@agentclientprotocol/codex-acp` did not answer `initialize` through `npx`
  within 25 seconds. The first Codex task installs it and probes it directly. If it needs
  different arguments or behaves differently, that fix joins commit group 3.
- **Gemini.** It cannot be exercised past `initialize` on the development account. Its coverage
  is handshake plus unit tests.
- **Cursor flags.** It is not yet confirmed that `cursor-agent` accepts flags such as `--model`
  alongside `acp`. If it does not, Cursor's table holds only what `acp --help` shows and model
  selection goes through `setSessionConfigOption`.
- **Cursor ACP gaps.** With the print port deleted there is no fallback. The live matrix test
  for Cursor must pass before commit group 4 is proposed for review.
- **SDK churn.** 2.x shipped eight releases in three weeks. The caret range accepts new minors;
  the lockfile pins what CI tests.

## Out of scope

Session load, resume, list and close; durable stores; the session manager; worktrees and launch
profiles. These are phases 2 to 4.
