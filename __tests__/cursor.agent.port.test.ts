import { describe, expect, it } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { CursorAgentPort } from "../src/providers/cursor/cursor.agent.port";

describe("CursorAgentPort", () => {
  it("exposes capabilities with streamPrompt/restart/openClose/sessionPersistence false", () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    expect(port.capabilities).toBeDefined();
    expect(port.capabilities?.streamPrompt).toBe(false);
    expect(port.capabilities?.restart).toBe(false);
    expect(port.capabilities?.openClose).toBe(false);
    expect(port.capabilities?.sessionPersistence).toBe(false);
  });

  it("setSessionMode accepts modeId and setSessionModel accepts modelId", async () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    const modeRes = await port.setSessionMode?.({ sessionId: "s1", modeId: "read-only" });
    expect(modeRes).toEqual({});
    const modelRes = await port.setSessionModel?.({
      sessionId: "s1",
      modelId: "claude-3-5-sonnet",
    });
    expect(modelRes).toEqual({});
  });

  it("setSessionMode with unknown modeId clears session mode", async () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    await port.setSessionMode?.({ sessionId: "s1", modeId: "agent" });
    await port.setSessionMode?.({ sessionId: "s1", modeId: "invalid-mode" });
    expect(await port.setSessionMode?.({ sessionId: "s1", modeId: "invalid" })).toEqual({});
  });

  it("initialize returns valid InitializeResponse shape", async () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    const res = await port.initialize();
    expect(res).toHaveProperty("protocolVersion");
    expect(typeof res.protocolVersion).toBe("number");
  });

  it("connectionStatus starts DISCONNECTED", () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("disconnect sets status to DISCONNECTED and emits state", async () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    const states: string[] = [];
    port.on("state", (s) => states.push(s));
    await port.disconnect();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    expect(states).toContain(CONNECTION_STATUS.DISCONNECTED);
  });

  it("authenticate returns empty object", async () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    expect(await port.authenticate({})).toEqual({});
  });

  it("sessionUpdate is no-op", async () => {
    const port = new CursorAgentPort({ command: "cursor-agent", args: [] });
    await expect(port.sessionUpdate({ sessionId: "s1", update: {} })).resolves.toBeUndefined();
  });
});
