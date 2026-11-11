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
  ResumeSessionRequest,
  ResumeSessionResponse,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import {
  type ClientCapabilities,
  type ClientConnection,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  client,
  type KillTerminalRequest,
  type KillTerminalResponse,
  methods,
  PROTOCOL_VERSION,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  RequestError,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { AGENT_PORT_EVENT } from "../domain/agent.port.events";
import { CONNECTION_EVENT } from "../domain/connection.events";
import type { ConnectionStatus } from "../domain/connection.status";
import { CONNECTION_STATUS } from "../domain/connection.status";
import { ERROR_MESSAGE } from "../domain/error.messages";
import {
  ACP_ERROR_CODE,
  AcpCliError,
  AgentProcessError,
  AgentProtocolError,
  ConnectionError,
  ToolHostError,
} from "../domain/errors";
import { PERMISSION_OUTCOME } from "../domain/permission.outcome";
import { providerSetup } from "../domain/provider.setup";
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
  /** Provider id put on typed errors and used to look up setup hints, e.g. "cursor-cli". */
  providerId?: string;
  /** The agent command, named when the CLI cannot be found. */
  command?: string;
}

export function createAcpAgentPort(
  connection: IACPConnectionLike,
  options: ACPClientOptions = {}
): IAgentPort {
  return new ACPClient(connection, options);
}

type AcpStream = NonNullable<ReturnType<IConnection["getStream"]>>;
type AcpMessage = AcpStream["readable"] extends ReadableStream<infer T> ? T : never;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type AuthMethods = NonNullable<AgentProtocolError["authMethods"]>;

/** SDK RequestError codes (sdk dist/core/jsonrpc.js) to protocol codes; others are internal. */
const PROTOCOL_CODE_BY_RPC_CODE: ReadonlyMap<number, AgentProtocolError["code"]> = new Map([
  [-32000, ACP_ERROR_CODE.AUTH_REQUIRED],
  [-32002, ACP_ERROR_CODE.SESSION_NOT_FOUND],
  [-32800, ACP_ERROR_CODE.REQUEST_CANCELLED],
  [-32602, ACP_ERROR_CODE.INVALID_PARAMS],
  [-32601, ACP_ERROR_CODE.METHOD_NOT_FOUND],
  [-32022, ACP_ERROR_CODE.UNSUPPORTED_PROTOCOL_VERSION],
]);

/** A session/update notification carrying the fields the port's consumers read. */
function isSessionUpdateMessage(
  message: unknown
): message is { method: string; params: SessionNotification } {
  if (!isRecord(message) || "id" in message) return false;
  if (message.method !== methods.client.session.update) return false;
  const params = message.params;
  return (
    isRecord(params) &&
    typeof params.sessionId === "string" &&
    isRecord(params.update) &&
    typeof params.update.sessionUpdate === "string"
  );
}

class ACPClient extends EventEmitter<AgentPortEvents> implements IAgentPort {
  /**
   * The live SDK connection and the stream it was built on, held together so "am I usable" has
   * exactly one representation. Keeping the stream lets connect() recognise that it is already
   * attached to it, instead of stacking a second reader loop on the same pipe.
   */
  private attached: { link: ClientConnection; stream: AcpStream } | undefined;
  /**
   * The stream of a link the SDK closed by itself (EOF, failed write, broken input) while the
   * transport reported nothing. The process may still be alive, so connect() must not reuse it.
   * Cleared whenever detach() runs or a new link is attached.
   */
  private staleStream: AcpStream | undefined;
  private readonly toolHost: IToolHost | undefined;
  private readonly clientCapabilities: ClientCapabilities;
  /** From the last successful initialize(), for AUTH_REQUIRED errors. */
  private authMethods: AuthMethods = [];
  /** From the last successful initialize() on the current link. */
  private initializedCapabilities: AgentCapabilities | undefined;
  /** The transport's last error during the current connect(), as re-raised by this client. */
  private transportError: Error | undefined;

  constructor(
    private readonly connection: IACPConnectionLike,
    private readonly options: ACPClientOptions = {}
  ) {
    super();
    this.toolHost = options.toolHost;
    // A tool host is the only way to serve fs/* and terminal/* requests, and IToolHost requires
    // all seven methods, so its presence is exactly equivalent to "this client supports both".
    // Defaulting to {} meant the documented way to enable tools advertised no support at all,
    // the agent never issued the requests, and the host sat unreachable with no diagnostic.
    // An explicit clientCapabilities still wins outright: session/plan and partial fs support
    // are only expressible there, so the two are never merged.
    this.clientCapabilities =
      options.clientCapabilities ??
      (options.toolHost ? { fs: { readTextFile: true, writeTextFile: true }, terminal: true } : {});
    this.connection.on(CONNECTION_EVENT.STATE, (status) => {
      // Drop the link on terminal transport states only. A transient CONNECTING must not
      // detach, and third-party transports may emit states this client does not model.
      if (status === CONNECTION_STATUS.DISCONNECTED || status === CONNECTION_STATUS.ERROR) {
        this.detach();
      }
      this.emit(AGENT_PORT_EVENT.STATE, status);
    });
    this.connection.on(CONNECTION_EVENT.ERROR, (error) => {
      this.transportError = this.withProvider(error);
      this.emit(AGENT_PORT_EVENT.ERROR, this.transportError);
    });
    // The transport declares and emits EXIT; nothing used to subscribe, so the client kept a
    // link to a process that had already gone away. EXIT is announced for every child, including
    // one abandoned by an earlier reconnect, so ownership has to be checked.
    //
    // The transport clears getStream() before announcing the exit of the process that stream
    // belonged to. So if getStream() STILL returns the stream this link was built on, the
    // process that just exited was some other child and the link is untouched; otherwise the
    // exit was ours and the link is dead. The test reads inverted at a glance - keep the
    // ordering contract in connection.interface.ts in mind when changing either side.
    this.connection.on(CONNECTION_EVENT.EXIT, () => {
      // A link the SDK already closed still owns its stream for this check.
      const ownStream = this.attached?.stream ?? this.staleStream;
      if (ownStream && this.connection.getStream() === ownStream) {
        return;
      }
      this.detach();
    });
  }

  /** One app per attach: handlers are bound to this client and delegate to its own methods. */
  private buildApp() {
    return client()
      .onRequest(methods.client.session.requestPermission, ({ params }) =>
        this.requestPermission(params)
      )
      .onRequest(methods.client.fs.readTextFile, ({ params }) => this.readTextFile(params))
      .onRequest(methods.client.fs.writeTextFile, ({ params }) => this.writeTextFile(params))
      .onRequest(methods.client.terminal.create, ({ params }) => this.createTerminal(params))
      .onRequest(methods.client.terminal.output, ({ params }) => this.terminalOutput(params))
      .onRequest(methods.client.terminal.waitForExit, ({ params }) =>
        this.waitForTerminalExit(params)
      )
      .onRequest(methods.client.terminal.release, ({ params }) => this.releaseTerminal(params))
      .onRequest(methods.client.terminal.kill, ({ params }) => this.killTerminal(params));
    // session/update is deliberately not registered here: observeInbound() emits it.
  }

  /**
   * Wraps the inbound side so each session/update is emitted at the moment the SDK reads it.
   *
   * The SDK settles a request's promise synchronously when it reads the response, but runs each
   * notification through an async handler chain. Emitting from an onNotification handler let
   * prompt() resolve before the updates read just ahead of its response had been emitted, and
   * streamPrompt() closed its queue on them. The SDK reads one message at a time, and pull()
   * runs only when it asks for the next one, so every update is emitted before the SDK can even
   * see the message after it.
   */
  private observeInbound(stream: AcpStream): AcpStream {
    let reader: ReadableStreamDefaultReader<AcpMessage> | undefined;
    const readable = new ReadableStream<AcpMessage>(
      {
        pull: async (controller) => {
          reader ??= stream.readable.getReader();
          const { value, done } = await reader.read();
          if (done) {
            controller.close();
            return;
          }
          this.emitIfSessionUpdate(value);
          controller.enqueue(value);
        },
        cancel: (reason) => (reader ?? stream.readable).cancel(reason),
      },
      // Zero, so nothing is read from the transport before the SDK asks for it.
      { highWaterMark: 0 }
    );
    return { readable, writable: stream.writable };
  }

  /**
   * The SDK still parses every session/update with its schema (and logs ones that fail), but
   * that runs after this point and cannot gate it, so this checks the shape consumers rely on.
   * A listener that throws is reported on `error` rather than allowed to break the read loop.
   */
  private emitIfSessionUpdate(message: AcpMessage): void {
    if (!isSessionUpdateMessage(message)) return;
    try {
      this.emit(AGENT_PORT_EVENT.SESSION_UPDATE, message.params);
    } catch (error) {
      this.emitError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private emitError(error: Error): void {
    try {
      this.emit(AGENT_PORT_EVENT.ERROR, error);
    } catch {
      // An error listener that throws has nowhere further to report to.
    }
  }

  /**
   * The SDK closes a link by itself on EOF, a failed write or a broken input stream. Only a link
   * that is still attached counts: one we closed in detach(), or one replaced by a reconnect, is
   * ignored. Nothing is reported or torn down here: when the process has died, the transport
   * reports the exit (code and stderr) moments later, and acting first would pre-empt that.
   * Calls fail with ACP_LINK_CLOSED meanwhile, and connect() replaces the stale stream.
   */
  private onLinkClosed(link: ClientConnection): void {
    if (this.attached?.link !== link) return;
    this.staleStream = this.attached.stream;
    this.attached = undefined;
  }

  private detach(): void {
    const attached = this.attached;
    this.attached = undefined;
    this.staleStream = undefined;
    // Closing rejects requests still pending on a link whose process is gone, so callers
    // waiting on prompt() see an error rather than hanging.
    attached?.link.close();
  }

  get connectionStatus(): ConnectionStatus {
    return this.connection.connectionStatus;
  }

  async connect(): Promise<void> {
    this.transportError = undefined;
    await this.connection.connect();
    // The SDK has closed the link but its close callback has not run yet: treat it as stale now.
    if (this.attached?.link.signal.aborted) this.onLinkClosed(this.attached.link);
    let stream = this.connection.getStream();
    const staleStream = this.staleStream;
    if (staleStream && stream === staleStream) {
      // The link on this stream is dead but the process has not exited, so the transport still
      // reports itself connected. Restart it to get a stream that is actually readable.
      await this.connection.disconnect();
      await this.connection.connect();
      stream = this.connection.getStream();
      if (stream === staleStream) {
        stream = undefined;
      }
    }
    if (!stream) {
      this.detach();
      // Do not leave a spawned child behind with no usable link to it.
      await this.connection.disconnect().catch(() => undefined);
      // Set by the transport's error event during the awaits above, which TS cannot see.
      const failure = this.transportError as Error | undefined;
      const cliUnusable =
        failure instanceof AgentProcessError &&
        (failure.code === ACP_ERROR_CODE.CLI_NOT_FOUND ||
          failure.code === ACP_ERROR_CODE.CLI_NOT_EXECUTABLE);
      throw cliUnusable
        ? failure
        : new ConnectionError(
            ACP_ERROR_CODE.STREAM_UNAVAILABLE,
            ERROR_MESSAGE.ACP_STREAM_UNAVAILABLE,
            { providerId: this.options.providerId }
          );
    }
    // Connecting a client app starts a reader loop, so re-attaching to a stream we
    // are already reading would leave two loops competing on one pipe.
    if (this.attached?.stream === stream) {
      return;
    }
    const link = this.buildApp().connect(this.observeInbound(stream));
    this.attached = { link, stream };
    // A new link may be a different process, which may advertise different auth methods.
    this.authMethods = [];
    this.initializedCapabilities = undefined;
    this.staleStream = undefined;
    void link.closed.then(() => this.onLinkClosed(link));
  }

  async disconnect(): Promise<void> {
    // Detach first: a rejecting transport disconnect must not leave the port looking usable.
    this.detach();
    await this.connection.disconnect();
  }

  async initialize(params?: Partial<InitializeRequest>): Promise<InitializeResponse> {
    const response = await this.call(() =>
      this.requireAgent().request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: this.clientCapabilities,
        ...params,
      })
    );
    this.authMethods = (response.authMethods ?? []).map(({ id, name, description }) => ({
      id,
      name,
      ...(description == null ? {} : { description }),
    }));
    this.initializedCapabilities = response.agentCapabilities;
    return response;
  }

  get agentCapabilities(): AgentCapabilities | undefined {
    return this.initializedCapabilities;
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    return this.call(() => this.requireAgent().request(methods.agent.session.new, params));
  }

  async resumeSession(params: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    return this.call(
      () => this.requireAgent().request(methods.agent.session.resume, params),
      params.sessionId
    );
  }

  /** The agent's history replay arrives as `sessionUpdate` events before this resolves. */
  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    return this.call(
      () => this.requireAgent().request(methods.agent.session.load, params),
      params.sessionId
    );
  }

  async authenticate(params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return this.call(() => this.requireAgent().request(methods.agent.authenticate, params));
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    return this.call(
      () => this.requireAgent().request(methods.agent.session.prompt, params),
      params.sessionId
    );
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    return this.call(
      () => this.requireAgent().request(methods.agent.session.setMode, params),
      params.sessionId
    );
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest
  ): Promise<SetSessionConfigOptionResponse> {
    return this.call(
      () => this.requireAgent().request(methods.agent.session.setConfigOption, params),
      params.sessionId
    );
  }

  /**
   * Every outbound request goes through here, so agent JSON-RPC errors are classified once. A
   * request still pending when its link closes (agent EOF, process exit, disconnect()) is rejected
   * by the SDK with a plain Error; that becomes LINK_CLOSED, keeping the SDK's message.
   */
  private async call<T>(send: () => Promise<T>, sessionId?: string): Promise<T> {
    const link = this.attached?.link;
    try {
      return await send();
    } catch (error) {
      if (error instanceof RequestError) throw this.toProtocolError(error, sessionId);
      if (link?.signal.aborted && error instanceof Error && !(error instanceof AcpCliError)) {
        throw new ConnectionError(ACP_ERROR_CODE.LINK_CLOSED, error.message, {
          providerId: this.options.providerId,
          sessionId,
          cause: error,
        });
      }
      throw error;
    }
  }

  private toProtocolError(error: RequestError, sessionId: string | undefined): AgentProtocolError {
    const code = PROTOCOL_CODE_BY_RPC_CODE.get(error.code) ?? ACP_ERROR_CODE.AGENT_INTERNAL_ERROR;
    const isAuth = code === ACP_ERROR_CODE.AUTH_REQUIRED;
    const login = isAuth ? providerSetup(this.options.providerId)?.login : undefined;
    const hint = login === undefined ? undefined : ERROR_MESSAGE.HINT_LOGIN(login);
    return new AgentProtocolError(
      code,
      hint === undefined ? error.message : ERROR_MESSAGE.WITH_HINT(error.message, hint),
      {
        rpcCode: error.code,
        data: error.data,
        authMethods: isAuth ? this.authMethods : undefined,
        providerId: this.options.providerId,
        sessionId,
        hint,
        cause: error,
      }
    );
  }

  /** The transport does not know the provider: add it, and the install hint for a missing CLI. */
  private withProvider(error: Error): Error {
    const { providerId } = this.options;
    if (!(error instanceof AgentProcessError) || providerId === undefined) return error;
    const install =
      error.code === ACP_ERROR_CODE.CLI_NOT_FOUND ? providerSetup(providerId)?.install : undefined;
    const hint = install === undefined ? undefined : ERROR_MESSAGE.HINT_INSTALL(install);
    return new AgentProcessError(
      error.code,
      hint === undefined ? error.message : ERROR_MESSAGE.WITH_HINT(error.message, hint),
      {
        command: error.command ?? this.options.command,
        exitCode: error.exitCode,
        signal: error.signal,
        stderr: error.stderr,
        providerId,
        hint,
        ...(error.cause === undefined ? {} : { cause: error.cause }),
      }
    );
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

  async killTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse> {
    return this.requireToolHost("terminal").killTerminal(params);
  }

  private requireToolHost(kind: "file" | "terminal"): IToolHost {
    if (!this.toolHost) {
      throw new ToolHostError(
        ACP_ERROR_CODE.TOOLS_NOT_CONFIGURED,
        kind === "file"
          ? ERROR_MESSAGE.FILE_SYSTEM_TOOLS_NOT_CONFIGURED
          : ERROR_MESSAGE.TERMINAL_TOOLS_NOT_CONFIGURED,
        { kind, providerId: this.options.providerId }
      );
    }
    return this.toolHost;
  }

  private requireAgent(): ClientConnection["agent"] {
    if (!this.attached) {
      const options = { providerId: this.options.providerId };
      throw this.staleStream
        ? new ConnectionError(ACP_ERROR_CODE.LINK_CLOSED, ERROR_MESSAGE.ACP_LINK_CLOSED, options)
        : new ConnectionError(
            ACP_ERROR_CODE.NOT_CONNECTED,
            ERROR_MESSAGE.ACP_CLIENT_NOT_CONNECTED,
            options
          );
    }
    return this.attached.link.agent;
  }
}
