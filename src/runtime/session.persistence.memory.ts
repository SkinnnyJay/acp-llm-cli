import type { ISessionPersistence } from "../domain/session.persistence";
import type { PersistedSession } from "../domain/session.persistence";

/**
 * In-memory session persistence. Useful for tests or single-process use.
 * For durable persistence across restarts, implement ISessionPersistence with file or DB storage.
 */
export function createMemorySessionPersistence(): ISessionPersistence {
  const store = new Map<string, PersistedSession>();

  function key(providerId: string, workspace?: string): string {
    return workspace ? `${providerId}:${workspace}` : providerId;
  }

  return {
    async loadSession(providerId: string, workspace?: string): Promise<PersistedSession | null> {
      const v = store.get(key(providerId, workspace));
      return v ?? null;
    },
    async saveSession(data: PersistedSession): Promise<void> {
      store.set(key(data.providerId, data.workspace), {
        ...data,
        updatedAt: data.updatedAt ?? Date.now(),
      });
    },
    async clearSession(providerId: string, workspace?: string): Promise<void> {
      store.delete(key(providerId, workspace));
    },
  };
}
