import type { Provider } from "../domain/provider";
import type { IAgentPort } from "./agent.port";
import type { IProviderClient } from "./interfaces/provider.types";

/**
 * Default implementation of IProviderClient: holds provider enum and agent port.
 * Returned by ProviderClientFactory.getClient(provider, config).
 */
export class ProviderClient implements IProviderClient {
  constructor(
    public readonly provider: Provider,
    public readonly port: IAgentPort
  ) {}
}
