import {
  type Client,
  type ClientCapabilities,
  ClientSideConnection,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type KillTerminalCommandRequest,
  type KillTerminalCommandResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
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
  SessionNotification,
  SetSessionModeRequest,
  SetSessionModeResponse,
  SetSessionModelRequest,
  SetSessionModelResponse,
} from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { AGENT_PORT_EVENT } from "../domain/agent.port.events";
import { CONNECTION_EVENT } from "../domain/connection.events";
import type { ConnectionStatus } from "../domain/connection.status";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { PERMISSION_OUTCOME } from "../domain/permission.outcome";
import type { AgentPortEvents, IAgentPort } from "./agent.port";
import type { IConnection } from "./connection.interface";
import type { IPermissionHandler } from "./permission.handler.interface";
import type { IToolHost } from "./tool.host.interface";

export interface IACPConnectionLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStream(): ReturnType<IConnection["getStream"]>;
  readonly connectionStatus: ConnectionStatus;
  on(event: typeof CONNECTION_EVENT.STATE, handler: (status: ConnectionStatus) => void): void;
  on(event: typeof CONNECTION_EVENT.ERROR, handler: (error: Error) => void): void;
  on(
    event: typeof CONNECTION_EVENT.EXIT,
    handler: (info: {
      code: number | null;
      signal: NodeJS.Signals | null;
    }) => void
  ): void;
}

/**
 * Decision policy used when no permissionHandler is configured.
 * - "fail-closed" (default): select a reject-kind option if one exists,
 *   otherwise answer "cancelled". Never auto-approves. Agents commonly order
 *   allow_always FIRST in the options array, so selecting options[0] silently
 *   grants standing approval for tool execution.
 * - "first-option": legacy behavior — select options[0] whatever it is.
 */
export type PermissionMode = "fail-closed" | "first-option";

export interface ACPClientOptions {
  clientCapabilities?: ClientCapabilities;
  permissionHandler?: IPermissionHandler;
  toolHost?: IToolHost;
  /** Policy when no permissionHandler is set. Default: "fail-closed". */
  permissionMode?: PermissionMode;
}

const PERMISSION_OPTION_KIND = {
  REJECT_ONCE: "reject_once",
  REJECT_ALWAYS: "reject_always",
} as const;

export function createAcpAgentPort(
  connection: IACPConnectionLike,
  options: ACPClientOptions = {}
): IAgentPort {
  return new ACPClient(connection, options);
}

class ACPClient
  extends EventEmitter<AgentPortEvents>
  implements IAgentPort, Client
{
  private clientConnection: ClientSideConnection | undefined;
  private readonly toolHost: IToolHost | undefined;
  private readonly clientCapabilities: ClientCapabilities;
  private readonly pendingPermissions = new Map<
    symbol,
    { sessionId: string; cancel: () => void }
  >();

  constructor(
    private readonly connection: IACPConnectionLike,
    private readonly options: ACPClientOptions = {}
  ) {
    super();
    this.toolHost = options.toolHost;
    this.clientCapabilities = options.clientCapabilities ?? {};
    this.connection.on(CONNECTION_EVENT.STATE, (status) =>
      this.emit(AGENT_PORT_EVENT.STATE, status)
    );
    this.connection.on(CONNECTION_EVENT.ERROR, (error) =>
      this.emit(AGENT_PORT_EVENT.ERROR, error)
    );
  }

  get connectionStatus(): ConnectionStatus {
    return this.connection.connectionStatus;
  }

  async connect(): Promise<void> {
    await this.connection.connect();
    const stream = this.connection.getStream();
    if (!stream) {
      throw new Error(ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE);
    }
    this.clientConnection = new ClientSideConnection(() => this, stream);
  }

  async disconnect(): Promise<void> {
    await this.connection.disconnect();
    this.clientConnection = undefined;
  }

  async initialize(params?: Partial<InitializeRequest>): Promise<InitializeResponse> {
    return this.requireConnection().initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: this.clientCapabilities,
      ...params,
    });
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.requireConnection().newSession(params);
  }

  async authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return this.requireConnection().authenticate(params);
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    return this.requireConnection().prompt(params);
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    return this.requireConnection().setSessionMode(params);
  }

  async setSessionModel(params: SetSessionModelRequest): Promise<SetSessionModelResponse> {
    return this.requireConnection().unstable_setSessionModel(params);
  }

  async requestPermission(params: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    this.emit(AGENT_PORT_EVENT.PERMISSION_REQUEST, params);
    const decision: Promise<RequestPermissionResponse> = this.options.permissionHandler
      ? Promise.resolve(this.options.permissionHandler(params))
      : Promise.resolve(this.defaultPermissionDecision(params));

    // Track in-flight requests so cancel(sessionId) can answer them with
    // outcome "cancelled" — the spec REQUIRES cancelling clients to respond
    // to pending session/request_permission with cancelled.
    return new Promise<RequestPermissionResponse>((resolve, reject) => {
      const key = Symbol("permission");
      this.pendingPermissions.set(key, {
        sessionId: params.sessionId,
        cancel: () => {
          this.pendingPermissions.delete(key);
          resolve({ outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } });
        },
      });
      decision.then(
        (response) => {
          if (!this.pendingPermissions.delete(key)) return;
          resolve(response);
        },
        (error: unknown) => {
          if (!this.pendingPermissions.delete(key)) return;
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      );
    });
  }

  /** Fail-closed by default: never auto-approve when nobody is watching. */
  private defaultPermissionDecision(
    params: RequestPermissionRequest
  ): RequestPermissionResponse {
    const mode = this.options.permissionMode ?? "fail-closed";
    const options = params.options ?? [];
    if (mode === "first-option") {
      const firstOption = options[0];
      if (!firstOption) {
        return { outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } };
      }
      return {
        outcome: { outcome: PERMISSION_OUTCOME.SELECTED, optionId: firstOption.optionId },
      };
    }
    const rejectOption =
      options.find((option) => option.kind === PERMISSION_OPTION_KIND.REJECT_ONCE) ??
      options.find((option) => option.kind === PERMISSION_OPTION_KIND.REJECT_ALWAYS);
    if (rejectOption) {
      return {
        outcome: { outcome: PERMISSION_OUTCOME.SELECTED, optionId: rejectOption.optionId },
      };
    }
    return { outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } };
  }

  async cancel(params: CancelNotification): Promise<void> {
    for (const pending of [...this.pendingPermissions.values()]) {
      if (pending.sessionId === params.sessionId) pending.cancel();
    }
    return this.requireConnection().cancel(params);
  }

  async sessionUpdate(params: SessionNotification): Promise<void> {
    this.emit(AGENT_PORT_EVENT.SESSION_UPDATE, params);
  }

  async readTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    return this.requireToolHost("file").readTextFile(params);
  }

  async writeTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    return this.requireToolHost("file").writeTextFile(params);
  }

  async createTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    return this.requireToolHost("terminal").createTerminal(params);
  }

  async terminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    return this.requireToolHost("terminal").terminalOutput(params);
  }

  async waitForTerminalExit(
    params: WaitForTerminalExitRequest
  ): Promise<WaitForTerminalExitResponse> {
    return this.requireToolHost("terminal").waitForTerminalExit(params);
  }

  async releaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    return this.requireToolHost("terminal").releaseTerminal(params);
  }

  async killTerminal(params: KillTerminalCommandRequest): Promise<KillTerminalCommandResponse> {
    return this.requireToolHost("terminal").killTerminal(params);
  }

  private requireToolHost(kind: "file" | "terminal"): IToolHost {
    if (!this.toolHost) {
      throw new Error(
        kind === "file"
          ? ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED
          : ERROR_MESSAGE.TERMINAL_TOOLS_NOT_CONFIGURED
      );
    }
    return this.toolHost;
  }

  private requireConnection(): ClientSideConnection {
    if (!this.clientConnection) {
      throw new Error(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
    }
    return this.clientConnection;
  }
}
