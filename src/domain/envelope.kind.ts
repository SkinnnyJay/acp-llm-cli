/**
 * Stream envelope kinds.
 */
export const ENVELOPE_KIND = {
  NATIVE: "native",
} as const;

export type EnvelopeKind = (typeof ENVELOPE_KIND)[keyof typeof ENVELOPE_KIND];
