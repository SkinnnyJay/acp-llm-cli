import type {
  LoadSessionRequest,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  RequestPermissionRequest,
  ResumeSessionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import type { ConnectionStatus } from "../domain/connection.status";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { ACP_ERROR_CODE, AgentProtocolError, UnsupportedCapabilityError } from "../domain/errors";
import { PORT_CAPABILITY } from "../domain/port.capabilities";
import { notificationSessionId } from "../domain/session.notification";
import type { ISessionPersistence, PersistedSession } from "../domain/session.persistence";
import type { StreamEnvelope } from "../domain/stream.envelopes";
import type {
  AgentPortCapabilities,
  AgentPortEvents,
  IAgentPort,
  RestartOutcome,
  StreamPromptOptions,
} from "./agent.port";
import type { RestartWithBackoffOptions } from "./restart.with.backoff";
import { restartWithBackoff } from "./restart.with.backoff";

/** A login or a cancel says nothing about the session, so it must not discard it. */
const movesOnToNextMethod = (error: unknown): boolean =>
  error instanceof AgentProtocolError &&
  error.code !== ACP_ERROR_CODE.AUTH_REQUIRED &&
  error.code !== ACP_ERROR_CODE.REQUEST_CANCELLED;

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
  /**
   * MCP servers to attach when restoring a session after `restart()`. Used until a `newSession`
   * call through this port supplies its own.
   */
  mcpServers?: NewSessionRequest["mcpServers"];
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
  /** From the last successful newSession() through this port, reused when restoring. */
  private lastMcpServers: NewSessionRequest["mcpServers"];
  /**
   * The session a pending `session/load` is replaying. Its updates are history the consumer has
   * already rendered, so they are neither re-emitted nor persisted.
   */
  private replayingSessionId: string | undefined;

  constructor(inner: IAgentPort, options: LifecycleSupervisorOptions) {
    super();
    this.inner = inner;
    this.persistence = options.persistence;
    this.resumeOnRestart = options.persistence?.resumeOnRestart ?? true;
    this.restartOptions = options.restartOptions;
    this.lastMcpServers = options.persistence?.mcpServers ?? [];

    this.capabilities = {
      ...inner.capabilities,
      [PORT_CAPABILITY.RESTART]: true,
      [PORT_CAPABILITY.OPEN_CLOSE]: true,
      [PORT_CAPABILITY.SESSION_PERSISTENCE]: !!options.persistence,
    };

    inner.on("state", (status: ConnectionStatus) => this.emit("state", status));
    inner.on("sessionUpdate", (update: SessionNotification) => {
      if (
        this.replayingSessionId !== undefined &&
        notificationSessionId(update) === this.replayingSessionId
      ) {
        return;
      }
      void this.maybePersistFromNotification(update);
      this.emit("sessionUpdate", update);
    });
    inner.on("permissionRequest", (request: RequestPermissionRequest) =>
      this.emit("permissionRequest", request)
    );
    inner.on("error", (error: Error) => this.emit("error", error));
  }

  /** Notifications already written, so a second trigger for one is a no-op. */
  private readonly persistedNotifications = new WeakSet<SessionNotification>();

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

  /**
   * Two triggers reach this for the same notification: `sessionUpdate()` above, and
   * the inner `sessionUpdate` listener firing when that call reaches an inner port
   * which re-emits - which the real ACP client does. Neither can be dropped: the
   * listener is the only path for agent-initiated notifications, since the SDK holds
   * the innermost client and calls it directly, while the method is the only path for
   * an inner port that does not emit. So both stay, and the notification itself
   * carries the record of having been persisted, keeping one write per notification.
   */
  private async maybePersistFromNotification(update: SessionNotification): Promise<void> {
    if (this.persistedNotifications.has(update)) return;
    const sessionId = notificationSessionId(update, { vendorOnly: true });
    if (!sessionId) return;
    this.persistedNotifications.add(update);
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
    this.lastMcpServers = params.mcpServers;
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
      throw new UnsupportedCapabilityError(
        ACP_ERROR_CODE.CAPABILITY_UNSUPPORTED,
        ERROR_MESSAGE.STREAM_PROMPT_NOT_SUPPORTED,
        { capability: PORT_CAPABILITY.STREAM_PROMPT, sessionId: params.sessionId }
      );
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

  get resumeSession(): IAgentPort["resumeSession"] {
    const resume = this.inner.resumeSession;
    if (!resume) return undefined;
    return async (params) => {
      const response = await resume.call(this.inner, params);
      await this.recordRestored(params);
      return response;
    };
  }

  get loadSession(): IAgentPort["loadSession"] {
    const load = this.inner.loadSession;
    if (!load) return undefined;
    return async (params) => {
      const response = await load.call(this.inner, params);
      await this.recordRestored(params);
      return response;
    };
  }

  /** A session the caller resumed or loaded becomes the one the next restart() restores. */
  private async recordRestored(params: LoadSessionRequest | ResumeSessionRequest): Promise<void> {
    this.lastSessionCwd = params.cwd;
    this.lastMcpServers = params.mcpServers ?? [];
    await this.persist(params.sessionId, params.cwd);
  }

  get agentCapabilities() {
    return this.inner.agentCapabilities;
  }

  /**
   * Restarts the process, then restores the persisted session: `session/resume` when advertised,
   * else `session/load` (its history replay is dropped), else a new session. An agent error other
   * than `AUTH_REQUIRED` or `REQUEST_CANCELLED` moves on to the next method; any other error
   * propagates.
   */
  async restart(): Promise<RestartOutcome> {
    const persistence = this.persistence;
    let sessionToResume: PersistedSession | null = null;
    if (persistence && this.resumeOnRestart) {
      sessionToResume = await persistence.store.loadSession(
        persistence.providerId,
        persistence.workspace
      );
    }

    await restartWithBackoff(this.inner, this.restartOptions);

    if (!persistence || !sessionToResume?.sessionId) return { session: "none" };

    const cwd = sessionToResume.cwd ?? persistence.workspace ?? process.cwd();
    const outcome = await this.restoreSession(sessionToResume.sessionId, cwd);
    // Keep the in-memory cwd in step with what was just restored. Without this the next
    // inbound vendor session_id notification persists cwd: undefined and wipes it, so the
    // following restart resumes in the wrong directory.
    this.lastSessionCwd = cwd;
    // Route through persist() rather than assembling a second record here. Spreading the
    // LOADED record carried its providerId/workspace into the write, so a store that does not
    // round-trip those fields would file this under a different key than every other write.
    // The key belongs to the configured persistence group, never to the loaded value.
    if (outcome.sessionId) await this.persist(outcome.sessionId, cwd);
    return outcome;
  }

  private async restoreSession(
    sessionId: string,
    cwd: string
  ): Promise<RestartOutcome & { sessionId: string }> {
    const caps = this.inner.agentCapabilities;
    const mcpServers = this.lastMcpServers;
    if (caps?.sessionCapabilities?.resume && this.inner.resumeSession) {
      try {
        await this.inner.resumeSession({ sessionId, cwd, mcpServers });
        return { session: "resumed", sessionId };
      } catch (error) {
        if (!movesOnToNextMethod(error)) throw error;
      }
    }
    if (caps?.loadSession && this.inner.loadSession) {
      this.replayingSessionId = sessionId;
      try {
        await this.inner.loadSession({ sessionId, cwd, mcpServers });
        return { session: "loaded", sessionId };
      } catch (error) {
        if (!movesOnToNextMethod(error)) throw error;
      } finally {
        this.replayingSessionId = undefined;
      }
    }
    const created = await this.inner.newSession({ cwd, mcpServers });
    return { session: "new", sessionId: created.sessionId, previousSessionId: sessionId };
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
