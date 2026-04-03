/**
 * Node.js stream/event names.
 */
export const NODE_EVENT = {
  DATA: "data",
  ERROR: "error",
  CLOSE: "close",
} as const;

export type NodeEvent = (typeof NODE_EVENT)[keyof typeof NODE_EVENT];
