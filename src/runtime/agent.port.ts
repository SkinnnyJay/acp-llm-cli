import type {
  AgentCapabilities,
  AuthenticateRequest,
  AuthenticateResponse,
  InitializeRequest,
  InitializeResponse,
  LoadSessionRequest,
  LoadSessionResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  ResumeSessionRequest,
  ResumeSessionResponse,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import type { EventEmitter } from "eventemitter3";
import type { ConnectionStatus } from "../domain/connection.status";
import type { EnvelopeMode } from "../domain/envelope.mode";
import type { StreamEnvelope } from "../domain/stream.envelopes";

export interface AgentPortEvents {
  state: (status: ConnectionStatus) => void;
  sessionUpdate: (update: SessionNotification) => void;
  permissionRequest: (request: RequestPermissionRequest) => void;
  error: (error: Error) => void;
}

/** Optional capabilities; absent or false means not supported. */
export interface AgentPortCapabilities {
  readonly streamPrompt?: boolean;
  readonly restart?: boolean;
  readonly openClose?: boolean;
  readonly sessionPersistence?: boolean;
}

export interface StreamPromptOptions {
  envelopeMode?: EnvelopeMode;
}

/** How `restart()` re-established the session. */
export type RestartSessionOutcome = "resumed" | "loaded" | "new" | "none";

export interface RestartOutcome {
  session: RestartSessionOutcome;
  /** The session to use from now on. Absent when `session` is "none". */
  sessionId?: string;
}

export interface IAgentPort extends EventEmitter<AgentPortEvents> {
  readonly connectionStatus: ConnectionStatus;
  /** Optional: feature flags for streamPrompt, restart, open/close, session persistence. */
  readonly capabilities?: AgentPortCapabilities;
  /**
   * `agentCapabilities` from the most recent successful `initialize`; cleared when a new link is
   * attached.
   */
  readonly agentCapabilities?: AgentCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  initialize(params?: Partial<InitializeRequest>): Promise<InitializeResponse>;
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  prompt(params: PromptRequest): Promise<PromptResponse>;
  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse>;
  sessionUpdate(params: SessionNotification): Promise<void>;
  setSessionMode?(params: SetSessionModeRequest): Promise<SetSessionModeResponse>;
  setSessionConfigOption?(
    params: SetSessionConfigOptionRequest
  ): Promise<SetSessionConfigOptionResponse>;
  /** Optional: `session/resume`, reattaching to a session without replaying its history. */
  resumeSession?(params: ResumeSessionRequest): Promise<ResumeSessionResponse>;
  /**
   * Optional: `session/load`. The agent replays the session's whole history as `session/update`
   * notifications before it responds, and this port emits each one as a `sessionUpdate` event;
   * the replay is not hidden.
   */
  loadSession?(params: LoadSessionRequest): Promise<LoadSessionResponse>;
  /** Optional: stream prompt with dual envelope output (OpenAI + native). */
  streamPrompt?(
    params: PromptRequest,
    options?: StreamPromptOptions
  ): AsyncIterable<StreamEnvelope>;
  /**
   * Optional: restart connection (disconnect + connect + reinitialize), then restore the
   * persisted session; the outcome says how.
   */
  restart?(): Promise<RestartOutcome>;
  /** Optional: alias for connect(). */
  open?(): Promise<void>;
  /** Optional: alias for disconnect(). */
  close?(): Promise<void>;
}
