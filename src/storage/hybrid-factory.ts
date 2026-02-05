/**
 * Hybrid Storage Factory - SPEC-T2
 * 
 * Creates SQLite or PostgreSQL storage based on configuration.
 * PostgreSQL is for PRODUCTION workloads, SQLite for development.
 * 
 * Usage:
 * - DASH_STORAGE_TYPE=postgres -> PostgreSQL (production)
 * - DASH_STORAGE_TYPE=sqlite -> SQLite (development, default)
 */

import { SQLiteStorage, getDb, initDatabase, closeDatabase } from './sqlite';
import { PostgresStorage, getGlobalPostgresStorage, resetGlobalPostgresStorage } from './postgres-storage';

export type StorageType = 'sqlite' | 'postgres';

export interface StorageConfig {
  type: StorageType;
  sqlite?: { dbPath?: string };
  postgres?: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    ssl?: boolean;
    maxConnections?: number;
  };
}

/**
 * Create storage based on configuration
 */
export function createStorage(config: StorageConfig): SQLiteStorage | PostgresStorage {
  switch (config.type) {
    case 'sqlite':
      return new SQLiteStorage({
        dbPath: config.sqlite?.dbPath || './dash.db',
        enableWAL: true,
        busyTimeout: 5000,
      });
    case 'postgres':
      if (!config.postgres) {
        throw new Error('PostgreSQL config required for postgres storage');
      }
      return new PostgresStorage(config.postgres);
    default:
      throw new Error(`Unknown storage type: ${config.type}`);
  }
}

/**
 * Create storage from environment variables
 */
export async function createStorageFromEnv(): Promise<SQLiteStorage | PostgresStorage> {
  const type = (process.env['DASH_STORAGE_TYPE'] as StorageType) || 'sqlite';
  
  if (type === 'postgres') {
    const config = {
      host: process.env['POSTGRES_HOST'] || 'localhost',
      port: parseInt(process.env['POSTGRES_PORT'] || '5432'),
      database: process.env['POSTGRES_DB'] || 'dash',
      user: process.env['POSTGRES_USER'] || 'dash',
      password: process.env['POSTGRES_PASSWORD'] || 'dash_password',
      ssl: process.env['POSTGRES_SSL'] === 'true',
      maxConnections: parseInt(process.env['POSTGRES_MAX_CONNECTIONS'] || '20'),
    };
    
    return getGlobalPostgresStorage(config);
  }
  
  return initDatabase({
    dbPath: './dash.db',
    enableWAL: true,
    busyTimeout: 5000,
  });
}

/**
 * Reset all storage (useful for testing)
 */
export function resetAllStorage(): void {
  closeDatabase();
  resetGlobalPostgresStorage();
}

/**
 * Get storage type from environment
 */
export function getStorageType(): StorageType {
  return (process.env['DASH_STORAGE_TYPE'] as StorageType) || 'sqlite';
}

/**
 * Check if using PostgreSQL
 */
export function isPostgres(): boolean {
  return getStorageType() === 'postgres';
}

export default createStorage;
