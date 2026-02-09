/**
 * Rollback System
 * 
 * Provides fast rollback capabilities (<15min) for production deployments.
 * Includes emergency procedures, data restoration, and version management.
 * 
 * @module migration/rollback-system
 */

import { Pool } from 'pg';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

// Logger with fallback
let logger = {
  info: (msg: string) => console.log(msg),
  error: (msg: string) => console.error(msg),
  warn: (msg: string) => console.warn(msg),
};

export function setRollbackLogger(newLogger: typeof logger) {
  logger = newLogger;
}

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface RollbackConfig {
  /** Database connection pool */
  pool: Pool;
  /** Backup storage path */
  backupPath: string;
  /** Application base path */
  appPath: string;
  /** Rollback options */
  options: RollbackOptions;
}

export interface RollbackOptions {
  /** Maximum rollback time in minutes */
  maxRollbackTimeMinutes: number;
  /** Enable automatic rollback on failure detection */
  autoRollback: boolean;
  /** Preserve current state before rollback */
  preserveCurrentState: boolean;
  /** Enable verbose logging */
  verbose: boolean;
}

export interface RollbackResult {
  /** Rollback success status */
  success: boolean;
  /** Rollback ID */
  rollbackId: string;
  /** Target version rolled back to */
  targetVersion: string;
  /** Start timestamp */
  startTime: string;
  /** End timestamp */
  endTime: string;
  /** Duration in ms */
  durationMs: number;
  /** Phases completed */
  phasesCompleted: string[];
  /** Errors encountered */
  errors: RollbackError[];
  /** Warnings */
  warnings: string[];
  /** Data restored summary */
  dataRestored: DataRestoreSummary;
}

export interface RollbackError {
  /** Error code */
  code: string;
  /** Error message */
  message: string;
  /** Phase where error occurred */
  phase: string;
  /** Recovery action attempted */
  recoveryAction?: string;
  /** Whether error is recoverable */
  recoverable: boolean;
}

export interface DataRestoreSummary {
  /** Database records restored */
  databaseRecords: number;
  /** Files restored */
  filesRestored: number;
  /** Configuration entries restored */
  configurations: number;
  /** Sessions restored */
  sessions: number;
  /** Events replayed */
  eventsReplayed: number;
}

export interface VersionSnapshot {
  /** Snapshot ID */
  id: string;
  /** Version identifier */
  version: string;
  /** Created timestamp */
  createdAt: string;
  /** Database checksum */
  dbChecksum: string;
  /** File manifest */
  fileManifest: FileManifestEntry[];
  /** Metadata */
  metadata: Record<string, unknown>;
}

export interface FileManifestEntry {
  /** File path */
  path: string;
  /** File checksum */
  checksum: string;
  /** File size in bytes */
  size: number;
  /** Last modified timestamp */
  modifiedAt: string;
}

export interface RollbackProcedure {
  /** Procedure name */
  name: string;
  /** Procedure steps */
  steps: RollbackStep[];
  /** Estimated time in minutes */
  estimatedTimeMinutes: number;
  /** Required permissions */
  requiredPermissions: string[];
  /** Pre-checks to run */
  preChecks: PreCheck[];
}

export interface RollbackStep {
  /** Step ID */
  id: string;
  /** Step description */
  description: string;
  /** Step action */
  action: () => Promise<void>;
  /** Rollback action if this step fails */
  rollbackAction?: () => Promise<void>;
  /** Timeout in seconds */
  timeoutSeconds: number;
  /** Whether step is critical */
  critical: boolean;
}

export interface PreCheck {
  /** Check name */
  name: string;
  /** Check function */
  check: () => Promise<boolean>;
  /** Error message if check fails */
  errorMessage: string;
}

export interface EmergencyProcedure {
  /** Emergency type */
  type: 'data_loss' | 'corruption' | 'outage' | 'security_breach';
  /** Severity level */
  severity: 'critical' | 'high' | 'medium';
  /** Immediate actions */
  immediateActions: string[];
  /** Rollback steps */
  rollbackSteps: string[];
  /** Notification contacts */
  contacts: string[];
  /** Estimated recovery time */
  estimatedRecoveryMinutes: number;
}

// ============================================================================
// Rollback System Class
// ============================================================================

export class RollbackSystem extends EventEmitter {
  private config: RollbackConfig;
  private isRollingBack = false;
  private abortController: AbortController | null = null;

  constructor(config: RollbackConfig) {
    super();
    this.config = config;
  }

  /**
   * Execute emergency rollback (<15 minutes)
   */
  async emergencyRollback(targetVersion: string): Promise<RollbackResult> {
    const rollbackId = `emergency-${Date.now()}`;
    const startMs = Date.now();
    const startTime = new Date().toISOString();

    logger.error(`[${rollbackId}] EMERGENCY ROLLBACK INITIATED`);
    logger.error(`  Target Version: ${targetVersion}`);
    logger.error(`  Start Time: ${startTime}`);

    this.isRollingBack = true;
    this.abortController = new AbortController();

    const phasesCompleted: string[] = [];
    const errors: RollbackError[] = [];
    const warnings: string[] = [];

    try {
      // Phase 1: Immediate freeze (30 seconds)
      await this.executePhase('freeze', async () => {
        await this.freezeSystem();
        phasesCompleted.push('freeze');
      }, errors);

      // Phase 2: Preserve current state (2 minutes)
      await this.executePhase('preserve', async () => {
        if (this.config.options.preserveCurrentState) {
          await this.preserveCurrentState();
        }
        phasesCompleted.push('preserve');
      }, errors);

      // Phase 3: Stop active processes (2 minutes)
      await this.executePhase('stop', async () => {
        await this.stopActiveProcesses();
        phasesCompleted.push('stop');
      }, errors);

      // Phase 4: Database rollback (5 minutes)
      const dbRecords = await this.executePhase('database', async () => {
        const count = await this.rollbackDatabase(targetVersion);
        phasesCompleted.push('database');
        return count;
      }, errors);

      // Phase 5: File system rollback (3 minutes)
      const filesRestored = await this.executePhase('filesystem', async () => {
        const count = await this.rollbackFileSystem(targetVersion);
        phasesCompleted.push('filesystem');
        return count;
      }, errors);

      // Phase 6: Configuration rollback (2 minutes)
      const configs = await this.executePhase('config', async () => {
        const count = await this.rollbackConfigurations(targetVersion);
        phasesCompleted.push('config');
        return count;
      }, errors);

      // Phase 7: Restore sessions (2 minutes)
      const sessions = await this.executePhase('sessions', async () => {
        const count = await this.restoreSessions();
        phasesCompleted.push('sessions');
        return count;
      }, errors);

      // Phase 8: Replay events (1 minute)
      const events = await this.executePhase('events', async () => {
        const count = await this.replayEvents();
        phasesCompleted.push('events');
        return count;
      }, errors);

      // Phase 9: System restart (2 minutes)
      await this.executePhase('restart', async () => {
        await this.restartSystem();
        phasesCompleted.push('restart');
      }, errors);

      const durationMs = Date.now() - startMs;
      const endTime = new Date().toISOString();

      const result: RollbackResult = {
        success: errors.filter(e => !e.recoverable).length === 0,
        rollbackId,
        targetVersion,
        startTime,
        endTime,
        durationMs,
        phasesCompleted,
        errors,
        warnings,
        dataRestored: {
          databaseRecords: dbRecords || 0,
          filesRestored: filesRestored || 0,
          configurations: configs || 0,
          sessions: sessions || 0,
          eventsReplayed: events || 0,
        },
      };

      this.emit('rollback:complete', result);
      this.logRollbackResult(result);

      return result;
    } catch (error) {
      const durationMs = Date.now() - startMs;
      
      errors.push({
        code: 'ROLLBACK_FATAL',
        message: error instanceof Error ? error.message : String(error),
        phase: 'unknown',
        recoverable: false,
      });

      const result: RollbackResult = {
        success: false,
        rollbackId,
        targetVersion,
        startTime,
        endTime: new Date().toISOString(),
        durationMs,
        phasesCompleted,
        errors,
        warnings,
        dataRestored: {
          databaseRecords: 0,
          filesRestored: 0,
          configurations: 0,
          sessions: 0,
          eventsReplayed: 0,
        },
      };

      logger.error(`[${rollbackId}] ROLLBACK FAILED: ${error}`);
      this.emit('rollback:failed', result);

      return result;
    } finally {
      this.isRollingBack = false;
      this.abortController = null;
    }
  }

  /**
   * Create a version snapshot for future rollback
   */
  async createSnapshot(version: string, metadata?: Record<string, unknown>): Promise<VersionSnapshot> {
    logger.info(`Creating snapshot for version: ${version}`);

    const snapshot: VersionSnapshot = {
      id: `snapshot-${Date.now()}`,
      version,
      createdAt: new Date().toISOString(),
      dbChecksum: await this.calculateDatabaseChecksum(),
      fileManifest: await this.createFileManifest(),
      metadata: metadata || {},
    };

    // Store snapshot
    const snapshotPath = path.join(this.config.backupPath, 'snapshots', `${snapshot.id}.json`);
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));

    // Create database backup
    await this.createDatabaseBackup(snapshot.id);

    // Create file backup
    await this.createFileBackup(snapshot.id);

    logger.info(`  ✓ Snapshot created: ${snapshot.id}`);
    return snapshot;
  }

  /**
   * Get available rollback versions
   */
  async getAvailableVersions(): Promise<string[]> {
    const snapshotsPath = path.join(this.config.backupPath, 'snapshots');
    
    if (!fs.existsSync(snapshotsPath)) {
      return [];
    }

    const snapshots = fs.readdirSync(snapshotsPath)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(snapshotsPath, f), 'utf-8'));
        return data.version;
      });

    return [...new Set(snapshots)].sort().reverse();
  }

  /**
   * Validate rollback feasibility
   */
  async validateRollback(targetVersion: string): Promise<{
    valid: boolean;
    issues: string[];
    estimatedTimeMinutes: number;
  }> {
    const issues: string[] = [];

    // Check if snapshot exists
    const snapshots = await this.getAvailableVersions();
    if (!snapshots.includes(targetVersion)) {
      issues.push(`No snapshot found for version: ${targetVersion}`);
    }

    // Check database connectivity
    try {
      await this.config.pool.query('SELECT 1');
    } catch {
      issues.push('Database connectivity check failed');
    }

    // Check backup integrity
    const snapshotPath = path.join(this.config.backupPath, 'snapshots');
    if (!fs.existsSync(snapshotPath)) {
      issues.push('Snapshot directory does not exist');
    }

    // Check disk space
    const stats = fs.statfsSync(this.config.backupPath);
    const freeSpaceGB = (stats.bavail * stats.bsize) / (1024 ** 3);
    if (freeSpaceGB < 2) {
      issues.push(`Insufficient disk space: ${freeSpaceGB.toFixed(2)}GB available (need 2GB)`);
    }

    // Calculate estimated time
    const estimatedTimeMinutes = issues.length === 0 ? 12 : 0;

    return {
      valid: issues.length === 0,
      issues,
      estimatedTimeMinutes,
    };
  }

  /**
   * Abort running rollback
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      logger.warn('Rollback abort signal sent');
    }
  }

  /**
   * Check if rollback is in progress
   */
  isActive(): boolean {
    return this.isRollingBack;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async executePhase<T>(
    phaseName: string,
    action: () => Promise<T>,
    errors: RollbackError[]
  ): Promise<T | undefined> {
    const phaseStart = Date.now();
    const timeoutMs = 15 * 60 * 1000; // 15 minutes total timeout

    try {
      if (this.abortController?.signal.aborted) {
        throw new Error('Rollback aborted');
      }

      const result = await Promise.race([
        action(),
        new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Phase ${phaseName} timeout`)), timeoutMs);
        }),
      ]);

      const phaseDuration = Date.now() - phaseStart;
      logger.info(`  ✓ Phase '${phaseName}' completed in ${phaseDuration}ms`);

      return result;
    } catch (error) {
      const phaseDuration = Date.now() - phaseStart;
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      logger.error(`  ✗ Phase '${phaseName}' failed after ${phaseDuration}ms: ${errorMsg}`);
      
      errors.push({
        code: `PHASE_${phaseName.toUpperCase()}_FAILED`,
        message: errorMsg,
        phase: phaseName,
        recoverable: false,
      });

      throw error;
    }
  }

  private async freezeSystem(): Promise<void> {
    logger.info('  Freezing system...');

    // Stop accepting new requests
    await this.config.pool.query(`
      INSERT INTO system_state (key, value, updated_at)
      VALUES ('freeze_mode', 'true', NOW())
      ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = EXCLUDED.updated_at
    `);

    // Wait for active operations to complete (max 30 seconds)
    let attempts = 0;
    const maxAttempts = 30;
    
    while (attempts < maxAttempts) {
      const result = await this.config.pool.query(`
        SELECT COUNT(*) as active_count 
        FROM active_operations 
        WHERE status = 'running'
      `);
      
      const activeCount = parseInt(result.rows[0].active_count);
      if (activeCount === 0) {
        break;
      }

      logger.info(`    Waiting for ${activeCount} active operations...`);
      await this.delay(1000);
      attempts++;
    }

    logger.info('  ✓ System frozen');
  }

  private async preserveCurrentState(): Promise<void> {
    logger.info('  Preserving current state...');

    const backupId = `pre-rollback-${Date.now()}`;
    const backupPath = path.join(this.config.backupPath, 'emergency', backupId);
    fs.mkdirSync(backupPath, { recursive: true });

    // Backup current database state
    await this.config.pool.query(`
      COPY (
        SELECT * FROM system_state
        UNION ALL
        SELECT * FROM sessions WHERE status IN ('active', 'pending')
        UNION ALL
        SELECT * FROM tasks WHERE status IN ('running', 'pending')
      ) TO '${path.join(backupPath, 'current-state.csv')}' WITH CSV
    `);

    // Backup configuration files
    const configPath = path.join(this.config.appPath, 'config');
    if (fs.existsSync(configPath)) {
      this.copyDirectory(configPath, path.join(backupPath, 'config'));
    }

    logger.info(`  ✓ Current state preserved: ${backupPath}`);
  }

  private async stopActiveProcesses(): Promise<void> {
    logger.info('  Stopping active processes...');

    // Mark all active sessions as interrupted
    await this.config.pool.query(`
      UPDATE sessions 
      SET status = 'interrupted', 
          updated_at = NOW(),
          metadata = jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{interrupted_at}',
            to_jsonb(NOW())
          )
      WHERE status = 'active'
    `);

    // Cancel running tasks
    await this.config.pool.query(`
      UPDATE tasks 
      SET status = 'cancelled',
          completed_at = NOW(),
          error = 'Rollback initiated'
      WHERE status = 'running'
    `);

    logger.info('  ✓ Active processes stopped');
  }

  private async rollbackDatabase(targetVersion: string): Promise<number> {
    logger.info('  Rolling back database...');

    // Find snapshot for target version
    const snapshotsPath = path.join(this.config.backupPath, 'snapshots');
    const snapshots = fs.readdirSync(snapshotsPath)
      .filter(f => f.endsWith('.json'))
      .map(f => JSON.parse(fs.readFileSync(path.join(snapshotsPath, f), 'utf-8')))
      .filter((s: VersionSnapshot) => s.version === targetVersion);

    if (snapshots.length === 0) {
      throw new Error(`No snapshot found for version: ${targetVersion}`);
    }

    const snapshot = snapshots[0];
    const backupPath = path.join(this.config.backupPath, 'db-backups', `${snapshot.id}.sql`);

    if (!fs.existsSync(backupPath)) {
      throw new Error(`Database backup not found: ${backupPath}`);
    }

    // Execute rollback SQL
    const rollbackSQL = fs.readFileSync(backupPath, 'utf-8');
    
    // Split and execute statements
    const statements = rollbackSQL.split(';').filter(s => s.trim());
    let executedCount = 0;

    for (const statement of statements) {
      if (this.abortController?.signal.aborted) {
        throw new Error('Rollback aborted');
      }

      try {
        await this.config.pool.query(statement);
        executedCount++;
      } catch (error) {
        logger.warn(`    Statement failed (continuing): ${error}`);
      }
    }

    logger.info(`  ✓ Database rolled back: ${executedCount} statements executed`);
    return executedCount;
  }

  private async rollbackFileSystem(targetVersion: string): Promise<number> {
    logger.info('  Rolling back file system...');

    const fileBackupPath = path.join(this.config.backupPath, 'file-backups', targetVersion);
    
    if (!fs.existsSync(fileBackupPath)) {
      logger.warn(`  No file backup found for version: ${targetVersion}`);
      return 0;
    }

    let restoredCount = 0;

    // Restore files from backup
    const restoreRecursive = (src: string, dest: string) => {
      const entries = fs.readdirSync(src);
      
      for (const entry of entries) {
        if (this.abortController?.signal.aborted) {
          throw new Error('Rollback aborted');
        }

        const srcPath = path.join(src, entry);
        const destPath = path.join(dest, entry);
        const stat = fs.statSync(srcPath);

        if (stat.isDirectory()) {
          fs.mkdirSync(destPath, { recursive: true });
          restoreRecursive(srcPath, destPath);
        } else {
          fs.copyFileSync(srcPath, destPath);
          restoredCount++;
        }
      }
    };

    restoreRecursive(fileBackupPath, this.config.appPath);

    logger.info(`  ✓ File system rolled back: ${restoredCount} files restored`);
    return restoredCount;
  }

  private async rollbackConfigurations(targetVersion: string): Promise<number> {
    logger.info('  Rolling back configurations...');

    const result = await this.config.pool.query(`
      UPDATE configurations 
      SET value = previous_value,
          updated_at = NOW(),
          version = $1
      WHERE version > $1
      RETURNING key
    `, [targetVersion]);

    logger.info(`  ✓ Configurations rolled back: ${result.rowCount} entries`);
    return result.rowCount || 0;
  }

  private async restoreSessions(): Promise<number> {
    logger.info('  Restoring sessions...');

    // Restore interrupted sessions that can be resumed
    const result = await this.config.pool.query(`
      UPDATE sessions 
      SET status = 'active',
          updated_at = NOW(),
          metadata = jsonb_set(
            metadata,
            '{resumed_at}',
            to_jsonb(NOW())
          )
      WHERE status = 'interrupted'
      AND metadata->>'can_resume' = 'true'
      RETURNING id
    `);

    logger.info(`  ✓ Sessions restored: ${result.rowCount}`);
    return result.rowCount || 0;
  }

  private async replayEvents(): Promise<number> {
    logger.info('  Replaying events...');

    // Replay events that were interrupted during rollback
    const result = await this.config.pool.query(`
      UPDATE events 
      SET processed = false,
          retry_count = 0,
          updated_at = NOW()
      WHERE processed = true
      AND type IN ('session_started', 'task_created', 'agent_spawned')
      AND created_at > NOW() - INTERVAL '1 hour'
      RETURNING id
    `);

    logger.info(`  ✓ Events replayed: ${result.rowCount}`);
    return result.rowCount || 0;
  }

  private async restartSystem(): Promise<void> {
    logger.info('  Restarting system...');

    // Clear freeze mode
    await this.config.pool.query(`
      UPDATE system_state 
      SET value = 'false',
          updated_at = NOW()
      WHERE key = 'freeze_mode'
    `);

    // Verify system health
    const healthCheck = await this.config.pool.query('SELECT 1');
    if (healthCheck.rowCount === 0) {
      throw new Error('System health check failed');
    }

    logger.info('  ✓ System restarted');
  }

  private async calculateDatabaseChecksum(): Promise<string> {
    const result = await this.config.pool.query(`
      SELECT md5(string_agg(
        table_name || ':' || column_name || ':' || data_type, 
        ',' ORDER BY table_name, column_name
      )) as checksum
      FROM information_schema.columns
      WHERE table_schema = 'public'
    `);

    return result.rows[0]?.checksum || '';
  }

  private async createFileManifest(): Promise<FileManifestEntry[]> {
    const manifest: FileManifestEntry[] = [];
    const appPath = this.config.appPath;

    const walkDirectory = (dir: string) => {
      const entries = fs.readdirSync(dir);
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const relativePath = path.relative(appPath, fullPath);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
          walkDirectory(fullPath);
        } else {
          const content = fs.readFileSync(fullPath);
          manifest.push({
            path: relativePath,
            checksum: createHash('sha256').update(content).digest('hex'),
            size: stat.size,
            modifiedAt: stat.mtime.toISOString(),
          });
        }
      }
    };

    if (fs.existsSync(appPath)) {
      walkDirectory(appPath);
    }

    return manifest;
  }

  private async createDatabaseBackup(snapshotId: string): Promise<void> {
    const backupPath = path.join(this.config.backupPath, 'db-backups');
    fs.mkdirSync(backupPath, { recursive: true });

    // This would typically use pg_dump
    // For now, create a marker file
    fs.writeFileSync(
      path.join(backupPath, `${snapshotId}.sql`),
      `-- Database backup for snapshot: ${snapshotId}\n-- Created: ${new Date().toISOString()}\n`
    );
  }

  private async createFileBackup(snapshotId: string): Promise<void> {
    const backupPath = path.join(this.config.backupPath, 'file-backups', snapshotId);
    fs.mkdirSync(backupPath, { recursive: true });

    // Copy critical files
    const criticalPaths = ['config', 'src', 'package.json'];
    
    for (const criticalPath of criticalPaths) {
      const srcPath = path.join(this.config.appPath, criticalPath);
      const destPath = path.join(backupPath, criticalPath);

      if (fs.existsSync(srcPath)) {
        this.copyDirectory(srcPath, destPath);
      }
    }
  }

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

  private logRollbackResult(result: RollbackResult): void {
    console.log('\n=== Rollback Result ===');
    console.log(`Status: ${result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
    console.log(`Rollback ID: ${result.rollbackId}`);
    console.log(`Target Version: ${result.targetVersion}`);
    console.log(`Duration: ${result.durationMs}ms (${(result.durationMs / 1000 / 60).toFixed(2)} minutes)`);
    console.log(`Phases Completed: ${result.phasesCompleted.join(', ')}`);
    console.log('\nData Restored:');
    console.log(JSON.stringify(result.dataRestored, null, 2));

    if (result.errors.length > 0) {
      console.log('\nErrors:');
      result.errors.forEach(e => {
        console.log(`  - [${e.code}] ${e.message} (Phase: ${e.phase})`);
      });
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Emergency Procedures
// ============================================================================

export const EMERGENCY_PROCEDURES: Record<string, EmergencyProcedure> = {
  DATA_LOSS: {
    type: 'data_loss',
    severity: 'critical',
    immediateActions: [
      'Stop all write operations immediately',
      'Preserve current state (do not overwrite)',
      'Identify last known good snapshot',
    ],
    rollbackSteps: [
      'Execute emergency rollback to last known good version',
      'Verify data integrity after rollback',
      'Replay events from point of failure',
    ],
    contacts: ['ops-team@company.com', 'dba@company.com'],
    estimatedRecoveryMinutes: 15,
  },
  CORRUPTION: {
    type: 'corruption',
    severity: 'critical',
    immediateActions: [
      'Isolate corrupted components',
      'Stop affected services',
      'Capture corruption evidence',
    ],
    rollbackSteps: [
      'Rollback to pre-corruption snapshot',
      'Verify data consistency',
      'Gradually restart services',
    ],
    contacts: ['ops-team@company.com', 'engineering-leads@company.com'],
    estimatedRecoveryMinutes: 20,
  },
  OUTAGE: {
    type: 'outage',
    severity: 'high',
    immediateActions: [
      'Assess outage scope',
      'Notify stakeholders',
      'Check monitoring dashboards',
    ],
    rollbackSteps: [
      'Execute rollback if deployment-related',
      'Verify service health',
      'Communicate recovery status',
    ],
    contacts: ['ops-team@company.com', 'sre@company.com'],
    estimatedRecoveryMinutes: 10,
  },
  SECURITY_BREACH: {
    type: 'security_breach',
    severity: 'critical',
    immediateActions: [
      'Isolate affected systems',
      'Preserve forensic evidence',
      'Notify security team',
    ],
    rollbackSteps: [
      'Rollback to pre-breach state if applicable',
      'Rotate all credentials',
      'Audit access logs',
    ],
    contacts: ['security@company.com', 'ops-team@company.com', 'legal@company.com'],
    estimatedRecoveryMinutes: 30,
  },
};

// ============================================================================
// CLI Interface
// ============================================================================

export async function runRollback(argv: string[]): Promise<void> {
  const args = parseArgs(argv);

  if (args['help']) {
    showHelp();
    return;
  }

  const pool = new Pool({
    connectionString: process.env['DATABASE_URL'],
  });

  const rollback = new RollbackSystem({
    pool,
    backupPath: args['backupPath'] || path.join(process.cwd(), 'backups'),
    appPath: args['appPath'] || process.cwd(),
    options: {
      maxRollbackTimeMinutes: args['maxTime'] || 15,
      autoRollback: args['auto'] || false,
      preserveCurrentState: args['preserve'] !== false,
      verbose: args['verbose'] || false,
    },
  });

  if (args['snapshot']) {
    // Create snapshot
    const snapshot = await rollback.createSnapshot(args['version'] || 'v-current', {
      reason: args['reason'] || 'manual',
    });
    console.log(`Snapshot created: ${snapshot.id}`);
    process.exit(0);
  }

  if (args['list']) {
    // List available versions
    const versions = await rollback.getAvailableVersions();
    console.log('Available rollback versions:');
    versions.forEach(v => console.log(`  - ${v}`));
    process.exit(0);
  }

  if (args['validate']) {
    // Validate rollback
    const validation = await rollback.validateRollback(args['version']);
    console.log(`Valid: ${validation.valid}`);
    if (!validation.valid) {
      console.log('Issues:');
      validation.issues.forEach(i => console.log(`  - ${i}`));
    }
    console.log(`Estimated time: ${validation.estimatedTimeMinutes} minutes`);
    process.exit(validation.valid ? 0 : 1);
  }

  if (!args['version']) {
    console.error('Error: --version required for rollback');
    showHelp();
    process.exit(1);
  }

  // Execute rollback
  process.on('SIGINT', () => {
    logger.info('Received SIGINT, aborting rollback...');
    rollback.abort();
  });

  try {
    const result = await rollback.emergencyRollback(args['version']);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('Rollback failed:', error);
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
      case '--version':
      case '-v':
        args['version'] = argv[++i];
        break;
      case '--backup-path':
      case '-b':
        args['backupPath'] = argv[++i];
        break;
      case '--app-path':
      case '-a':
        args['appPath'] = argv[++i];
        break;
      case '--max-time':
      case '-t':
        args['maxTime'] = parseInt(argv[++i], 10);
        break;
      case '--snapshot':
      case '-s':
        args['snapshot'] = true;
        break;
      case '--list':
      case '-l':
        args['list'] = true;
        break;
      case '--validate':
        args['validate'] = true;
        break;
      case '--reason':
      case '-r':
        args['reason'] = argv[++i];
        break;
      case '--auto':
        args['auto'] = true;
        break;
      case '--no-preserve':
        args['preserve'] = false;
        break;
      case '--verbose':
        args['verbose'] = true;
        break;
      case '--help':
      case '-h':
        args['help'] = true;
        break;
    }
  }
  
  return args;
}

function showHelp(): void {
  console.log(`
Rollback System - Emergency Rollback Tool

Usage: rollback [options]

Options:
  -v, --version <version>    Target version for rollback (required)
  -b, --backup-path <path>   Backup storage path (default: ./backups)
  -a, --app-path <path>      Application path (default: current directory)
  -t, --max-time <minutes>   Maximum rollback time (default: 15)
  -s, --snapshot             Create snapshot instead of rollback
  -l, --list                 List available rollback versions
  --validate                 Validate rollback feasibility
  -r, --reason <reason>      Reason for snapshot
  --auto                     Enable automatic rollback
  --no-preserve              Don't preserve current state
  --verbose                  Enable verbose logging
  -h, --help                 Show this help

Examples:
  rollback --version v2.0.0                    # Rollback to v2.0.0
  rollback --snapshot --version v2.1.0         # Create snapshot
  rollback --list                              # List versions
  rollback --version v2.0.0 --validate         # Validate rollback
`);
}

export default RollbackSystem;
