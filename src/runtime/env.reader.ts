/**
 * Type-safe env reading: use @simpill/env.utils when no override;
 * when override is provided (e.g. tests or config.env), prefer override then process.env.
 */
import { Env } from "@simpill/env.utils";
import { BOOLEAN_TRUTHY_PATTERN } from "../domain/boolean.patterns";
import type { EnvKey } from "../domain/env.keys";
import { ENV_KEY } from "../domain/env.keys";
import type { ProcessEnv } from "../domain/process.env";

/**
 * Resolve the raw value for a key from one place: the caller's override if it has one, otherwise
 * the ambient environment (which @simpill/env.utils backs with .env files). Parsing then happens
 * once, here, with this package's own rules.
 *
 * Previously each getter branched to a different library on the override path, so the two paths
 * disagreed: `ACP_LLM_CLI_DEBUG=yes` was truthy via config.env and falsy from the shell, because
 * only the override path used BOOLEAN_TRUTHY_PATTERN.
 */
function readRaw(key: EnvKey, override?: ProcessEnv): string | undefined {
  const fromOverride = override?.[key];
  if (fromOverride !== undefined) return String(fromOverride);
  return Env.getValue(key);
}

export function getEnvString(key: EnvKey, defaultValue: string, override?: ProcessEnv): string {
  const raw = readRaw(key, override);
  // An empty value means "unset" on both paths, so it cannot produce a config that fails
  // `command: z.string().min(1)` with a confusing message.
  return raw === undefined || raw === "" ? defaultValue : raw;
}

export function getEnvBoolean(key: EnvKey, defaultValue: boolean, override?: ProcessEnv): boolean {
  const raw = readRaw(key, override);
  if (raw === undefined || raw.trim() === "") return defaultValue;
  return BOOLEAN_TRUTHY_PATTERN.test(raw.trim());
}

export function mergeEnv(overrides?: ProcessEnv, baseEnv: ProcessEnv = process.env): ProcessEnv {
  return { ...baseEnv, ...(overrides ?? {}) };
}

export function isDebugEnabled(override?: ProcessEnv): boolean {
  return getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, false, override);
}
