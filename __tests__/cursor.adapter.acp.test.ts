import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../src/domain/default.commands";
import { PORT_CAPABILITY } from "../src/domain/port.capabilities";
import { claudeAdapter } from "../src/providers/claude/adapter";
import { cursorAdapter } from "../src/providers/cursor/adapter";
import type { CursorConfig } from "../src/providers/cursor/schema";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";

describe("cursor adapter over ACP", () => {
  it("defaults to `cursor-agent acp`", () => {
    expect(DEFAULT_COMMANDS.CURSOR_DEFAULT_COMMAND).toBe("cursor-agent");
    expect([...DEFAULT_COMMANDS.CURSOR_DEFAULT_ARGS]).toEqual(["acp"]);
  });

  it("builds the same kind of port as the other ACP providers", () => {
    const cursor = cursorAdapter.createHarness({ command: "cursor-agent", args: ["acp"], env: {} });
    const claude = claudeAdapter.createHarness({ command: "claude-agent-acp", args: [], env: {} });
    expect(cursor.constructor).toBe(claude.constructor);
    expect(cursor.capabilities?.[PORT_CAPABILITY.RESTART]).toBe(true);
    expect(cursor.capabilities?.[PORT_CAPABILITY.STREAM_PROMPT]).toBe(true);
    expect(typeof cursor.streamPrompt).toBe("function");
  });

  it("honours session persistence instead of ignoring it", () => {
    const port = cursorAdapter.createHarness(
      { command: "cursor-agent", args: ["acp"], env: {} },
      { sessionPersistence: createMemorySessionPersistence() }
    );
    expect(port.capabilities?.[PORT_CAPABILITY.SESSION_PERSISTENCE]).toBe(true);
  });

  it("no longer types the removed print-mode fields", () => {
    const config: CursorConfig = {
      command: "cursor-agent",
      args: ["acp"],
      env: {},
      // @ts-expect-error `mode` and `workspacePath` were print-port fields, not CursorConfig
      mode: "plan",
      workspacePath: "/x",
    };
    expect(config.command).toBe("cursor-agent");
  });
});
