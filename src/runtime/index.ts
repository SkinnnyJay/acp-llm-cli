// Public agent port types and interfaces
export type {
  IAgentPort,
  AgentPortEvents,
  AgentPortCapabilities,
  StreamPromptOptions,
} from "./agent.port";

// Stream decorator — named class + factory
export { StreamAgentPort, wrapAgentPortWithStream } from "./acp.agent.port.stream";
export type { WrapAgentPortOptions } from "./acp.agent.port.stream";

// Lifecycle decorator — named class + factory
export { LifecycleAgentPort, wrapAgentPortWithLifecycle } from "./lifecycle.supervisor";
export type { LifecycleSupervisorOptions } from "./lifecycle.supervisor";

// ACP client factory
export { createAcpAgentPort } from "./acp.client";
export type { ACPClientOptions, IACPConnectionLike } from "./acp.client";

// Envelope mapper (public utility for consumers building custom providers)
export { sessionUpdateToEnvelopes, createOpenAIFinishEnvelope } from "./envelope.mapper";

// Config types and schema
export { baseCliConfigSchema } from "./config";
export type { BaseCliConfig } from "./config";
export { resolveBaseConfig } from "./config.resolve";

// Provider factory stack
export { ProviderFactory } from "./provider.factory";
export { ProviderClient } from "./provider.client";
export { ProviderClientFactory } from "./provider.client.factory";
export { ProviderMetricsCollector } from "./metrics";

// Registry
export { HarnessRegistry } from "./registry";

// Adapter creation
export { createCliHarnessAdapter } from "./create.cli.harness.adapter";
export type { CreateCliHarnessAdapterParams } from "./create.cli.harness.adapter";

// Harness adapter interface
export type { IHarnessAdapter, HarnessRuntime } from "./harness.adapter";

// Provider type interfaces
export type {
  IProvider,
  IProviderClient,
  IProviderClientFactory,
  IProviderFactory,
  IProviderMetrics,
} from "./interfaces/provider.types";

// Connection abstractions (for consumers building custom connections)
export type { IConnection } from "./connection.interface";
export type { IConnectionFactory } from "./connection.factory.interface";
export { StdioConnection } from "./stdio.connection";
export type { SpawnFunction } from "./stdio.connection";
export { StdioConnectionFactory } from "./stdio.connection.factory";

// Permission and tool host interfaces
export type { IPermissionHandler } from "./permission.handler.interface";
export type { IToolHost } from "./tool.host.interface";

// Session persistence
export { createMemorySessionPersistence } from "./session.persistence.memory";
export type { ISessionPersistence, PersistedSession } from "../domain/session.persistence";

// Shared ACP CLI runtime builders (extension API)
export {
  createAcpCliHarnessRuntime,
  createStandardAcpRuntime,
} from "../providers/acp.shared";
export type { AcpSharedRuntimeOptions } from "../providers/acp.shared";
