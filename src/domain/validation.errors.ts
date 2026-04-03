/**
 * Validation and configuration error messages. Used by Zod schemas and factory.
 * No raw error strings in business logic.
 */
export const VALIDATION_ERROR = {
  UNKNOWN_PROVIDER_ID: (id: string) => `Unknown provider id: ${id}. Use PROVIDER_IDS constants.`,
  CONFIG_REQUIRED: "Config is required and must be a non-null object.",
  PARSE_FAILED: (providerId: string) =>
    `Config validation failed for provider '${providerId}'. Check the errors above.`,
} as const;
