/**
 * Persisted session record for restore after process/app restart.
 */
export interface PersistedSession {
  providerId: string;
  workspace?: string;
  sessionId: string;
  updatedAt?: number;
}

/**
 * Optional session persistence: load/save/clear session metadata.
 * Used by lifecycle orchestration to restore context after restart.
 */
export interface ISessionPersistence {
  loadSession(providerId: string, workspace?: string): Promise<PersistedSession | null>;
  saveSession(data: PersistedSession): Promise<void>;
  clearSession(providerId: string, workspace?: string): Promise<void>;
}
