import { describe, expect, it } from "vitest";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { CursorAgentPort } from "../src/providers/cursor/cursor.agent.port";
import { createCursorConfig } from "./helpers/cursor.config";

describe("CursorAgentPort", () => {
  it("exposes capabilities with streamPrompt/restart/openClose/sessionPersistence false", () => {
    const port = new CursorAgentPort(createCursorConfig());
    expect(port.capabilities).toBeDefined();
    expect(port.capabilities?.streamPrompt).toBe(false);
    expect(port.capabilities?.restart).toBe(false);
    expect(port.capabilities?.openClose).toBe(false);
    expect(port.capabilities?.sessionPersistence).toBe(false);
  });

  it("setSessionMode accepts modeId and setSessionConfigOption selects a model", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    const modeRes = await port.setSessionMode?.({ sessionId: "s1", modeId: "read-only" });
    expect(modeRes).toEqual({});

    const modelRes = await port.setSessionConfigOption?.({
      sessionId: "s1",
      configId: "model",
      value: "claude-3-5-sonnet",
    });
    expect(modelRes).toEqual({
      configOptions: [
        {
          id: "model",
          name: "Model",
          category: "model",
          type: "select",
          currentValue: "claude-3-5-sonnet",
          options: [{ value: "claude-3-5-sonnet", name: "claude-3-5-sonnet" }],
        },
      ],
    });
  });

  it("setSessionConfigOption ignores config ids it does not own", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    await port.setSessionConfigOption?.({
      sessionId: "s1",
      configId: "model",
      value: "gpt-5",
    });
    const res = await port.setSessionConfigOption?.({
      sessionId: "s1",
      configId: "reasoning_level",
      value: "high",
    });
    // the model selection survives an unrelated option
    expect(res?.configOptions[0]?.currentValue).toBe("gpt-5");
  });

  it("setSessionConfigOption keeps model selections isolated per session", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    await port.setSessionConfigOption?.({ sessionId: "s1", configId: "model", value: "gpt-5" });
    const other = await port.setSessionConfigOption?.({
      sessionId: "s2",
      configId: "model",
      value: "opus-5",
    });
    expect(other?.configOptions[0]?.currentValue).toBe("opus-5");
  });

  it("setSessionMode with unknown modeId clears session mode", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    await port.setSessionMode?.({ sessionId: "s1", modeId: "agent" });
    await port.setSessionMode?.({ sessionId: "s1", modeId: "invalid-mode" });
    expect(await port.setSessionMode?.({ sessionId: "s1", modeId: "invalid" })).toEqual({});
  });

  it("initialize returns valid InitializeResponse shape", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    const res = await port.initialize();
    expect(res).toHaveProperty("protocolVersion");
    expect(typeof res.protocolVersion).toBe("number");
  });

  it("connectionStatus starts DISCONNECTED", () => {
    const port = new CursorAgentPort(createCursorConfig());
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
  });

  it("disconnect sets status to DISCONNECTED and emits state", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    const states: string[] = [];
    port.on("state", (s) => states.push(s));
    await port.disconnect();
    expect(port.connectionStatus).toBe(CONNECTION_STATUS.DISCONNECTED);
    expect(states).toContain(CONNECTION_STATUS.DISCONNECTED);
  });

  it("authenticate returns empty object", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    expect(await port.authenticate({ methodId: "none" })).toEqual({});
  });

  it("sessionUpdate is no-op", async () => {
    const port = new CursorAgentPort(createCursorConfig());
    await expect(
      port.sessionUpdate({
        sessionId: "s1",
        update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
      })
    ).resolves.toBeUndefined();
  });
});
