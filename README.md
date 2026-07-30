# @simpill/acp-llm-cli

[![CI](https://github.com/SkinnnyJay/acp-llm-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/SkinnnyJay/acp-llm-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@simpill/acp-llm-cli)](https://www.npmjs.com/package/@simpill/acp-llm-cli)

Source: **[github.com/SkinnnyJay/acp-llm-cli](https://github.com/SkinnnyJay/acp-llm-cli)**. Optional local path next to [simpill-utils](https://github.com/SkinnnyJay/simpill-utils): `utils/@simpill-acp-llm-cli.utils/`.

Modular, extensible layer to run ACP-compatible LLM CLIs (Claude, Codex, Gemini, Cursor). Interface-first and Zod-driven: **Factory** and **Provider** classes driven by **interfaces** (common + extended), **Zod** for validation and clear error messages, **common metrics and logging**, and no magic numbers or strings. CLI research (commands/args, common vs provider-unique) is in the repo scratchpad and linked from implementation.

## Install

```bash
npm install @simpill/acp-llm-cli
```

Subpath imports: use `@simpill/acp-llm-cli/runtime` for low-level harness exports; `@simpill/acp-llm-cli/core` is an alias to the same files (deprecated).

## Usage

**Recommended: Provider enum + ProviderClientFactory** (extensible module pattern):

```ts
import {
  getDefaultProviderClientFactory,
  Provider,
  ANTHROPIC_MODEL_IDS,
} from "@simpill/acp-llm-cli";

const factory = getDefaultProviderClientFactory();
const client = factory.getClient(Provider.CLAUDE, {
  command: "claude-code-acp",
  args: [],
  model: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_4_6,
});
await client.port.connect();
await client.port.initialize();
// client.port.prompt(), etc.
await client.port.disconnect();
// client.provider is Provider.CLAUDE
```

Use `Provider.CLAUDE`, `Provider.GEMINI`, `Provider.CODEX`, `Provider.CURSOR`; `factory.listProviders()` returns all. To add a provider: add to the `Provider` enum, register the adapter in the registry, and the factory supports it.

**Alternative: registry + createHarness by id:**

```ts
import { getDefaultRegistry, createHarness, PROVIDER_IDS } from "@simpill/acp-llm-cli";

const registry = getDefaultRegistry();
const port = createHarness(registry, PROVIDER_IDS.CLAUDE_CLI_ID, {
  command: "claude-code-acp",
  args: [],
  cwd: process.cwd(),
});
await port.connect();
await port.initialize();
// prompt, newSession, etc.
await port.disconnect();
```

With config file: load JSON, validate with the adapter's schema, then `createHarness(registry, id, config)`.

**Factory (recommended):** Use `getDefaultFactory()` for Zod-validated config, clear error messages, and optional metrics/logging:

```ts
import { getDefaultFactory, PROVIDER_IDS } from "@simpill/acp-llm-cli";

const factory = getDefaultFactory();
const port = factory.createRuntime(PROVIDER_IDS.CLAUDE_CLI_ID, {
  command: "claude-code-acp",
  args: [],
  model: "claude-sonnet-4-20250514",
});
// Invalid config throws with: "Config validation failed for provider 'claude-cli'. Path: ..."
const metrics = factory.getMetrics?.(PROVIDER_IDS.CLAUDE_CLI_ID); // invocations, lastError, lastInvocationMs
```

Custom adapter: `registry.register(myAdapter); createHarness(registry, myId, config)` with id from a constant.

## Simpill integration

This package uses [**@simpill** scoped packages](https://www.npmjs.com/search?q=scope%3Asimpill) on npm for shared patterns:

- **@simpill/env.utils** — type-safe env reads (e.g. `ACP_LLM_CLI_DEBUG`, command overrides) via `Env` and a small env-reader layer for test overrides.
- **@simpill/logger.utils** — structured logging; `createLogger()` returns an `ILogger` that delegates to `getLogger()` with debug gated by `ACP_LLM_CLI_DEBUG`.
- **@simpill/async.utils** — `retry` and `delay` for `restartWithBackoff` (exponential backoff with cap).
- **@simpill/errors.utils** — available for typed `AppError` and `serializeError`; adoption in throw paths can be done incrementally.
- **@simpill/protocols.utils** — transitive dependency of logger.utils (protocol constants).

## Mesh / ACPX compatibility

`llm-mesh` speaks ACPX (`acpx <claude|codex|cursor> exec …`) as an `Executor` adapter.
This package remains the typed harness for talking to provider CLIs directly:

| Provider | This package default | ACPX built-in |
|---|---|---|
| Claude | `claude-agent-acp` | `npx -y @agentclientprotocol/claude-agent-acp` (preferred bin `claude-agent-acp`) |
| Codex | `codex-acp` | `npx @zed-industries/codex-acp` (preferred bin `codex-acp`) |
| Cursor | `cursor-agent` print/stream-json | `cursor-agent acp` |

Live gates: `ACP_LLM_CLI_LIVE=1` for this package; `MESH_CLI_AGENT_LIVE=1` for llm-mesh.

## Env and config

All env keys are in `ENV_KEY` (see `src/domain/env.keys.ts`). Copy `.env.sample` to `.env` and set:

- `ACP_LLM_CLI_DEBUG` – truthy enables debug logging
- `ACP_LLM_CLI_CLAUDE_COMMAND` / `ACP_LLM_CLI_CLAUDE_ARGS` – overrides for Claude (same pattern for Gemini, Codex, Cursor)
- CLI-required keys: `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY` / `GEMINI_API_KEY`, `OPENAI_API_KEY`, `CURSOR_API_KEY`
- For `npm run update-models`: set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` (or `GOOGLE_API_KEY`), `XAI_API_KEY` to refresh model enums from provider APIs.

Resolution order: defaults (from `default.commands.ts`) → env (via `ENV_KEY` only) → passed config. All validated with Zod.

## Provider ids (constants)

| Constant | Value |
|----------|--------|
| `PROVIDER_IDS.CLAUDE_CLI_ID` | claude-cli |
| `PROVIDER_IDS.GEMINI_CLI_ID` | gemini-cli |
| `PROVIDER_IDS.CODEX_CLI_ID` | codex-cli |
| `PROVIDER_IDS.CURSOR_CLI_ID` | cursor-cli |

Default commands: `claude-agent-acp`, `gemini` + `--experimental-acp`, `codex-acp`, `cursor-agent`. See `DEFAULT_COMMANDS` and `src/domain/default.commands.ts`. These match ACPX’s preferred Claude/Codex wrappers; Cursor in this package uses print/stream-json (ACPX uses `cursor-agent acp` for ACP mode).

## Model enums and update-models script

Model IDs are exposed as enums (no raw strings). Use `ANTHROPIC_MODEL_IDS`, `OPENAI_MODEL_IDS`, `GEMINI_MODEL_IDS`, `XAI_MODEL_IDS` for type-safe model values. Provider configs validate `model` against the corresponding enum or allow any string for forward compatibility.

**Refresh enums (no API keys required):**

```bash
npm run update-models
```

Optional: set `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `XAI_API_KEY` to use provider APIs instead of OpenRouter.

The script uses **OpenRouter's public endpoint** (https://openrouter.ai/api/v1/models, no auth) when no keys are set. With API keys it uses provider APIs. Dry run: `ACP_LLM_CLI_MODELS_DRY_RUN=1 npm run update-models`.

## Generic CLI layer (args, help, schema)

All providers expose a **generic options schema** (model, outputFormat, inputFormat, stream, trust, sandbox, workspace, resume, sessionId, verbose, debug, print) and a **CLI spec** on the adapter for building args and extracting help.

### Argument builder

Configs support generic options; each provider maps them to its own flags. Build argv without magic strings:

```ts
import { getDefaultRegistry, getAdapter, PROVIDER_IDS } from "@simpill/acp-llm-cli";

const registry = getDefaultRegistry();
const adapter = getAdapter(registry, PROVIDER_IDS.CLAUDE_CLI_ID);
const spec = adapter?.cliSpec;
if (spec) {
  const argv = spec.buildArgs({
    command: "claude-code-acp",
    args: [],
    model: "claude-sonnet-4-20250514",
    outputFormat: "stream-json",
    print: true,
  });
  // argv = ["--model", "claude-sonnet-4-20250514", "--output-format", "stream-json", "--print"]
}
```

Use `buildGenericArgs(options, flagMap, baseArgs)` from the package for custom builders; provider `knownFlags` and `genericFlagMap` expose the flag names.

### Help extractor

Run the CLI with `--help` and get stdout for discovery or validation:

```ts
const helpText = await spec.getHelp({
  command: "claude-code-acp",
  args: spec.defaultArgs,
  cwd: process.cwd(),
});
```

`extractHelp(options)` is also exported for use without an adapter.

### Default args and schema

- **Default args** per provider: `adapter.cliSpec.defaultArgs` (from `DEFAULT_COMMANDS`).
- **Generic options** are in `genericLlmCliOptionsSchema`; provider configs extend base config with `.and(genericLlmCliOptionsSchema.partial())`.
- **Provider-specific flags** are in each provider’s `*_CLI_ARG` and `*_GENERIC_FLAG_MAP` in `constants.ts`.

## Provider structure (contributors)

Each provider lives in its own folder under `src/providers/<provider>/` with a consistent layout:

| File | Purpose |
|------|--------|
| `adapter.ts` | Registers with the harness: config schema, default command/args, `createRuntime(config)`, and optional `cliSpec`. |
| `schema.ts` | Zod config schema (extends `baseCliConfigSchema` and `genericLlmCliOptionsSchema.partial()`; add provider-specific options as needed). |
| `constants.ts` | Env keys for config resolution; `*_CLI_ARG` (all flags) and `*_GENERIC_FLAG_MAP` (generic option key → flag) for the arg builder. No magic strings. |
| `cli.definition.ts` | Implements `ICliSpec<Config>`: `defaultArgs`, `genericFlagMap`, `knownFlags`, `buildArgs(config)`, `getHelp(options)`. |

- **Claude, Gemini, Codex**: ACP over stdio; runtime is `createAcpCliHarnessRuntime(config)` (shared). Extend schema and add `*_CLI_ARG` entries when you need provider-specific options or flags.
- **Cursor**: Custom protocol (NDJSON subprocess); has its own `CursorAgentPort` and uses `CURSOR_CLI_ARG` for all flags. Use as the reference for a fully custom provider.

To add a new provider: create `src/providers/<name>/` with `adapter.ts`, `schema.ts`, `constants.ts`, and `cli.definition.ts`; add default command/args to `src/domain/default.commands.ts` and env keys to `src/domain/env.keys.ts`; register in `src/bootstrap.ts`.

## Extension API (streaming, lifecycle, session persistence)

The shared ACP runtime supports optional streaming and lifecycle orchestration. Use `capabilities` for feature detection.

### Streaming (streamPrompt)

Claude, Codex, and Gemini ports from `createAcpCliHarnessRuntime` support dual-envelope streaming:

```ts
if (port.capabilities?.streamPrompt && port.streamPrompt) {
  for await (const envelope of port.streamPrompt(
    { prompt: [{ type: "text", text: "Hello" }] },
    { envelopeMode: "openai" }
  )) {
    if (envelope.object === "chat.completion.chunk") {
      const text = envelope.choices[0]?.delta?.content;
      if (text) process.stdout.write(text);
    }
  }
}
```

**Envelope modes**: `openai` (OpenAI-compatible chunks), `native` (raw ACP session updates), `both`.

### Lifecycle (restart, open, close)

Ports from the shared runtime expose `restart()`, `open()`, and `close()`:

```ts
if (port.capabilities?.restart && port.restart) {
  await port.restart(); // disconnect + connect + initialize, with backoff retries
}
```

### Session persistence (opt-in)

Enable session save/restore on restart by passing `sessionPersistence` to `createAcpCliHarnessRuntime`:

```ts
import {
  createAcpCliHarnessRuntime,
  createMemorySessionPersistence,
} from "@simpill/acp-llm-cli/runtime";

const persistence = createMemorySessionPersistence();
const port = createAcpCliHarnessRuntime(config, {
  sessionPersistence: persistence,
  providerId: "claude-cli",
  workspace: "/path/to/project",
});
// On restart(), the port will load persisted session and call newSession(sessionId) to resume
```

For durable persistence across process restarts, implement `ISessionPersistence` with file or DB storage.

### Cursor compatibility

Cursor uses process-per-prompt and does not support streaming or lifecycle. Its `capabilities` explicitly set `streamPrompt`, `restart`, `openClose`, and `sessionPersistence` to `false`.

## Extensible module pattern (Provider enum + Factory)

- **Provider** — Enum-like const: `Provider.CLAUDE`, `Provider.GEMINI`, `Provider.CODEX`, `Provider.CURSOR` (values match `PROVIDER_IDS`). Use with Zod via `ProviderSchema`.
- **IProviderClient** — `{ provider: Provider; port: IAgentPort }`. Returned by the client factory.
- **ProviderClientFactory** — `getClient(provider: Provider, config: unknown): IProviderClient`. Delegates to `IProviderFactory.createRuntime`; validates provider and config. `listProviders(): Provider[]`.
- **Extending** — Add a new provider: (1) add entry to `Provider` and `PROVIDER_IDS`, (2) register the adapter in the registry (e.g. in `bootstrap.ts`), (3) no factory changes needed.

## Interfaces, factory, metrics, and logging

- **Interfaces**: `IProvider` (same as `IHarnessAdapter`), `IProviderFactory`, `IProviderMetrics` — see `src/runtime/interfaces/provider.types.ts`.
- **Factory**: `ProviderFactory` implements `IProviderFactory`: `createRuntime(id, config)` validates config with the provider's Zod schema and throws with messages from `VALIDATION_ERROR`; optional per-provider metrics and `createLogger(ProviderFactory)` logging (debug when `ACP_LLM_CLI_DEBUG` is set).
- **Metrics**: `ProviderMetricsCollector` holds `invocations`, `lastError`, `lastInvocationMs`; exposed via `factory.getMetrics(id)` when `collectMetrics` is true.
- **Validation errors**: All config and validation messages use `VALIDATION_ERROR` in `src/domain/validation.errors.ts`; no raw error strings in business logic.

## CLI research (scratchpad)

Commands and arguments for each CLI (Claude, Gemini, Codex, Cursor) and the mapping to **common** vs **provider-unique** features are documented in the repo scratchpad. Implementation links back to that doc:

- **Research doc**: `scratchpad/acp-llm-cli-cli-research.md` (in the repo root). Contains help-derived option tables, protocol notes, and the implementation reference (interfaces, factory, metrics, schemas, providers).

## Requirements

- Node.js >= 20
- One or more of: Claude CLI (claude-code-acp), Gemini CLI, Codex CLI, Cursor Agent CLI

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) (branching, Git Flow, PR expectations). Please read [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md). Report security issues per [SECURITY.md](./SECURITY.md), not via public issues.

## License

[ISC](./LICENSE)
