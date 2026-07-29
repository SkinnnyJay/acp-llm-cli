import { VALIDATION_ERROR } from "../domain/validation.errors";
import type { IAgentPort } from "./agent.port";
import type { BaseCliConfig } from "./config";
import type { IProvider, IProviderFactory } from "./interfaces/provider.types";
import { createLogger } from "./logger";
import { ProviderMetricsCollector } from "./metrics";
import type { HarnessRegistry } from "./registry";

const LOG_NAME = "ProviderFactory";

/**
 * Factory for creating agent ports by provider id with Zod-validated config,
 * optional metrics, and structured logging. DRY entry point for createHarness with clear errors.
 */
export class ProviderFactory implements IProviderFactory {
  private readonly registry: HarnessRegistry;
  private readonly logger: ReturnType<typeof createLogger>;
  private readonly metricsById = new Map<string, ProviderMetricsCollector>();
  private readonly collectMetrics: boolean;

  constructor(options: {
    registry: HarnessRegistry;
    logger?: ReturnType<typeof createLogger>;
    collectMetrics?: boolean;
  }) {
    this.registry = options.registry;
    this.logger = options.logger ?? createLogger(LOG_NAME);
    this.collectMetrics = options.collectMetrics ?? true;
  }

  createRuntime(id: string, config: unknown): IAgentPort {
    const provider = this.registry.get(id);
    if (!provider) {
      const msg = VALIDATION_ERROR.UNKNOWN_PROVIDER_ID(id);
      this.logger.error(msg);
      throw new Error(msg);
    }

    const metrics = this.getOrCreateMetrics(id);

    // Validate config before entering the runtime try-catch so parse errors
    // log exactly once (not once here and again in the catch block below).
    if (config === null || config === undefined) {
      const msg = VALIDATION_ERROR.CONFIG_REQUIRED;
      this.logger.warn(msg, { providerId: id });
      metrics.recordFailure(msg);
      throw new Error(msg);
    }

    const result = provider.configSchema.safeParse(config);
    if (!result.success) {
      const first = result.error.issues[0];
      const path = first?.path.join(".") ?? "config";
      const detail = first?.message ?? result.error.message;
      const msg = `${VALIDATION_ERROR.PARSE_FAILED(id)} Path: ${path}. ${detail}`;
      this.logger.error(msg, { providerId: id, issues: result.error.issues });
      metrics.recordFailure(msg);
      throw new Error(msg);
    }

    // Only runtime errors from createHarness are caught here.
    const start = Date.now();
    try {
      const port = provider.createHarness(result.data);
      const durationMs = Date.now() - start;
      metrics.recordSuccess(durationMs);
      this.logger.debug("createRuntime succeeded", {
        providerId: id,
        durationMs,
        invocations: metrics.invocations,
      });
      return port;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      metrics.recordFailure(message);
      this.logger.error("createRuntime failed", { providerId: id, error: message });
      throw err;
    }
  }

  getProvider(id: string): IProvider<BaseCliConfig> | undefined {
    return this.registry.get(id);
  }

  listProviderIds(): string[] {
    return this.registry.list().map((a) => a.id);
  }

  getMetrics(id: string): import("./interfaces/provider.types").IProviderMetrics | undefined {
    if (!this.collectMetrics) return undefined;
    return this.metricsById.get(id);
  }

  private getOrCreateMetrics(id: string): ProviderMetricsCollector {
    let m = this.metricsById.get(id);
    if (!m) {
      m = new ProviderMetricsCollector();
      this.metricsById.set(id, m);
    }
    return m;
  }
}
