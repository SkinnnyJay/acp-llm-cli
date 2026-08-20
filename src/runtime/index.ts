// Public agent port types and interfaces

export type { ISessionPersistence, PersistedSession } from "../domain/session.persistence";
export type { WrapAgentPortOptions } from "./acp.agent.port.stream";
// Stream decorator — named class + factory
export { StreamAgentPort, wrapAgentPortWithStream } from "./acp.agent.port.stream";
export type { ACPClientOptions, IACPConnectionLike } from "./acp.client";
// ACP client factory
export { createAcpAgentPort } from "./acp.client";
export type { AcpSharedRuntimeOptions } from "./acp.runtime";
// Shared ACP CLI runtime builders (extension API)
export {
  createAcpCliHarnessRuntime,
  createStandardAcpRuntime,
} from "./acp.runtime";
export type {
  AgentPortCapabilities,
  AgentPortEvents,
  IAgentPort,
  StreamPromptOptions,
} from "./agent.port";
export type {
  BaseCliConfig,
  ConfigSchema,
  ConfigSchemaError,
  ConfigSchemaIssue,
  ConfigSchemaResult,
} from "./config";
// Config types and schema
export { baseCliConfigSchema } from "./config";
export { resolveBaseConfig } from "./config.resolve";
export type { IConnectionFactory } from "./connection.factory.interface";
// Connection abstractions (for consumers building custom connections)
export type { IConnection } from "./connection.interface";
export type { CreateCliHarnessAdapterParams } from "./create.cli.harness.adapter";
// Adapter creation
export { createCliHarnessAdapter } from "./create.cli.harness.adapter";
// Envelope mapper (public utility for consumers building custom providers)
export { createOpenAIFinishEnvelope, sessionUpdateToEnvelopes } from "./envelope.mapper";
// Harness adapter interface
export type { HarnessRuntime, IHarnessAdapter } from "./harness.adapter";
// Provider type interfaces
export type {
  IProvider,
  IProviderClient,
  IProviderClientFactory,
  IProviderFactory,
  IProviderMetrics,
} from "./interfaces/provider.types";
export type {
  LifecycleSessionPersistence,
  LifecycleSupervisorOptions,
} from "./lifecycle.supervisor";
// Lifecycle decorator — named class + factory
export { LifecycleAgentPort, wrapAgentPortWithLifecycle } from "./lifecycle.supervisor";
export { ProviderMetricsCollector } from "./metrics";
// Permission and tool host interfaces
export type { IPermissionHandler } from "./permission.handler.interface";
export { ProviderClient } from "./provider.client";
export { ProviderClientFactory } from "./provider.client.factory";
// Provider factory stack
export { ProviderFactory } from "./provider.factory";
// Registry
export { HarnessRegistry } from "./registry";
// Session persistence
export { createMemorySessionPersistence } from "./session.persistence.memory";
export type { SpawnFunction } from "./stdio.connection";
export { StdioConnection } from "./stdio.connection";
export { StdioConnectionFactory } from "./stdio.connection.factory";
export type { IToolHost } from "./tool.host.interface";
