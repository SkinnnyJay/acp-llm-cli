import { z } from "zod";
import { PROVIDER_IDS } from "./provider.ids";

/**
 * Enum-like map of supported providers. Use with ProviderClientFactory.getClient(Provider.CLAUDE, config).
 * Extensible: add a new key and register the adapter in the registry to support a new provider.
 */
export const Provider = {
  CLAUDE: PROVIDER_IDS.CLAUDE_CLI_ID,
  GEMINI: PROVIDER_IDS.GEMINI_CLI_ID,
  CODEX: PROVIDER_IDS.CODEX_CLI_ID,
  CURSOR: PROVIDER_IDS.CURSOR_CLI_ID,
} as const;

export type Provider = (typeof Provider)[keyof typeof Provider];

export const ProviderSchema = z.enum([
  Provider.CLAUDE,
  Provider.GEMINI,
  Provider.CODEX,
  Provider.CURSOR,
]);

/** All provider values for iteration / validation. */
export const PROVIDER_VALUES: readonly Provider[] = [
  Provider.CLAUDE,
  Provider.GEMINI,
  Provider.CODEX,
  Provider.CURSOR,
];
