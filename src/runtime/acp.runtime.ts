import type { EnvelopeMode } from "../domain/envelope.mode";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { ACP_ERROR_CODE, InvalidStateError } from "../domain/errors";
import type { ISessionPersistence } from "../domain/session.persistence";
import { wrapAgentPortWithStream } from "./acp.agent.port.stream";
import type { ACPClientOptions } from "./acp.client";
import { createAcpAgentPort } from "./acp.client";
import type { IAgentPort } from "./agent.port";
import type { BaseCliConfig, ConfigSchema } from "./config";
import { resolveBaseConfig } from "./config.resolve";
import type { IConnectionFactory } from "./connection.factory.interface";
import type { IConnection } from "./connection.interface";
import type { LifecycleSupervisorOptions } from "./lifecycle.supervisor";
import { wrapAgentPortWithLifecycle } from "./lifecycle.supervisor";
import { StdioConnectionFactory } from "./stdio.connection.factory";

/** Options for the shared ACP runtime: client options plus optional stream/lifecycle tuning. */
/** `command` is omitted: the runtime always names `config.command` on errors. */
export interface AcpSharedRuntimeOptions extends Omit<ACPClientOptions, "command"> {
  /** Envelope mode for streamPrompt: openai, native, or both. Default: both. */
  envelopeMode?: EnvelopeMode;
  /** Model id used in OpenAI-style stream envelopes. */
  modelId?: string;
  /** Optional session persistence. When provided, the store records the session id and cwd; restoring the conversation is not implemented in this release. */
  sessionPersistence?: ISessionPersistence;
  /**
   * Provider id: the persistence key, and the provider named on errors (it selects the install
   * and login hints from PROVIDER_SETUP). Required when sessionPersistence is provided.
   */
  providerId?: string;
  /** Workspace for persistence key. */
  workspace?: string;
  /** Restart backoff options for lifecycle supervisor. */
  restartOptions?: LifecycleSupervisorOptions["restartOptions"];
  /** Default: true when sessionPersistence is set. After restart a new session is created and the persisted session id is kept; restoring the conversation is not implemented in this release. */
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
    throw new InvalidStateError(
      ACP_ERROR_CODE.PERSISTENCE_MISCONFIGURED,
      ERROR_MESSAGE.SESSION_PERSISTENCE_PROVIDER_ID_REQUIRED
    );
  }

  const port = createAcpAgentPort(connection, {
    ...clientOptions,
    providerId,
    command: config.command,
  });
  const streamed = wrapAgentPortWithStream(port, { envelopeMode, modelId });
  // Always wrap with lifecycle for restart/open/close; persistence remains optional.
  // Narrowing both in one expression is what lets providerId stay a plain string inside the
  // group, with no fabricated placeholder for the no-persistence case.
  return wrapAgentPortWithLifecycle(streamed, {
    persistence:
      sessionPersistence && providerId
        ? { store: sessionPersistence, providerId, workspace, resumeOnRestart }
        : undefined,
    restartOptions,
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
  // resolveBaseConfig now returns the caller's config with the resolved base applied over it,
  // so the precedence rule lives in that function rather than in a spread here.
  const parsed = schema.parse(resolveBaseConfig(defaults, configKeys, config));
  // ACP providers select their model over the protocol (setSessionConfigOption) or via `args`, which is
  // passed to the process verbatim - this package never invents CLI flags for a third-party
  // binary. A configured `model` is still meaningful as the default label on OpenAI-style stream
  // envelopes, so it is threaded through rather than left inert.
  const configuredModel = (parsed as { model?: unknown }).model;
  return createAcpCliHarnessRuntime(parsed, {
    ...runtimeOptions,
    ...(runtimeOptions?.modelId === undefined && typeof configuredModel === "string"
      ? { modelId: configuredModel }
      : {}),
  });
}
