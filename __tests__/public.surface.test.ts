import { describe, expect, it } from "vitest";
import type { RestartOutcome, RestartSessionOutcome } from "../src/index";
import * as root from "../src/index";
import * as runtime from "../src/runtime/index";

// Runtime export names of each entry point, sorted. Adding or removing a public value must
// change these lists, so it shows up in review.
const ROOT_EXPORTS = [
  "ACP_ERROR_CODE",
  "ACP_ERROR_SUBSYSTEM",
  "ANTHROPIC_MODEL_IDS",
  "AcpCliError",
  "AgentProcessError",
  "AgentProtocolError",
  "AnthropicModelIdSchema",
  "ConfigError",
  "ConnectionError",
  "DEFAULT_COMMANDS",
  "ENVELOPE_MODE",
  "ENV_KEY",
  "GEMINI_MODEL_IDS",
  "GENERIC_OPTION_KEY",
  "GeminiModelIdSchema",
  "HELP_FLAG",
  "HarnessRegistry",
  "InvalidStateError",
  "OPENAI_FINISH_REASON",
  "OPENAI_MODEL_IDS",
  "OpenAIModelIdSchema",
  "PORT_CAPABILITY",
  "PROVIDER_IDS",
  "PROVIDER_SETUP",
  "PROVIDER_VALUES",
  "Provider",
  "ProviderClient",
  "ProviderClientFactory",
  "ProviderFactory",
  "ProviderMetricsCollector",
  "ProviderSchema",
  "TimeoutError",
  "ToolHostError",
  "UnsupportedCapabilityError",
  "VALIDATION_ERROR",
  "XAIModelIdSchema",
  "XAI_MODEL_IDS",
  "baseCliConfigSchema",
  "buildGenericArgs",
  "createAcpAgentPort",
  "createAcpCliHarnessRuntime",
  "createHarness",
  "createMemorySessionPersistence",
  "createStandardAcpRuntime",
  "extractHelp",
  "genericLlmCliOptionsSchema",
  "getAdapter",
  "getDefaultFactory",
  "getDefaultProviderClientFactory",
  "getDefaultRegistry",
  "isNativeEnvelope",
  "isOpenAIEnvelope",
];

const RUNTIME_EXPORTS = [
  "HarnessRegistry",
  "LifecycleAgentPort",
  "OPENAI_FINISH_REASON",
  "ProviderClient",
  "ProviderClientFactory",
  "ProviderFactory",
  "ProviderMetricsCollector",
  "StdioConnection",
  "StdioConnectionFactory",
  "StreamAgentPort",
  "baseCliConfigSchema",
  "createAcpAgentPort",
  "createAcpCliHarnessRuntime",
  "createCliHarnessAdapter",
  "createMemorySessionPersistence",
  "createOpenAIFinishEnvelope",
  "createStandardAcpRuntime",
  "resolveBaseConfig",
  "sessionUpdateToEnvelopes",
  "wrapAgentPortWithLifecycle",
  "wrapAgentPortWithStream",
];

/**
 * The two entry points deliberately share a vocabulary. Nothing used to check that they agree,
 * and the one place they disagreed was a defect: HarnessRegistry was a value on ./runtime but
 * type-only on ".", so the custom-registry workflow both docs advertise was impossible from the
 * root entry point.
 */
describe("public surface", () => {
  it("exposes HarnessRegistry as a constructible value from the root entry point", () => {
    expect(typeof root.HarnessRegistry).toBe("function");
    const registry = new root.HarnessRegistry();
    expect(registry.list()).toEqual([]);
  });

  it("gives shared symbols one identity across both entry points", () => {
    const shared = Object.keys(root).filter((name) => name in runtime);
    expect(shared.length).toBeGreaterThan(0);

    for (const name of shared) {
      expect(
        (root as Record<string, unknown>)[name],
        `${name} differs between "." and "./runtime"`
      ).toBe((runtime as Record<string, unknown>)[name]);
    }
  });

  it("keeps the documented shared core a constructible value on both entry points", () => {
    // The previous version of this case built `shared` by filtering on `name in runtime` and
    // then asserted those same names were in runtime - true by construction, so it could never
    // fail. The two barrels are overlapping sets, not nested, so "root is a subset of runtime" is not the invariant either.
    // What actually matters is the defect the docblock above names: a symbol vanishing from one
    // barrel, or becoming type-only there. Pin the shared core explicitly so either fails.
    const SHARED_CORE = [
      "HarnessRegistry",
      "ProviderClient",
      "ProviderClientFactory",
      "ProviderFactory",
      "ProviderMetricsCollector",
      "baseCliConfigSchema",
      "createAcpAgentPort",
      "createAcpCliHarnessRuntime",
      "createMemorySessionPersistence",
      "createStandardAcpRuntime",
    ] as const;

    for (const name of SHARED_CORE) {
      expect((root as Record<string, unknown>)[name], `${name} missing from "."`).toBeDefined();
      expect(
        (runtime as Record<string, unknown>)[name],
        `${name} missing from "./runtime"`
      ).toBeDefined();
    }
  });

  it("exports the restart outcome types from the root entry point", () => {
    // Types only, so this is enforced by `npm run typecheck` rather than at run time.
    const session: RestartSessionOutcome = "resumed";
    const outcome: RestartOutcome = { session, sessionId: "s1" };
    expect(outcome).toEqual({ session: "resumed", sessionId: "s1" });
  });

  it("exports exactly the documented runtime names from each entry point", () => {
    expect(Object.keys(root).sort()).toEqual(ROOT_EXPORTS);
    expect(Object.keys(runtime).sort()).toEqual(RUNTIME_EXPORTS);
  });
});
