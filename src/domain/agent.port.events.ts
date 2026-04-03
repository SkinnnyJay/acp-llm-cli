/**
 * Agent port event names.
 */
export const AGENT_PORT_EVENT = {
  STATE: "state",
  SESSION_UPDATE: "sessionUpdate",
  PERMISSION_REQUEST: "permissionRequest",
  ERROR: "error",
} as const;

export type AgentPortEvent = (typeof AGENT_PORT_EVENT)[keyof typeof AGENT_PORT_EVENT];
