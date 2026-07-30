import { LIMIT } from "./limits";

const SECRET_PATTERN = /(api[_-]?key|token|authorization|bearer|password|secret)\s*[:=]\s*\S+/gi;

/**
 * Prepare stderr for inclusion in thrown errors.
 * When debug is false: redact common secret patterns and truncate to a trailing window.
 * When debug is true: return full stderr unchanged.
 */
export function formatStderrForError(
  stderr: string,
  options?: { debug?: boolean; maxChars?: number }
): string {
  if (!stderr) return "";
  if (options?.debug) return stderr;
  const redacted = stderr.replace(SECRET_PATTERN, "$1=[REDACTED]");
  const maxChars = options?.maxChars ?? LIMIT.STDERR_ERROR_CHARS;
  if (redacted.length <= maxChars) return redacted;
  return `…${redacted.slice(redacted.length - maxChars)}`;
}
