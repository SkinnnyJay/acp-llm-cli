import { beforeEach, describe, expect, it, vi } from "vitest";

const created: { command: string; args: string[] }[] = [];

vi.mock("../src/runtime/stdio.connection.factory", () => ({
  StdioConnectionFactory: class {
    create(options: { command: string; args: string[] }) {
      created.push({ command: options.command, args: options.args });
      return { on: vi.fn(), off: vi.fn(), send: vi.fn(), close: vi.fn() };
    }
  },
}));

const { cursorAdapter } = await import("../src/providers/cursor/adapter");
const { claudeAdapter } = await import("../src/providers/claude/adapter");

const spawnedArgs = (): string[] | undefined => created[created.length - 1]?.args;

describe("generic options reach the spawned process", () => {
  beforeEach(() => {
    created.length = 0;
  });

  it("appends every mapped option to Cursor's default args, in buildGenericArgs order", () => {
    cursorAdapter.createHarness({
      command: "cursor-agent",
      args: [],
      env: {},
      model: "gpt-5.5",
      trust: true,
      sandbox: "enabled",
      workspace: "/w",
    });
    expect(spawnedArgs()).toEqual([
      "acp",
      "--model",
      "gpt-5.5",
      "--trust",
      "--sandbox",
      "enabled",
      "--workspace",
      "/w",
    ]);
  });

  it("lets an explicit `--model x` win over the model option", () => {
    cursorAdapter.createHarness({
      command: "cursor-agent",
      args: ["acp", "--model", "x"],
      env: {},
      model: "y",
    });
    expect(spawnedArgs()).toEqual(["acp", "--model", "x"]);
  });

  it("lets an explicit `--model=x` win over the model option", () => {
    cursorAdapter.createHarness({
      command: "cursor-agent",
      args: ["acp", "--model=x"],
      env: {},
      model: "y",
    });
    expect(spawnedArgs()).toEqual(["acp", "--model=x"]);
  });

  it("emits nothing for trust false or an empty model", () => {
    cursorAdapter.createHarness({
      command: "cursor-agent",
      args: ["acp"],
      env: {},
      trust: false,
      model: "",
    });
    expect(spawnedArgs()).toEqual(["acp"]);
  });

  it("never applies outputFormat or debug", () => {
    cursorAdapter.createHarness({
      command: "cursor-agent",
      args: ["acp"],
      env: {},
      outputFormat: "json",
      debug: true,
    });
    expect(spawnedArgs()).toEqual(["acp"]);
  });

  it("leaves Claude's args alone because Claude maps no generic option", () => {
    claudeAdapter.createHarness({
      command: "claude-agent-acp",
      args: [],
      env: {},
      model: "claude-opus-5",
      trust: true,
    });
    expect(spawnedArgs()).toEqual([]);
  });
});
