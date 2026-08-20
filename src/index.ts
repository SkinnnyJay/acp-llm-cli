export {
  getDefaultRegistry,
  getDefaultFactory,
  getDefaultProviderClientFactory,
  createHarness,
  getAdapter,
} from "./bootstrap";
export type {
  IProviderFactory,
  IProvider,
  IProviderMetrics,
  IProviderClient,
  IProviderClientFactory,
} from "./runtime/interfaces/provider.types";
export { ProviderFactory } from "./runtime/provider.factory";
export { ProviderClientFactory } from "./runtime/provider.client.factory";
export { ProviderClient } from "./runtime/provider.client";
export { ProviderMetricsCollector } from "./runtime/metrics";
export { Provider, ProviderSchema, PROVIDER_VALUES } from "./domain/provider";
export { VALIDATION_ERROR } from "./domain/validation.errors";
export type { HarnessRegistry } from "./runtime/registry";
export type { IHarnessAdapter } from "./runtime/harness.adapter";
export type {
  IAgentPort,
  AgentPortCapabilities,
  StreamPromptOptions,
} from "./runtime/agent.port";
export type {
  StreamEnvelope,
  OpenAIStyleChunkEnvelope,
  NativeEnvelope,
} from "./domain/stream.envelopes";
export { isNativeEnvelope, isOpenAIEnvelope } from "./domain/stream.envelopes";
export { ENVELOPE_MODE } from "./domain/envelope.mode";
export type { EnvelopeMode } from "./domain/envelope.mode";
export { PORT_CAPABILITY } from "./domain/port.capabilities";
export type { PortCapabilityName } from "./domain/port.capabilities";
export type {
  BaseCliConfig,
  ConfigSchema,
  ConfigSchemaError,
  ConfigSchemaIssue,
  ConfigSchemaResult,
} from "./runtime/config";
export type { IConnection } from "./runtime/connection.interface";
export type { ConnectionStatus } from "./domain/connection.status";
export { PROVIDER_IDS } from "./domain/provider.ids";
export { ENV_KEY } from "./domain/env.keys";
export { DEFAULT_COMMANDS } from "./domain/default.commands";
export {
  MODEL_IDS as ANTHROPIC_MODEL_IDS,
  ModelIdSchema as AnthropicModelIdSchema,
  MODEL_ID_LIST as ANTHROPIC_MODEL_ID_LIST,
} from "./domain/models/anthropic.models";
export type { ModelId as AnthropicModelId } from "./domain/models/anthropic.models";
export {
  MODEL_IDS as OPENAI_MODEL_IDS,
  ModelIdSchema as OpenAIModelIdSchema,
  MODEL_ID_LIST as OPENAI_MODEL_ID_LIST,
} from "./domain/models/openai.models";
export type { ModelId as OpenAIModelId } from "./domain/models/openai.models";
export {
  MODEL_IDS as GEMINI_MODEL_IDS,
  ModelIdSchema as GeminiModelIdSchema,
  MODEL_ID_LIST as GEMINI_MODEL_ID_LIST,
} from "./domain/models/gemini.models";
export type { ModelId as GeminiModelId } from "./domain/models/gemini.models";
export {
  MODEL_IDS as XAI_MODEL_IDS,
  ModelIdSchema as XAIModelIdSchema,
  MODEL_ID_LIST as XAI_MODEL_ID_LIST,
} from "./domain/models/xai.models";
export type { ModelId as XAIModelId } from "./domain/models/xai.models";
export { baseCliConfigSchema } from "./runtime/config";
export { createAcpAgentPort } from "./runtime/acp.client";
export type { ACPClientOptions } from "./runtime/acp.client";
export {
  createAcpCliHarnessRuntime,
  createStandardAcpRuntime,
} from "./providers/acp.shared";
export type { AcpSharedRuntimeOptions } from "./providers/acp.shared";
export { createMemorySessionPersistence } from "./runtime/session.persistence.memory";
export type { ISessionPersistence, PersistedSession } from "./domain/session.persistence";

export {
  genericLlmCliOptionsSchema,
  GENERIC_OPTION_KEY,
  GENERIC_OPTION_DEFAULTS,
  buildGenericArgs,
  extractHelp,
  HELP_FLAG,
} from "./cli/index";
export type {
  GenericLlmCliOptions,
  GenericOptionKey,
  GenericFlagMap,
  ICliSpec,
  GetHelpOptions,
  BuiltCliInvocation,
} from "./cli/index";
