/**
 * Database Migrations Module
 * 
 * Exports migration utilities and types for the Godel database schema.
 */

export { 
  MigrationRunner, 
  MigrationError,
  type Migration,
  type MigrationFile,
  type MigrationOptions,
} from './runner';

// Migration constants
export const MIGRATIONS_TABLE = '_migrations';
export const DEFAULT_MIGRATIONS_PATH = './migrations';

// Helper function to create a new migration
export function createMigrationTemplate(name: string): string {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const filename = `${timestamp}_${name.toLowerCase().replace(/\s+/g, '_')}.sql`;
  
  return `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Up
-- Add your migration here

-- Down
-- Add your rollback here
`;
}
