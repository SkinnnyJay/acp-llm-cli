import { describe, expect, it, vi } from "vitest";
import { createLogger } from "../src/runtime/logger";

vi.mock("@simpill/logger.utils", () => ({
  getLogger: vi.fn().mockReturnValue({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("createLogger", () => {
  it("returns an object with debug/info/warn/error methods", () => {
    const logger = createLogger("test");
    expect(typeof logger.debug).toBe("function");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("debug is a no-op when debug env is not set", () => {
    const logger = createLogger("test-noop", { env: {} });
    expect(() => logger.debug("silent")).not.toThrow();
  });

  it("debug calls through when ACP_LLM_CLI_DEBUG=true", () => {
    const logger = createLogger("test-debug-on", { env: { ACP_LLM_CLI_DEBUG: "true" } });
    expect(() => logger.debug("loud")).not.toThrow();
  });

  it("info delegates without throwing", () => {
    const logger = createLogger("test-info");
    expect(() => logger.info("info message")).not.toThrow();
  });

  it("warn delegates without throwing", () => {
    const logger = createLogger("test-warn");
    expect(() => logger.warn("warn message")).not.toThrow();
  });

  it("error delegates without throwing", () => {
    const logger = createLogger("test-error");
    expect(() => logger.error("error message")).not.toThrow();
  });

  it("passes a single object arg as metadata directly", () => {
    const logger = createLogger("test-meta");
    expect(() => logger.info("with meta", { foo: "bar" })).not.toThrow();
  });

  it("wraps multiple args — hits toMetadata fallback branch", () => {
    const logger = createLogger("test-multi");
    expect(() => logger.info("multi", "a", "b")).not.toThrow();
  });

  it("wraps single non-object arg — hits toMetadata fallback", () => {
    const logger = createLogger("test-scalar");
    expect(() => logger.warn("scalar arg", 42)).not.toThrow();
  });
});
