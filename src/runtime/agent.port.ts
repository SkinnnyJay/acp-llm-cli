import type {
  AuthenticateRequest,
  CancelNotification,
  AuthenticateResponse,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  RequestPermissionRequest,
  SessionNotification,
  SetSessionModeRequest,
  SetSessionModeResponse,
  SetSessionModelRequest,
  SetSessionModelResponse,
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
  readonly cancel?: boolean;
}

export interface StreamPromptOptions {
  envelopeMode?: EnvelopeMode;
}

export interface IAgentPort extends EventEmitter<AgentPortEvents> {
  readonly connectionStatus: ConnectionStatus;
  /** Optional: feature flags for streamPrompt, restart, open/close, session persistence. */
  readonly capabilities?: AgentPortCapabilities;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  initialize(params?: Partial<InitializeRequest>): Promise<InitializeResponse>;
  newSession(params: NewSessionRequest): Promise<NewSessionResponse>;
  prompt(params: PromptRequest): Promise<PromptResponse>;
  authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse>;
  sessionUpdate(params: SessionNotification): Promise<void>;
  setSessionMode?(params: SetSessionModeRequest): Promise<SetSessionModeResponse>;
  setSessionModel?(params: SetSessionModelRequest): Promise<SetSessionModelResponse>;
  /** Optional: stream prompt with dual envelope output (OpenAI + native). */
  streamPrompt?(
    params: PromptRequest,
    options?: StreamPromptOptions
  ): AsyncIterable<StreamEnvelope>;
  /** Optional: cancel an ongoing prompt turn (ACP session/cancel). Pending
   * permission requests for the session are answered with outcome "cancelled",
   * as the spec requires of cancelling clients. */
  cancel?(params: CancelNotification): Promise<void>;
  /** Optional: restart connection (disconnect + connect + reinitialize). */
  restart?(): Promise<void>;
  /** Optional: alias for connect(). */
  open?(): Promise<void>;
  /** Optional: alias for disconnect(). */
  close?(): Promise<void>;
}

/** Alias for backward compatibility. */
