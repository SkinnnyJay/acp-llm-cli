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
import { notificationSessionId } from "../domain/session.notification";
import type { ISessionPersistence, PersistedSession } from "../domain/session.persistence";
import type { StreamEnvelope } from "../domain/stream.envelopes";
import type {
  AgentPortCapabilities,
  AgentPortEvents,
  IAgentPort,
  StreamPromptOptions,
} from "./agent.port";
import type { RestartWithBackoffOptions } from "./restart.with.backoff";
import { restartWithBackoff } from "./restart.with.backoff";

export interface LifecycleSupervisorOptions {
  sessionPersistence?: ISessionPersistence;
  providerId: string;
  workspace?: string;
  restartOptions?: RestartWithBackoffOptions;
  resumeOnRestart?: boolean;
}

function persistActiveSession(
  persistence: ISessionPersistence,
  providerId: string,
  workspace: string | undefined,
  sessionId: string,
  cwd?: string
): Promise<void> {
  return persistence.saveSession({
    providerId,
    workspace,
    cwd,
    sessionId,
    updatedAt: Date.now(),
  });
}

/**
 * Wraps an IAgentPort with restart and optional session persistence orchestration.
 * Saves session on newSession and on inbound sessionUpdate events carrying session_id.
 */
export class LifecycleAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities: AgentPortCapabilities;

  private readonly inner: IAgentPort;
  private readonly sessionPersistence: ISessionPersistence | undefined;
  private readonly providerId: string;
  private readonly workspace: string | undefined;
  private readonly restartOptions: RestartWithBackoffOptions | undefined;
  private readonly resumeOnRestart: boolean;
  private lastSessionCwd: string | undefined;

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
    inner.on("sessionUpdate", (update: SessionNotification) => {
      void this.maybePersistFromNotification(update);
      this.emit("sessionUpdate", update);
    });
    inner.on("permissionRequest", (request: RequestPermissionRequest) =>
      this.emit("permissionRequest", request)
    );
    inner.on("error", (error: Error) => this.emit("error", error));
  }

  private async maybePersistFromNotification(update: SessionNotification): Promise<void> {
    const sessionId = notificationSessionId(update, { vendorOnly: true });
    if (this.sessionPersistence && sessionId) {
      await persistActiveSession(
        this.sessionPersistence,
        this.providerId,
        this.workspace,
        sessionId,
        this.lastSessionCwd
      );
    }
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
    this.lastSessionCwd = params.cwd;
    if (this.sessionPersistence && sessionId) {
      await persistActiveSession(
        this.sessionPersistence,
        this.providerId,
        this.workspace,
        sessionId,
        params.cwd
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
    await this.maybePersistFromNotification(params);
    return this.inner.sessionUpdate(params);
  }

  get setSessionMode() {
    return this.inner.setSessionMode?.bind(this.inner);
  }

  get setSessionConfigOption() {
    return this.inner.setSessionConfigOption?.bind(this.inner);
  }

  async restart(): Promise<void> {
    let sessionToResume: PersistedSession | null = null;
    if (this.sessionPersistence && this.resumeOnRestart) {
      sessionToResume = await this.sessionPersistence.loadSession(this.providerId, this.workspace);
    }

    await restartWithBackoff(this.inner, this.restartOptions);

    if (sessionToResume?.sessionId && this.sessionPersistence) {
      const resumeParams = {
        cwd: sessionToResume.cwd ?? this.workspace ?? process.cwd(),
        mcpServers: [] as NewSessionRequest["mcpServers"],
        sessionId: sessionToResume.sessionId,
      } as NewSessionRequest;
      await this.inner.newSession(resumeParams);
      await this.sessionPersistence.saveSession({
        ...sessionToResume,
        cwd: resumeParams.cwd,
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

export function wrapAgentPortWithLifecycle(
  inner: IAgentPort,
  options: LifecycleSupervisorOptions
): IAgentPort {
  return new LifecycleAgentPort(inner, options);
}
