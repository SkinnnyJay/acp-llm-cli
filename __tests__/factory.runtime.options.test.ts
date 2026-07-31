import { describe, expect, it, vi } from "vitest";
import { createMockAgentPort } from "./helpers/mock.agent.port";
import { getDefaultFactory, resetDefaultFactoriesForTests } from "../src/bootstrap";
import { CONNECTION_STATUS } from "../src/domain/connection.status";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import type { AcpSharedRuntimeOptions } from "../src/providers/acp.shared";
import type { IAgentPort } from "../src/runtime/agent.port";
import { baseCliConfigSchema } from "../src/runtime/config";
import { createCliHarnessAdapter } from "../src/runtime/create.cli.harness.adapter";
import { wrapAgentPortWithLifecycle } from "../src/runtime/lifecycle.supervisor";
import { ProviderFactory } from "../src/runtime/provider.factory";
import { HarnessRegistry } from "../src/runtime/registry";
import { createMemorySessionPersistence } from "../src/runtime/session.persistence.memory";

const createMockPort = () => createMockAgentPort({ sessionId: "factory-sess-1" });

describe("ProviderFactory runtime options composition", () => {
  it("threads sessionPersistence through createRuntime and persists on newSession + events", async () => {
    let inner: IAgentPort | undefined;
    const captured: AcpSharedRuntimeOptions[] = [];
    const adapter = createCliHarnessAdapter({
      id: "comp-test",
      name: "Composition Test",
      configSchema: baseCliConfigSchema,
      createRuntime: (_config, runtimeOptions) => {
        captured.push(runtimeOptions ?? {});
        inner = createMockPort();
        return wrapAgentPortWithLifecycle(inner, {
          sessionPersistence: runtimeOptions?.sessionPersistence,
          providerId: runtimeOptions?.providerId ?? "comp-test",
          workspace: runtimeOptions?.workspace,
        });
      },
    });

    const registry = new HarnessRegistry();
    registry.register(adapter);
    const factory = new ProviderFactory({ registry, collectMetrics: false });
    const persistence = createMemorySessionPersistence();

    const port = factory.createRuntime(
      "comp-test",
      { command: "mock-cmd", args: [], env: {} },
      { sessionPersistence: persistence, workspace: "/ws" }
    );

    expect(captured).toHaveLength(1);
    expect(captured[0]?.sessionPersistence).toBe(persistence);
    expect(captured[0]?.providerId).toBe("comp-test");
    expect(captured[0]?.workspace).toBe("/ws");
    expect(port.capabilities?.sessionPersistence).toBe(true);
    expect(port.capabilities?.restart).toBe(true);

    await port.newSession({ cwd: "/ws", mcpServers: [] } as Parameters<
      IAgentPort["newSession"]
    >[0]);
    const afterNew = await persistence.loadSession("comp-test", "/ws");
    expect(afterNew?.sessionId).toBe("factory-sess-1");
    expect(afterNew?.cwd).toBe("/ws");

    if (!inner) throw new Error("inner port missing");
    inner.emit("sessionUpdate", {
      session_id: "event-sess-2",
      update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } },
    } as never);

    await vi.waitFor(async () => {
      const loaded = await persistence.loadSession("comp-test", "/ws");
      expect(loaded?.sessionId).toBe("event-sess-2");
    });
  });

  it("default Claude adapter enables lifecycle even without persistence", () => {
    const factory = getDefaultFactory();
    const port = factory.createRuntime(PROVIDER_IDS.CLAUDE_CLI_ID, {
      command: "claude-agent-acp",
      args: [],
    });
    expect(port.capabilities?.restart).toBe(true);
    expect(port.capabilities?.openClose).toBe(true);
    expect(port.capabilities?.sessionPersistence).toBe(false);
  });
});

describe("getDefaultFactory options honesty", () => {
  it("throws when collectMetrics differs after first init", () => {
    resetDefaultFactoriesForTests();
    getDefaultFactory({ collectMetrics: true });
    expect(() => getDefaultFactory({ collectMetrics: false })).toThrow(
      /already initialized with collectMetrics=true/
    );
    resetDefaultFactoriesForTests();
  });

  it("allows repeated calls with the same collectMetrics", () => {
    resetDefaultFactoriesForTests();
    const a = getDefaultFactory({ collectMetrics: true });
    const b = getDefaultFactory({ collectMetrics: true });
    expect(a).toBe(b);
    resetDefaultFactoriesForTests();
  });
});
