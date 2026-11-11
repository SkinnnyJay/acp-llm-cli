import { EventEmitter } from "node:events";
import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { extractHelp } from "../src/cli/help.extractor";
import { AgentProcessError } from "../src/domain/errors";

/** A child that never exits, so only the path under test can settle the promise. */
function createInertChild() {
  return Object.assign(new EventEmitter(), {
    stdout: new Readable({ read() {} }),
    stderr: new Readable({ read() {} }),
    stdin: new Writable({
      write(_c: unknown, _e: unknown, cb: () => void) {
        cb();
      },
    }),
    kill: vi.fn(),
    pid: 4242,
  });
}

describe("help extraction spawn failure", () => {
  it("rejects with the spawn error when the binary cannot be launched", async () => {
    const child = createInertChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const pending = extractHelp({ command: "does-not-exist", spawnFn });

    // What Node emits when the binary is missing: an "error" event, never "close".
    child.emit("error", Object.assign(new Error("spawn ENOENT"), { code: "ENOENT" }));

    await expect(pending).rejects.toThrow("spawn ENOENT");
    await expect(pending).rejects.toBeInstanceOf(AgentProcessError);
    await expect(pending).rejects.toMatchObject({
      code: "CLI_NOT_FOUND",
      command: "does-not-exist",
      cause: expect.objectContaining({ code: "ENOENT" }),
    });
  });

  it("classifies a non-executable binary as CLI_NOT_EXECUTABLE, keeping the original as cause", async () => {
    const child = createInertChild();
    const spawnFn = vi.fn().mockReturnValue(child);
    const pending = extractHelp({ command: "not-executable", spawnFn });

    child.emit("error", Object.assign(new Error("spawn EACCES"), { code: "EACCES" }));

    await expect(pending).rejects.toBeInstanceOf(AgentProcessError);
    await expect(pending).rejects.toMatchObject({
      code: "CLI_NOT_EXECUTABLE",
      command: "not-executable",
      cause: expect.objectContaining({ code: "EACCES" }),
    });
  });
});
