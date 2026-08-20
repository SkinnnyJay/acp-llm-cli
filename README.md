# @simpill/acp-llm-cli

[![CI](https://github.com/SkinnnyJay/acp-llm-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/SkinnnyJay/acp-llm-cli/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@simpill/acp-llm-cli)](https://www.npmjs.com/package/@simpill/acp-llm-cli)
[![node](https://img.shields.io/node/v/@simpill/acp-llm-cli)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/@simpill/acp-llm-cli)](./LICENSE)

One typed TypeScript client for the coding-agent CLIs — Claude, Codex, Gemini, and Cursor — behind a single interface.

## Why

Every coding-agent vendor ships a CLI, and every CLI wants to be driven differently. Some speak the [Agent Client Protocol](https://agentclientprotocol.com) over stdio; Cursor streams NDJSON and exits per prompt. Their flags disagree, their streaming formats disagree, and each one fails in its own way when the subprocess dies mid-turn.

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
  model: ANTHROPIC_MODEL_IDS.CLAUDE_SONNET_4_6,
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

Swap `Provider.CLAUDE` for `Provider.CODEX`, `Provider.GEMINI`, or `Provider.CURSOR` and nothing else changes. `factory.listProviders()` returns all of them.

Runnable versions live in [`examples/`](./examples) — `minimal-claude.ts`, `cursor-print.ts`, `stream-prompt.ts`. Run `npm run build` first.

## Providers

| Provider | `Provider` value | Default command | Transport |
|---|---|---|---|
| Claude | `Provider.CLAUDE` | `claude-agent-acp` | ACP over stdio |
| Codex | `Provider.CODEX` | `codex-acp` | ACP over stdio |
| Gemini | `Provider.GEMINI` | `gemini --experimental-acp` | ACP over stdio |
| Cursor | `Provider.CURSOR` | `cursor-agent` | NDJSON, process per prompt |

Defaults live in `DEFAULT_COMMANDS` and can be overridden per provider through config or environment. The Claude and Codex bins match the wrappers ACPX prefers, so the two can front the same installation.

Cursor is the outlier: it spawns a process per prompt, so it supports neither streaming nor lifecycle. Its `capabilities` report `streamPrompt`, `restart`, `openClose`, and `sessionPersistence` as `false` — check them rather than assuming.

## Configuration

Config resolves in one direction, last wins:

```
DEFAULT_COMMANDS  →  environment (ENV_KEY)  →  config you pass
```

The result is validated against the provider's Zod schema before a process is spawned.

Copy `.env.sample` to `.env`. Every key this package reads is declared in `ENV_KEY` (`src/domain/env.keys.ts`):

| Variable | Purpose |
|---|---|
| `ACP_LLM_CLI_DEBUG` | Truthy enables debug logging |
| `ACP_LLM_CLI_CLAUDE_COMMAND` | Override the Claude binary — same pattern for `GEMINI`, `CODEX`, `CURSOR` |
| `ACP_LLM_CLI_CLAUDE_ARGS` | Override the Claude default args |
| `ACP_LLM_CLI_LIVE` | Set to `1` to run tests that spawn real CLIs |

The provider CLIs read their own credentials — `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY` or `GOOGLE_API_KEY`, `CURSOR_API_KEY`. This package never reads or forwards them.

## Streaming

Claude, Codex, and Gemini stream. Feature-detect, then iterate:

```ts
if (port.capabilities?.streamPrompt && port.streamPrompt) {
  for await (const envelope of port.streamPrompt(
    { sessionId, prompt: [{ type: "text", text: "Hello" }] },
    { envelopeMode: "openai" }
  )) {
    if (envelope.object === "chat.completion.chunk") {
      process.stdout.write(envelope.choices[0]?.delta?.content ?? "");
    }
  }
}
```

`envelopeMode` is `openai` for OpenAI-compatible chunks, `native` for raw ACP session updates, or `both`.

## Lifecycle and session persistence

Ports wrapped by the shared ACP runtime expose `restart()`, `open()`, and `close()`. `restart()` retries on an awaited, capped exponential backoff.

To survive a restart with the conversation intact, pass a persistence store:

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
  await port.restart?.(); // reloads and resumes the persisted session
}
```

`createMemorySessionPersistence()` is process-local. For anything durable, implement `ISessionPersistence` over a file or database.

## Building CLI arguments

Every adapter carries a `cliSpec` that turns typed options into argv, so callers never hand-write flags:

```ts
import { getAdapter, getDefaultRegistry, PROVIDER_IDS } from "@simpill/acp-llm-cli";

const adapter = getAdapter(getDefaultRegistry(), PROVIDER_IDS.CLAUDE_CLI_ID);
const argv = adapter?.cliSpec?.buildArgs({
  command: "claude-agent-acp",
  args: [],
  model: "claude-sonnet-4-20250514",
  outputFormat: "stream-json",
  print: true,
});
// ["--model", "claude-sonnet-4-20250514", "--output-format", "stream-json", "--print"]
```

The generic options — `model`, `outputFormat`, `inputFormat`, `stream`, `trust`, `sandbox`, `workspace`, `resume`, `sessionId`, `verbose`, `debug`, `print` — are shared across providers and mapped to each one's real flags. `buildGenericArgs` is exported for custom builders.

`cliSpec.getHelp()` shells out to the CLI's `--help` and returns stdout, which is useful for discovery and for checking that an installed CLI supports what you are about to send:

```ts
const helpText = await adapter.cliSpec.getHelp({
  command: "claude-agent-acp",
  args: adapter.cliSpec.defaultArgs,
  cwd: process.cwd(),
});
```

## Model IDs

Model IDs are exported as const objects — `ANTHROPIC_MODEL_IDS`, `OPENAI_MODEL_IDS`, `GEMINI_MODEL_IDS`, `XAI_MODEL_IDS` — so editors autocomplete them and typos fail to compile. Schemas also accept any string, so a model released this morning is never blocked by this package's release cadence.

Refresh them from live provider catalogues:

```bash
npm run update-models                              # OpenRouter's public endpoint, no key needed
ACP_LLM_CLI_MODELS_DRY_RUN=1 npm run update-models # preview the diff
```

Setting `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, or `XAI_API_KEY` makes the script use that provider's own API instead.

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
| `constants.ts` | Env keys, `*_CLI_ARG` flag names, and `*_GENERIC_FLAG_MAP` |
| `cli.definition.ts` | `ICliSpec` — `defaultArgs`, `genericFlagMap`, `knownFlags`, `buildArgs`, `getHelp` |
| `adapter.ts` | Ties them together and exposes `createRuntime(config)` |

Then add the default command to `src/domain/default.commands.ts`, the env keys to `src/domain/env.keys.ts`, and register the adapter in `src/bootstrap.ts`. If the CLI speaks ACP over stdio, `createAcpCliHarnessRuntime(config)` is the whole runtime. If it does not, `src/providers/cursor/` is the reference for a fully custom port.

### Architecture notes

`IProviderFactory.createRuntime` validates config against the provider schema and throws with messages from `VALIDATION_ERROR`; no raw error strings live in business logic. Pass `collectMetrics` to expose `invocations`, `lastError`, and `lastInvocationMs` through `factory.getMetrics(id)`. Logging goes through `createLogger()`, with debug output gated on `ACP_LLM_CLI_DEBUG`.

This package builds on the [`@simpill`](https://www.npmjs.com/search?q=scope%3Asimpill) utilities for env reads (`env.utils`), structured logging (`logger.utils`), and async helpers (`async.utils`). `errors.utils`, `patterns.utils`, and `protocols.utils` are declared directly so packed installs resolve their transitive requirements.

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) covers branching and PR expectations, and [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) applies to every interaction here. `npm run verify` runs lint, typecheck, build, and tests — the same gate CI applies.

Report security issues privately per [SECURITY.md](./SECURITY.md), never as a public issue.

## License

[ISC](./LICENSE)
