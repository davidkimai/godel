/**
 * Database Migration System
 * 
 * Provides versioned database migrations with:
 * - Up/down migration support
 * - Transaction safety
 * - Migration locking
 * - Checksum validation
 * - Rollback capabilities
 */

import { Pool, PoolClient } from 'pg';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export interface Migration {
  id: number;
  name: string;
  appliedAt: Date;
  checksum: string;
}

export interface MigrationFile {
  id: number;
  name: string;
  filename: string;
  up: string;
  down: string | null;
  checksum: string;
}

export interface MigrationOptions {
  migrationsPath?: string;
  schemaName?: string;
  migrationsTable?: string;
}

export class MigrationError extends Error {
  constructor(
    message: string,
    public readonly migrationName?: string,
    public readonly cause?: Error
  ) {
    super(message);
    this.name = 'MigrationError';
  }
}

export class MigrationRunner {
  private pool: Pool;
  private options: Required<MigrationOptions>;

  constructor(pool: Pool, options: MigrationOptions = {}) {
    this.pool = pool;
    this.options = {
      migrationsPath: options.migrationsPath || './migrations',
      schemaName: options.schemaName || 'public',
      migrationsTable: options.migrationsTable || '_migrations',
    };
  }

  /**
   * Initialize the migration system
   * Creates the migrations table if it doesn't exist
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.options.migrationsTable} (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          applied_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
          checksum VARCHAR(64) NOT NULL
        )
      `);
    } finally {
      client.release();
    }
  }

  /**
   * Load all migration files from the migrations directory
   */
  async loadMigrations(): Promise<MigrationFile[]> {
    const migrationsPath = path.resolve(this.options.migrationsPath);
    
    if (!fs.existsSync(migrationsPath)) {
      return [];
    }

    const files = fs.readdirSync(migrationsPath)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const migrations: MigrationFile[] = [];

    for (const filename of files) {
      const match = filename.match(/^(\d+)_(.+)\.sql$/);
      if (!match) continue;

      const [, idStr, name] = match;
      const id = parseInt(idStr, 10);
      const content = fs.readFileSync(path.join(migrationsPath, filename), 'utf-8');
      
      // Parse up/down sections
      const upMatch = content.match(/--\s*Up\s*\n([\s\S]*?)(?=--\s*Down|$)/i);
      const downMatch = content.match(/--\s*Down\s*\n([\s\S]*)/i);

      migrations.push({
        id,
        name: name.replace(/_/g, ' '),
        filename,
        up: upMatch ? upMatch[1].trim() : content,
        down: downMatch ? downMatch[1].trim() : null,
        checksum: this.calculateChecksum(content),
      });
    }

    return migrations.sort((a, b) => a.id - b.id);
  }

  /**
   * Get all applied migrations from the database
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    const result = await this.pool.query(
      `SELECT id, name, applied_at, checksum 
       FROM ${this.options.migrationsTable} 
       ORDER BY id ASC`
    );
    
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      appliedAt: row.applied_at,
      checksum: row.checksum,
    }));
  }

  /**
   * Get pending migrations
   */
  async getPendingMigrations(): Promise<MigrationFile[]> {
    const [allMigrations, appliedMigrations] = await Promise.all([
      this.loadMigrations(),
      this.getAppliedMigrations(),
    ]);

    const appliedMap = new Map(appliedMigrations.map(m => [m.id, m]));
    const pending: MigrationFile[] = [];

    for (const migration of allMigrations) {
      const applied = appliedMap.get(migration.id);
      
      if (!applied) {
        pending.push(migration);
      } else if (applied.checksum !== migration.checksum) {
        throw new MigrationError(
          `Migration ${migration.name} has been modified after it was applied`,
          migration.name
        );
      }
    }

    return pending;
  }

  /**
   * Run all pending migrations
   */
  async migrate(target?: number): Promise<MigrationFile[]> {
    await this.initialize();
    
    const pending = await this.getPendingMigrations();
    const applied: MigrationFile[] = [];

    // Filter to target if specified
    const toApply = target 
      ? pending.filter(m => m.id <= target)
      : pending;

    for (const migration of toApply) {
      await this.applyMigration(migration);
      applied.push(migration);
    }

    return applied;
  }

  /**
   * Rollback migrations
   */
  async rollback(steps: number = 1): Promise<MigrationFile[]> {
    const applied = await this.getAppliedMigrations();
    const toRollback = applied.slice(-steps);
    const allMigrations = await this.loadMigrations();
    const rolledBack: MigrationFile[] = [];

    // Process in reverse order
    for (const migration of toRollback.reverse()) {
      const file = allMigrations.find(m => m.id === migration.id);
      if (file && file.down) {
        await this.revertMigration(file);
        rolledBack.push(file);
      }
    }

    return rolledBack;
  }

  /**
   * Get current migration status
   */
  async status(): Promise<{
    applied: number;
    pending: number;
    lastApplied: Migration | null;
  }> {
    const [applied, pending] = await Promise.all([
      this.getAppliedMigrations(),
      this.getPendingMigrations(),
    ]);

    return {
      applied: applied.length,
      pending: pending.length,
      lastApplied: applied[applied.length - 1] || null,
    };
  }

  /**
   * Apply a single migration
   */
  private async applyMigration(migration: MigrationFile): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Acquire advisory lock
      await client.query('SELECT pg_advisory_lock($1)', [migration.id]);

      try {
        // Execute migration
        await client.query(migration.up);

        // Record migration
        await client.query(
          `INSERT INTO ${this.options.migrationsTable} (id, name, checksum) 
           VALUES ($1, $2, $3)
           ON CONFLICT (name) DO UPDATE SET checksum = $3`,
          [migration.id, migration.name, migration.checksum]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new MigrationError(
          `Failed to apply migration ${migration.name}`,
          migration.name,
          error as Error
        );
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [migration.id]);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Revert a single migration
   */
  private async revertMigration(migration: MigrationFile): Promise<void> {
    if (!migration.down) {
      throw new MigrationError(
        `Migration ${migration.name} has no rollback script`,
        migration.name
      );
    }

    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_lock($1)', [migration.id]);

      try {
        await client.query(migration.down);
        
        await client.query(
          `DELETE FROM ${this.options.migrationsTable} WHERE id = $1`,
          [migration.id]
        );

        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new MigrationError(
          `Failed to rollback migration ${migration.name}`,
          migration.name,
          error as Error
        );
      } finally {
        await client.query('SELECT pg_advisory_unlock($1)', [migration.id]);
      }
    } finally {
      client.release();
    }
  }

  /**
   * Calculate SHA-256 checksum of content
   */
  private calculateChecksum(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}

export { createHash };
export default MigrationRunner;
