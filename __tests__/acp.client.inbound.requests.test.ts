import { afterEach, describe, expect, it } from "vitest";
import { createAcpAgentPort } from "../src/runtime/acp.client";
import type { IAgentPort } from "../src/runtime/agent.port";
import type { IPermissionHandler } from "../src/runtime/permission.handler.interface";
import type { IToolHost } from "../src/runtime/tool.host.interface";
import { createFakeAcpAgent, type FakeAcpAgent } from "./helpers/fake.acp.agent";
import { createFakeAcpConnection } from "./helpers/fake.acp.connection";

/**
 * Requests the agent sends to the client, through the real SDK over ndJsonStream. The assertions
 * are on the response message the agent receives, not on what the handler was called with.
 */

const permissionParams = {
  sessionId: "s1",
  toolCall: { toolCallId: "t1" },
  options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
};
const readParams = { sessionId: "s1", path: "/tmp/a.txt" };
const promptParams = { sessionId: "s1", prompt: [{ type: "text" as const, text: "hi" }] };

describe("ACPClient answers requests from the agent through the real SDK", () => {
  let agent: FakeAcpAgent | undefined;
  let port: IAgentPort | undefined;

  const start = async (options: Parameters<typeof createAcpAgentPort>[1] = {}) => {
    agent = createFakeAcpAgent();
    port = createAcpAgentPort(createFakeAcpConnection(agent.stream), options);
    await port.connect();
    await port.initialize();
    return { agent, port };
  };

  afterEach(async () => {
    await port?.disconnect().catch(() => undefined);
    port = undefined;
    await agent?.close();
    agent = undefined;
  });

  it("session/request_permission with no handler answers cancelled and emits the event", async () => {
    const { agent: a, port: p } = await start();
    const seen: unknown[] = [];
    p.on("permissionRequest", (params) => seen.push(params));

    const response = await a.request("session/request_permission", permissionParams);

    expect(response.result).toEqual({ outcome: { outcome: "cancelled" } });
    expect(response.error).toBeUndefined();
    expect(seen).toHaveLength(1);
  });

  it("session/request_permission with a handler puts the handler's result on the wire", async () => {
    const permissionHandler: IPermissionHandler = async () => ({
      outcome: { outcome: "selected", optionId: "allow" },
    });
    const { agent: a } = await start({ permissionHandler });

    const response = await a.request("session/request_permission", permissionParams);

    expect(response.result).toEqual({ outcome: { outcome: "selected", optionId: "allow" } });
  });

  it("fs/read_text_file with no tool host answers with an error and the link stays usable", async () => {
    const { agent: a, port: p } = await start();

    const response = await a.request("fs/read_text_file", readParams);

    expect(response.result).toBeUndefined();
    expect(response.error).toBeDefined();
    // -32601 would mean the method was never registered rather than the handler failing.
    expect((response.error as { code: number }).code).not.toBe(-32601);
    await expect(p.prompt(promptParams)).resolves.toEqual({ stopReason: "end_turn" });
  });

  it("fs/read_text_file with a tool host puts the host's result on the wire", async () => {
    const toolHost = {
      readTextFile: async () => ({ content: "hello" }),
    } as unknown as IToolHost;
    const { agent: a } = await start({ toolHost });

    const response = await a.request("fs/read_text_file", readParams);

    expect(response.result).toEqual({ content: "hello" });
  });

  it("a throwing permission handler answers with an error and the link stays usable", async () => {
    const permissionHandler: IPermissionHandler = async () => {
      throw new Error("handler blew up");
    };
    const { agent: a, port: p } = await start({ permissionHandler });

    const response = await a.request("session/request_permission", permissionParams);

    expect(response.result).toBeUndefined();
    expect(response.error).toBeDefined();
    // -32601 would mean the method was never registered rather than the handler failing.
    expect((response.error as { code: number }).code).not.toBe(-32601);
    await expect(p.prompt(promptParams)).resolves.toEqual({ stopReason: "end_turn" });
  });
});
