import { describe, expect, it } from "vitest";
import {
  ACP_ERROR_CODE,
  ACP_ERROR_SUBSYSTEM,
  AcpCliError,
  type AcpErrorCode,
  AgentProcessError,
  AgentProtocolError,
  ConfigError,
  ConnectionError,
  InvalidStateError,
  TimeoutError,
  ToolHostError,
  UnsupportedCapabilityError,
} from "../src/domain/errors";
import { PROVIDER_VALUES } from "../src/domain/provider";
import { PROVIDER_SETUP } from "../src/domain/provider.setup";

/** Which class owns each code, read from the class types themselves. */
type ClassCodes = {
  config: ConfigError["code"];
  process: AgentProcessError["code"];
  connection: ConnectionError["code"];
  protocol: AgentProtocolError["code"];
  capability: UnsupportedCapabilityError["code"];
  usage: InvalidStateError["code"];
  "tool-host": ToolHostError["code"];
  timeout: TimeoutError["code"];
};
type Owners<C> = { [S in keyof ClassCodes]: C extends ClassCodes[S] ? S : never }[keyof ClassCodes];
type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never;
type AnyShared = { [C in AcpErrorCode]: IsUnion<Owners<C>> }[AcpErrorCode];
// Fails to compile if any code is accepted by two subsystem classes.
const noCodeIsShared: true extends AnyShared ? never : true = true;

// Fails to compile if a code has no owning class (its type would be `never`) or the wrong one.
const OWNER: { [C in AcpErrorCode]: Owners<C> } = {
  CONFIG_INVALID: "config",
  PROVIDER_UNKNOWN: "config",
  CLI_NOT_FOUND: "process",
  CLI_NOT_EXECUTABLE: "process",
  SPAWN_FAILED: "process",
  PROCESS_EXITED: "process",
  NOT_CONNECTED: "connection",
  STREAM_UNAVAILABLE: "connection",
  LINK_CLOSED: "connection",
  AUTH_REQUIRED: "protocol",
  SESSION_NOT_FOUND: "protocol",
  REQUEST_CANCELLED: "protocol",
  INVALID_PARAMS: "protocol",
  METHOD_NOT_FOUND: "protocol",
  UNSUPPORTED_PROTOCOL_VERSION: "protocol",
  AGENT_INTERNAL_ERROR: "protocol",
  CAPABILITY_UNSUPPORTED: "capability",
  STREAM_IN_PROGRESS: "usage",
  PERSISTENCE_MISCONFIGURED: "usage",
  TOOLS_NOT_CONFIGURED: "tool-host",
  TIMEOUT: "timeout",
};

/** Builds an instance of the class that owns `code`, with that code. */
function construct(code: AcpErrorCode): AcpCliError {
  const message = `m-${code}`;
  switch (OWNER[code]) {
    case "config":
      return new ConfigError(code as ConfigError["code"], message);
    case "process":
      return new AgentProcessError(code as AgentProcessError["code"], message);
    case "connection":
      return new ConnectionError(code as ConnectionError["code"], message);
    case "protocol":
      return new AgentProtocolError(code as AgentProtocolError["code"], message, { rpcCode: 1 });
    case "capability":
      return new UnsupportedCapabilityError(code as "CAPABILITY_UNSUPPORTED", message, {
        capability: "x",
      });
    case "usage":
      return new InvalidStateError(code as InvalidStateError["code"], message);
    case "tool-host":
      return new ToolHostError(code as "TOOLS_NOT_CONFIGURED", message, { kind: "file" });
    case "timeout":
      return new TimeoutError(code as "TIMEOUT", message, { operation: "op", timeoutMs: 1 });
  }
}

describe("typed errors", () => {
  it("every code belongs to exactly one subsystem class", () => {
    expect(noCodeIsShared).toBe(true);
    expect(Object.keys(OWNER).sort()).toEqual(Object.values(ACP_ERROR_CODE).sort());
    for (const code of Object.values(ACP_ERROR_CODE)) {
      const error = construct(code);
      expect(error.code).toBe(code);
      expect(error.subsystem).toBe(OWNER[code]);
    }
    expect(new Set(Object.values(OWNER))).toEqual(new Set(Object.values(ACP_ERROR_SUBSYSTEM)));
  });

  it("ConfigError carries issues", () => {
    const cause = new Error("zod");
    const issues = [{ path: ["command"], message: "Expected string" }];
    const error = new ConfigError(ACP_ERROR_CODE.CONFIG_INVALID, "bad config", {
      issues,
      providerId: "codex-cli",
      cause,
    });
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AcpCliError);
    expect(error.name).toBe("ConfigError");
    expect(error.subsystem).toBe(ACP_ERROR_SUBSYSTEM.CONFIG);
    expect(error.message).toBe("bad config");
    expect(error.issues).toEqual(issues);
    expect(error.providerId).toBe("codex-cli");
    expect(error.cause).toBe(cause);
  });

  it("AgentProcessError carries the command, exit details and hint", () => {
    const cause = Object.assign(new Error("spawn x ENOENT"), { code: "ENOENT" });
    const error = new AgentProcessError(ACP_ERROR_CODE.CLI_NOT_FOUND, "missing", {
      command: "cursor-agent",
      exitCode: null,
      signal: "SIGTERM",
      stderr: "boom",
      providerId: "cursor-cli",
      hint: "Install it with: x",
      cause,
    });
    expect(error).toBeInstanceOf(AcpCliError);
    expect(error.name).toBe("AgentProcessError");
    expect(error.subsystem).toBe("process");
    expect(error.command).toBe("cursor-agent");
    expect(error.exitCode).toBeNull();
    expect(error.signal).toBe("SIGTERM");
    expect(error.stderr).toBe("boom");
    expect(error.hint).toBe("Install it with: x");
    expect(error.cause).toBe(cause);
  });

  it("ConnectionError and InvalidStateError add no fields", () => {
    const connection = new ConnectionError(ACP_ERROR_CODE.LINK_CLOSED, "closed");
    expect(connection.name).toBe("ConnectionError");
    expect(connection.subsystem).toBe("connection");
    expect(connection.cause).toBeUndefined();
    const state = new InvalidStateError(ACP_ERROR_CODE.STREAM_IN_PROGRESS, "busy", {
      sessionId: "s1",
    });
    expect(state.name).toBe("InvalidStateError");
    expect(state.subsystem).toBe("usage");
    expect(state.sessionId).toBe("s1");
  });

  it("AgentProtocolError carries the JSON-RPC code, data and auth methods", () => {
    const cause = new Error("rpc");
    const authMethods = [{ id: "a", name: "A", description: "d" }];
    const error = new AgentProtocolError(ACP_ERROR_CODE.AUTH_REQUIRED, "login", {
      rpcCode: -32000,
      data: { x: 1 },
      authMethods,
      sessionId: "s1",
      cause,
    });
    expect(error.name).toBe("AgentProtocolError");
    expect(error.subsystem).toBe("protocol");
    expect(error.rpcCode).toBe(-32000);
    expect(error.data).toEqual({ x: 1 });
    expect(error.authMethods).toEqual(authMethods);
    expect(error.sessionId).toBe("s1");
    expect(error.cause).toBe(cause);
  });

  it("UnsupportedCapabilityError, ToolHostError and TimeoutError carry their fields", () => {
    const capability = new UnsupportedCapabilityError(
      ACP_ERROR_CODE.CAPABILITY_UNSUPPORTED,
      "nope",
      { capability: "streamPrompt" }
    );
    expect(capability.name).toBe("UnsupportedCapabilityError");
    expect(capability.capability).toBe("streamPrompt");
    const tool = new ToolHostError(ACP_ERROR_CODE.TOOLS_NOT_CONFIGURED, "no tools", {
      kind: "terminal",
    });
    expect(tool.name).toBe("ToolHostError");
    expect(tool.kind).toBe("terminal");
    const timeout = new TimeoutError(ACP_ERROR_CODE.TIMEOUT, "slow", {
      operation: "help-extraction",
      timeoutMs: 5,
    });
    expect(timeout.name).toBe("TimeoutError");
    expect(timeout.subsystem).toBe("timeout");
    expect(timeout.operation).toBe("help-extraction");
    expect(timeout.timeoutMs).toBe(5);
  });
});

describe("PROVIDER_SETUP", () => {
  it("has an entry for each supported provider and nothing else", () => {
    expect(Object.keys(PROVIDER_SETUP).sort()).toEqual([...PROVIDER_VALUES].sort());
  });

  it("holds the install and login commands for each provider", () => {
    expect(PROVIDER_SETUP).toEqual({
      "claude-cli": {
        install: "npm install -g @agentclientprotocol/claude-agent-acp",
        login: "claude /login",
      },
      "codex-cli": {
        install: "npm install -g @agentclientprotocol/codex-acp",
        login: "codex login",
      },
      "cursor-cli": {
        install: "curl https://cursor.com/install -fsS | bash",
        login: "cursor-agent login",
      },
      "antigravity-cli": {
        install: "curl -fsSL https://antigravity.google/cli/install.sh | bash",
        login: "agy acp --login",
      },
    });
  });
});
