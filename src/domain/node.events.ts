/**
 * Node.js stream/event names.
 */
export const NODE_EVENT = {
  DATA: "data",
  ERROR: "error",
  CLOSE: "close",
} as const;

/** What Node puts on a child-process spawn failure: its `code`, and the `syscall` prefix. */
export const NODE_SPAWN_ERROR = {
  ENOENT: "ENOENT",
  EACCES: "EACCES",
  SYSCALL_PREFIX: "spawn",
} as const;
