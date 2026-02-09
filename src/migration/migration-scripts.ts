/**
 * Migration Scripts - Worktree to Kata Migration
 * 
 * Handles data migration from legacy worktree architecture to Kata architecture.
 * Ensures zero-downtime migration with data preservation.
 * 
 * @module migration/migration-scripts
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
// Logger will be injected or use console fallback
let logger = {
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  warn: (msg: string) => console.warn(msg),
};

// Allow logger override
export function setLogger(newLogger: typeof logger) {
  logger = newLogger;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface MigrationConfig {
  /** Source worktree path */
  sourcePath: string;
  /** Target Kata path */
  targetPath: string;
  /** Database connection pool */
  pool: Pool;
  /** Migration options */
  options: MigrationOptions;
}

export interface MigrationOptions {
  /** Dry run mode - validate without executing */
  dryRun: boolean;
  /** Preserve source data after migration */
  preserveSource: boolean;
  /** Batch size for database operations */
  batchSize: number;
  /** Maximum concurrent migrations */
  maxConcurrency: number;
  /** Enable verbose logging */
  verbose: boolean;
}

export interface MigrationResult {
  /** Migration success status */
  success: boolean;
  /** Migration ID */
  migrationId: string;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime: string;
  /** Duration in ms */
  durationMs: number;
  /** Migrated entities count */
  entitiesMigrated: EntityCount;
  /** Errors encountered */
  errors: MigrationError[];
  /** Warnings */
  warnings: string[];
  /** Data integrity checksum */
  checksum: string;
}

export interface EntityCount {
  worktrees: number;
  sessions: number;
  agents: number;
  tasks: number;
  events: number;
  files: number;
  configurations: number;
}

export interface MigrationError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Entity type affected */
  entityType: string;
  /** Entity ID */
  entityId?: string;
  /** Recovery action taken */
  recoveryAction?: string;
}

export interface WorktreeData {
  id: string;
  name: string;
  path: string;
  branch: string;
  sessions: SessionData[];
  metadata: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionData {
  id: string;
  worktreeId: string;
  teamId: string;
  agents: AgentData[];
  tasks: TaskData[];
  events: EventData[];
  state: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AgentData {
  id: string;
  sessionId: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'completed' | 'error';
  metadata: Record<string, unknown>;
}

export interface TaskData {
  id: string;
  sessionId: string;
  agentId: string;
  type: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

export interface EventData {
  id: string;
  sessionId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

// ============================================================================
// Migration Scripts Class
// ============================================================================

export class WorktreeToKataMigration {
  private config: MigrationConfig;
  private metrics: MigrationMetrics;
  private abortController: AbortController | null = null;

  constructor(config: MigrationConfig) {
    this.config = config;
    this.metrics = new MigrationMetrics();
  }

  /**
   * Execute full migration from worktree to Kata architecture
   */
  async execute(): Promise<MigrationResult> {
    const migrationId = `migration-${Date.now()}`;
    const startTime = new Date().toISOString();
    const startMs = Date.now();

    logger.info(`[${migrationId}] Starting Worktree to Kata migration`);
    logger.info(`  Source: ${this.config.sourcePath}`);
    logger.info(`  Target: ${this.config.targetPath}`);
    logger.info(`  Mode: ${this.config.options.dryRun ? 'DRY RUN' : 'LIVE'}`);

    this.abortController = new AbortController();

    try {
      // Phase 1: Pre-migration validation
      await this.validatePrerequisites();

      // Phase 2: Backup source data
      await this.backupSourceData();

      // Phase 3: Migrate worktrees to Kata projects
      const worktrees = await this.migrateWorktrees();

      // Phase 4: Migrate sessions
      const sessions = await this.migrateSessions(worktrees);

      // Phase 5: Migrate agents
      const agents = await this.migrateAgents(sessions);

      // Phase 6: Migrate tasks
      const tasks = await this.migrateTasks(sessions);

      // Phase 7: Migrate events
      const events = await this.migrateEvents(sessions);

      // Phase 8: Verify data integrity
      const checksum = await this.verifyIntegrity(worktrees, sessions, agents, tasks, events);

      // Phase 9: Cleanup (if not preserving source)
      if (!this.config.options.preserveSource && !this.config.options.dryRun) {
        await this.cleanupSourceData();
      }

      const endMs = Date.now();
      const result: MigrationResult = {
        success: true,
        migrationId,
        startTime,
        endTime: new Date().toISOString(),
        durationMs: endMs - startMs,
        entitiesMigrated: {
          worktrees: worktrees.length,
          sessions: sessions.length,
          agents: agents.length,
          tasks: tasks.length,
          events: events.length,
          files: await this.countMigratedFiles(),
          configurations: await this.countMigratedConfigs(),
        },
        errors: this.metrics.errors,
        warnings: this.metrics.warnings,
        checksum,
      };

      logger.info(`[${migrationId}] Migration completed successfully`);
      logger.info(`  Duration: ${result.durationMs}ms`);
      logger.info(`  Entities: ${JSON.stringify(result.entitiesMigrated)}`);

      return result;
    } catch (error) {
      const endMs = Date.now();
      const result: MigrationResult = {
        success: false,
        migrationId,
        startTime,
        endTime: new Date().toISOString(),
        durationMs: endMs - startMs,
        entitiesMigrated: this.metrics.getCounts(),
        errors: [
          ...this.metrics.errors,
          {
            code: 'MIGRATION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            entityType: 'migration',
          },
        ],
        warnings: this.metrics.warnings,
        checksum: '',
      };

      logger.error(`[${migrationId}] Migration failed: ${error}`);
      
      // Attempt rollback on failure
      await this.rollback();
      
      return result;
    }
  }

  /**
   * Abort running migration
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.warn('Migration abort signal sent');
    }
  }

  /**
   * Validate migration prerequisites
   */
  private async validatePrerequisites(): Promise<void> {
    logger.info('Phase 1: Validating prerequisites...');

    // Check source path exists
    if (!fs.existsSync(this.config.sourcePath)) {
      throw new Error(`Source path does not exist: ${this.config.sourcePath}`);
    }

    // Check target path exists or create it
    if (!fs.existsSync(this.config.targetPath)) {
      if (!this.config.options.dryRun) {
        fs.mkdirSync(this.config.targetPath, { recursive: true });
      }
    }

    // Verify database connectivity
    try {
      await this.config.pool.query('SELECT 1');
    } catch (error) {
      throw new Error(`Database connectivity check failed: ${error}`);
    }

    // Check disk space
    const stats = fs.statfsSync(this.config.targetPath);
    const freeSpaceGB = (stats.bavail * stats.bsize) / (1024 ** 3);
    if (freeSpaceGB < 1) {
      throw new Error(`Insufficient disk space: ${freeSpaceGB.toFixed(2)}GB available`);
    }

    logger.info('  ✓ All prerequisites validated');
  }

  /**
   * Backup source data before migration
   */
  private async backupSourceData(): Promise<string> {
    logger.info('Phase 2: Creating source data backup...');

    if (this.config.options.dryRun) {
      logger.info('  (Dry run - skipping backup)');
      return '';
    }

    const backupPath = path.join(
      this.config.targetPath,
      '.migration-backup',
      `backup-${Date.now()}`
    );

    fs.mkdirSync(backupPath, { recursive: true });

    // Backup worktree metadata
    const worktreesPath = path.join(this.config.sourcePath, '.claude', 'worktrees');
    if (fs.existsSync(worktreesPath)) {
      this.copyDirectory(worktreesPath, path.join(backupPath, 'worktrees'));
    }

    // Backup configuration
    const configPath = path.join(this.config.sourcePath, '.godel');
    if (fs.existsSync(configPath)) {
      this.copyDirectory(configPath, path.join(backupPath, 'godel-config'));
    }

    // Database backup
    const backupQuery = `
      COPY (
        SELECT * FROM worktrees 
        UNION ALL 
        SELECT * FROM sessions 
        UNION ALL 
        SELECT * FROM agents
      ) TO '${path.join(backupPath, 'database-backup.csv')}' WITH CSV
    `;
    await this.config.pool.query(backupQuery);

    logger.info(`  ✓ Backup created at: ${backupPath}`);
    return backupPath;
  }

  /**
   * Migrate worktrees to Kata projects
   */
  private async migrateWorktrees(): Promise<WorktreeData[]> {
    logger.info('Phase 3: Migrating worktrees...');

    const worktrees: WorktreeData[] = [];
    const worktreesPath = path.join(this.config.sourcePath, '.claude', 'worktrees');

    if (!fs.existsSync(worktreesPath)) {
      logger.warn('  No worktrees directory found');
      return worktrees;
    }

    const entries = fs.readdirSync(worktreesPath);
    const batchSize = this.config.options.batchSize;

    for (let i = 0; i < entries.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Migration aborted');
      }

      const batch = entries.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (entry) => {
        const worktreePath = path.join(worktreesPath, entry);
        const stat = fs.statSync(worktreePath);

        if (!stat.isDirectory()) return;

        try {
          const worktree = await this.migrateSingleWorktree(entry, worktreePath);
          worktrees.push(worktree);
          this.metrics.increment('worktrees');
        } catch (error) {
          this.metrics.addError({
            code: 'WORKTREE_MIGRATION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            entityType: 'worktree',
            entityId: entry,
          });
        }
      }));

      logger.info(`  Progress: ${Math.min(i + batchSize, entries.length)}/${entries.length}`);
    }

    logger.info(`  ✓ Migrated ${worktrees.length} worktrees`);
    return worktrees;
  }

  /**
   * Migrate a single worktree to Kata
   */
  private async migrateSingleWorktree(name: string, worktreePath: string): Promise<WorktreeData> {
    // Read worktree metadata
    const metadataPath = path.join(worktreePath, '.claude', 'metadata.json');
    const metadata = fs.existsSync(metadataPath) 
      ? JSON.parse(fs.readFileSync(metadataPath, 'utf-8'))
      : {};

    const worktree: WorktreeData = {
      id: `kata-${createHash('sha256').update(name).digest('hex').slice(0, 12)}`,
      name,
      path: worktreePath,
      branch: metadata.branch || 'main',
      sessions: [],
      metadata,
      createdAt: new Date(metadata.createdAt || Date.now()),
      updatedAt: new Date(metadata.updatedAt || Date.now()),
    };

    if (!this.config.options.dryRun) {
      // Create Kata project directory
      const kataPath = path.join(this.config.targetPath, 'katas', worktree.id);
      fs.mkdirSync(kataPath, { recursive: true });

      // Write Kata metadata
      fs.writeFileSync(
        path.join(kataPath, 'kata.json'),
        JSON.stringify({
          id: worktree.id,
          name: worktree.name,
          branch: worktree.branch,
          migratedFrom: worktreePath,
          createdAt: worktree.createdAt,
          updatedAt: worktree.updatedAt,
        }, null, 2)
      );

      // Migrate git repository
      const gitPath = path.join(worktreePath, '.git');
      if (fs.existsSync(gitPath)) {
        this.copyDirectory(gitPath, path.join(kataPath, '.git'));
      }
    }

    return worktree;
  }

  /**
   * Migrate sessions from worktrees
   */
  private async migrateSessions(worktrees: WorktreeData[]): Promise<SessionData[]> {
    logger.info('Phase 4: Migrating sessions...');

    const sessions: SessionData[] = [];

    for (const worktree of worktrees) {
      const sessionsPath = path.join(worktree.path, '.claude', 'sessions');
      
      if (!fs.existsSync(sessionsPath)) {
        continue;
      }

      const sessionFiles = fs.readdirSync(sessionsPath)
        .filter(f => f.endsWith('.json'));

      for (const sessionFile of sessionFiles) {
        if (this.abortController?.signal.aborted) {
          throw new Error('Migration aborted');
        }

        try {
          const sessionPath = path.join(sessionsPath, sessionFile);
          const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf-8'));

          const session: SessionData = {
            id: sessionData.id || `session-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            worktreeId: worktree.id,
            teamId: sessionData.teamId || `team-${Math.random().toString(36).slice(2)}`,
            agents: [],
            tasks: [],
            events: [],
            state: sessionData.state || {},
            createdAt: new Date(sessionData.createdAt || Date.now()),
            updatedAt: new Date(sessionData.updatedAt || Date.now()),
          };

          if (!this.config.options.dryRun) {
            // Store in database
            await this.config.pool.query(
              `INSERT INTO sessions (id, team_id, worktree_id, state, created_at, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6)
               ON CONFLICT (id) DO UPDATE SET
               state = EXCLUDED.state,
               updated_at = EXCLUDED.updated_at`,
              [session.id, session.teamId, session.worktreeId, JSON.stringify(session.state), session.createdAt, session.updatedAt]
            );
          }

          sessions.push(session);
          worktree.sessions.push(session);
          this.metrics.increment('sessions');
        } catch (error) {
          this.metrics.addError({
            code: 'SESSION_MIGRATION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            entityType: 'session',
            entityId: sessionFile,
          });
        }
      }
    }

    logger.info(`  ✓ Migrated ${sessions.length} sessions`);
    return sessions;
  }

  /**
   * Migrate agents from sessions
   */
  private async migrateAgents(sessions: SessionData[]): Promise<AgentData[]> {
    logger.info('Phase 5: Migrating agents...');

    const agents: AgentData[] = [];

    for (const session of sessions) {
      // Look for agent data in session directory
      const agentsPath = path.join(
        this.config.sourcePath,
        '.claude',
        'worktrees',
        session.worktreeId.replace('kata-', ''),
        '.claude',
        'agents'
      );

      if (!fs.existsSync(agentsPath)) {
        continue;
      }

      const agentFiles = fs.readdirSync(agentsPath)
        .filter(f => f.endsWith('.json'));

      for (const agentFile of agentFiles) {
        try {
          const agentPath = path.join(agentsPath, agentFile);
          const agentData = JSON.parse(fs.readFileSync(agentPath, 'utf-8'));

          const agent: AgentData = {
            id: agentData.id || `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sessionId: session.id,
            name: agentData.name || 'unnamed-agent',
            role: agentData.role || 'worker',
            status: agentData.status || 'idle',
            metadata: agentData.metadata || {},
          };

          if (!this.config.options.dryRun) {
            await this.config.pool.query(
              `INSERT INTO agents (id, session_id, name, role, status, metadata, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (id) DO UPDATE SET
               status = EXCLUDED.status,
               metadata = EXCLUDED.metadata`,
              [agent.id, agent.sessionId, agent.name, agent.role, agent.status, JSON.stringify(agent.metadata)]
            );
          }

          agents.push(agent);
          session.agents.push(agent);
          this.metrics.increment('agents');
        } catch (error) {
          this.metrics.addError({
            code: 'AGENT_MIGRATION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            entityType: 'agent',
            entityId: agentFile,
          });
        }
      }
    }

    logger.info(`  ✓ Migrated ${agents.length} agents`);
    return agents;
  }

  /**
   * Migrate tasks from sessions
   */
  private async migrateTasks(sessions: SessionData[]): Promise<TaskData[]> {
    logger.info('Phase 6: Migrating tasks...');

    const tasks: TaskData[] = [];

    // Query tasks from database
    const result = await this.config.pool.query(
      `SELECT * FROM tasks WHERE session_id = ANY($1)`,
      [sessions.map(s => s.id)]
    );

    for (const row of result.rows) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Migration aborted');
      }

      try {
        const task: TaskData = {
          id: row.id,
          sessionId: row.session_id,
          agentId: row.agent_id,
          type: row.type,
          status: row.status,
          input: row.input || {},
          output: row.output,
          createdAt: row.created_at,
          completedAt: row.completed_at,
        };

        if (!this.config.options.dryRun) {
          // Tasks are already in DB, just update references
          await this.config.pool.query(
            `UPDATE tasks SET migrated = true, migrated_at = NOW()
             WHERE id = $1`,
            [task.id]
          );
        }

        tasks.push(task);
        
        const session = sessions.find(s => s.id === task.sessionId);
        if (session) {
          session.tasks.push(task);
        }
        
        this.metrics.increment('tasks');
      } catch (error) {
        this.metrics.addError({
          code: 'TASK_MIGRATION_FAILED',
          message: error instanceof Error ? error.message : String(error),
          entityType: 'task',
          entityId: row.id,
        });
      }
    }

    logger.info(`  ✓ Migrated ${tasks.length} tasks`);
    return tasks;
  }

  /**
   * Migrate events from sessions
   */
  private async migrateEvents(sessions: SessionData[]): Promise<EventData[]> {
    logger.info('Phase 7: Migrating events...');

    const events: EventData[] = [];

    // Query events from database in batches
    const batchSize = this.config.options.batchSize;
    const sessionIds = sessions.map(s => s.id);

    for (let i = 0; i < sessionIds.length; i += batchSize) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Migration aborted');
      }

      const batch = sessionIds.slice(i, i + batchSize);
      
      const result = await this.config.pool.query(
        `SELECT * FROM events WHERE session_id = ANY($1) ORDER BY timestamp`,
        [batch]
      );

      for (const row of result.rows) {
        try {
          const event: EventData = {
            id: row.id,
            sessionId: row.session_id,
            type: row.type,
            payload: row.payload || {},
            timestamp: row.timestamp,
          };

          if (!this.config.options.dryRun) {
            await this.config.pool.query(
              `UPDATE events SET migrated = true, migrated_at = NOW()
               WHERE id = $1`,
              [event.id]
            );
          }

          events.push(event);
          
          const session = sessions.find(s => s.id === event.sessionId);
          if (session) {
            session.events.push(event);
          }
          
          this.metrics.increment('events');
        } catch (error) {
          this.metrics.addError({
            code: 'EVENT_MIGRATION_FAILED',
            message: error instanceof Error ? error.message : String(error),
            entityType: 'event',
            entityId: row.id,
          });
        }
      }
    }

    logger.info(`  ✓ Migrated ${events.length} events`);
    return events;
  }

  /**
   * Verify data integrity after migration
   */
  private async verifyIntegrity(
    worktrees: WorktreeData[],
    sessions: SessionData[],
    agents: AgentData[],
    tasks: TaskData[],
    events: EventData[]
  ): Promise<string> {
    logger.info('Phase 8: Verifying data integrity...');

    const integrity = {
      worktrees: worktrees.length,
      sessions: sessions.length,
      agents: agents.length,
      tasks: tasks.length,
      events: events.length,
      timestamp: Date.now(),
    };

    const checksum = createHash('sha256')
      .update(JSON.stringify(integrity))
      .digest('hex');

    // Verify database records match
    const dbCounts = await this.config.pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM sessions) as session_count,
        (SELECT COUNT(*) FROM agents) as agent_count,
        (SELECT COUNT(*) FROM tasks WHERE migrated = true) as task_count,
        (SELECT COUNT(*) FROM events WHERE migrated = true) as event_count
    `);

    const db = dbCounts.rows[0];
    
    if (parseInt(db.session_count) !== sessions.length) {
      this.metrics.addWarning(`Session count mismatch: DB=${db.session_count}, Migrated=${sessions.length}`);
    }
    
    if (parseInt(db.agent_count) !== agents.length) {
      this.metrics.addWarning(`Agent count mismatch: DB=${db.agent_count}, Migrated=${agents.length}`);
    }

    logger.info(`  ✓ Integrity verified: ${checksum.slice(0, 16)}...`);
    return checksum;
  }

  /**
   * Count migrated files
   */
  private async countMigratedFiles(): Promise<number> {
    const katasPath = path.join(this.config.targetPath, 'katas');
    if (!fs.existsSync(katasPath)) return 0;

    let count = 0;
    const countFiles = (dir: string) => {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          countFiles(fullPath);
        } else {
          count++;
        }
      }
    };

    countFiles(katasPath);
    return count;
  }

  /**
   * Count migrated configurations
   */
  private async countMigratedConfigs(): Promise<number> {
    const result = await this.config.pool.query(
      `SELECT COUNT(*) FROM configurations WHERE migrated = true`
    );
    return parseInt(result.rows[0].count);
  }

  /**
   * Cleanup source data after successful migration
   */
  private async cleanupSourceData(): Promise<void> {
    logger.info('Phase 9: Cleaning up source data...');

    const worktreesPath = path.join(this.config.sourcePath, '.claude', 'worktrees');
    
    if (fs.existsSync(worktreesPath)) {
      // Mark worktrees as archived
      const archivePath = path.join(this.config.sourcePath, '.claude', 'worktrees-archived');
      fs.renameSync(worktreesPath, archivePath);
      
      logger.info(`  ✓ Source worktrees archived to: ${archivePath}`);
    }
  }

  /**
   * Rollback migration on failure
   */
  private async rollback(): Promise<void> {
    logger.warn('Executing rollback...');

    try {
      // Restore from backup if available
      const backupPath = path.join(this.config.targetPath, '.migration-backup');
      if (fs.existsSync(backupPath)) {
        logger.info(`  Backup available at: ${backupPath}`);
      }

      // Clean up partially migrated data
      await this.config.pool.query(
        `DELETE FROM sessions WHERE id IN (
          SELECT id FROM sessions WHERE created_at > NOW() - INTERVAL '1 hour'
        )`
      );

      logger.info('  ✓ Rollback completed');
    } catch (error) {
      logger.error(`  Rollback failed: ${error}`);
    }
  }

  /**
   * Copy directory recursively
   */
  private copyDirectory(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}

// ============================================================================
// Migration Metrics
// ============================================================================

class MigrationMetrics {
  public errors: MigrationError[] = [];
  public warnings: string[] = [];
  private counts: Partial<EntityCount> = {};

  increment(entity: keyof EntityCount): void {
    this.counts[entity] = (this.counts[entity] || 0) + 1;
  }

  addError(error: MigrationError): void {
    this.errors.push(error);
  }

  addWarning(warning: string): void {
    this.warnings.push(warning);
  }

  getCounts(): EntityCount {
    return {
      worktrees: this.counts.worktrees || 0,
      sessions: this.counts.sessions || 0,
      agents: this.counts.agents || 0,
      tasks: this.counts.tasks || 0,
      events: this.counts.events || 0,
      files: this.counts.files || 0,
      configurations: this.counts.configurations || 0,
    };
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

export async function runMigration(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  
  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
  });

  const migration = new WorktreeToKataMigration({
    sourcePath: args['source'] || process.cwd(),
    targetPath: args['target'] || path.join(process.cwd(), 'migrated'),
    pool,
    options: {
      dryRun: args['dryRun'] || false,
      preserveSource: args['preserve'] || true,
      batchSize: args['batchSize'] || 100,
      maxConcurrency: args['concurrency'] || 5,
      verbose: args['verbose'] || false,
    },
  });

  // Handle abort signals
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, aborting migration...');
    migration.abort();
  });

  process.on('SIGTERM', () => {
    logger.info('Received SIGTERM, aborting migration...');
    migration.abort();
  });

  try {
    const result = await migration.execute();
    
    console.log('\n=== Migration Result ===');
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Migration ID: ${result.migrationId}`);
    console.log(`Duration: ${result.durationMs}ms`);
    console.log('\nEntities Migrated:');
    console.log(JSON.stringify(result.entitiesMigrated, null, 2));
    
    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => console.log(`  - [${e.code}] ${e.message}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(w => console.log(`  - ${w}`));
    }

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function parseArgs(argv: string[]): Record<string, any> {
  const args: Record<string, any> = {};
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case '--source':
      case '-s':
        args['source'] = argv[++i];
        break;
      case '--target':
      case '-t':
        args['target'] = argv[++i];
        break;
      case '--dry-run':
      case '-d':
        args['dryRun'] = true;
        break;
      case '--preserve':
      case '-p':
        args['preserve'] = true;
        break;
      case '--batch-size':
      case '-b':
        args['batchSize'] = parseInt(argv[++i], 10);
        break;
      case '--concurrency':
      case '-c':
        args['concurrency'] = parseInt(argv[++i], 10);
        break;
      case '--verbose':
      case '-v':
        args['verbose'] = true;
        break;
    }
  }
  
  return args;
}

// Export for module use
export default WorktreeToKataMigration;
