/**
 * Checkpoint System - Periodic State Snapshots for Recovery
 * 
 * Provides:
 * - Periodic agent state snapshots
 * - PostgreSQL storage for checkpoints
 * - Restore from checkpoint on failure
 * - Configurable checkpoint intervals
 * - Automatic cleanup of old checkpoints
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { getPool, type PostgresPool } from '../storage/postgres/pool';
import type { PostgresConfig } from '../storage/postgres/config';

// ============================================================================
// Types
// ============================================================================

export interface Checkpoint {
  id: string;
  entityType: 'agent' | 'team' | 'session' | 'service';
  entityId: string;
  timestamp: Date;
  data: Record<string, unknown>;
  metadata?: {
    version?: number;
    reason?: string;
    tags?: string[];
    checksum?: string;
  };
}

export interface CheckpointConfig {
  /** Enable automatic checkpointing (default: true) */
  enabled: boolean;
  /** Interval between checkpoints in milliseconds (default: 30000) */
  intervalMs: number;
  /** Maximum number of checkpoints to keep per entity (default: 10) */
  maxCheckpointsPerEntity: number;
  /** Maximum age of checkpoints in hours before cleanup (default: 24) */
  maxAgeHours: number;
  /** Enable compression for checkpoint data (default: true) */
  compressionEnabled: boolean;
  /** PostgreSQL configuration */
  postgresConfig?: Partial<PostgresConfig>;
}

export interface CheckpointStats {
  totalCheckpoints: number;
  checkpointsByType: Record<string, number>;
  oldestCheckpoint: Date | null;
  newestCheckpoint: Date | null;
  storageSizeBytes: number;
}

export interface RestoreResult {
  success: boolean;
  checkpointId: string;
  entityId: string;
  timestamp: Date;
  data: Record<string, unknown>;
  error?: string;
}

export interface CheckpointProvider {
  getCheckpointData(): Promise<Record<string, unknown>>;
  restoreFromCheckpoint(data: Record<string, unknown>): Promise<boolean>;
  getEntityId(): string;
  getEntityType(): 'agent' | 'team' | 'session' | 'service';
}

// Database row types
interface CheckpointRow {
  checkpoint_id: string;
  entity_type: 'agent' | 'team' | 'session' | 'service';
  entity_id: string;
  timestamp: string;
  data: string | Record<string, unknown>;
  metadata: string | Record<string, unknown>;
  compression_enabled: boolean;
}

// ============================================================================
// Checkpoint Manager
// ============================================================================

export class CheckpointManager extends EventEmitter {
  private pool: PostgresPool | null = null;
  private config: CheckpointConfig;
  private checkpointIntervals: Map<string, NodeJS.Timeout> = new Map();
  private providers: Map<string, CheckpointProvider> = new Map();
  private isInitialized = false;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<CheckpointConfig> = {}) {
    super();
    this.config = {
      enabled: true,
      intervalMs: 30000, // 30 seconds
      maxCheckpointsPerEntity: 10,
      maxAgeHours: 24,
      compressionEnabled: true,
      ...config,
    };
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      this.pool = await getPool(this.config.postgresConfig);
      this.isInitialized = true;
      await this.createSchema();
      
      if (this.config.enabled) {
        this.startCleanupTask();
      }

      logger.info('[CheckpointManager] Initialized successfully');
      this.emit('initialized');
    } catch (error) {
      logger.error('[CheckpointManager] Initialization failed:', error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    // Stop all checkpoint intervals
    for (const [entityId, interval] of this.checkpointIntervals) {
      clearInterval(interval);
      logger.debug(`[CheckpointManager] Stopped checkpoint interval for ${entityId}`);
    }
    this.checkpointIntervals.clear();

    // Stop cleanup interval
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    this.isInitialized = false;
    logger.info('[CheckpointManager] Shutdown complete');
    this.emit('shutdown');
  }

  private async createSchema(): Promise<void> {
    this.ensureInitialized();

    await this.pool!.query(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id SERIAL PRIMARY KEY,
        checkpoint_id VARCHAR(64) UNIQUE NOT NULL,
        entity_type VARCHAR(32) NOT NULL,
        entity_id VARCHAR(128) NOT NULL,
        timestamp TIMESTAMPTZ DEFAULT NOW(),
        data JSONB NOT NULL,
        metadata JSONB DEFAULT '{}',
        compression_enabled BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Indexes for efficient queries
    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_entity 
      ON checkpoints(entity_id, timestamp DESC)
    `);

    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_type 
      ON checkpoints(entity_type, timestamp DESC)
    `);

    await this.pool!.query(`
      CREATE INDEX IF NOT EXISTS idx_checkpoints_timestamp 
      ON checkpoints(timestamp)
    `);

    logger.debug('[CheckpointManager] Database schema created');
  }

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.pool) {
      throw new Error('CheckpointManager not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // Checkpoint Creation
  // ============================================================================

  /**
   * Create a checkpoint for an entity
   */
  async createCheckpoint(
    entityType: Checkpoint['entityType'],
    entityId: string,
    data: Record<string, unknown>,
    metadata?: Checkpoint['metadata']
  ): Promise<Checkpoint> {
    this.ensureInitialized();

    const checkpointId = this.generateCheckpointId(entityId);
    const timestamp = new Date();

    try {
      await this.pool!.query(
        `INSERT INTO checkpoints 
         (checkpoint_id, entity_type, entity_id, timestamp, data, metadata, compression_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          checkpointId,
          entityType,
          entityId,
          timestamp,
          JSON.stringify(data),
          JSON.stringify(metadata || {}),
          this.config.compressionEnabled,
        ]
      );

      // Clean up old checkpoints for this entity
      await this.cleanupOldCheckpoints(entityId);

      const checkpoint: Checkpoint = {
        id: checkpointId,
        entityType,
        entityId,
        timestamp,
        data,
        metadata,
      };

      logger.debug(`[CheckpointManager] Created checkpoint ${checkpointId} for ${entityType}:${entityId}`);
      this.emit('checkpoint.created', checkpoint);

      return checkpoint;
    } catch (error) {
      logger.error(`[CheckpointManager] Failed to create checkpoint for ${entityId}:`, error);
      throw error;
    }
  }

  /**
   * Register a provider for automatic checkpointing
   */
  registerProvider(provider: CheckpointProvider): void {
    const entityId = provider.getEntityId();
    
    if (this.providers.has(entityId)) {
      logger.warn(`[CheckpointManager] Provider for ${entityId} already registered, replacing`);
      this.unregisterProvider(entityId);
    }

    this.providers.set(entityId, provider);

    if (this.config.enabled) {
      this.startAutoCheckpoint(entityId, provider);
    }

    logger.debug(`[CheckpointManager] Registered provider for ${entityId}`);
    this.emit('provider.registered', { entityId, type: provider.getEntityType() });
  }

  /**
   * Unregister a provider and stop automatic checkpointing
   */
  unregisterProvider(entityId: string): void {
    // Stop auto-checkpoint interval
    const interval = this.checkpointIntervals.get(entityId);
    if (interval) {
      clearInterval(interval);
      this.checkpointIntervals.delete(entityId);
    }

    this.providers.delete(entityId);
    logger.debug(`[CheckpointManager] Unregistered provider for ${entityId}`);
    this.emit('provider.unregistered', { entityId });
  }

  private startAutoCheckpoint(entityId: string, provider: CheckpointProvider): void {
    // Create immediate checkpoint
    this.createCheckpointFromProvider(provider).catch(error => {
      logger.error(`[CheckpointManager] Initial checkpoint failed for ${entityId}:`, error);
    });

    // Schedule periodic checkpoints
    const interval = setInterval(async () => {
      try {
        await this.createCheckpointFromProvider(provider);
      } catch (error) {
        logger.error(`[CheckpointManager] Auto checkpoint failed for ${entityId}:`, error);
      }
    }, this.config.intervalMs);

    this.checkpointIntervals.set(entityId, interval);
    logger.debug(`[CheckpointManager] Started auto-checkpoint for ${entityId} (interval: ${this.config.intervalMs}ms)`);
  }

  private async createCheckpointFromProvider(provider: CheckpointProvider): Promise<Checkpoint> {
    const data = await provider.getCheckpointData();
    return this.createCheckpoint(
      provider.getEntityType(),
      provider.getEntityId(),
      data,
      { version: 1, tags: ['auto'] }
    );
  }

  // ============================================================================
  // Checkpoint Retrieval
  // ============================================================================

  /**
   * Get the latest checkpoint for an entity
   */
  async getLatestCheckpoint(entityId: string): Promise<Checkpoint | null> {
    this.ensureInitialized();

    const result = await this.pool!.query<CheckpointRow>(
      `SELECT * FROM checkpoints 
       WHERE entity_id = $1 
       ORDER BY timestamp DESC 
       LIMIT 1`,
      [entityId]
    );

    if (result.rows.length === 0) return null;

    return this.mapRowToCheckpoint(result.rows[0]);
  }

  /**
   * Get all checkpoints for an entity
   */
  async getCheckpointsForEntity(
    entityId: string,
    options: { limit?: number; since?: Date } = {}
  ): Promise<Checkpoint[]> {
    this.ensureInitialized();

    let query = `SELECT * FROM checkpoints WHERE entity_id = $1`;
    const params: unknown[] = [entityId];
    let paramIndex = 2;

    if (options.since) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(options.since);
    }

    query += ` ORDER BY timestamp DESC`;

    if (options.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result = await this.pool!.query<CheckpointRow>(query, params);
    return result.rows.map((row: CheckpointRow) => this.mapRowToCheckpoint(row));
  }

  /**
   * Get checkpoints by type
   */
  async getCheckpointsByType(
    entityType: Checkpoint['entityType'],
    options: { limit?: number; since?: Date } = {}
  ): Promise<Checkpoint[]> {
    this.ensureInitialized();

    let query = `SELECT * FROM checkpoints WHERE entity_type = $1`;
    const params: unknown[] = [entityType];
    let paramIndex = 2;

    if (options.since) {
      query += ` AND timestamp >= $${paramIndex++}`;
      params.push(options.since);
    }

    query += ` ORDER BY timestamp DESC`;

    if (options.limit) {
      query += ` LIMIT $${paramIndex++}`;
      params.push(options.limit);
    }

    const result = await this.pool!.query<CheckpointRow>(query, params);
    return result.rows.map((row: CheckpointRow) => this.mapRowToCheckpoint(row));
  }

  /**
   * Get a specific checkpoint by ID
   */
  async getCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    this.ensureInitialized();

    const result = await this.pool!.query<CheckpointRow>(
      `SELECT * FROM checkpoints WHERE checkpoint_id = $1`,
      [checkpointId]
    );

    if (result.rows.length === 0) return null;

    return this.mapRowToCheckpoint(result.rows[0]);
  }

  // ============================================================================
  // Restore Operations
  // ============================================================================

  /**
   * Restore an entity from its latest checkpoint
   */
  async restoreFromLatestCheckpoint(entityId: string): Promise<RestoreResult> {
    const checkpoint = await this.getLatestCheckpoint(entityId);
    
    if (!checkpoint) {
      return {
        success: false,
        checkpointId: '',
        entityId,
        timestamp: new Date(),
        data: {},
        error: 'No checkpoint found for entity',
      };
    }

    return this.restoreFromCheckpoint(checkpoint);
  }

  /**
   * Restore from a specific checkpoint
   */
  async restoreFromCheckpoint(checkpoint: Checkpoint): Promise<RestoreResult> {
    const provider = this.providers.get(checkpoint.entityId);
    
    if (!provider) {
      return {
        success: false,
        checkpointId: checkpoint.id,
        entityId: checkpoint.entityId,
        timestamp: checkpoint.timestamp,
        data: checkpoint.data,
        error: 'No provider registered for entity - manual restore required',
      };
    }

    try {
      const success = await provider.restoreFromCheckpoint(checkpoint.data);
      
      const result: RestoreResult = {
        success,
        checkpointId: checkpoint.id,
        entityId: checkpoint.entityId,
        timestamp: checkpoint.timestamp,
        data: checkpoint.data,
      };

      if (success) {
        logger.info(`[CheckpointManager] Successfully restored ${checkpoint.entityId} from checkpoint ${checkpoint.id}`);
        this.emit('checkpoint.restored', result);
      } else {
        result.error = 'Provider restore returned false';
        logger.error(`[CheckpointManager] Restore failed for ${checkpoint.entityId}`);
        this.emit('checkpoint.restore_failed', result);
      }

      return result;
    } catch (error) {
      const result: RestoreResult = {
        success: false,
        checkpointId: checkpoint.id,
        entityId: checkpoint.entityId,
        timestamp: checkpoint.timestamp,
        data: checkpoint.data,
        error: error instanceof Error ? error.message : String(error),
      };

      logger.error(`[CheckpointManager] Restore error for ${checkpoint.entityId}:`, error);
      this.emit('checkpoint.restore_failed', result);
      return result;
    }
  }

  /**
   * Restore an entity to a specific checkpoint ID
   */
  async restoreToCheckpointId(checkpointId: string): Promise<RestoreResult> {
    const checkpoint = await this.getCheckpoint(checkpointId);
    
    if (!checkpoint) {
      return {
        success: false,
        checkpointId,
        entityId: '',
        timestamp: new Date(),
        data: {},
        error: 'Checkpoint not found',
      };
    }

    return this.restoreFromCheckpoint(checkpoint);
  }

  // ============================================================================
  // Cleanup Operations
  // ============================================================================

  private startCleanupTask(): void {
    // Run cleanup every hour
    this.cleanupInterval = setInterval(() => {
      this.performCleanup().catch(error => {
        logger.error('[CheckpointManager] Cleanup task failed:', error);
      });
    }, 60 * 60 * 1000);

    logger.debug('[CheckpointManager] Cleanup task started');
  }

  private async performCleanup(): Promise<void> {
    this.ensureInitialized();

    const cutoff = new Date(Date.now() - this.config.maxAgeHours * 60 * 60 * 1000);

    const result = await this.pool!.query(
      `DELETE FROM checkpoints WHERE timestamp < $1`,
      [cutoff]
    );

    if (result.rowCount > 0) {
      logger.info(`[CheckpointManager] Cleaned up ${result.rowCount} old checkpoints`);
      this.emit('cleanup.completed', { deleted: result.rowCount });
    }
  }

  private async cleanupOldCheckpoints(entityId: string): Promise<void> {
    this.ensureInitialized();

    // Keep only the most recent N checkpoints per entity
    const result = await this.pool!.query(
      `DELETE FROM checkpoints 
       WHERE entity_id = $1 
       AND id NOT IN (
         SELECT id FROM checkpoints 
         WHERE entity_id = $1 
         ORDER BY timestamp DESC 
         LIMIT $2
       )`,
      [entityId, this.config.maxCheckpointsPerEntity]
    );

    if (result.rowCount > 0) {
      logger.debug(`[CheckpointManager] Cleaned up ${result.rowCount} old checkpoints for ${entityId}`);
    }
  }

  /**
   * Manually trigger cleanup
   */
  async cleanup(maxAgeHours?: number): Promise<number> {
    this.ensureInitialized();

    const cutoff = new Date(Date.now() - (maxAgeHours || this.config.maxAgeHours) * 60 * 60 * 1000);

    const result = await this.pool!.query(
      `DELETE FROM checkpoints WHERE timestamp < $1`,
      [cutoff]
    );

    logger.info(`[CheckpointManager] Manual cleanup: ${result.rowCount} checkpoints deleted`);
    return result.rowCount;
  }

  /**
   * Delete all checkpoints for an entity
   */
  async deleteEntityCheckpoints(entityId: string): Promise<number> {
    this.ensureInitialized();

    const result = await this.pool!.query(
      `DELETE FROM checkpoints WHERE entity_id = $1`,
      [entityId]
    );

    logger.info(`[CheckpointManager] Deleted ${result.rowCount} checkpoints for ${entityId}`);
    return result.rowCount;
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  async getStats(): Promise<CheckpointStats> {
    this.ensureInitialized();

    interface CountRow {
      count: string;
    }

    interface TypeCountRow {
      entity_type: string;
      count: string;
    }

    interface TimestampRow {
      timestamp: string;
    }

    interface SizeRow {
      size: string;
    }

    const totalResult = await this.pool!.query<CountRow>(`SELECT COUNT(*) as count FROM checkpoints`);
    const totalCheckpoints = parseInt(totalResult.rows[0]?.count || '0', 10);

    const typeResult = await this.pool!.query<TypeCountRow>(
      `SELECT entity_type, COUNT(*) as count FROM checkpoints GROUP BY entity_type`
    );
    const checkpointsByType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      checkpointsByType[row.entity_type] = parseInt(row.count, 10);
    }

    const oldestResult = await this.pool!.query<TimestampRow>(
      `SELECT timestamp FROM checkpoints ORDER BY timestamp ASC LIMIT 1`
    );
    const oldestCheckpoint = oldestResult.rows.length > 0 
      ? new Date(oldestResult.rows[0].timestamp) 
      : null;

    const newestResult = await this.pool!.query<TimestampRow>(
      `SELECT timestamp FROM checkpoints ORDER BY timestamp DESC LIMIT 1`
    );
    const newestCheckpoint = newestResult.rows.length > 0 
      ? new Date(newestResult.rows[0].timestamp) 
      : null;

    // Estimate storage size (PostgreSQL doesn't give exact byte size easily)
    const sizeResult = await this.pool!.query<SizeRow>(
      `SELECT pg_total_relation_size('checkpoints') as size`
    );
    const storageSizeBytes = parseInt(sizeResult.rows[0]?.size || '0', 10);

    return {
      totalCheckpoints,
      checkpointsByType,
      oldestCheckpoint,
      newestCheckpoint,
      storageSizeBytes,
    };
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private generateCheckpointId(entityId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `chk_${entityId.substring(0, 16)}_${timestamp}_${random}`;
  }

  private mapRowToCheckpoint(row: CheckpointRow): Checkpoint {
    return {
      id: row.checkpoint_id,
      entityType: row.entity_type,
      entityId: row.entity_id,
      timestamp: new Date(row.timestamp),
      data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<CheckpointConfig>): void {
    const oldEnabled = this.config.enabled;
    const oldInterval = this.config.intervalMs;

    this.config = { ...this.config, ...newConfig };

    // Restart intervals if enabled status or interval changed
    if (oldEnabled !== this.config.enabled || oldInterval !== this.config.intervalMs) {
      for (const [entityId, provider] of this.providers) {
        this.unregisterProvider(entityId);
        if (this.config.enabled) {
          this.registerProvider(provider);
        }
      }
    }

    logger.info('[CheckpointManager] Configuration updated');
  }

  getConfig(): CheckpointConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton
// ============================================================================

let globalCheckpointManager: CheckpointManager | null = null;

export function getGlobalCheckpointManager(config?: Partial<CheckpointConfig>): CheckpointManager {
  if (!globalCheckpointManager) {
    globalCheckpointManager = new CheckpointManager(config);
  }
  return globalCheckpointManager;
}

export function resetGlobalCheckpointManager(): void {
  globalCheckpointManager?.shutdown().catch((error) => {
    logger.error('recovery', 'Failed to shut down checkpoint manager', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
  globalCheckpointManager = null;
}

export default CheckpointManager;
