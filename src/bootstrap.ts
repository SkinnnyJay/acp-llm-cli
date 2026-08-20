import { VALIDATION_ERROR } from "./domain/validation.errors";
import type { AcpSharedRuntimeOptions } from "./providers/acp.shared";
import { claudeAdapter } from "./providers/claude/adapter";
import { codexAdapter } from "./providers/codex/adapter";
import { cursorAdapter } from "./providers/cursor/adapter";
import { geminiAdapter } from "./providers/gemini/adapter";
import type { IAgentPort } from "./runtime/agent.port";
import type { IProviderClientFactory, IProviderFactory } from "./runtime/interfaces/provider.types";
import { ProviderClientFactory } from "./runtime/provider.client.factory";
import { ProviderFactory } from "./runtime/provider.factory";
import type { HarnessRegistry } from "./runtime/registry";
import { HarnessRegistry as RegistryClass } from "./runtime/registry";

let defaultRegistry: HarnessRegistry | null = null;
let defaultFactory: IProviderFactory | null = null;
let defaultFactoryCollectMetrics: boolean | null = null;
let defaultClientFactory: IProviderClientFactory | null = null;

/**
 * Creates HarnessRegistry, registers Claude, Codex, Gemini, Cursor adapters. Ids from PROVIDER_IDS.
 */
export function getDefaultRegistry(): HarnessRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new RegistryClass();
    defaultRegistry.register(claudeAdapter);
    defaultRegistry.register(codexAdapter);
    defaultRegistry.register(geminiAdapter);
    defaultRegistry.register(cursorAdapter);
  }
  return defaultRegistry;
}

/**
 * Creates a ProviderFactory with default registry, metrics, and logging.
 * Use createRuntime(id, config, options?) for Zod-validated config and clear errors.
 * Throws if called again with a different collectMetrics value after first init.
 */
export function getDefaultFactory(options?: { collectMetrics?: boolean }): IProviderFactory {
  const collectMetrics = options?.collectMetrics ?? true;
  if (!defaultFactory) {
    defaultFactoryCollectMetrics = collectMetrics;
    defaultFactory = new ProviderFactory({
      registry: getDefaultRegistry(),
      collectMetrics,
    });
    return defaultFactory;
  }
  if (defaultFactoryCollectMetrics !== collectMetrics) {
    throw new Error(
      `getDefaultFactory already initialized with collectMetrics=${String(defaultFactoryCollectMetrics)}; ` +
        `cannot reinitialize with collectMetrics=${String(collectMetrics)}`
    );
  }
  return defaultFactory;
}

/**
 * Creates a ProviderClientFactory: getClient(Provider.CLAUDE, config, options?) returns IProviderClient.
 * Uses default ProviderFactory under the hood. Extensible: add to Provider enum and register adapter.
 */
export function getDefaultProviderClientFactory(): IProviderClientFactory {
  if (!defaultClientFactory) {
    defaultClientFactory = new ProviderClientFactory(getDefaultFactory());
  }
  return defaultClientFactory;
}

/**
 * Get adapter by id (use PROVIDER_IDS constants), parse config with adapter's schema, return IAgentPort.
 * For validated config and better errors, use getDefaultFactory().createRuntime(id, config, options?).
 */
export function createHarness(
  registry: HarnessRegistry,
  id: string,
  config: unknown,
  runtimeOptions?: AcpSharedRuntimeOptions
): IAgentPort {
  const adapter = registry.get(id);
  if (!adapter) {
    throw new Error(VALIDATION_ERROR.UNKNOWN_PROVIDER_ID(id));
  }
  const parsed = adapter.configSchema.parse(config);
  return adapter.createHarness(parsed, runtimeOptions);
}

export function getAdapter(
  registry: HarnessRegistry,
  id: string
): ReturnType<HarnessRegistry["get"]> {
  return registry.get(id);
}

/** Test-only: reset singleton factories. Not part of the public API. */
export function resetDefaultFactoriesForTests(): void {
  defaultRegistry = null;
  defaultFactory = null;
  defaultFactoryCollectMetrics = null;
  defaultClientFactory = null;
}
