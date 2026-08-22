import { ENV_KEY } from "../domain/env.keys";
import type { ProcessEnv } from "../domain/process.env";
import type { BaseCliConfig } from "./config";
import { getEnvString } from "./env.reader";

/**
 * Resolve config: defaults → env (ENV_KEY only) → overrides. No raw env strings.
 *
 * Returns the caller's own config with the resolved base fields applied over it, so the
 * precedence rule lives here rather than at each call site. It previously returned only
 * {command, args, cwd, env}, which meant every caller had to write
 * `schema.parse({ ...config, ...resolved })` to stop provider-specific fields being discarded -
 * duplicated at two sites, and expressed purely by spread argument order, so the inverted
 * `{ ...resolved, ...config }` type-checked identically while silently throwing away all
 * env and default resolution.
 */
export function resolveBaseConfig<TConfig extends Partial<BaseCliConfig>>(
  defaults: { command: string; args: string[] },
  envOverrides: {
    commandKey: keyof typeof ENV_KEY;
    argsKey: keyof typeof ENV_KEY;
  },
  overrides?: TConfig,
  envOverride?: ProcessEnv
): TConfig & BaseCliConfig {
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
  // Spread the caller's config first so provider fields survive; the resolved base then wins.
  return {
    ...((overrides ?? {}) as TConfig),
    command,
    args,
    cwd: overrides?.cwd,
    env: overrides?.env ?? {},
  };
}
