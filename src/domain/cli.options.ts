/**
 * Generic CLI option values shared across provider configs.
 */
export const OUTPUT_FORMAT = {
  JSON: "json",
  TEXT: "text",
  STREAM_JSON: "stream-json",
} as const;

export type OutputFormat = (typeof OUTPUT_FORMAT)[keyof typeof OUTPUT_FORMAT];

export const SANDBOX_MODE = {
  ENABLED: "enabled",
  DISABLED: "disabled",
} as const;

export type SandboxMode = (typeof SANDBOX_MODE)[keyof typeof SANDBOX_MODE];
