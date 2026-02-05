import { AgentSQLiteStorage } from './sqlite-storage';
import { AgentStorageInterface } from './types';

export { AgentSQLiteStorage } from './sqlite-storage';

export function createAgentStorage(type: 'sqlite' = 'sqlite', options?: { dbPath?: string }): AgentStorageInterface {
  switch (type) {
    case 'sqlite':
      return new AgentSQLiteStorage(options?.dbPath);
    default:
      return new AgentSQLiteStorage(options?.dbPath);
  }
}

// Singleton instance
let storageInstance: AgentStorageInterface | null = null;

export function getAgentStorage(): AgentStorageInterface {
  if (!storageInstance) {
    storageInstance = createAgentStorage('sqlite');
  }
  return storageInstance;
}

export function setAgentStorage(storage: AgentStorageInterface): void {
  storageInstance = storage;
}
