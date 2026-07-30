import { ENV_KEY } from "../domain/env.keys";
import type { ProcessEnv } from "../domain/process.env";
import type { BaseCliConfig } from "./config";
import { getEnvString } from "./env.reader";

/**
 * Resolve config: defaults → env (ENV_KEY only) → overrides. No raw env strings.
 * Returns a plain object; caller validates with provider schema.
 */
export function resolveBaseConfig(
  defaults: { command: string; args: string[] },
  envOverrides: {
    commandKey: keyof typeof ENV_KEY;
    argsKey: keyof typeof ENV_KEY;
  },
  overrides?: Partial<BaseCliConfig>,
  envOverride?: ProcessEnv
): BaseCliConfig {
  const command =
    overrides?.command ??
    getEnvString(ENV_KEY[envOverrides.commandKey], defaults.command, envOverride);
  const args =
    overrides?.args && overrides.args.length > 0
      ? overrides.args
      : (() => {
          const raw = getEnvString(ENV_KEY[envOverrides.argsKey], "", envOverride);
          if (!raw.trim()) return defaults.args;
          return raw.trim().split(/\s+/);
        })();
  const cwd = overrides?.cwd ?? undefined;
  const envVars = overrides?.env ?? {};
  return { command, args, cwd, env: envVars };
}
