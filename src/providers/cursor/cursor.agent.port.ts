import type {
  AuthenticateRequest,
  AuthenticateResponse,
  InitializeRequest,
  InitializeResponse,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  SessionConfigOption,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from "@agentclientprotocol/sdk";
import { PROTOCOL_VERSION } from "@agentclientprotocol/sdk";
import { EventEmitter } from "eventemitter3";
import { AGENT_PORT_EVENT } from "../../domain/agent.port.events";
import type { ConnectionStatus } from "../../domain/connection.status";
import { CONNECTION_STATUS } from "../../domain/connection.status";
import { DEFAULT_COMMANDS } from "../../domain/default.commands";
import { ENV_KEY } from "../../domain/env.keys";
import { ERROR_MESSAGE } from "../../domain/error.messages";
import { PORT_CAPABILITY } from "../../domain/port.capabilities";
import { formatStderrForError } from "../../domain/stderr.format";
import { STOP_REASON } from "../../domain/stop.reason";
import { TIMEOUT } from "../../domain/timeouts";
import type { AgentPortCapabilities, AgentPortEvents, IAgentPort } from "../../runtime/agent.port";
import { getEnvString, isDebugEnabled } from "../../runtime/env.reader";
import {
  CURSOR_CLI_ARG,
  CURSOR_CONFIG_OPTION,
  CURSOR_HEALTH_CHECK_PROMPT,
  CURSOR_UUID_PATTERN,
} from "./constants";
import { resolveCursorMode } from "./cursor.mode.utils";
import { parseCursorNdjsonResult } from "./cursor.ndjson.utils";
import type { CursorSpawnFn } from "./cursor.spawn.utils";
import { runCursorSpawnedCommand } from "./cursor.spawn.utils";
import type { CursorConfig } from "./schema";

/** Cursor uses process-per-prompt; streaming and lifecycle are not supported. */
const CURSOR_CAPABILITIES: AgentPortCapabilities = {
  [PORT_CAPABILITY.STREAM_PROMPT]: false,
  [PORT_CAPABILITY.RESTART]: false,
  [PORT_CAPABILITY.OPEN_CLOSE]: false,
  [PORT_CAPABILITY.SESSION_PERSISTENCE]: false,
};

export interface CursorAgentPortOptions {
  /** Injectable spawn for tests; defaults to node:child_process spawn. */
  spawnFn?: CursorSpawnFn;
}

/** Everything the port knows about one ACP session. */
interface CursorSessionState {
  /** The cursor chat id to resume, once one has been minted or echoed back by the CLI. */
  cursorSessionId?: string;
  mode?: string;
  model?: string;
}

/**
 * IAgentPort for Cursor CLI: spawns process per prompt, parses NDJSON result.
 * Supports setSessionMode/setSessionConfigOption, runCommand timeout, and graceful disconnect.
 */
export class CursorAgentPort extends EventEmitter<AgentPortEvents> implements IAgentPort {
  readonly capabilities = CURSOR_CAPABILITIES;
  private status: ConnectionStatus = CONNECTION_STATUS.DISCONNECTED;
  private readonly config: CursorConfig;
  private readonly spawnFn: CursorSpawnFn | undefined;
  /**
   * Per-ACP-session state. Previously the cursor chat id was a single process-wide field while
   * mode and model were per-session maps, so a prompt could resume one chat with another
   * session's settings. Everything about a session now lives in one entry with one lifetime.
   */
  private readonly sessions = new Map<string, CursorSessionState>();
  /**
   * The single in-flight ledger, mutated only by runTracked. Its size replaces a separate
   * counter, so every spawn kind (connect, newSession, prompt) is tracked and waited on
   * uniformly rather than only prompts.
   */
  private readonly inFlight = new Set<AbortController>();
  /** Non-undefined while a disconnect is running; makes disconnect() idempotent by construction. */
  private shutdown: Promise<void> | undefined;

  constructor(config: CursorConfig, options?: CursorAgentPortOptions) {
    super();
    this.config = config;
    this.spawnFn = options?.spawnFn;
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
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

  /** Honor config.trust; never force --trust by default. */
  private trustArgs(): string[] {
    return this.config.trust === true ? [CURSOR_CLI_ARG.TRUST] : [];
  }

  private async runTracked(
    command: string,
    args: string[],
    timeoutMs: number = TIMEOUT.CURSOR_PROMPT_MS
  ) {
    // Single admission point: this closes connect() and newSession(), which were previously
    // ungated and could start a process after a disconnect had already begun.
    if (this.shutdown) {
      throw new Error(ERROR_MESSAGE.CURSOR_DISCONNECT_IN_PROGRESS);
    }
    const controller = new AbortController();
    this.inFlight.add(controller);
    try {
      return await runCursorSpawnedCommand(command, args, this.config, {
        timeoutMs,
        signal: controller.signal,
        spawnFn: this.spawnFn,
      });
    } finally {
      // Each caller retires its own entry. Nothing else may clear the ledger.
      this.inFlight.delete(controller);
    }
  }

  async connect(): Promise<void> {
    this.status = CONNECTION_STATUS.CONNECTING;
    // Health-check the exact binary and base args every prompt will use. These used to differ:
    // connect resolved env-then-default and ignored config.command entirely, and omitted the
    // configured args, so a custom `command` was probed as the default binary - connect could
    // pass while every real invocation failed, or the reverse.
    const command = this.resolveCliCommand();
    const args = [
      CURSOR_CLI_ARG.PRINT,
      CURSOR_CLI_ARG.OUTPUT_FORMAT,
      CURSOR_CLI_ARG.STREAM_JSON,
      ...this.trustArgs(),
      ...this.resolveBaseArgs(),
      CURSOR_HEALTH_CHECK_PROMPT,
    ];
    try {
      const result = await this.runTracked(command, args);
      if (result.exitCode === 0) {
        this.status = CONNECTION_STATUS.CONNECTED;
        this.emit(AGENT_PORT_EVENT.STATE, this.status);
      } else {
        this.status = CONNECTION_STATUS.ERROR;
        this.emit(AGENT_PORT_EVENT.STATE, this.status);
        this.emit(
          AGENT_PORT_EVENT.ERROR,
          new Error(
            formatStderrForError(result.stderr, { debug: isDebugEnabled(this.config.env) }) ||
              ERROR_MESSAGE.CURSOR_CLI_CHECK_FAILED
          )
        );
      }
    } catch (err) {
      this.status = CONNECTION_STATUS.ERROR;
      this.emit(AGENT_PORT_EVENT.STATE, this.status);
      this.emit(AGENT_PORT_EVENT.ERROR, err instanceof Error ? err : new Error(String(err)));
    }
  }

  async disconnect(): Promise<void> {
    // Overlapping callers share one shutdown, so none of them can clear another's state.
    // The latch is released when runShutdown settles, before this promise resolves, which
    // keeps the restart path (disconnect() then connect()) working.
    this.shutdown ??= this.runShutdown().finally(() => {
      this.shutdown = undefined;
    });
    return this.shutdown;
  }

  private async runShutdown(): Promise<void> {
    // Abort in-flight work first so disconnect cannot hang on a stuck child.
    for (const controller of this.inFlight) {
      controller.abort();
    }
    await this.waitForInFlight();
    this.status = CONNECTION_STATUS.DISCONNECTED;
    this.emit(AGENT_PORT_EVENT.STATE, this.status);
  }

  private async waitForInFlight(): Promise<void> {
    if (this.inFlight.size === 0) return;
    const deadline = Date.now() + TIMEOUT.CURSOR_GRACEFUL_SHUTDOWN_MS;
    while (this.inFlight.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, TIMEOUT.CURSOR_GRACEFUL_SHUTDOWN_POLL_MS));
    }
  }

  async initialize(_params?: Partial<InitializeRequest>): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
    };
  }

  /** Returns the entry for a session, creating it on first use. */
  private sessionState(sessionId: string): CursorSessionState {
    let state = this.sessions.get(sessionId);
    if (!state) {
      state = {};
      this.sessions.set(sessionId, state);
    }
    return state;
  }

  async newSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    const command = this.resolveCliCommand();
    const baseArgs = this.resolveBaseArgs();
    const result = await this.runTracked(command, [...baseArgs, CURSOR_CLI_ARG.CREATE_CHAT]);
    const cursorSessionId = result.stdout.match(CURSOR_UUID_PATTERN)?.[0];
    if (!cursorSessionId) {
      return { sessionId: "" };
    }
    // The ACP session id is the cursor chat id, so the entry is keyed by what we return.
    this.sessionState(cursorSessionId).cursorSessionId = cursorSessionId;
    return { sessionId: cursorSessionId };
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    this.sessionState(params.sessionId).mode = resolveCursorMode(params.modeId);
    return {};
  }

  async setSessionConfigOption(
    params: SetSessionConfigOptionRequest
  ): Promise<SetSessionConfigOptionResponse> {
    if (params.configId === CURSOR_CONFIG_OPTION.MODEL && typeof params.value === "string") {
      this.sessionState(params.sessionId).model = params.value;
    }
    return { configOptions: this.describeConfigOptions(params.sessionId) };
  }

  /**
   * Cursor exposes one session config option: the model. `cursor-agent` has no
   * command that enumerates models for a session, so the selector reports the
   * active value as its only known option rather than inventing a catalogue
   * that could drift from what the CLI actually accepts.
   */
  private describeConfigOptions(sessionId: string): SessionConfigOption[] {
    const current = this.sessionState(sessionId).model ?? this.config.model ?? "";
    return [
      {
        id: CURSOR_CONFIG_OPTION.MODEL,
        name: "Model",
        category: "model",
        type: "select",
        currentValue: current,
        options: current ? [{ value: current, name: current }] : [],
      },
    ];
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const textBlock = params.prompt?.find((contentBlock) => contentBlock.type === "text");
    const text =
      textBlock && "text" in textBlock && typeof textBlock.text === "string" ? textBlock.text : "";
    const command = this.resolveCliCommand();
    const baseArgs = this.resolveBaseArgs();
    const session = this.sessions.get(params.sessionId);
    const mode = session?.mode ?? this.config.mode ?? undefined;
    const model = session?.model ?? this.config.model ?? undefined;
    const resumeId = session?.cursorSessionId;
    const args = [
      CURSOR_CLI_ARG.PRINT,
      CURSOR_CLI_ARG.OUTPUT_FORMAT,
      CURSOR_CLI_ARG.STREAM_JSON,
      ...this.trustArgs(),
      ...(resumeId ? [CURSOR_CLI_ARG.RESUME, resumeId] : []),
      ...(mode ? [CURSOR_CLI_ARG.MODE, mode] : []),
      ...(model ? [CURSOR_CLI_ARG.MODEL, model] : []),
      ...baseArgs,
      text,
    ];
    // runTracked owns admission and in-flight bookkeeping for every spawn kind.
    const result = await this.runTracked(command, args);
    const parsed = parseCursorNdjsonResult(result.stdout);
    if (parsed === null) {
      // cursor-agent exits 0 while printing things like "Authentication required"
      // to stdout, so the parse failure is often not the interesting part - the
      // line it printed is. Redacted and truncated on the same rules as stderr.
      const said = formatStderrForError(`${result.stdout}\n${result.stderr}`.trim(), {
        debug: isDebugEnabled(this.config.env),
      });
      throw new Error(
        said
          ? ERROR_MESSAGE.CURSOR_RESULT_MISSING_WITH_OUTPUT(said)
          : ERROR_MESSAGE.CURSOR_RESULT_MISSING
      );
    }
    // Bind the chat the CLI reports back to this session, so later turns resume it.
    if (parsed.sessionId) {
      this.sessionState(params.sessionId).cursorSessionId = parsed.sessionId;
    }
    return {
      stopReason: STOP_REASON.END_TURN,
      ...(parsed.result ? { content: [{ type: "text" as const, text: parsed.result }] } : {}),
    };
  }

  async authenticate(_params: AuthenticateRequest): Promise<AuthenticateResponse> {
    return {};
  }

  async sessionUpdate(_params: SessionNotification): Promise<void> {
    // no-op
  }
}
