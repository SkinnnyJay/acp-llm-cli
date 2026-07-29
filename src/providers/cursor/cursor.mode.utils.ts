import { CURSOR_MODE } from "./constants";

export type CursorCliMode = (typeof CURSOR_MODE)[keyof typeof CURSOR_MODE];

/** Map session modeId (e.g. auto, read-only, full-access) to Cursor CLI mode. */
export function resolveCursorMode(modeId: string): CursorCliMode | undefined {
  const normalized = modeId.trim().toLowerCase().replace(/-/g, "_");
  if (normalized === "auto" || normalized === "full_access") return CURSOR_MODE.AGENT;
  if (normalized === "read_only") return CURSOR_MODE.ASK;
  if (
    normalized === CURSOR_MODE.AGENT ||
    normalized === CURSOR_MODE.PLAN ||
    normalized === CURSOR_MODE.ASK
  ) {
    return normalized;
  }
  return undefined;
}
