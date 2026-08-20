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
import { CONNECTION_STATUS } from "../domain/connection.status";
import type { ConnectionStatus } from "../domain/connection.status";
import { ERROR_MESSAGE } from "../domain/error.messages";
import { PERMISSION_OUTCOME } from "../domain/permission.outcome";
import type { AgentPortEvents, IAgentPort } from "./agent.port";
import type { ConnectionEvents, IConnection } from "./connection.interface";
import type { IPermissionHandler } from "./permission.handler.interface";
import type { IToolHost } from "./tool.host.interface";

/** Structural subset of IConnection the ACP client needs; deliberately not `extends IConnection`
 * so minimal third-party transports (and test doubles) can satisfy it. */
export interface IACPConnectionLike {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStream(): ReturnType<IConnection["getStream"]>;
  readonly connectionStatus: ConnectionStatus;
  on(event: typeof CONNECTION_EVENT.STATE, handler: ConnectionEvents["state"]): void;
  on(event: typeof CONNECTION_EVENT.ERROR, handler: ConnectionEvents["error"]): void;
  on(event: typeof CONNECTION_EVENT.EXIT, handler: ConnectionEvents["exit"]): void;
}

export interface ACPClientOptions {
  clientCapabilities?: ClientCapabilities;
  permissionHandler?: IPermissionHandler;
  toolHost?: IToolHost;
}

export function createAcpAgentPort(
  connection: IACPConnectionLike,
  options: ACPClientOptions = {}
): IAgentPort {
  return new ACPClient(connection, options);
}

type AcpStream = NonNullable<ReturnType<IConnection["getStream"]>>;

class ACPClient extends EventEmitter<AgentPortEvents> implements IAgentPort, Client {
  /**
   * The live RPC link and the stream it was built on, held together so "am I usable" has exactly
   * one representation. Keeping the stream lets connect() recognise that it is already attached
   * to it, instead of stacking a second reader loop on the same pipe.
   */
  private attached: { rpc: ClientSideConnection; stream: AcpStream } | undefined;
  private readonly toolHost: IToolHost | undefined;
  private readonly clientCapabilities: ClientCapabilities;

  constructor(
    private readonly connection: IACPConnectionLike,
    private readonly options: ACPClientOptions = {}
  ) {
    super();
    this.toolHost = options.toolHost;
    this.clientCapabilities = options.clientCapabilities ?? {};
    this.connection.on(CONNECTION_EVENT.STATE, (status) => {
      // Drop the link on terminal transport states only. A transient CONNECTING must not
      // detach, and third-party transports may emit states this client does not model.
      if (status === CONNECTION_STATUS.DISCONNECTED || status === CONNECTION_STATUS.ERROR) {
        this.detach();
      }
      this.emit(AGENT_PORT_EVENT.STATE, status);
    });
    this.connection.on(CONNECTION_EVENT.ERROR, (error) => this.emit(AGENT_PORT_EVENT.ERROR, error));
    // The transport declares and emits EXIT; nothing used to subscribe, so the client kept a
    // link to a process that had already gone away.
    this.connection.on(CONNECTION_EVENT.EXIT, () => this.detach());
  }

  private detach(): void {
    this.attached = undefined;
  }

  get connectionStatus(): ConnectionStatus {
    return this.connection.connectionStatus;
  }

  async connect(): Promise<void> {
    await this.connection.connect();
    const stream = this.connection.getStream();
    if (!stream) {
      this.detach();
      // Do not leave a spawned child behind with no usable link to it.
      await this.connection.disconnect().catch(() => undefined);
      throw new Error(ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE);
    }
    // Constructing a ClientSideConnection starts a reader loop, so re-attaching to a stream we
    // are already reading would leave two loops competing on one pipe.
    if (this.attached?.stream === stream) {
      return;
    }
    this.attached = { rpc: new ClientSideConnection(() => this, stream), stream };
  }

  async disconnect(): Promise<void> {
    // Detach first: a rejecting transport disconnect must not leave the port looking usable.
    this.detach();
    await this.connection.disconnect();
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
    if (this.options.permissionHandler) {
      return this.options.permissionHandler(params);
    }
    // Safe default: deny when no handler is configured (never auto-allow).
    return { outcome: { outcome: PERMISSION_OUTCOME.CANCELLED } };
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
    if (!this.attached) {
      throw new Error(ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED);
    }
    return this.attached.rpc;
  }
}
