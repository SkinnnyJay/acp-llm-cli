import type { z } from "zod";
import type { AcpSharedRuntimeOptions } from "../providers/acp.shared";
import type { IAgentPort } from "./agent.port";
import type { BaseCliConfig } from "./config";
import type { IHarnessAdapter } from "./harness.adapter";

export interface CreateCliHarnessAdapterParams<TConfig extends BaseCliConfig> {
  id: string;
  name: string;
  configSchema: z.ZodType<TConfig, z.ZodTypeDef, unknown>;
  createRuntime: (config: TConfig, runtimeOptions?: AcpSharedRuntimeOptions) => IAgentPort;
  /** Optional: expose default args, buildArgs, getHelp, known flags. */
  cliSpec?: IHarnessAdapter<TConfig>["cliSpec"];
}

/**
 * Factory for CLI harness adapters. Id and name come from caller (provider modules pass constants).
 */
export function createCliHarnessAdapter<TConfig extends BaseCliConfig>(
  params: CreateCliHarnessAdapterParams<TConfig>
): IHarnessAdapter<TConfig> {
  const { id, name, configSchema, createRuntime, cliSpec } = params;
  return {
    get id() {
      return id;
    },
    get name() {
      return name;
    },
    configSchema,
    createHarness(config: TConfig, runtimeOptions?: AcpSharedRuntimeOptions) {
      return createRuntime(config, runtimeOptions);
    },
    get cliSpec() {
      return cliSpec;
    },
  };
}
