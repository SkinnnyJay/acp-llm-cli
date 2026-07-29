import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
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
import { EventEmitter } from "eventemitter3";
import { AGENT_PORT_EVENT } from "../../domain/agent.port.events";
import { CONNECTION_STATUS } from "../../domain/connection.status";
import type { ConnectionStatus } from "../../domain/connection.status";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { ENV_KEY } from "../../domain/env.keys";
import { ERROR_MESSAGE } from "../../domain/error.messages";
import { PORT_CAPABILITY } from "../../domain/port.capabilities";
import { STOP_REASON } from "../../domain/stop.reason";
import { TIMEOUT } from "../../domain/timeouts";
import type { AgentPortCapabilities, AgentPortEvents, IAgentPort } from "../../runtime/agent.port";
import { getEnvString } from "../../runtime/env.reader";
import { CURSOR_CLI_ARG, CURSOR_HEALTH_CHECK_PROMPT, CURSOR_UUID_PATTERN } from "./constants";
import { resolveCursorMode } from "./cursor.mode.utils";
import { parseCursorNdjsonResult } from "./cursor.ndjson.utils";
import { runCursorSpawnedCommand } from "./cursor.spawn.utils";
import type { CursorConfig } from "./schema";

/** Cursor uses process-per-prompt; streaming and lifecycle are not supported. */
const CURSOR_CAPABILITIES: AgentPortCapabilities = {
  [PORT_CAPABILITY.STREAM_PROMPT]: false,
  [PORT_CAPABILITY.RESTART]: false,
  [PORT_CAPABILITY.OPEN_CLOSE]: false,
  [PORT_CAPABILITY.SESSION_PERSISTENCE]: false,
};

/**
 * IAgentPort for Cursor CLI: spawns process per prompt, parses NDJSON result.
 * Supports setSessionMode/setSessionModel, runCommand timeout, and graceful disconnect.
 */
export class CursorAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities = CURSOR_CAPABILITIES;
  private status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;
  private sessionId: string | undefined;
  private readonly config: CursorConfig;
  private readonly sessionModeById = new Map<string, string>();
  private readonly sessionModelById = new Map<string, string>();
  private activePromptCount = 0;
  private disconnectionInProgress = false;

  constructor(config: CursorConfig) {
    super();
    this.config = config;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  private resolveConnectCommand(): string {
    return getEnvString(
      ENV_KEY.ACP_LLM_CLI_CURSOR_COMMAND,
      DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND,
      this.config.env
    );
  }

  private resolveCliCommand(): string {
    return (
      this.config.command ??
      getEnvString(
        ENV_KEY.ACP_LLM_CLI_CURSOR_COMMAND,
        DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND,
        this.config.env
      )
    );
  }

  private resolveBaseArgs(): string[] {
    return this.config.args ?? [...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS];
  }

  async connect(): Promise<void> {
    this.status = CONNECTION_STATUS.CONNECTING;
    const command = this.resolveConnectCommand();
    const args = [
      CURSOR_CLI_ARG.PRINT,
      CURSOR_CLI_ARG.OUTPUT_FORMAT,
      CURSOR_CLI_ARG.STREAM_JSON,
      CURSOR_CLI_ARG.TRUST,
      CURSOR_HEALTH_CHECK_PROMPT,
    ];
    try {
      const result = await runCursorSpawnedCommand(
        command,
        args,
        this.config,
        TIMEOUT.CURSOR_PROMPT_MS
      );
      if (result.exitCode === 0) {
        this.status = CONNECTION_STATUS.CONNECTED;
        this.emit(AGENT_PORT_EVENT.STATE, this.status);
      } else {
        this.status = CONNECTION_STATUS.ERROR;
        this.emit(AGENT_PORT_EVENT.STATE, this.status);
        this.emit(
          AGENT_PORT_EVENT.ERROR,
          new Error(result.stderr || ERROR_MESSAGE.CURSOR_CLI_CHECK_FAILED)
        );
      }
    } catch (err) {
      this.status = CONNECTION_STATUS.ERROR;
      this.emit(AGENT_PORT_EVENT.STATE, this.status);
      this.emit(AGENT_PORT_EVENT.ERROR, err instanceof Error ? err : new Error(String(err)));
    }
  }

  async disconnect(): Promise<void> {
    this.disconnectionInProgress = true;
    try {
      await this.waitForPromptCompletion();
      this.status = CONNECTION_STATUS.DISCONNECTED;
      this.emit(AGENT_PORT_EVENT.STATE, this.status);
    } finally {
      this.disconnectionInProgress = false;
    }
  }

  private async waitForPromptCompletion(): Promise<void> {
    if (this.activePromptCount === 0) return;
    const deadline = Date.now() + TIMEOUT.CURSOR_GRACEFUL_SHUTDOWN_MS;
    while (this.activePromptCount > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, TIMEOUT.CURSOR_GRACEFUL_SHUTDOWN_POLL_MS));
    }
    if (this.activePromptCount > 0) this.activePromptCount = 0;
  }

  async initialize(_params?: Partial<InitializeRequest>): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
    };
  }

  async newSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    const command = this.resolveCliCommand();
    const baseArgs = this.resolveBaseArgs();
    const result = await runCursorSpawnedCommand(
      command,
      [...baseArgs, CURSOR_CLI_ARG.CREATE_CHAT],
      this.config,
      TIMEOUT.CURSOR_PROMPT_MS
    );
    const match = result.stdout.match(CURSOR_UUID_PATTERN);
    this.sessionId = match?.[0] ?? undefined;
    return { sessionId: this.sessionId ?? "" };
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    const resolved = resolveCursorMode(params.modeId);
    if (resolved) {
      this.sessionModeById.set(params.sessionId, resolved);
    } else {
      this.sessionModeById.delete(params.sessionId);
    }
    return {};
  }

  async setSessionModel(params: SetSessionModelRequest): Promise<SetSessionModelResponse> {
    this.sessionModelById.set(params.sessionId, params.modelId);
    return {};
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    if (this.disconnectionInProgress) {
      throw new Error("Disconnection in progress; prompt rejected.");
    }
    this.activePromptCount++;
    try {
      const textBlock = params.prompt?.find((contentBlock) => contentBlock.type === "text");
      const text =
        textBlock && "text" in textBlock && typeof textBlock.text === "string"
          ? textBlock.text
          : "";
      const command = this.resolveCliCommand();
      const baseArgs = this.resolveBaseArgs();
      const mode = this.sessionModeById.get(params.sessionId) ?? this.config.mode ?? undefined;
      const model = this.sessionModelById.get(params.sessionId) ?? this.config.model ?? undefined;
      const args = [
        CURSOR_CLI_ARG.PRINT,
        CURSOR_CLI_ARG.OUTPUT_FORMAT,
        CURSOR_CLI_ARG.STREAM_JSON,
        CURSOR_CLI_ARG.TRUST,
        ...(this.sessionId ? [CURSOR_CLI_ARG.RESUME, this.sessionId] : []),
        ...(mode ? [CURSOR_CLI_ARG.MODE, mode] : []),
        ...(model ? [CURSOR_CLI_ARG.MODEL, model] : []),
        ...baseArgs,
        text,
      ];
      const result = await runCursorSpawnedCommand(
        command,
        args,
        this.config,
        TIMEOUT.CURSOR_PROMPT_MS
      );
      const parsed = parseCursorNdjsonResult(result.stdout);
      if (parsed === null) {
        throw new Error(ERROR_MESSAGE.CURSOR_RESULT_MISSING);
      }
      if (parsed.sessionId) this.sessionId = parsed.sessionId;
      return {
        stopReason: STOP_REASON.END_TURN,
        ...(parsed.result ? { content: [{ type: "text" as const, text: parsed.result }] } : {}),
      };
    } finally {
      this.activePromptCount--;
    }
  }

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return {};
  }

  async sessionUpdate(_params: SessionNotification): Promise<void> {
    // no-op
  }
}
