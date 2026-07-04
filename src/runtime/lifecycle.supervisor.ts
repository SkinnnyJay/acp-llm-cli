import type {
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  RequestPermissionRequest,
  SessionNotification,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import type { ConnectionStatus } from "../domain/connection.status";
import { PORT_CAPABILITY } from "../domain/port.capabilities";
import type { ISessionPersistence, PersistedSession } from "../domain/session.persistence";
import type { AgentPortCapabilities, StreamPromptOptions } from "./agent.port";
import type { IAgentPort } from "./agent.port";
import type { StreamEnvelope } from "../domain/stream.envelopes";
import type { RestartWithBackoffOptions } from "./restart.with.backoff";
import { restartWithBackoff } from "./restart.with.backoff";

export interface LifecycleSupervisorOptions {
  /** Session persistence for save/load/clear. When provided, enables sessionPersistence capability. */
  sessionPersistence?: ISessionPersistence;
  /** Provider id for persistence key (e.g. "claude", "codex"). */
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
 * SessionNotification params may include session_id at top level.
 */
function extractSessionIdFromNotification(update: SessionNotification): string | undefined {
  const p = update as unknown as { session_id?: string; sessionId?: string };
  return p.session_id ?? p.sessionId;
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
 * Wraps an IAgentPort with optional restart/session.persistence orchestration.
 * - Saves session when newSession returns or when sessionUpdate carries session_id.
 * - On restart: graceful close, reopen, reinitialize, optional session resume via newSession(sessionId).
 * - Uses restartWithBackoff for retries.
 * - Opt-in: when sessionPersistence is not provided, only adds restart orchestration (no save/load).
 */
export function wrapAgentPortWithLifecycle(
  inner: IAgentPort,
  options: LifecycleSupervisorOptions
): IAgentPort {
  const {
    sessionPersistence,
    providerId,
    workspace,
    restartOptions,
    resumeOnRestart = !!sessionPersistence,
  } = options;

  const capabilities: AgentPortCapabilities = {
    ...inner.capabilities,
    [PORT_CAPABILITY.RESTART]: true,
    [PORT_CAPABILITY.OPEN_CLOSE]: true,
    [PORT_CAPABILITY.SESSION_PERSISTENCE]: !!sessionPersistence,
  };

  // Every ACP session notification carries the sessionId — persisting on each
  // one issues a persistence write PER STREAMED CHUNK. Only persist when the
  // active session actually changes.
  let lastPersistedSessionId: string | undefined;
  const persistIfChanged = async (sessionId: string): Promise<void> => {
    if (!sessionPersistence || sessionId === lastPersistedSessionId) return;
    lastPersistedSessionId = sessionId;
    await persistActiveSession(sessionPersistence, providerId, workspace, sessionId);
  };

  const wrapped = new (class LifecycleSupervisedPort
    extends EventEmitter<{
      state: (status: ConnectionStatus) => void;
      sessionUpdate: (update: SessionNotification) => void;
      permissionRequest: (request: RequestPermissionRequest) => void;
      error: (error: Error) => void;
    }>
    implements IAgentPort
  {
    readonly capabilities = capabilities;

    get connectionStatus() {
      return inner.connectionStatus;
    }

    async connect(): Promise<void> {
      return inner.connect();
    }
    async disconnect(): Promise<void> {
      return inner.disconnect();
    }
    async initialize(...args: Parameters<IAgentPort["initialize"]>) {
      return inner.initialize(...args);
    }

    async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
      const response = await inner.newSession(params);
      const sessionId = response.sessionId;
      if (sessionId) {
        await persistIfChanged(sessionId);
      }
      return response;
    }

    async prompt(...args: Parameters<IAgentPort["prompt"]>) {
      return inner.prompt(...args);
    }
    async *streamPrompt(
      params: PromptRequest,
      options?: StreamPromptOptions
    ): AsyncIterable<StreamEnvelope> {
      if (inner.streamPrompt) {
        yield* inner.streamPrompt(params, options);
      } else {
        throw new Error("streamPrompt not supported");
      }
    }
    async authenticate(...args: Parameters<IAgentPort["authenticate"]>) {
      return inner.authenticate(...args);
    }
    async sessionUpdate(params: SessionNotification): Promise<void> {
      const sessionId = extractSessionIdFromNotification(params);
      if (sessionId) {
        await persistIfChanged(sessionId);
      }
      return inner.sessionUpdate(params);
    }
    get setSessionMode() {
      return inner.setSessionMode;
    }
    get setSessionModel() {
      return inner.setSessionModel;
    }
    get cancel() {
      const innerCancel = inner.cancel;
      return innerCancel ? innerCancel.bind(inner) : undefined;
    }

    async restart(): Promise<void> {
      let sessionToResume: PersistedSession | null = null;
      if (sessionPersistence && resumeOnRestart) {
        sessionToResume = await sessionPersistence.loadSession(providerId, workspace);
      }

      await restartWithBackoff(inner, restartOptions);

      if (sessionToResume?.sessionId) {
        const resumeParams = {
          cwd: workspace ?? process.cwd(),
          mcpServers: [] as const,
          sessionId: sessionToResume.sessionId,
        };
        await inner.newSession(resumeParams as unknown as NewSessionRequest);
        if (sessionPersistence) {
          lastPersistedSessionId = sessionToResume.sessionId;
          await sessionPersistence.saveSession({
            ...sessionToResume,
            updatedAt: Date.now(),
          });
        }
      }
    }

    async open(): Promise<void> {
      return inner.connect();
    }
    async close(): Promise<void> {
      return inner.disconnect();
    }
  })();

  inner.on("state", (status: ConnectionStatus) => wrapped.emit("state", status));
  inner.on("sessionUpdate", (update: SessionNotification) => wrapped.emit("sessionUpdate", update));
  inner.on("permissionRequest", (request: RequestPermissionRequest) =>
    wrapped.emit("permissionRequest", request)
  );
  inner.on("error", (error: Error) => wrapped.emit("error", error));

  return wrapped as IAgentPort;
}
