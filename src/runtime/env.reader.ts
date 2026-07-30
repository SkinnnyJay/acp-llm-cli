/**
 * Type-safe env reading: use @simpill/env.utils when no override;
 * when override is provided (e.g. tests or config.env), prefer override then process.env.
 */
import { Env } from "@simpill/env.utils";
import { BOOLEAN_TRUTHY_PATTERN } from "../domain/boolean.patterns";
import type { EnvKey } from "../domain/env.keys";
import { ENV_KEY } from "../domain/env.keys";
import type { ProcessEnv } from "../domain/process.env";

export function getEnvString(key: EnvKey, defaultValue: string, override?: ProcessEnv): string {
  if (override && key in override && override[key] !== undefined && override[key] !== "") {
    return String(override[key]);
  }
  return Env.getString(key, defaultValue);
}

export function getEnvBoolean(key: EnvKey, defaultValue: boolean, override?: ProcessEnv): boolean {
  if (override && key in override) {
    const raw = override[key];
    if (raw === undefined) return defaultValue;
    return BOOLEAN_TRUTHY_PATTERN.test(String(raw).trim());
  }
  return Env.getBoolean(key, defaultValue);
}

export function mergeEnv(overrides?: ProcessEnv, baseEnv: ProcessEnv = process.env): ProcessEnv {
  return { ...baseEnv, ...(overrides ?? {}) };
}

export function isDebugEnabled(override?: ProcessEnv): boolean {
  return getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, false, override);
}
