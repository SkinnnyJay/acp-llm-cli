import type { Provider } from "../../domain/provider";
import type { AcpSharedRuntimeOptions } from "../acp.runtime";
import type { IAgentPort } from "../agent.port";
import type { BaseCliConfig } from "../config";
import type { IHarnessAdapter } from "../harness.adapter";

/**
 * Common provider interface: same as IHarnessAdapter. Creates an IAgentPort from validated config
 * and optionally exposes CLI spec (args, help, flags). Implemented by all providers.
 */
export type IProvider<TConfig extends BaseCliConfig = BaseCliConfig> = IHarnessAdapter<TConfig>;

/**
 * Client returned by ProviderClientFactory: wraps the agent port with the provider enum for type-safe usage.
 */
export interface IProviderClient {
  readonly provider: Provider;
  readonly port: IAgentPort;
}

/**
 * Factory that returns IProviderClient by provider enum. Extensible: new providers add to Provider and registry.
 */
export interface IProviderClientFactory {
  getClient(
    provider: Provider,
    config: unknown,
    runtimeOptions?: AcpSharedRuntimeOptions
  ): IProviderClient;
  listProviders(): Provider[];
}

/**
 * Optional metrics for a provider (invocations, last error, latency).
 * Implemented by ProviderMetricsCollector; exposed by factory or provider wrapper.
 */
export interface IProviderMetrics {
  readonly invocations: number;
  readonly lastError: string | undefined;
  readonly lastInvocationMs: number | undefined;
  reset(): void;
}

/**
 * Factory interface: create runtimes by provider id with validated config,
 * optional metrics and logging. Implemented by ProviderFactory.
 */
export interface IProviderFactory {
  /**
   * Create an IAgentPort for the given provider id and config.
   * Config is validated with the provider's Zod schema; throws with clear errors on failure.
   */
  createRuntime(id: string, config: unknown, runtimeOptions?: AcpSharedRuntimeOptions): IAgentPort;

  /** Get the provider (adapter) for an id, if registered. */
  getProvider(id: string): IProvider<BaseCliConfig> | undefined;

  /** List all registered provider ids. */
  listProviderIds(): string[];

  /** Optional: get metrics for a provider (if metrics are collected). */
  getMetrics?(id: string): IProviderMetrics | undefined;
}
