import { PROVIDER_VALUES } from "../domain/provider";
import type { Provider } from "../domain/provider";
import { VALIDATION_ERROR } from "../domain/validation.errors";
import type { AcpSharedRuntimeOptions } from "../providers/acp.shared";
import type { IProviderFactory } from "./interfaces/provider.types";
import type { IProviderClient, IProviderClientFactory } from "./interfaces/provider.types";
import { ProviderClient } from "./provider.client";

/**
 * Factory that returns a ProviderClient (provider enum + IAgentPort) for a given Provider and config.
 * Delegates to IProviderFactory.createRuntime; validates provider is in Provider enum. Extensible: add to Provider and registry.
 */
export class ProviderClientFactory implements IProviderClientFactory {
  constructor(private readonly runtimeFactory: IProviderFactory) {}

  getClient(
    provider: Provider,
    config: unknown,
    runtimeOptions?: AcpSharedRuntimeOptions
  ): IProviderClient {
    if (!PROVIDER_VALUES.includes(provider)) {
      throw new Error(VALIDATION_ERROR.UNKNOWN_PROVIDER_ID(provider));
    }
    const port = this.runtimeFactory.createRuntime(provider, config, runtimeOptions);
    return new ProviderClient(provider, port);
  }

  listProviders(): Provider[] {
    return [...PROVIDER_VALUES];
  }
}
