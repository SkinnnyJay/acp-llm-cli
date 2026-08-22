import { beforeEach, describe, expect, it, vi } from "vitest";
import { PROVIDER_IDS } from "../src/domain/provider.ids";

const warn = vi.fn();
vi.mock("../src/runtime/logger", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/runtime/logger")>();
  return {
    ...actual,
    createLogger: (name: string) => ({
      ...actual.createLogger(name),
      warn,
    }),
  };
});

const { cursorAdapter } = await import("../src/providers/cursor/adapter");

const baseConfig = { command: "cursor-agent", args: [], env: {} };

describe("cursor adapter runtime options", () => {
  beforeEach(() => warn.mockReset());

  it("reports the runtime options it cannot honour instead of dropping them silently", () => {
    // The adapter took `_runtimeOptions` and discarded every field. Cursor is not an ACP
    // provider, so persistence/restart/envelope options genuinely do not apply - but a caller
    // passing them got a port with none of it applied and no diagnostic of any kind.
    cursorAdapter.createHarness(baseConfig, {
      providerId: PROVIDER_IDS.CURSOR_CLI_ID,
      sessionPersistence: { saveSession: vi.fn(), loadSession: vi.fn(), clearSession: vi.fn() },
      envelopeMode: "openai",
      modelId: "some-model",
    } as never);

    expect(warn).toHaveBeenCalledTimes(1);
    const [message, meta] = warn.mock.calls[0] as [string, { ignored: string[] }];
    expect(message).toMatch(/cursor/i);
    expect(meta.ignored).toEqual(
      expect.arrayContaining(["sessionPersistence", "envelopeMode", "modelId"])
    );
  });

  it("stays quiet when only providerId is supplied, which every factory injects", () => {
    // ProviderFactory and bootstrap both always set providerId, so warning on it would fire on
    // every single cursor construction and train callers to ignore the warning.
    cursorAdapter.createHarness(baseConfig, { providerId: PROVIDER_IDS.CURSOR_CLI_ID } as never);
    expect(warn).not.toHaveBeenCalled();
  });

  it("stays quiet when no runtime options are supplied at all", () => {
    cursorAdapter.createHarness(baseConfig);
    expect(warn).not.toHaveBeenCalled();
  });
});
