/**
 * Errors this package raises. Every one is an `AcpCliError` whose `code` is stable and safe to
 * branch on; `message` is for people and may change. One subclass per subsystem, and each
 * subclass accepts only its own subsystem's codes.
 */

export const ACP_ERROR_SUBSYSTEM = {
  CONFIG: "config",
  PROCESS: "process",
  CONNECTION: "connection",
  PROTOCOL: "protocol",
  CAPABILITY: "capability",
  USAGE: "usage",
  TOOL_HOST: "tool-host",
  TIMEOUT: "timeout",
} as const;

export type AcpErrorSubsystem = (typeof ACP_ERROR_SUBSYSTEM)[keyof typeof ACP_ERROR_SUBSYSTEM];

export const ACP_ERROR_CODE = {
  // config
  CONFIG_INVALID: "CONFIG_INVALID",
  PROVIDER_UNKNOWN: "PROVIDER_UNKNOWN",
  // process
  CLI_NOT_FOUND: "CLI_NOT_FOUND",
  CLI_NOT_EXECUTABLE: "CLI_NOT_EXECUTABLE",
  SPAWN_FAILED: "SPAWN_FAILED",
  PROCESS_EXITED: "PROCESS_EXITED",
  // connection
  NOT_CONNECTED: "NOT_CONNECTED",
  STREAM_UNAVAILABLE: "STREAM_UNAVAILABLE",
  LINK_CLOSED: "LINK_CLOSED",
  // protocol (errors returned by the agent)
  AUTH_REQUIRED: "AUTH_REQUIRED",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  REQUEST_CANCELLED: "REQUEST_CANCELLED",
  INVALID_PARAMS: "INVALID_PARAMS",
  METHOD_NOT_FOUND: "METHOD_NOT_FOUND",
  UNSUPPORTED_PROTOCOL_VERSION: "UNSUPPORTED_PROTOCOL_VERSION",
  AGENT_INTERNAL_ERROR: "AGENT_INTERNAL_ERROR",
  // capability
  CAPABILITY_UNSUPPORTED: "CAPABILITY_UNSUPPORTED",
  // usage
  STREAM_IN_PROGRESS: "STREAM_IN_PROGRESS",
  PERSISTENCE_MISCONFIGURED: "PERSISTENCE_MISCONFIGURED",
  // tool host
  TOOLS_NOT_CONFIGURED: "TOOLS_NOT_CONFIGURED",
  // timeout
  TIMEOUT: "TIMEOUT",
} as const;

export type AcpErrorCode = (typeof ACP_ERROR_CODE)[keyof typeof ACP_ERROR_CODE];

type Code<K extends keyof typeof ACP_ERROR_CODE> = (typeof ACP_ERROR_CODE)[K];

interface AcpCliErrorOptions {
  /** Provider id when known, e.g. "cursor-cli". */
  providerId?: string;
  sessionId?: string;
  /** One sentence telling the user what to do next. */
  hint?: string;
  /** The original error. */
  cause?: unknown;
}

/**
 * Base of every error this package classifies. Branch on `code`; `name` is the concrete class,
 * written as a literal so a minifier cannot change it.
 */
export class AcpCliError extends Error {
  override readonly name: string = "AcpCliError";
  readonly code: AcpErrorCode;
  readonly subsystem: AcpErrorSubsystem;
  readonly providerId?: string;
  readonly sessionId?: string;
  readonly hint?: string;

  constructor(
    subsystem: AcpErrorSubsystem,
    code: AcpErrorCode,
    message: string,
    options: AcpCliErrorOptions = {}
  ) {
    super(message, "cause" in options ? { cause: options.cause } : undefined);
    this.code = code;
    this.subsystem = subsystem;
    this.providerId = options.providerId;
    this.sessionId = options.sessionId;
    this.hint = options.hint;
  }
}

/** Provider config failed validation, or the provider id is not registered. */
export class ConfigError extends AcpCliError {
  override readonly name: string = "ConfigError";
  declare readonly code: Code<"CONFIG_INVALID" | "PROVIDER_UNKNOWN">;
  readonly issues?: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;

  constructor(
    code: ConfigError["code"],
    message: string,
    options: AcpCliErrorOptions & Pick<ConfigError, "issues"> = {}
  ) {
    super(ACP_ERROR_SUBSYSTEM.CONFIG, code, message, options);
    this.issues = options.issues;
  }
}

/** The agent's process could not be started, or exited on its own. */
export class AgentProcessError extends AcpCliError {
  override readonly name: string = "AgentProcessError";
  declare readonly code: Code<
    "CLI_NOT_FOUND" | "CLI_NOT_EXECUTABLE" | "SPAWN_FAILED" | "PROCESS_EXITED"
  >;
  readonly command?: string;
  readonly exitCode?: number | null;
  readonly signal?: string | null;
  /** Captured stderr, redacted and truncated the same way as in `message`. */
  readonly stderr?: string;

  constructor(
    code: AgentProcessError["code"],
    message: string,
    options: AcpCliErrorOptions &
      Pick<AgentProcessError, "command" | "exitCode" | "signal" | "stderr"> = {}
  ) {
    super(ACP_ERROR_SUBSYSTEM.PROCESS, code, message, options);
    this.command = options.command;
    this.exitCode = options.exitCode;
    this.signal = options.signal;
    this.stderr = options.stderr;
  }
}

/** The port has no usable link to the agent. */
export class ConnectionError extends AcpCliError {
  override readonly name: string = "ConnectionError";
  declare readonly code: Code<"NOT_CONNECTED" | "STREAM_UNAVAILABLE" | "LINK_CLOSED">;

  constructor(code: ConnectionError["code"], message: string, options?: AcpCliErrorOptions) {
    super(ACP_ERROR_SUBSYSTEM.CONNECTION, code, message, options);
  }
}

/** The agent answered a request with a JSON-RPC error. `message` is the agent's own. */
export class AgentProtocolError extends AcpCliError {
  override readonly name: string = "AgentProtocolError";
  declare readonly code: Code<
    | "AUTH_REQUIRED"
    | "SESSION_NOT_FOUND"
    | "REQUEST_CANCELLED"
    | "INVALID_PARAMS"
    | "METHOD_NOT_FOUND"
    | "UNSUPPORTED_PROTOCOL_VERSION"
    | "AGENT_INTERNAL_ERROR"
  >;
  readonly rpcCode: number;
  readonly data?: unknown;
  /** Auth methods the agent advertised at initialize; set for AUTH_REQUIRED. */
  readonly authMethods?: ReadonlyArray<{ id: string; name: string; description?: string }>;

  constructor(
    code: AgentProtocolError["code"],
    message: string,
    options: AcpCliErrorOptions & Pick<AgentProtocolError, "rpcCode" | "data" | "authMethods">
  ) {
    super(ACP_ERROR_SUBSYSTEM.PROTOCOL, code, message, options);
    this.rpcCode = options.rpcCode;
    this.data = options.data;
    this.authMethods = options.authMethods;
  }
}

/** The port does not support the requested capability. */
export class UnsupportedCapabilityError extends AcpCliError {
  override readonly name: string = "UnsupportedCapabilityError";
  declare readonly code: Code<"CAPABILITY_UNSUPPORTED">;
  readonly capability: string;

  constructor(
    code: UnsupportedCapabilityError["code"],
    message: string,
    options: AcpCliErrorOptions & Pick<UnsupportedCapabilityError, "capability">
  ) {
    super(ACP_ERROR_SUBSYSTEM.CAPABILITY, code, message, options);
    this.capability = options.capability;
  }
}

/** The call is not valid in the port's current state or configuration. */
export class InvalidStateError extends AcpCliError {
  override readonly name: string = "InvalidStateError";
  declare readonly code: Code<"STREAM_IN_PROGRESS" | "PERSISTENCE_MISCONFIGURED">;

  constructor(code: InvalidStateError["code"], message: string, options?: AcpCliErrorOptions) {
    super(ACP_ERROR_SUBSYSTEM.USAGE, code, message, options);
  }
}

/** The agent asked for a file or terminal tool and no tool host is configured. */
export class ToolHostError extends AcpCliError {
  override readonly name: string = "ToolHostError";
  declare readonly code: Code<"TOOLS_NOT_CONFIGURED">;
  readonly kind: "file" | "terminal";

  constructor(
    code: ToolHostError["code"],
    message: string,
    options: AcpCliErrorOptions & Pick<ToolHostError, "kind">
  ) {
    super(ACP_ERROR_SUBSYSTEM.TOOL_HOST, code, message, options);
    this.kind = options.kind;
  }
}

/** An operation did not finish in time. */
export class TimeoutError extends AcpCliError {
  override readonly name: string = "TimeoutError";
  declare readonly code: Code<"TIMEOUT">;
  readonly operation: string;
  readonly timeoutMs: number;

  constructor(
    code: TimeoutError["code"],
    message: string,
    options: AcpCliErrorOptions & Pick<TimeoutError, "operation" | "timeoutMs">
  ) {
    super(ACP_ERROR_SUBSYSTEM.TIMEOUT, code, message, options);
    this.operation = options.operation;
    this.timeoutMs = options.timeoutMs;
  }
}
