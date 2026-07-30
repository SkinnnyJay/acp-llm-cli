# Public API (`@simpill/acp-llm-cli`)

Curated exports from the package root. Prefer this surface for applications.

## Start here

| Export | Kind | Purpose |
|--------|------|---------|
| `getDefaultProviderClientFactory` | fn | Recommended entry: `getClient(Provider.*, config, runtimeOptions?)` |
| `getDefaultFactory` | fn | `createRuntime(id, config, runtimeOptions?)` by provider id |
| `getDefaultRegistry` / `createHarness` / `getAdapter` | fn | Custom registry wiring |
| `Provider` / `PROVIDER_VALUES` / `ProviderSchema` | const/type | Provider enum + Zod |
| `PROVIDER_IDS` | const | String ids (`claude-cli`, …) |
| `DEFAULT_COMMANDS` | const | Default binaries/args |
| `ENV_KEY` | const | Env key constants |

## Ports and runtime options

| Export | Kind | Purpose |
|--------|------|---------|
| `IAgentPort` / `AgentPortCapabilities` / `StreamPromptOptions` | type | Agent port contract |
| `IProviderClient` / `IProviderClientFactory` / `IProviderFactory` | type | Factory interfaces |
| `ProviderFactory` / `ProviderClientFactory` / `ProviderClient` | class | Explicit factory construction |
| `createAcpCliHarnessRuntime` / `createStandardAcpRuntime` | fn | Build ACP ports (also on `./runtime`) |
| `AcpSharedRuntimeOptions` | type | Persistence, permissions, envelope, lifecycle |
| `createMemorySessionPersistence` | fn | In-memory `ISessionPersistence` |
| `ISessionPersistence` / `PersistedSession` | type | Session save/restore |
| `createAcpAgentPort` / `ACPClientOptions` | fn/type | Low-level ACP client over a connection |
| `baseCliConfigSchema` / `BaseCliConfig` | schema/type | Shared CLI config |

## Streaming

| Export | Kind | Purpose |
|--------|------|---------|
| `ENVELOPE_MODE` / `EnvelopeMode` | const/type | `openai` \| `native` \| `both` |
| `StreamEnvelope` / `isNativeEnvelope` / `isOpenAIEnvelope` | type/guard | Dual-envelope stream types |
| `PORT_CAPABILITY` | const | Capability flag names |

`streamPrompt` filters inbound `sessionUpdate` events by `params.sessionId` and rejects concurrent `streamPrompt` calls on the same port (`STREAM_PROMPT_IN_PROGRESS`).

## Models

| Export | Kind | Purpose |
|--------|------|---------|
| `ANTHROPIC_MODEL_IDS` / `AnthropicModelIdSchema` | const/schema | Claude model enum |
| `OPENAI_MODEL_IDS` / `OpenAIModelIdSchema` | const/schema | OpenAI / Codex |
| `GEMINI_MODEL_IDS` / `GeminiModelIdSchema` | const/schema | Gemini |
| `XAI_MODEL_IDS` / `XAIModelIdSchema` | const/schema | xAI |

Provider `model` config accepts the provider enum **or any string** (open escape for new model ids before `npm run update-models` refreshes the enum).

## CLI helpers

| Export | Kind | Purpose |
|--------|------|---------|
| `buildGenericArgs` / `genericLlmCliOptionsSchema` | fn/schema | Generic flag builder |
| `extractHelp` / `HELP_FLAG` | fn/const | `--help` extraction |
| `ICliSpec` / `GetHelpOptions` | type | Adapter CLI surface |

## Extension API (`@simpill/acp-llm-cli/runtime`)

Use for custom adapters and decorators: `StreamAgentPort`, `LifecycleAgentPort`, `StdioConnection`, `StdioConnectionFactory`, envelope mapper, session persistence, and the shared ACP runtime builders above.

## Safety defaults (0.2.0+)

- Permission requests without a `permissionHandler` are **cancelled** (never auto-allow).
- Cursor `--trust` is passed only when `trust: true` in config.
- Stderr in thrown errors is redacted/truncated unless `ACP_LLM_CLI_DEBUG` is set.
