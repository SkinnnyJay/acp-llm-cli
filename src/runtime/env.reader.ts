/**
 * Type-safe env reading: use @simpill/env.utils when no override;
 * when override is provided (e.g. tests or config.env), prefer override then process.env.
 */
import { Env, EnvManager } from "@simpill/env.utils";
import { BOOLEAN_TRUTHY_PATTERN } from "../domain/boolean.patterns";
import type { EnvKey } from "../domain/env.keys";
import { ENV_FILE_PATHS, ENV_KEY, MISSING_ENV_FILE_CODE } from "../domain/env.keys";
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
let envBootstrapped = false;

/**
 * Initialise .env loading once, without the upstream noise.
 *
 * dotenvx prints `☠ [MISSING_ENV_FILE]` for every path it is asked to load and
 * cannot find, and does so even under the `quiet: true` that @simpill/env.utils
 * already passes - so any consumer project without a .env got two skull-emoji
 * errors on stderr the first time it used this package. Nothing was broken; it
 * just reads as if something were.
 *
 * Restricting the paths does not help: env.utils treats an empty `envPaths` as
 * "unspecified" and falls back to its defaults, which is precisely the no-.env
 * case. So the write is filtered instead, for the duration of this one call and
 * only for that message - anything else dotenvx has to say still reaches stderr.
 */
function ensureEnvBootstrapped(): void {
  if (envBootstrapped) return;
  envBootstrapped = true;
  const write = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) =>
    typeof chunk === "string" && chunk.includes(MISSING_ENV_FILE_CODE)
      ? true
      : (write as (c: string | Uint8Array, ...r: unknown[]) => boolean)(
          chunk,
          ...rest
        )) as typeof process.stderr.write;
  try {
    EnvManager.getInstance({ envPaths: [...ENV_FILE_PATHS] });
  } finally {
    process.stderr.write = write;
  }
}

function readRaw(key: EnvKey, override?: ProcessEnv): string | undefined {
  const fromOverride = override?.[key];
  // An empty override is treated as absent rather than as a value, so it falls through to the
  // ambient environment instead of shadowing it - the behaviour callers had before.
  if (fromOverride !== undefined && fromOverride !== "") return String(fromOverride);
  ensureEnvBootstrapped();
  return Env.getValue(key);
}

export function getEnvString(key: EnvKey, defaultValue: string, override?: ProcessEnv): string {
  const raw = readRaw(key, override);
  // An empty ambient value also means "unset", so it cannot produce a config that fails
  // `command: z.string().min(1)` with a confusing message.
  return raw === undefined || raw === "" ? defaultValue : raw;
}

export function getEnvBoolean(key: EnvKey, defaultValue: boolean, override?: ProcessEnv): boolean {
  const fromOverride = override?.[key];
  if (fromOverride !== undefined) {
    // An explicitly supplied override is authoritative, including "". Falling through to the
    // ambient environment here would let `env: { ACP_LLM_CLI_DEBUG: "" }` silently pick up a
    // shell `ACP_LLM_CLI_DEBUG=1` and stop redacting child stderr in thrown errors.
    return BOOLEAN_TRUTHY_PATTERN.test(String(fromOverride).trim());
  }
  ensureEnvBootstrapped();
  const ambient = Env.getValue(key);
  if (ambient === undefined || ambient.trim() === "") return defaultValue;
  return BOOLEAN_TRUTHY_PATTERN.test(ambient.trim());
}

export function mergeEnv(overrides?: ProcessEnv, baseEnv: ProcessEnv = process.env): ProcessEnv {
  return { ...baseEnv, ...(overrides ?? {}) };
}

export function isDebugEnabled(override?: ProcessEnv): boolean {
  return getEnvBoolean(ENV_KEY.ACP_LLM_CLI_DEBUG, false, override);
}
