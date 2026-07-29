/**
 * Session update types for ACP notifications.
 */
export const SESSION_UPDATE_TYPE = {
  AGENT_MESSAGE_CHUNK: "agent_message_chunk",
} as const;

export type SessionUpdateType = (typeof SESSION_UPDATE_TYPE)[keyof typeof SESSION_UPDATE_TYPE];
