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
import type { AgentPortCapabilities, AgentPortEvents, StreamPromptOptions } from "./agent.port";
import type { IAgentPort } from "./agent.port";
import type { RestartWithBackoffOptions } from "./restart.with.backoff";
import { restartWithBackoff } from "./restart.with.backoff";

/**
 * Session persistence travels as one group: the store, the key it is written under, and the
 * resume policy. Grouping them makes `resumeOnRestart` unstateable without a store and lets
 * `providerId` be required exactly where it is used, so no placeholder id is ever fabricated.
 */
export interface LifecycleSessionPersistence {
  store: ISessionPersistence;
  /** Persistence key. Required here because this object only exists when persisting. */
  providerId: string;
  workspace?: string;
  /** Resume the persisted session after a restart. Default: true. */
  resumeOnRestart?: boolean;
}

export interface LifecycleSupervisorOptions {
  persistence?: LifecycleSessionPersistence;
  restartOptions?: RestartWithBackoffOptions;
}

/**
 * Wraps an IAgentPort with restart and optional session persistence orchestration.
 * Saves session on newSession and on inbound sessionUpdate events carrying session_id.
 */
export class LifecycleAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities: AgentPortCapabilities;

  private readonly inner: IAgentPort;
  private readonly persistence: LifecycleSessionPersistence | undefined;
  private readonly resumeOnRestart: boolean;
  private readonly restartOptions: RestartWithBackoffOptions | undefined;
  private lastSessionCwd: string | undefined;

  constructor(inner: IAgentPort, options: LifecycleSupervisorOptions) {
    super();
    this.inner = inner;
    this.persistence = options.persistence;
    this.resumeOnRestart = options.persistence?.resumeOnRestart ?? true;
    this.restartOptions = options.restartOptions;

    this.capabilities = {
      ...inner.capabilities,
      [PORT_CAPABILITY.RESTART]: true,
      [PORT_CAPABILITY.OPEN_CLOSE]: true,
      [PORT_CAPABILITY.SESSION_PERSISTENCE]: !!options.persistence,
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

  /** Single write path: every persisted record is assembled here. */
  private async persist(sessionId: string, cwd: string | undefined): Promise<void> {
    const persistence = this.persistence;
    if (!persistence) return;
    await persistence.store.saveSession({
      providerId: persistence.providerId,
      workspace: persistence.workspace,
      cwd,
      sessionId,
      updatedAt: Date.now(),
    });
  }

  private async maybePersistFromNotification(update: SessionNotification): Promise<void> {
    const sessionId = notificationSessionId(update, { vendorOnly: true });
    if (!sessionId) return;
    await this.persist(sessionId, this.lastSessionCwd);
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
    this.lastSessionCwd = params.cwd;
    if (response.sessionId) {
      await this.persist(response.sessionId, params.cwd);
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

  get setSessionModel() {
    return this.inner.setSessionModel?.bind(this.inner);
  }

  async restart(): Promise<void> {
    const persistence = this.persistence;
    let sessionToResume: PersistedSession | null = null;
    if (persistence && this.resumeOnRestart) {
      sessionToResume = await persistence.store.loadSession(
        persistence.providerId,
        persistence.workspace
      );
    }

    await restartWithBackoff(this.inner, this.restartOptions);

    if (persistence && sessionToResume?.sessionId) {
      const cwd = sessionToResume.cwd ?? persistence.workspace ?? process.cwd();
      const resumeParams = {
        cwd,
        mcpServers: [] as NewSessionRequest["mcpServers"],
        sessionId: sessionToResume.sessionId,
      } as NewSessionRequest;
      await this.inner.newSession(resumeParams);
      // Keep the in-memory cwd in step with what was just restored. Without this the next
      // inbound vendor session_id notification persists cwd: undefined and wipes it, so the
      // following restart resumes in the wrong directory.
      this.lastSessionCwd = cwd;
      await persistence.store.saveSession({ ...sessionToResume, cwd, updatedAt: Date.now() });
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
