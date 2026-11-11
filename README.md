# @simpill/acp-llm-cli

[![CI](https://github.com/SkinnnyJay/acp-llm-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/SkinnnyJay/acp-llm-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@simpill/acp-llm-cli)](https://www.npmjs.com/package/@simpill/acp-llm-cli)
[![node](https://img.shields.io/node/v/@simpill/acp-llm-cli)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@simpill/acp-llm-cli)](./LICENSE)

One typed TypeScript client for the coding-agent CLIs — Claude, Codex, Cursor, and Antigravity — behind a single interface.

## Why

Every coding-agent vendor ships a CLI, and every CLI wants to be driven differently. All four are driven through the same [Agent Client Protocol](https://agentclientprotocol.com) runtime, but their flags disagree, their capabilities differ, and each one fails in its own way when the subprocess dies mid-turn.

Talking to them directly means writing that plumbing once per vendor, then maintaining it. This package writes it once:

- **One port interface.** `connect`, `initialize`, `prompt`, `disconnect` behave the same for every provider. Differences that cannot be hidden are advertised through `capabilities` rather than discovered at runtime.
- **Validated config.** Every provider config is a Zod schema, so a bad command or flag fails at the boundary with a useful message instead of a confusing subprocess error.
- **Subprocess lifecycle that holds up.** Restart with real exponential backoff, force-kill that cannot leak onto a restarted child, and streams that deliver their tail instead of dropping it at close.
- **Optional streaming and session persistence,** in OpenAI-compatible chunks or raw ACP updates.

## Requirements

- Node.js >= 22
- At least one provider CLI installed — see [Providers](#providers)

## Install

```bash
npm install @simpill/acp-llm-cli
```

`zod` and `eventemitter3` are peer dependencies. zod 3 and 4 are both supported, and CI verifies each.

## Quick start

```ts
import {
  ANTHROPIC_MODEL_IDS,
  getDefaultProviderClientFactory,
  Provider,
} from "@simpill/acp-llm-cli";

const factory = getDefaultProviderClientFactory();

const client = factory.getClient(Provider.CLAUDE, {
  command: "claude-agent-acp",
  args: [],
  // Any string. The enum is a convenience for autocomplete, not a constraint. For ACP
  // providers this labels OpenAI-style stream envelopes rather than selecting
  // the agent's model — for that use port.setSessionConfigOption(...) or pass
  // the flag your CLI expects in `args`.
  model: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_5_5,
});

await client.port.connect();
await client.port.initialize();

const { sessionId } = await client.port.newSession({
  cwd: process.cwd(),
  mcpServers: [],
});
const result = await client.port.prompt({
  sessionId,
  prompt: [{ type: "text", text: "What does this repo do?" }],
});

console.log(result.stopReason);
await client.port.disconnect();
```

Swap `Provider.CLAUDE` for `Provider.CODEX`, `Provider.CURSOR`, or `Provider.ANTIGRAVITY` and nothing else changes. `factory.listProviders()` returns all of them.

Runnable versions live in [`examples/`](./examples) — `minimal-claude.ts`, `cursor-acp.ts`, `stream-prompt.ts`. Run `npm run build` first.

## Providers

All four providers are driven through the same ACP runtime and configured the same way; see the table below for which have been run against the real binary.

### Supported agents

| Provider | `Provider` value | Command spawned | Binary comes from | Verified live in 0.5.0 |
|---|---|---|---|---|
| Claude | `Provider.CLAUDE` | `claude-agent-acp` | npm `@agentclientprotocol/claude-agent-acp` | Yes |
| Codex | `Provider.CODEX` | `codex-acp` | npm `@agentclientprotocol/codex-acp` | Yes |
| Cursor | `Provider.CURSOR` | `cursor-agent acp` | Cursor's `cursor-agent` CLI | Yes |
| Antigravity | `Provider.ANTIGRAVITY` | `agy acp` | Google's Antigravity CLI (`agy`). Install with `curl -fsSL https://antigravity.google/cli/install.sh \| bash`, which places `agy` in `~/.local/bin`; `agy acp --login` signs in | Yes, `agy` 1.5.5 (live prompt round trip) |

What each agent advertises at `initialize` (session load, list, resume, close, fork) is recorded in [`docs/capabilities.md`](./docs/capabilities.md). `npm run probe` regenerates it.

Defaults live in `DEFAULT_COMMANDS` and can be overridden per provider through config or environment. The Claude and Codex bins match the wrappers ACPX prefers, so the two can front the same installation. Google has replaced the Gemini CLI with the Antigravity CLI for consumer accounts, so the Gemini provider is removed and Antigravity takes its place; Gemini model ids remain available as constants.

Cursor needs the `cursor-agent` binary with its `acp` subcommand. Set its mode with `port.setSessionMode(...)` and its model with `port.setSessionConfigOption(...)`.

## Configuration

Config resolves in one direction, last wins:

```
DEFAULT_COMMANDS  →  environment (ENV_KEY)  →  config you pass
```

The result is validated against the provider's Zod schema before a process is spawned.

That arrow is a simplification worth unpacking, because the env layer is narrower than it looks. `command` is required by the config schema, so a config you pass always supplies it — which means `ACP_LLM_CLI_*_COMMAND` only takes effect when you call `resolveBaseConfig` yourself (exported from `@simpill/acp-llm-cli/runtime`). `ACP_LLM_CLI_*_ARGS` applies whenever `args` is empty. Provider-specific fields you pass, such as `model`, survive resolution untouched on the validated config. The runtime does not turn them into flags.

Copy `.env.sample` to `.env`. Every key this package reads is declared in `ENV_KEY` (`src/domain/env.keys.ts`):

| Variable | Purpose |
|---|---|
| `ACP_LLM_CLI_DEBUG` | Truthy enables debug logging |
| `ACP_LLM_CLI_<PROVIDER>_COMMAND` | Override a provider's binary. `<PROVIDER>` is `CLAUDE`, `CODEX`, `CURSOR` or `ANTIGRAVITY` |
| `ACP_LLM_CLI_<PROVIDER>_ARGS` | Override that provider's default args |
| `ACP_LLM_CLI_LIVE` | Set to `1` to run tests that spawn real CLIs |

The provider CLIs read their own credentials — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or `GOOGLE_API_KEY`, `CURSOR_API_KEY`. This package never reads or forwards them.

## Streaming

Every provider streams. Feature-detect, then iterate. Narrow each envelope with the
exported `isOpenAIEnvelope` / `isNativeEnvelope` guards -- `StreamEnvelope` is a union, so
`object` is not present on every member and reading it directly does not type-check:

```ts
import { isOpenAIEnvelope } from "@simpill/acp-llm-cli";

if (port.capabilities?.streamPrompt && port.streamPrompt) {
  for await (const envelope of port.streamPrompt(
    { sessionId, prompt: [{ type: "text", text: "Hello" }] },
    { envelopeMode: "openai" }
  )) {
    if (isOpenAIEnvelope(envelope)) {
      process.stdout.write(envelope.choices?.[0]?.delta?.content ?? "");
    }
  }
}
```

`envelopeMode` is `openai` for OpenAI-compatible chunks, `native` for raw ACP session updates, or `both`.

The final chunk carries a `finish_reason` translated from the agent's stop reason — `length` for a truncated turn, `content_filter` for a refusal, `stop` otherwise. Import `OPENAI_FINISH_REASON` to switch on it; a truncated turn is not a clean completion.

## Lifecycle and session persistence

Ports wrapped by the shared ACP runtime expose `restart()`, `open()`, and `close()`. `restart()` restarts the process with an awaited, capped exponential backoff and re-initializes.

A persistence store records the session id and cwd. The conversation is **not** restored by this release: `restart()` does not give you a usable session, so call `newSession()` again after it (when a session was persisted, the supervisor sends `session/new`, discards the new id and keeps the old one in the store). Real resume (`session/resume` / `session/load`, which [`docs/capabilities.md`](./docs/capabilities.md) shows the agents advertise) is planned for the next phase. To record the session, pass a persistence store:

```ts
import {
  createMemorySessionPersistence,
  getDefaultFactory,
  PROVIDER_IDS,
} from "@simpill/acp-llm-cli";

const port = getDefaultFactory().createRuntime(
  PROVIDER_IDS.CLAUDE_CLI_ID,
  { command: "claude-agent-acp", args: [] },
  {
    sessionPersistence: createMemorySessionPersistence(),
    workspace: "/path/to/project",
  }
);

if (port.capabilities?.restart) {
  await port.restart?.(); // restarts the process and re-initializes; the conversation is not restored
}
```

`createMemorySessionPersistence()` is process-local. For anything durable, implement `ISessionPersistence` over a file or database.

## Errors you can branch on

Errors the package classifies are `AcpCliError` subclasses (still `Error`s) with a stable `code`,
their `subsystem`, and `providerId`, `sessionId` and `hint` when known. When one wraps another
error, the original is on `cause`. Branch on `code`; message text is for people. Not classified:
a zod error from calling a config schema's `parse` yourself, errors thrown by your own
`permissionHandler`, tool host or event listeners, and a child-process error that is not a spawn
failure.

| Class | Subsystem | Codes | Extra fields |
|-------|-----------|-------|--------------|
| `ConfigError` | `config` | `CONFIG_INVALID`, `PROVIDER_UNKNOWN` | `issues` |
| `AgentProcessError` | `process` | `CLI_NOT_FOUND`, `CLI_NOT_EXECUTABLE`, `SPAWN_FAILED`, `PROCESS_EXITED` | `command`, `exitCode`, `signal`, `stderr` |
| `ConnectionError` | `connection` | `NOT_CONNECTED`, `STREAM_UNAVAILABLE`, `LINK_CLOSED` | none |
| `AgentProtocolError` | `protocol` | `AUTH_REQUIRED`, `SESSION_NOT_FOUND`, `REQUEST_CANCELLED`, `INVALID_PARAMS`, `METHOD_NOT_FOUND`, `UNSUPPORTED_PROTOCOL_VERSION`, `AGENT_INTERNAL_ERROR` | `rpcCode`, `data`, `authMethods` |
| `UnsupportedCapabilityError` | `capability` | `CAPABILITY_UNSUPPORTED` | `capability` |
| `InvalidStateError` | `usage` | `STREAM_IN_PROGRESS`, `PERSISTENCE_MISCONFIGURED` | none |
| `ToolHostError` | `tool-host` | `TOOLS_NOT_CONFIGURED` | `kind` |
| `TimeoutError` | `timeout` | `TIMEOUT` | `operation`, `timeoutMs` |

A JSON-RPC error from the agent becomes an `AgentProtocolError` by its code: `-32000` is
`AUTH_REQUIRED` (with the `authMethods` the agent advertised at `initialize()`), `-32002`
`SESSION_NOT_FOUND`, `-32800` `REQUEST_CANCELLED`, `-32602` `INVALID_PARAMS`, `-32601`
`METHOD_NOT_FOUND`, `-32022` `UNSUPPORTED_PROTOCOL_VERSION`, and anything else
`AGENT_INTERNAL_ERROR`; the agent's message is kept. Rate limits, quotas and an unavailable model
have no standard ACP code, so they arrive as `AGENT_INTERNAL_ERROR` with the agent's own message.

For the built-in providers, `hint` says what to run: the install command when the CLI is missing,
the login command when the agent wants authentication (both come from `PROVIDER_SETUP`). A missing
or non-executable CLI makes `connect()` (and so `restart()`) reject with `CLI_NOT_FOUND` or
`CLI_NOT_EXECUTABLE`, and the same error is emitted once on the port's `error` event. A request
still pending when the link to the agent closes rejects with `ConnectionError` `LINK_CLOSED`,
carrying the SDK's message.

```ts
import { AgentProcessError, AgentProtocolError } from "@simpill/acp-llm-cli";

try {
  await port.connect();
  await port.newSession({ cwd: process.cwd(), mcpServers: [] });
} catch (e) {
  if (e instanceof AgentProtocolError && e.code === "AUTH_REQUIRED") console.error(e.hint);
  else if (e instanceof AgentProcessError && e.code === "CLI_NOT_FOUND") console.error(e.hint);
  else throw e;
}
```

## Building CLI arguments

Every adapter carries a `cliSpec` that turns typed options into argv, so callers never hand-write flags:

```ts
import { getAdapter, getDefaultRegistry, PROVIDER_IDS } from "@simpill/acp-llm-cli";

const adapter = getAdapter(getDefaultRegistry(), PROVIDER_IDS.CURSOR_CLI_ID);
const argv = adapter?.cliSpec?.buildArgs({
  command: "cursor-agent",
  args: ["acp"],
  model: "gpt-5",
  trust: true,
  sandbox: "enabled",
  workspace: "/path/to/project",
});
// ["acp", "--model", "gpt-5", "--trust", "--sandbox", "enabled", "--workspace", "/path/to/project"]
```

The generic options — `model`, `outputFormat`, `trust`, `sandbox`, `workspace`, `debug` — are the shared vocabulary for flag maps. Each provider maps the subset its binary actually supports, and an option the provider does not map is skipped rather than emitted. Only Cursor maps any of them (`model`, `trust`, `sandbox`, `workspace`); Claude, Codex and Antigravity map none. The flag tables are checked against saved `--help` output in `__tests__/fixtures/help/` by a drift test, and `npm run refresh:help` regenerates those fixtures from the installed binaries. `buildGenericArgs` is exported for custom builders.

The runtime applies four of them when it spawns the process: `model`, `trust`, `sandbox` and `workspace`. Each one that is set (`trust` only when `true`, `model` and `workspace` only when non-empty) and mapped by the provider is appended after the resolved `args`, unless `args` already holds that flag as `--flag` or `--flag=value`: explicit args win. `outputFormat` and `debug` are never applied at spawn, because an output-format flag would break the ACP stream on stdout. Only Cursor maps anything, so Cursor starts as `cursor-agent acp --model <id>`; for Claude, Codex and Antigravity nothing is appended, and a model is chosen over the protocol with `setSessionConfigOption`. `model` is also the default model label on OpenAI-style stream envelopes. `createAcpCliHarnessRuntime` is the low-level entry and spawns `config.args` verbatim.

`cliSpec.getHelp()` shells out to the CLI's `--help` and returns stdout, which is useful for discovery and for checking that an installed CLI supports what you are about to send:

```ts
const helpText = await adapter?.cliSpec?.getHelp({
  command: "claude-agent-acp",
  args: adapter.cliSpec.defaultArgs,
  cwd: process.cwd(),
});
```

## Model IDs

Model IDs are exported as const objects — `ANTHROPIC_MODEL_IDS`, `OPENAI_MODEL_IDS`, `GEMINI_MODEL_IDS`, `XAI_MODEL_IDS` — so editors autocomplete them and typos fail to compile. Provider config schemas accept any string for `model`, so a model released this morning is never blocked by this package's release cadence. The exported `*ModelIdSchema` are strict opt-in validators - parse with one explicitly if you want a vendor catalogue enforced.

Refresh them from the vendors themselves:

```bash
npm run update-models                              # each vendor's public models page, no key needed
ACP_LLM_CLI_MODELS_DRY_RUN=1 npm run update-models # preview the diff
```

Setting `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `XAI_API_KEY` makes the script use that provider's own API instead of its page. The refresh only adds ids; `ACP_LLM_CLI_MODELS_PRUNE=1` makes the fetched list authoritative.

## Package entry points

| Import | Contains |
|---|---|
| `@simpill/acp-llm-cli` | Product API — factories, `Provider`, model IDs, config schemas |
| `@simpill/acp-llm-cli/runtime` | Extension API — ports, decorators, connections, session persistence |

Reach for `/runtime` when you are building a custom port or adapter rather than consuming one. [`docs/api.md`](./docs/api.md) lists the curated exports.

## Extending

### Adding a provider

Create `src/providers/<name>/` with four files:

| File | Responsibility |
|---|---|
| `schema.ts` | Zod config schema, extending `baseCliConfigSchema` and `genericLlmCliOptionsSchema.partial()` |
| `constants.ts` | Env keys, `*_CLI_ARG` flag names, and `*_GENERIC_FLAG_MAP`. `*_CLI_ARG` is the codomain of `ProviderFlagMap`, so it must hold **flags only**, or a generic option can be mapped onto a positional argument |
| `cli.definition.ts` | `ICliSpec` — `defaultArgs`, `genericFlagMap`, `knownFlags`, `buildArgs`, `getHelp` |
| `adapter.ts` | Ties them together and exposes `createRuntime(config)` |

Then add the default command to `src/domain/default.commands.ts`, the env keys to `src/domain/env.keys.ts`, and register the adapter in `src/bootstrap.ts`. If the CLI speaks ACP over stdio, `createAcpCliHarnessRuntime(config)` is the whole runtime. If it does not, you need a custom port that implements `IAgentPort`.

### Architecture notes

`IProviderFactory.createRuntime` validates config against the provider schema and throws with messages from `VALIDATION_ERROR`; no raw error strings live in business logic. Pass `collectMetrics` to expose `invocations`, `lastError`, and `lastInvocationMs` through `factory.getMetrics(id)`. Logging goes through `createLogger()`, with debug output gated on `ACP_LLM_CLI_DEBUG`.

This package builds on the [`@simpill`](https://www.npmjs.com/search?q=scope%3Asimpill) utilities for env reads (`env.utils`), structured logging (`logger.utils`), and async helpers (`async.utils`). `errors.utils`, `patterns.utils`, and `protocols.utils` are declared directly so packed installs resolve their transitive requirements.

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) covers branching and PR expectations, and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) applies to every interaction here. `npm run verify` runs lint, typecheck, build, and tests — the same gate CI applies.

Report security issues privately per [SECURITY.md](./SECURITY.md), never as a public issue.

## License

[ISC](./LICENSE)
