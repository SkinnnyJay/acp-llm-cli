import type { EnvelopeMode } from "../domain/envelope.mode";
import { ERROR_MESSAGE } from "../domain/error.messages";
import type { ISessionPersistence } from "../domain/session.persistence";
import { wrapAgentPortWithStream } from "../runtime/acp.agent.port.stream";
import { createAcpAgentPort } from "../runtime/acp.client";
import type { ACPClientOptions } from "../runtime/acp.client";
import type { IAgentPort } from "../runtime/agent.port";
import type { BaseCliConfig, ConfigSchema } from "../runtime/config";
import { resolveBaseConfig } from "../runtime/config.resolve";
import type { IConnectionFactory } from "../runtime/connection.factory.interface";
import type { IConnection } from "../runtime/connection.interface";
import { wrapAgentPortWithLifecycle } from "../runtime/lifecycle.supervisor";
import type { LifecycleSupervisorOptions } from "../runtime/lifecycle.supervisor";
import { StdioConnectionFactory } from "../runtime/stdio.connection.factory";

/** Options for the shared ACP runtime: client options plus optional stream/lifecycle tuning. */
export interface AcpSharedRuntimeOptions extends ACPClientOptions {
  /** Envelope mode for streamPrompt: openai, native, or both. Default: both. */
  envelopeMode?: EnvelopeMode;
  /** Model id used in OpenAI-style stream envelopes. */
  modelId?: string;
  /** Optional session persistence. When provided, enables save/restore on restart. */
  sessionPersistence?: ISessionPersistence;
  /**
   * Provider id for persistence key and lifecycle identity.
   * Required when sessionPersistence is provided.
   */
  providerId?: string;
  /** Workspace for persistence key. */
  workspace?: string;
  /** Restart backoff options for lifecycle supervisor. */
  restartOptions?: LifecycleSupervisorOptions["restartOptions"];
  /** If true, resume session after restart using persisted sessionId. Default: true when sessionPersistence is set. */
  resumeOnRestart?: boolean;
}

/**
 * Build connection from config, create IAgentPort with dual-envelope streaming
 * and lifecycle (restart, open, close, optional session persistence).
 */
export function createAcpCliHarnessRuntime(
  config: BaseCliConfig,
  options?: AcpSharedRuntimeOptions,
  connectionFactory?: IConnectionFactory
): IAgentPort {
  const factory = connectionFactory ?? new StdioConnectionFactory();
  const connection: IConnection = factory.create({
    command: config.command,
    args: config.args,
    cwd: config.cwd,
    env: config.env,
  });
  const {
    envelopeMode,
    modelId,
    sessionPersistence,
    providerId,
    workspace,
    restartOptions,
    resumeOnRestart,
    ...clientOptions
  } = options ?? {};

  if (sessionPersistence && !providerId) {
    throw new Error(ERROR_MESSAGE.SESSION_PERSISTENCE_PROVIDER_ID_REQUIRED);
  }

  const port = createAcpAgentPort(connection, clientOptions);
  const streamed = wrapAgentPortWithStream(port, { envelopeMode, modelId });
  // Always wrap with lifecycle for restart/open/close; persistence remains optional.
  return wrapAgentPortWithLifecycle(streamed, {
    sessionPersistence,
    providerId: providerId ?? "acp-cli",
    workspace,
    restartOptions,
    resumeOnRestart,
  });
}

/**
 * Standard runtime creator: resolve defaults/env overrides, validate with schema,
 * then create the shared ACP CLI runtime.
 */
export function createStandardAcpRuntime<TConfig extends BaseCliConfig>(
  config: TConfig,
  defaults: Parameters<typeof resolveBaseConfig>[0],
  configKeys: Parameters<typeof resolveBaseConfig>[1],
  schema: ConfigSchema<TConfig>,
  runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort {
  const resolved = resolveBaseConfig(defaults, configKeys, config);
  const parsed = schema.parse(resolved);
  return createAcpCliHarnessRuntime(parsed, runtimeOptions);
}
