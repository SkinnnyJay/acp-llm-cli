import type { SessionNotification } from "@agentclientprotocol/sdk";
import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "../src/domain/provider.ids";
import type { ISessionPersistence, PersistedSession } from "../src/domain/session.persistence";
import { claudeAdapter } from "../src/providers/claude/adapter";
import { codexAdapter } from "../src/providers/codex/adapter";
import { geminiAdapter } from "../src/providers/gemini/adapter";
import { agentMessageChunk } from "./helpers/session.notification";

/**
 * The supervisor persists only from notifications carrying a vendor `session_id`.
 * That key is snake_case and absent from the SDK type, which is why the
 * production code reads it through a Record cast - so the fixture does too.
 */
const vendorUpdate = (sessionId: string): SessionNotification =>
  ({ ...agentMessageChunk(sessionId), session_id: sessionId }) as unknown as SessionNotification;

/** Records what providerId the runtime actually persists under. */
function createRecordingPersistence(): ISessionPersistence & { saved: PersistedSession[] } {
  const saved: PersistedSession[] = [];
  return {
    saved,
    async loadSession() {
      return null;
    },
    async saveSession(data) {
      saved.push(data);
    },
    async clearSession() {},
  };
}

/**
 * Each ACP adapter defaults providerId to its own id but lets a caller override it.
 * That branch decides the persistence key, so getting it backwards would make two
 * providers sharing a store read each other's sessions.
 *
 * Driving it through `port.sessionUpdate` rather than asserting the port merely
 * exists: the lifecycle supervisor persists from inbound notifications, so this
 * observes the key that was really used instead of trusting the wiring.
 */
const providerIdsWritten = (p: { saved: PersistedSession[] }): string[] =>
  p.saved.map((s) => s.providerId);

const adapters = [
  { name: "claude", adapter: claudeAdapter, defaultId: PROVIDER_IDS.CLAUDE_CLI_ID },
  { name: "codex", adapter: codexAdapter, defaultId: PROVIDER_IDS.CODEX_CLI_ID },
  { name: "gemini", adapter: geminiAdapter, defaultId: PROVIDER_IDS.GEMINI_CLI_ID },
] as const;

describe("ACP adapter providerId resolution", () => {
  for (const { name, adapter, defaultId } of adapters) {
    const build = (persistence: ISessionPersistence, providerId?: string) => {
      const config = adapter.configSchema.parse({ command: "echo", args: [] });
      return adapter.createHarness(config, {
        sessionPersistence: persistence,
        ...(providerId ? { providerId } : {}),
      });
    };

    it(`${name} persists under its own id when none is given`, async () => {
      const persistence = createRecordingPersistence();
      const port = build(persistence);

      await port.sessionUpdate(vendorUpdate("sess-1"));

      expect(providerIdsWritten(persistence)).toEqual([defaultId]);
    });

    it(`${name} persists under an explicit providerId instead of its default`, async () => {
      const persistence = createRecordingPersistence();
      const port = build(persistence, "custom-namespace");

      await port.sessionUpdate(vendorUpdate("sess-1"));

      expect(providerIdsWritten(persistence)).toEqual(["custom-namespace"]);
      expect(providerIdsWritten(persistence)).not.toContain(defaultId);
    });
  }
});
