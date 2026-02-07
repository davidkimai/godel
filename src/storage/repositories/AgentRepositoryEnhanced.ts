/**
 * Enhanced Agent Repository - With Optimistic Locking
 * 
 * Extends the base AgentRepository with:
 * - Optimistic locking for concurrent updates
 * - Transactional batch operations
 * - Race-condition-safe status transitions
 */

import { PostgresPool } from '../postgres/pool';
import { TransactionManager, OptimisticLockError, TransactionOptions } from '../transaction';
import {
  AgentRepository,
  Agent,
  AgentCreateInput,
  AgentUpdateInput,
  AgentFilter,
  AgentStatus,
  LifecycleState,
} from './AgentRepository';
import { logger } from '../../utils/logger';

export interface AgentWithVersion extends Agent {
  version: number;
}

export interface AgentStatusTransition {
  from: AgentStatus | AgentStatus[];
  to: AgentStatus;
  validate?: (agent: Agent) => boolean | Promise<boolean>;
}

// Valid status transitions to prevent invalid state changes
const VALID_STATUS_TRANSITIONS: Record<AgentStatus, AgentStatus[]> = {
  pending: ['running', 'failed', 'killed'],
  running: ['paused', 'completed', 'failed', 'killed'],
  paused: ['running', 'failed', 'killed'],
  completed: [], // Terminal state
  failed: ['running', 'pending'], // Allow retry
  blocked: ['running', 'failed', 'killed'],
  killed: [], // Terminal state
};

export class AgentRepositoryEnhanced extends AgentRepository {
  private txManager: TransactionManager | null = null;

  /**
   * Initialize with transaction manager
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    // Get pool from parent and create transaction manager
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (pool) {
      // We need to access the underlying pg Pool
      // This is a workaround since PostgresPool wraps pg-pool
      this.txManager = new TransactionManager(pool as unknown as import('pg').Pool);
    }
  }

  /**
   * Find an agent with version for optimistic locking
   */
  async findByIdWithVersion(id: string): Promise<AgentWithVersion | null> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const result = await pool.query<AgentWithVersion & { version: number }>(
      `SELECT *, COALESCE(version, 0) as version FROM agents WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update an agent with optimistic locking
   * Prevents lost updates when multiple processes modify the same agent
   */
  async updateWithLock(
    id: string,
    updates: AgentUpdateInput,
    expectedVersion: number,
    options?: TransactionOptions
  ): Promise<AgentWithVersion> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');

    return this.txManager.withTransaction(async (client, context) => {
      // First verify the agent exists and get current version
      const currentResult = await client.query(
        `SELECT status, COALESCE(version, 0) as version FROM agents WHERE id = $1`,
        [id]
      );

      if (currentResult.rowCount === 0) {
        throw new Error(`Agent ${id} not found`);
      }

      const currentVersion = currentResult.rows[0].version as number;
      
      if (currentVersion !== expectedVersion) {
        throw new OptimisticLockError(
          `Agent ${id} was modified by another transaction. ` +
          `Expected version ${expectedVersion}, found ${currentVersion}`,
          'agents',
          id,
          expectedVersion,
          currentVersion
        );
      }

      // Validate status transition if status is being updated
      if (updates.status) {
        const currentStatus = currentResult.rows[0].status as AgentStatus;
        this.validateStatusTransition(currentStatus, updates.status);
      }

      // Build update query
      const updateClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const jsonFields = ['config', 'context', 'code', 'reasoning', 'safety_boundaries', 'metadata'];
      
      for (const [key, value] of Object.entries(updates)) {
        if (value !== undefined && key !== 'version') {
          updateClauses.push(`${key} = $${paramIndex++}`);
          if (jsonFields.includes(key)) {
            values.push(JSON.stringify(value));
          } else if (value instanceof Date) {
            values.push(value.toISOString());
          } else {
            values.push(value);
          }
        }
      }

      // Always increment version and update updated_at
      updateClauses.push(`version = version + 1`);
      updateClauses.push(`updated_at = NOW()`);

      if (updateClauses.length === 0) {
        throw new Error('No updates provided');
      }

      values.push(id);
      values.push(expectedVersion);

      const query = `
        UPDATE agents 
        SET ${updateClauses.join(', ')}
        WHERE id = $${paramIndex} AND COALESCE(version, 0) = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await client.query<AgentWithVersion>(query, values);

      if (result.rowCount === 0) {
        throw new OptimisticLockError(
          `Agent ${id} was modified during update operation`,
          'agents',
          id,
          expectedVersion
        );
      }

      logger.debug(`[AgentRepository] Updated agent ${id} with version ${expectedVersion} -> ${expectedVersion + 1}`);
      
      return result.rows[0];
    }, options);
  }

  /**
   * Update agent status with optimistic locking and transition validation
   */
  async updateStatusWithLock(
    id: string,
    newStatus: AgentStatus,
    expectedVersion: number,
    options?: { lifecycleState?: LifecycleState; pausedBy?: string } & TransactionOptions
  ): Promise<AgentWithVersion> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');

    return this.txManager.withTransaction(async (client) => {
      // Get current state
      const currentResult = await client.query<{
        status: AgentStatus;
        lifecycle_state: LifecycleState;
        version: number;
      }>(
        `SELECT status, lifecycle_state, COALESCE(version, 0) as version 
         FROM agents WHERE id = $1`,
        [id]
      );

      if (currentResult.rowCount === 0) {
        throw new Error(`Agent ${id} not found`);
      }

      const current = currentResult.rows[0];
      
      if (current.version !== expectedVersion) {
        throw new OptimisticLockError(
          `Agent ${id} was modified by another transaction`,
          'agents',
          id,
          expectedVersion,
          current.version
        );
      }

      // Validate status transition
      this.validateStatusTransition(current.status, newStatus);

      // Build updates
      const updates: string[] = ['status = $1'];
      const values: unknown[] = [newStatus];
      let paramIndex = 2;

      // Update lifecycle state if provided
      if (options?.lifecycleState) {
        updates.push(`lifecycle_state = $${paramIndex++}`);
        values.push(options.lifecycleState);
      }

      // Set completed_at for terminal states
      if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'killed') {
        updates.push('completed_at = NOW()');
      }

      // Handle pause-specific fields
      if (newStatus === 'paused') {
        updates.push(`pause_time = $${paramIndex++}`);
        values.push(new Date().toISOString());
        updates.push(`paused_by = $${paramIndex++}`);
        values.push(options?.pausedBy || null);
      } else if (current.status === 'paused' && newStatus === 'running') {
        // Resuming from pause
        updates.push('pause_time = NULL');
        updates.push('paused_by = NULL');
      }

      // Always increment version and update timestamp
      updates.push('version = version + 1');
      updates.push('updated_at = NOW()');

      values.push(id);
      values.push(expectedVersion);

      const query = `
        UPDATE agents 
        SET ${updates.join(', ')}
        WHERE id = $${paramIndex} AND COALESCE(version, 0) = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await client.query<AgentWithVersion>(query, values);

      if (result.rowCount === 0) {
        throw new OptimisticLockError(
          `Agent ${id} status update conflict`,
          'agents',
          id,
          expectedVersion
        );
      }

      logger.debug(`[AgentRepository] Status ${current.status} -> ${newStatus} for agent ${id}`);
      
      return result.rows[0];
    }, options);
  }

  /**
   * Batch update agent statuses atomically
   * All updates succeed or none do
   */
  async updateStatusBatch(
    updates: Array<{
      id: string;
      status: AgentStatus;
      expectedVersion: number;
      lifecycleState?: LifecycleState;
    }>,
    options?: TransactionOptions
  ): Promise<AgentWithVersion[]> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');
    if (updates.length === 0) return [];

    return this.txManager.withTransaction(async (client) => {
      const results: AgentWithVersion[] = [];

      for (const update of updates) {
        // Check current state
        const currentResult = await client.query<{
          status: AgentStatus;
          version: number;
        }>(
          `SELECT status, COALESCE(version, 0) as version FROM agents WHERE id = $1`,
          [update.id]
        );

        if (currentResult.rowCount === 0) {
          throw new Error(`Agent ${update.id} not found`);
        }

        const current = currentResult.rows[0];
        
        if (current.version !== update.expectedVersion) {
          throw new OptimisticLockError(
            `Agent ${update.id} was modified by another transaction in batch update`,
            'agents',
            update.id,
            update.expectedVersion,
            current.version
          );
        }

        this.validateStatusTransition(current.status, update.status);

        const updateClauses = ['status = $1'];
        const values: unknown[] = [update.status];
        let paramIndex = 2;

        if (update.lifecycleState) {
          updateClauses.push(`lifecycle_state = $${paramIndex++}`);
          values.push(update.lifecycleState);
        }

        if (update.status === 'completed' || update.status === 'failed' || update.status === 'killed') {
          updateClauses.push('completed_at = NOW()');
        }

        updateClauses.push('version = version + 1');
        updateClauses.push('updated_at = NOW()');
        values.push(update.id);
        values.push(update.expectedVersion);

        const query = `
          UPDATE agents 
          SET ${updateClauses.join(', ')}
          WHERE id = $${paramIndex} AND COALESCE(version, 0) = $${paramIndex + 1}
          RETURNING *
        `;

        const result = await client.query<AgentWithVersion>(query, values);
        
        if (result.rowCount === 0) {
          throw new OptimisticLockError(
            `Agent ${update.id} update conflict in batch`,
            'agents',
            update.id,
            update.expectedVersion
          );
        }

        results.push(result.rows[0]);
      }

      logger.debug(`[AgentRepository] Batch updated ${results.length} agents`);
      
      return results;
    }, options);
  }

  /**
   * Increment retry count atomically
   * Safe for concurrent calls
   */
  async incrementRetryAtomic(id: string): Promise<AgentWithVersion> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const result = await pool.query<AgentWithVersion>(
      `UPDATE agents 
       SET retry_count = retry_count + 1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      throw new Error(`Agent ${id} not found`);
    }

    return result.rows[0];
  }

  /**
   * Atomic counter operations for runtime tracking
   */
  async incrementRuntime(id: string, seconds: number): Promise<void> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    await pool.query(
      `UPDATE agents 
       SET runtime = runtime + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [seconds, id]
    );
  }

  /**
   * Compare-and-swap for status updates
   * Only updates if current status matches expected status
   */
  async compareAndSwapStatus(
    id: string,
    expectedStatus: AgentStatus,
    newStatus: AgentStatus,
    options?: { lifecycleState?: LifecycleState }
  ): Promise<AgentWithVersion | null> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const updates: string[] = ['status = $1'];
    const values: unknown[] = [newStatus];
    let paramIndex = 2;

    if (options?.lifecycleState) {
      updates.push(`lifecycle_state = $${paramIndex++}`);
      values.push(options.lifecycleState);
    }

    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'killed') {
      updates.push('completed_at = NOW()');
    }

    updates.push('version = version + 1');
    updates.push('updated_at = NOW()');
    values.push(id);
    values.push(expectedStatus);

    const result = await pool.query<AgentWithVersion>(
      `UPDATE agents 
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex} AND status = $${paramIndex + 1}
       RETURNING *`,
      values
    );

    return result.rowCount && result.rowCount > 0 ? result.rows[0] : null;
  }

  /**
   * Create multiple agents in a single transaction with proper error handling
   */
  async createManyAtomic(
    inputs: AgentCreateInput[],
    options?: TransactionOptions
  ): Promise<AgentWithVersion[]> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');
    if (inputs.length === 0) return [];

    return this.txManager.withTransaction(async (client) => {
      const created: AgentWithVersion[] = [];

      for (const input of inputs) {
        const result = await client.query<AgentWithVersion>(
          `INSERT INTO agents (
            swarm_id, label, status, lifecycle_state, model, task, config,
            context, code, reasoning, safety_boundaries, max_retries, budget_limit, metadata,
            version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 0)
          RETURNING *`,
          [
            input.swarm_id || null,
            input.label || null,
            input.status || 'pending',
            input.lifecycle_state || 'initializing',
            input.model,
            input.task,
            JSON.stringify(input.config || {}),
            input.context ? JSON.stringify(input.context) : null,
            input.code ? JSON.stringify(input.code) : null,
            input.reasoning ? JSON.stringify(input.reasoning) : null,
            input.safety_boundaries ? JSON.stringify(input.safety_boundaries) : null,
            input.max_retries || 3,
            input.budget_limit || null,
            JSON.stringify(input.metadata || {}),
          ]
        );

        created.push(result.rows[0]);
      }

      logger.debug(`[AgentRepository] Created ${created.length} agents atomically`);
      
      return created;
    }, { isolationLevel: 'READ COMMITTED', ...options });
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(from: AgentStatus, to: AgentStatus): void {
    if (from === to) return; // Same status is always valid

    const allowedTransitions = VALID_STATUS_TRANSITIONS[from];
    
    if (!allowedTransitions.includes(to)) {
      throw new Error(
        `Invalid status transition: ${from} -> ${to}. ` +
        `Allowed transitions from ${from}: ${allowedTransitions.join(', ') || 'none'}`
      );
    }
  }

  /**
   * Add version column if not exists (migration helper)
   */
  async ensureVersionColumn(): Promise<void> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    await pool.query(`
      ALTER TABLE agents 
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0
    `);

    await pool.query(`
      UPDATE agents 
      SET version = 0 
      WHERE version IS NULL
    `);

    logger.info('[AgentRepository] Ensured version column exists');
  }
}

export default AgentRepositoryEnhanced;
