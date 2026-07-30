/**
 * Environment map without relying on the NodeJS namespace in public .d.ts.
 * Compatible with `process.env` and plain override objects.
 */
export type ProcessEnv = Record<string, string | undefined>;
