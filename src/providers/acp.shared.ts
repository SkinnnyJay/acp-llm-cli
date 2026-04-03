import type { z } from "zod";
import type { EnvelopeMode } from "../domain/envelope.mode";
import { PROVIDER_IDS } from "../domain/provider.ids";
import { wrapAgentPortWithStream } from "../runtime/acp.agent.port.stream";
import { createAcpAgentPort } from "../runtime/acp.client";
import type { ACPClientOptions } from "../runtime/acp.client";
import type { IAgentPort } from "../runtime/agent.port";
import type { BaseCliConfig } from "../runtime/config";
import { resolveBaseConfig } from "../runtime/config.resolve";
import type { IConnectionFactory } from "../runtime/connection.factory.interface";
import type { IConnection } from "../runtime/connection.interface";
import { wrapAgentPortWithLifecycle } from "../runtime/lifecycle.supervisor";
import type { LifecycleSupervisorOptions } from "../runtime/lifecycle.supervisor";
import { StdioConnectionFactory } from "../runtime/stdio.connection.factory";
import type { ISessionPersistence } from "../domain/session.persistence";

/** Options for the shared ACP runtime: client options plus optional stream/lifecycle tuning. */
export interface AcpSharedRuntimeOptions extends ACPClientOptions {
  /** Envelope mode for streamPrompt: openai, native, or both. Default: both. */
  envelopeMode?: EnvelopeMode;
  /** Model id used in OpenAI-style stream envelopes. */
  modelId?: string;
  /** Optional session persistence. When provided, enables lifecycle supervisor with save/restore on restart. */
  sessionPersistence?: ISessionPersistence;
  /** Provider id for persistence key (e.g. PROVIDER_IDS.CLAUDE_CLI_ID). Default: claude. */
  providerId?: string;
  /** Workspace for persistence key. */
  workspace?: string;
  /** Restart backoff options for lifecycle supervisor. */
  restartOptions?: LifecycleSupervisorOptions["restartOptions"];
  /** If true, resume session after restart using persisted sessionId. Default: true when sessionPersistence is set. */
  resumeOnRestart?: boolean;
}

/**
 * Build connection from config, create IAgentPort with optional dual-envelope streaming
 * and lifecycle (restart, open, close, session persistence). Used by Claude, Codex, Gemini.
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
    providerId = PROVIDER_IDS.CLAUDE_CLI_ID,
    workspace,
    restartOptions,
    resumeOnRestart,
    ...clientOptions
  } = options ?? {};
  const port = createAcpAgentPort(connection, clientOptions);
  let wrapped = wrapAgentPortWithStream(port, { envelopeMode, modelId });
  if (sessionPersistence) {
    wrapped = wrapAgentPortWithLifecycle(wrapped, {
      sessionPersistence,
      providerId,
      workspace,
      restartOptions,
      resumeOnRestart,
    });
  }
  return wrapped;
}

/**
 * Standard runtime creator: resolve defaults/env overrides, validate with schema,
 * then create the shared ACP CLI runtime.
 */
export function createStandardAcpRuntime<TConfig extends BaseCliConfig>(
  config: TConfig,
  defaults: Parameters<typeof resolveBaseConfig>[0],
  configKeys: Parameters<typeof resolveBaseConfig>[1],
  schema: z.ZodType<TConfig, z.ZodTypeDef, unknown>
): IAgentPort {
  const resolved = resolveBaseConfig(defaults, configKeys, config);
  const parsed = schema.parse(resolved);
  return createAcpCliHarnessRuntime(parsed);
}
