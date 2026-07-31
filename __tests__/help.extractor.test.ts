import { describe, expect, it, vi } from "vitest";
import { extractHelp, HELP_FLAG } from "../src/cli/help.extractor";
import { ERROR_MESSAGE } from "../src/domain/error.messages";
import { SIGNAL } from "../src/domain/signals";
import { TIMEOUT } from "../src/domain/timeouts";
import { createFakeChild } from "./helpers/fake.child.process";

describe("extractHelp", () => {
  it("returns stdout on success and appends --help", async () => {
    const { child } = createFakeChild({ stdout: "Usage: tool\n", exitCode: 0 });
    const spawnFn = vi.fn().mockImplementation((_c: string, args: string[]) => {
      expect(args).toContain(HELP_FLAG);
      return child;
    });

    const out = await extractHelp({
      command: "fake-cli",
      args: ["sub"],
      spawnFn: spawnFn as never,
    });
    expect(out).toBe("Usage: tool\n");
    expect(spawnFn).toHaveBeenCalledWith(
      "fake-cli",
      ["sub", HELP_FLAG],
      expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
    );
  });

  it("rejects on nonzero exit", async () => {
    const { child } = createFakeChild({ stderr: "boom", exitCode: 2 });
    const spawnFn = vi.fn().mockReturnValue(child);

    await expect(
      extractHelp({ command: "fake-cli", spawnFn: spawnFn as never })
    ).rejects.toThrow(ERROR_MESSAGE.HELP_COMMAND_FAILED(2, "boom"));
  });

  it("SIGTERM then SIGKILL on timeout", async () => {
    vi.useFakeTimers();
    const { child } = createFakeChild({ hang: true });
    const spawnFn = vi.fn().mockReturnValue(child);

    const promise = extractHelp({
      command: "fake-cli",
      timeoutMs: 100,
      spawnFn: spawnFn as never,
    });
    const assertion = expect(promise).rejects.toThrow(
      ERROR_MESSAGE.HELP_EXTRACTION_TIMEOUT(100)
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith(SIGNAL.TERM);

    await vi.advanceTimersByTimeAsync(TIMEOUT.DISCONNECT_FORCE_MS);
    expect(child.kill).toHaveBeenCalledWith(SIGNAL.KILL);

    await assertion;
    vi.useRealTimers();
  });
});
