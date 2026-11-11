# Public API (`@simpill/acp-llm-cli`)

Curated exports from the package root. Prefer this surface for applications.

## Start here

| Export | Kind | Purpose |
|--------|------|---------|
| `getDefaultProviderClientFactory` | fn | Recommended entry: `getClient(Provider.*, config, runtimeOptions?)` |
| `getDefaultFactory` | fn | `createRuntime(id, config, runtimeOptions?)` by provider id |
| `getDefaultRegistry` / `createHarness` / `getAdapter` | fn | Custom registry wiring |
| `HarnessRegistry` | class | Construct your own registry (`new HarnessRegistry()`) |
| `Provider` / `PROVIDER_VALUES` / `ProviderSchema` | const/type | Provider enum + Zod |
| `PROVIDER_IDS` | const | String ids (`claude-cli`, …) |
| `DEFAULT_COMMANDS` | const | Default binaries/args |
| `ENV_KEY` | const | Env key constants |

## Ports and runtime options

| Export | Kind | Purpose |
|--------|------|---------|
| `IAgentPort` / `AgentPortCapabilities` / `StreamPromptOptions` | type | Agent port contract |
| `IProviderClient` / `IProviderClientFactory` / `IProviderFactory` / `IProviderMetrics` | type | Factory interfaces |
| `ProviderMetricsCollector` | class | Holds `invocations`, `lastError`, `lastInvocationMs`; reached via `factory.getMetrics(id)` when `collectMetrics` is on |
| `ProviderFactory` / `ProviderClientFactory` / `ProviderClient` | class | Explicit factory construction |
| `createAcpCliHarnessRuntime` / `createStandardAcpRuntime` | fn | Build ACP ports (also on `./runtime`) |
| `AcpSharedRuntimeOptions` | type | Persistence, permissions, envelope, lifecycle |
| `createMemorySessionPersistence` | fn | In-memory `ISessionPersistence` |
| `ISessionPersistence` / `PersistedSession` | type | Records session id and cwd; the conversation is not restored in this release |
| `createAcpAgentPort` / `ACPClientOptions` | fn/type | Low-level ACP client over a connection |
| `baseCliConfigSchema` / `BaseCliConfig` | schema/type | Shared CLI config |
| `ConfigSchema` / `ConfigSchemaResult` / `ConfigSchemaError` / `ConfigSchemaIssue` | type | The `parse`/`safeParse` surface an adapter config schema must provide, spelled structurally so it holds across both supported zod majors |

## Errors

| Export | Kind | Purpose |
|--------|------|---------|
| `AcpCliError` | class | Base of every error the package raises: `code`, `subsystem`, `providerId?`, `sessionId?`, `hint?`, `cause` |
| `ConfigError` / `AgentProcessError` / `ConnectionError` / `AgentProtocolError` | class | One per subsystem: config, process, connection, protocol (agent JSON-RPC errors) |
| `UnsupportedCapabilityError` / `InvalidStateError` / `ToolHostError` / `TimeoutError` | class | One per subsystem: capability, usage, tool host, timeout |
| `ACP_ERROR_CODE` / `AcpErrorCode` | const/type | The stable codes to branch on |
| `ACP_ERROR_SUBSYSTEM` / `AcpErrorSubsystem` | const/type | Subsystem names |
| `PROVIDER_SETUP` / `ProviderSetup` | const/type | Install and login command per built-in provider; the source of `hint` |

See the README section "Errors you can branch on" for the codes per class and the JSON-RPC mapping.

## Streaming

| Export | Kind | Purpose |
|--------|------|---------|
| `ENVELOPE_MODE` / `EnvelopeMode` | const/type | `openai` \| `native` \| `both` |
| `OpenAIStyleChunkEnvelope` | type | The OpenAI-compatible chunk shape |
| `StreamEnvelope` / `isNativeEnvelope` / `isOpenAIEnvelope` | type/guard | Dual-envelope stream types |
| `OPENAI_FINISH_REASON` / `OpenAIFinishReason` | const/type | The closed set of `finish_reason` values emitted on OpenAI-style envelopes: `stop`, `length`, `content_filter`, `tool_calls` |
| `PORT_CAPABILITY` / `PortCapabilityName` | const/type | Capability flag names |

The terminal chunk carries a real `finish_reason` translated from the agent's ACP stop reason: `max_tokens` and `max_turn_requests` become `length`, `refusal` becomes `content_filter`, and `end_turn`/`cancelled` become `stop`. Switch on `OPENAI_FINISH_REASON` rather than raw strings — a truncated or refused turn is not a clean completion.

`streamPrompt` filters inbound `sessionUpdate` events by `params.sessionId` and rejects concurrent `streamPrompt` calls on the same port (`STREAM_PROMPT_IN_PROGRESS`). The port stays busy until the underlying prompt settles, so abandoning the iterator early does not free it.

## Models

| Export | Kind | Purpose |
|--------|------|---------|
| `ANTHROPIC_MODEL_IDS` / `AnthropicModelIdSchema` | const/schema | Claude model enum |
| `OPENAI_MODEL_IDS` / `OpenAIModelIdSchema` | const/schema | OpenAI / Codex |
| `GEMINI_MODEL_IDS` / `GeminiModelIdSchema` | const/schema | Gemini model ids (there is no Gemini provider; see Antigravity) |
| `XAI_MODEL_IDS` / `XAIModelIdSchema` | const/schema | xAI |

Provider `model` config accepts **any string**. It is a label, not a constraint: ACP providers select their model over the protocol or via `args`, and the configured value is threaded through as the default model id on OpenAI-style stream envelopes. The exported `*ModelIdSchema` are strict opt-in validators - parse with one explicitly if you want a model id checked against a vendor catalogue.

## CLI helpers

| Export | Kind | Purpose |
|--------|------|---------|
| `buildGenericArgs` / `genericLlmCliOptionsSchema` | fn/schema | Generic flag builder |
| `GenericLlmCliOptions` / `GENERIC_OPTION_KEY` / `GenericOptionKey` | type/const | The shared option set and its keys |
| `GenericFlagMap` | type | Option key -> this provider's flag string |
| `BuiltCliInvocation` | type | A built command plus argv |
| `extractHelp` / `HELP_FLAG` / `HelpExtractorOptions` | fn/const/type | `--help` extraction. Resolves only on exit 0; rejects on a non-zero exit, on a timeout, and on a signal kill (`code === null`) rather than returning whatever partial output was captured |
| `ICliSpec` / `GetHelpOptions` | type | Adapter CLI surface |
| `CliArgsInput` | type | What `ICliSpec.buildArgs` accepts: the provider config plus generic options, with `args`/`env` optional |

## Extension API (`@simpill/acp-llm-cli/runtime`)

The runtime types and classes above are re-exported here; the application conveniences (`getDefault*`, `createHarness`, `getAdapter`, and the CLI and domain constants) are root-only — the two entry points overlap rather than nest. What follows is available *only* from `/runtime` — reach for it when building a custom port, adapter, or connection rather than consuming one.

### Decorators

| Export | Kind | Purpose |
|--------|------|---------|
| `StreamAgentPort` / `wrapAgentPortWithStream` | class/fn | Adds `streamPrompt` to a port |
| `WrapAgentPortOptions` | type | Envelope mode and model label for the stream decorator |
| `LifecycleAgentPort` / `wrapAgentPortWithLifecycle` | class/fn | Adds `restart`/`open`/`close` and backoff; `restart()` restarts and re-initializes the process, and the conversation is not restored in this release |
| `LifecycleSupervisorOptions` / `LifecycleSessionPersistence` | type | Lifecycle tuning; persistence is grouped under `persistence` |

### Connections

| Export | Kind | Purpose |
|--------|------|---------|
| `StdioConnection` / `StdioConnectionFactory` | class | Default stdio transport and its factory |
| `SpawnFunction` | type | Inject a spawn implementation, mainly for tests |
| `IConnection` / `IConnectionFactory` | type | Implement these for a non-stdio transport |
| `ConnectionStatus` | type | Port and connection state |
| `IACPConnectionLike` | type | The connection surface the ACP client needs |

### Adapters and config

| Export | Kind | Purpose |
|--------|------|---------|
| `createCliHarnessAdapter` / `CreateCliHarnessAdapterParams` | fn/type | Build an `IHarnessAdapter` from a schema and a runtime factory |
| `HarnessRegistry` | class | Register adapters; a value export, so `new HarnessRegistry()` works |
| `HarnessRuntime` | type | Alias for `IAgentPort` |
| `resolveBaseConfig` | fn | Apply defaults and `ENV_KEY` overrides ahead of `schema.parse`. Returns your config with the resolved base fields applied over it, so provider-specific fields survive and you can pass the result straight to `schema.parse` |

### Ports, envelopes, hosts

| Export | Kind | Purpose |
|--------|------|---------|
| `AgentPortEvents` | type | The event map an `IAgentPort` emits |
| `sessionUpdateToEnvelopes` / `createOpenAIFinishEnvelope` | fn | Map ACP session updates to stream envelopes |
| `IPermissionHandler` | type | Decide permission requests; **absent means cancel**, never auto-allow |
| `IToolHost` | type | Terminal and filesystem operations an agent may request |

## Peer dependencies

`zod` (`^3.25.76 || ^4.0.0`) and `eventemitter3` (`^5.0.1`) are peers. Both zod majors are typechecked and tested in CI, so either satisfies the range.

## Safety defaults (0.2.0+)

**`toolHost` implies capabilities.** Supplying `toolHost` with no explicit
`clientCapabilities` now makes the client advertise `fs.readTextFile`, `fs.writeTextFile` and
`terminal` during `initialize`, so a conforming agent will begin issuing `fs/*` and `terminal/*`
requests. Those are direct client methods in ACP - they do **not** pass through
`permissionHandler`, so the deny-by-default permission rule does not gate them. Previously the
client advertised nothing and a supplied tool host was never called at all.

`IToolHost` requires all seven methods to *exist*, not to *work*, so stubbing the terminal
methods and relying on them never being reached is no longer safe. To advertise a narrower set -
filesystem only, or read-only - pass `clientCapabilities` explicitly; an explicit value replaces
the derived one outright and is never merged with it.


- Permission requests without a `permissionHandler` are **cancelled** (never auto-allow).
- No flag is added to a spawned binary for you: the ACP runtime starts `command` with `args` exactly as resolved, so `--trust` reaches `cursor-agent` only if you put it in `args`.
- Stderr in thrown errors is redacted/truncated unless `ACP_LLM_CLI_DEBUG` is set.
