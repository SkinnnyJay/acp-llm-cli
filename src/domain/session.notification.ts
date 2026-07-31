import type { SessionNotification } from "@agentclientprotocol/sdk";

/**
 * Session id on an ACP session notification.
 * Prefer camelCase `sessionId` (SDK). Use `{ vendorOnly: true }` for vendor `session_id` only.
 */
export function notificationSessionId(
  update: SessionNotification,
  options?: { vendorOnly?: boolean }
): string | undefined {
  const record = update as Record<string, unknown>;
  if (options?.vendorOnly) {
    return typeof record.session_id === "string" ? record.session_id : undefined;
  }
  if (typeof record.sessionId === "string") return record.sessionId;
  if (typeof record.session_id === "string") return record.session_id;
  return undefined;
}
