import { logger } from '../src/utils/logger';
/**
 * PostgreSQL Migration Runner
 * 
 * Runs migrations from the migrations/ directory.
 * Tracks applied migrations in the _migrations table.
 */

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { Client } from 'pg';
import { getConnectionString } from '../src/storage/postgres/config';

interface Migration {
  name: string;
  path: string;
  sql: string;
  checksum: string;
}

interface AppliedMigration {
  name: string;
  applied_at: Date;
  checksum: string;
}

/**
 * Get all migration files from the migrations directory
 */
function getMigrations(migrationsDir: string): Migration[] {
  const files = readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Ensure consistent order

  return files.map(filename => {
    const path = join(migrationsDir, filename);
    const sql = readFileSync(path, 'utf-8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    
    return {
      name: filename,
      path,
      sql,
      checksum,
    };
  });
}

/**
 * Get list of already applied migrations
 */
async function getAppliedMigrations(client: Client): Promise<Map<string, AppliedMigration>> {
  // Check if migrations table exists
  const tableCheck = await client.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = '_migrations'
    )
  `);

  if (!tableCheck.rows[0].exists) {
    return new Map();
  }

  const result = await client.query<AppliedMigration>(
    'SELECT name, applied_at, checksum FROM _migrations ORDER BY id'
  );

  const applied = new Map<string, AppliedMigration>();
  for (const row of result.rows) {
    applied.set(row.name, row);
  }

  return applied;
}

/**
 * Apply a single migration
 */
async function applyMigration(
  client: Client, 
  migration: Migration
): Promise<void> {
  logger.info(`Applying migration: ${migration.name}...`);

  try {
    // Run the migration in a transaction
    await client.query('BEGIN');
    await client.query(migration.sql);
    
    // Record the migration
    await client.query(
      'INSERT INTO _migrations (name, checksum) VALUES ($1, $2)',
      [migration.name, migration.checksum]
    );
    
    await client.query('COMMIT');
    logger.info(`✅ Applied: ${migration.name}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

/**
 * Run all pending migrations
 */
async function runMigrations(): Promise<void> {
  const connectionString = getConnectionString();
  const migrationsDir = join(__dirname, '..', 'migrations');

  logger.info('🔌 Connecting to PostgreSQL...');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    logger.info('✅ Connected\n');

    // Get all available migrations
    const migrations = getMigrations(migrationsDir);
    logger.info(`Found ${migrations.length} migration(s)\n`);

    // Get already applied migrations
    const applied = await getAppliedMigrations(client);
    logger.info(`Already applied: ${applied.size}\n`);

    // Find pending migrations
    const pending = migrations.filter(m => !applied.has(m.name));

    if (pending.length === 0) {
      logger.info('✨ All migrations are up to date!');
      return;
    }

    logger.info(`Applying ${pending.length} pending migration(s):\n`);

    // Apply each pending migration
    for (const migration of pending) {
      // Check if migration was applied with different checksum
      const existing = applied.get(migration.name);
      if (existing && existing.checksum !== migration.checksum) {
        console.error(`❌ ERROR: Migration ${migration.name} has been modified after application!`);
        console.error('   This is not allowed. Please create a new migration instead.');
        process.exit(1);
      }

      await applyMigration(client, migration);
    }

    logger.info('\n✅ All migrations completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

/**
 * Show migration status
 */
async function showStatus(): Promise<void> {
  const connectionString = getConnectionString();
  const migrationsDir = join(__dirname, '..', 'migrations');

  const client = new Client({ connectionString });

  try {
    await client.connect();

    const migrations = getMigrations(migrationsDir);
    const applied = await getAppliedMigrations(client);

    logger.info('\n📊 Migration Status:\n');
    logger.info(`${'Name'.padEnd(30)} ${'Status'.padEnd(12)} Applied At`);
    logger.info('─'.repeat(70));

    for (const migration of migrations) {
      const app = applied.get(migration.name);
      const status = app ? '✅ Applied' : '⏳ Pending';
      const date = app 
        ? new Date(app.applied_at).toLocaleString() 
        : '-';
      
      logger.info(`${migration.name.padEnd(30)} ${status.padEnd(12)} ${date}`);
    }

    const pendingCount = migrations.length - applied.size;
    logger.info('\n' + '─'.repeat(70));
    logger.info(`Total: ${migrations.length} | Applied: ${applied.size} | Pending: ${pendingCount}`);
  } finally {
    await client.end();
  }
}

/**
 * Create a new migration file
 */
async function createMigration(name: string): Promise<void> {
  const migrationsDir = join(__dirname, '..', 'migrations');
  const timestamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  const filename = `${timestamp}_${name}.sql`;
  const filepath = join(migrationsDir, filename);

  const template = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}

-- Add your migration SQL here

`;

  const { writeFileSync } = await import('fs');
  writeFileSync(filepath, template);
  logger.info(`✅ Created migration: ${filename}`);
}

/**
 * Rollback the last n migrations
 */
async function rollbackMigrations(steps: number = 1): Promise<void> {
  const connectionString = getConnectionString();
  const migrationsDir = join(__dirname, '..', 'migrations');

  logger.info('🔌 Connecting to PostgreSQL...');
  const client = new Client({ connectionString });

  try {
    await client.connect();
    logger.info('✅ Connected\n');

    // Get all migrations
    const migrations = getMigrations(migrationsDir);
    const applied = await getAppliedMigrations(client);

    if (applied.size === 0) {
      logger.info('ℹ️  No migrations to rollback');
      return;
    }

    // Get last N applied migrations
    const appliedList = Array.from(applied.entries())
      .sort((a, b) => new Date(b[1].applied_at).getTime() - new Date(a[1].applied_at).getTime())
      .slice(0, steps);

    logger.info(`Rolling back ${appliedList.length} migration(s):\n`);

    for (const [name, app] of appliedList) {
      logger.info(`Rolling back: ${name}...`);
      
      // Find the migration file to get the down SQL
      const migration = migrations.find(m => m.name === name);
      if (!migration) {
        console.error(`❌ Cannot find migration file for ${name}`);
        continue;
      }

      // Parse down section
      const downMatch = migration.sql.match(/--\s*Down\s*\n([\s\S]*)/i);
      if (!downMatch) {
        console.error(`❌ Migration ${name} has no rollback script`);
        continue;
      }

      const downSql = downMatch[1].trim();

      try {
        await client.query('BEGIN');
        await client.query(downSql);
        await client.query('DELETE FROM _migrations WHERE name = $1', [name]);
        await client.query('COMMIT');
        logger.info(`✅ Rolled back: ${name}`);
      } catch (error) {
        await client.query('ROLLBACK');
        console.error(`❌ Failed to rollback ${name}:`, error);
        throw error;
      }
    }

    logger.info('\n✅ Rollback completed successfully!');
  } catch (error) {
    console.error('\n❌ Rollback failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// CLI handling
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'status':
    showStatus();
    break;
  case 'create':
    if (!args[1]) {
      console.error('Usage: npm run migrate:create <migration-name>');
      process.exit(1);
    }
    createMigration(args[1]);
    break;
  case 'rollback':
    const steps = args[1] ? parseInt(args[1], 10) : 1;
    if (isNaN(steps) || steps < 1) {
      console.error('Usage: npm run migrate:rollback [steps]');
      process.exit(1);
    }
    rollbackMigrations(steps);
    break;
  case 'up':
  default:
    runMigrations();
    break;
}
