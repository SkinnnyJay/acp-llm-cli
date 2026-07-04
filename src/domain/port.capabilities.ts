/**
 * Capability flag names for IAgentPort feature detection. Used by runtime metadata.
 */
export const PORT_CAPABILITY = {
  STREAM_PROMPT: "streamPrompt",
  RESTART: "restart",
  OPEN_CLOSE: "openClose",
  SESSION_PERSISTENCE: "sessionPersistence",
  CANCEL: "cancel",
} as const;

export type PortCapabilityName = (typeof PORT_CAPABILITY)[keyof typeof PORT_CAPABILITY];
