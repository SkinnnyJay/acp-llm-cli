import type {
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import type { ConnectionStatus } from "../domain/connection.status";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { PORT_CAPABILITY } from "../domain/port.capabilities";
import type { ISessionPersistence, PersistedSession } from "../domain/session.persistence";
import type { StreamEnvelope } from "../domain/stream.envelopes";
import type { AgentPortCapabilities, AgentPortEvents, StreamPromptOptions } from "./agent.port";
import type { IAgentPort } from "./agent.port";
import type { RestartWithBackoffOptions } from "./restart.with.backoff";
import { restartWithBackoff } from "./restart.with.backoff";

export interface LifecycleSupervisorOptions {
  /** Session persistence for save/load/clear. When provided, enables sessionPersistence capability. */
  sessionPersistence?: ISessionPersistence;
  /** Provider id for persistence key (e.g. "claude-cli", "codex-cli"). Required when sessionPersistence is set. */
  providerId: string;
  /** Optional workspace for persistence key. */
  workspace?: string;
  /** Restart backoff options. */
  restartOptions?: RestartWithBackoffOptions;
  /** If true, on restart we call newSession with loaded sessionId to resume. Default: true when persistence is provided. */
  resumeOnRestart?: boolean;
}

/**
 * Extracts session_id from an ACP session notification if present.
 * SessionNotification shape may include session_id at the top level (SDK-version dependent).
 */
function extractSessionIdFromNotification(update: SessionNotification): string | undefined {
  const record = update as Record<string, unknown>;
  // Only read the vendor-extension `session_id` field. The standard `sessionId` field
  // identifies which session the notification belongs to and is always present — it is
  // not a newly established session ID to persist.
  if (typeof record.session_id === "string") return record.session_id;
  return undefined;
}

function persistActiveSession(
  persistence: ISessionPersistence,
  providerId: string,
  workspace: string | undefined,
  sessionId: string
): Promise<void> {
  return persistence.saveSession({
    providerId,
    workspace,
    sessionId,
    updatedAt: Date.now(),
  });
}

/**
 * Wraps an IAgentPort with optional restart and session persistence orchestration.
 *
 * - Saves session when newSession returns or when sessionUpdate carries session_id.
 * - On restart: graceful close, reopen, reinitialize, optional session resume via newSession(sessionId).
 * - Uses restartWithBackoff for retries.
 * - Opt-in: when sessionPersistence is not provided, only adds restart orchestration (no save/load).
 */
export class LifecycleAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities: AgentPortCapabilities;

  private readonly inner: IAgentPort;
  private readonly sessionPersistence: ISessionPersistence | undefined;
  private readonly providerId: string;
  private readonly workspace: string | undefined;
  private readonly restartOptions: RestartWithBackoffOptions | undefined;
  private readonly resumeOnRestart: boolean;

  constructor(inner: IAgentPort, options: LifecycleSupervisorOptions) {
    super();
    this.inner = inner;
    this.sessionPersistence = options.sessionPersistence;
    this.providerId = options.providerId;
    this.workspace = options.workspace;
    this.restartOptions = options.restartOptions;
    this.resumeOnRestart = options.resumeOnRestart ?? !!options.sessionPersistence;

    this.capabilities = {
      ...inner.capabilities,
      [PORT_CAPABILITY.RESTART]: true,
      [PORT_CAPABILITY.OPEN_CLOSE]: true,
      [PORT_CAPABILITY.SESSION_PERSISTENCE]: !!options.sessionPersistence,
    };

    inner.on("state", (status: ConnectionStatus) => this.emit("state", status));
    inner.on("sessionUpdate", (update: SessionNotification) => this.emit("sessionUpdate", update));
    inner.on("permissionRequest", (request: RequestPermissionRequest) =>
      this.emit("permissionRequest", request)
    );
    inner.on("error", (error: Error) => this.emit("error", error));
  }

  get connectionStatus(): ConnectionStatus {
    return this.inner.connectionStatus;
  }

  async connect(): Promise<void> {
    return this.inner.connect();
  }

  async disconnect(): Promise<void> {
    return this.inner.disconnect();
  }

  async initialize(...args: Parameters<IAgentPort["initialize"]>) {
    return this.inner.initialize(...args);
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    const response = await this.inner.newSession(params);
    const sessionId = response.sessionId;
    if (this.sessionPersistence && sessionId) {
      await persistActiveSession(
        this.sessionPersistence,
        this.providerId,
        this.workspace,
        sessionId
      );
    }
    return response;
  }

  async prompt(...args: Parameters<IAgentPort["prompt"]>) {
    return this.inner.prompt(...args);
  }

  async *streamPrompt(
    params: PromptRequest,
    options?: StreamPromptOptions
  ): AsyncIterable<StreamEnvelope> {
    if (!this.inner.streamPrompt) {
      throw new Error(ERROR_MESSAGE.STREAM_PROMPT_NOT_SUPPORTED);
    }
    yield* this.inner.streamPrompt(params, options);
  }

  async authenticate(...args: Parameters<IAgentPort["authenticate"]>) {
    return this.inner.authenticate(...args);
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    const sessionId = extractSessionIdFromNotification(params);
    if (this.sessionPersistence && sessionId) {
      await persistActiveSession(
        this.sessionPersistence,
        this.providerId,
        this.workspace,
        sessionId
      );
    }
    return this.inner.sessionUpdate(params);
  }

  get setSessionMode() {
    return this.inner.setSessionMode?.bind(this.inner);
  }

  get setSessionModel() {
    return this.inner.setSessionModel?.bind(this.inner);
  }

  async restart(): Promise<void> {
    let sessionToResume: PersistedSession | null = null;
    if (this.sessionPersistence && this.resumeOnRestart) {
      sessionToResume = await this.sessionPersistence.loadSession(this.providerId, this.workspace);
    }

    await restartWithBackoff(this.inner, this.restartOptions);

    if (sessionToResume?.sessionId && this.sessionPersistence) {
      // `sessionId` is a vendor extension accepted by ACP implementations for session resume.
      // The standard SDK type does not declare it, so a single cast is required.
      const resumeParams = {
        cwd: this.workspace ?? process.cwd(),
        mcpServers: [] as NewSessionRequest["mcpServers"],
        sessionId: sessionToResume.sessionId,
      } as NewSessionRequest;
      await this.inner.newSession(resumeParams);
      await this.sessionPersistence.saveSession({
        ...sessionToResume,
        updatedAt: Date.now(),
      });
    }
  }

  async open(): Promise<void> {
    return this.inner.connect();
  }

  async close(): Promise<void> {
    return this.inner.disconnect();
  }
}

/** Factory function for backward compatibility and ergonomic use. */
export function wrapAgentPortWithLifecycle(
  inner: IAgentPort,
  options: LifecycleSupervisorOptions
): IAgentPort {
  return new LifecycleAgentPort(inner, options);
}
