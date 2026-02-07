/**
 * Enhanced Team Repository - With Transaction Safety
 * 
 * Extends the base TeamRepository with:
 * - Optimistic locking for concurrent updates
 * - Transactional batch operations
 * - Race-condition-safe agent count updates
 */

import { PostgresPool } from '../postgres/pool';
import { TransactionManager, OptimisticLockError, TransactionOptions } from '../transaction';
import {
  TeamRepository,
  Team,
  TeamCreateInput,
  TeamUpdateInput,
  TeamFilter,
  TeamStatus,
} from './TeamRepository';
import { logger } from '../../utils/logger';

export interface TeamWithVersion extends Team {
  version: number;
}

export interface TeamAgentCount {
  total: number;
  running: number;
  completed: number;
  failed: number;
}

// Valid team status transitions
const VALID_TEAM_STATUS_TRANSITIONS: Record<TeamStatus, TeamStatus[]> = {
  creating: ['active', 'failed', 'destroyed'],
  active: ['scaling', 'paused', 'completed', 'failed', 'destroyed'],
  scaling: ['active', 'paused', 'failed'],
  paused: ['active', 'completed', 'failed', 'destroyed'],
  completed: ['destroyed'], // Terminal but can be destroyed
  failed: ['destroyed'], // Terminal but can be destroyed
  destroyed: [], // Terminal state
};

export class TeamRepositoryEnhanced extends TeamRepository {
  private txManager: TransactionManager | null = null;

  /**
   * Initialize with transaction manager
   */
  async initialize(): Promise<void> {
    await super.initialize();
    
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (pool) {
      this.txManager = new TransactionManager(pool as unknown as import('pg').Pool);
    }
  }

  /**
   * Find a team with version for optimistic locking
   */
  async findByIdWithVersion(id: string): Promise<TeamWithVersion | null> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const result = await pool.query<TeamWithVersion & { version: number }>(
      `SELECT *, COALESCE(version, 0) as version FROM teams WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  /**
   * Update a team with optimistic locking
   */
  async updateWithLock(
    id: string,
    updates: TeamUpdateInput,
    expectedVersion: number,
    options?: TransactionOptions
  ): Promise<TeamWithVersion> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');

    return this.txManager.withTransaction(async (client) => {
      // Check current version
      const currentResult = await client.query(
        `SELECT status, COALESCE(version, 0) as version FROM teams WHERE id = $1`,
        [id]
      );

      if (currentResult.rowCount === 0) {
        throw new Error(`Team ${id} not found`);
      }

      const currentVersion = currentResult.rows[0].version as number;
      
      if (currentVersion !== expectedVersion) {
        throw new OptimisticLockError(
          `Team ${id} was modified by another transaction`,
          'teams',
          id,
          expectedVersion,
          currentVersion
        );
      }

      // Validate status transition if status is being updated
      if (updates.status) {
        const currentStatus = currentResult.rows[0].status as TeamStatus;
        this.validateStatusTransition(currentStatus, updates.status);
      }

      // Build update query
      const updateClauses: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      if (updates.name !== undefined) {
        updateClauses.push(`name = $${paramIndex++}`);
        values.push(updates.name);
      }

      if (updates.config !== undefined) {
        updateClauses.push(`config = $${paramIndex++}`);
        values.push(JSON.stringify(updates.config));
      }

      if (updates.status !== undefined) {
        updateClauses.push(`status = $${paramIndex++}`);
        values.push(updates.status);
      }

      if (updates.completed_at !== undefined) {
        updateClauses.push(`completed_at = $${paramIndex++}`);
        values.push(updates.completed_at);
      }

      if (updateClauses.length === 0) {
        throw new Error('No updates provided');
      }

      // Always increment version and update timestamp
      updateClauses.push(`version = version + 1`);
      updateClauses.push(`updated_at = NOW()`);

      values.push(id);
      values.push(expectedVersion);

      const query = `
        UPDATE teams 
        SET ${updateClauses.join(', ')}
        WHERE id = $${paramIndex} AND COALESCE(version, 0) = $${paramIndex + 1}
        RETURNING *
      `;

      const result = await client.query<TeamWithVersion>(query, values);

      if (result.rowCount === 0) {
        throw new OptimisticLockError(
          `Team ${id} update conflict`,
          'teams',
          id,
          expectedVersion
        );
      }

      logger.debug(`[TeamRepository] Updated team ${id} version ${expectedVersion} -> ${expectedVersion + 1}`);
      
      return result.rows[0];
    }, options);
  }

  /**
   * Update team status with optimistic locking
   */
  async updateStatusWithLock(
    id: string,
    newStatus: TeamStatus,
    expectedVersion: number,
    options?: TransactionOptions
  ): Promise<TeamWithVersion> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');

    return this.txManager.withTransaction(async (client) => {
      const currentResult = await client.query<{
        status: TeamStatus;
        version: number;
      }>(
        `SELECT status, COALESCE(version, 0) as version FROM teams WHERE id = $1`,
        [id]
      );

      if (currentResult.rowCount === 0) {
        throw new Error(`Team ${id} not found`);
      }

      const current = currentResult.rows[0];
      
      if (current.version !== expectedVersion) {
        throw new OptimisticLockError(
          `Team ${id} was modified by another transaction`,
          'teams',
          id,
          expectedVersion,
          current.version
        );
      }

      this.validateStatusTransition(current.status, newStatus);

      const updates: string[] = ['status = $1'];
      const values: unknown[] = [newStatus];

      // Set completed_at for terminal states
      if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'destroyed') {
        updates.push('completed_at = NOW()');
      }

      updates.push('version = version + 1');
      updates.push('updated_at = NOW()');
      values.push(id);
      values.push(expectedVersion);

      const result = await client.query<TeamWithVersion>(
        `UPDATE teams 
         SET ${updates.join(', ')}
         WHERE id = $3 AND COALESCE(version, 0) = $4
         RETURNING *`,
        values
      );

      if (result.rowCount === 0) {
        throw new OptimisticLockError(
          `Team ${id} status update conflict`,
          'teams',
          id,
          expectedVersion
        );
      }

      logger.debug(`[TeamRepository] Team ${id} status ${current.status} -> ${newStatus}`);
      
      return result.rows[0];
    }, options);
  }

  /**
   * Atomically increment agent count for a team
   * Safe for concurrent scaling operations
   */
  async incrementAgentCount(
    teamId: string,
    status: 'running' | 'completed' | 'failed'
  ): Promise<void> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const columnMap = {
      running: 'running_agents',
      completed: 'completed_agents',
      failed: 'failed_agents',
    };

    const column = columnMap[status];

    await pool.query(
      `UPDATE teams 
       SET ${column} = ${column} + 1,
           total_agents = total_agents + 1,
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [teamId]
    );
  }

  /**
   * Atomically decrement agent count for a team
   */
  async decrementAgentCount(
    teamId: string,
    fromStatus: 'running' | 'completed' | 'failed'
  ): Promise<void> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const columnMap = {
      running: 'running_agents',
      completed: 'completed_agents',
      failed: 'failed_agents',
    };

    const column = columnMap[fromStatus];

    await pool.query(
      `UPDATE teams 
       SET ${column} = GREATEST(0, ${column} - 1),
           total_agents = GREATEST(0, total_agents - 1),
           version = version + 1,
           updated_at = NOW()
       WHERE id = $1`,
      [teamId]
    );
  }

  /**
   * Compare-and-swap for status updates
   */
  async compareAndSwapStatus(
    id: string,
    expectedStatus: TeamStatus,
    newStatus: TeamStatus
  ): Promise<TeamWithVersion | null> {
    const pool = (this as unknown as { pool: PostgresPool }).pool;
    if (!pool) throw new Error('Repository not initialized');

    const updates: string[] = ['status = $1'];
    const values: unknown[] = [newStatus];

    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'destroyed') {
      updates.push('completed_at = NOW()');
    }

    updates.push('version = version + 1');
    updates.push('updated_at = NOW()');
    values.push(id);
    values.push(expectedStatus);

    const result = await pool.query<TeamWithVersion>(
      `UPDATE teams 
       SET ${updates.join(', ')}
       WHERE id = $2 AND status = $3
       RETURNING *`,
      values
    );

    return result.rowCount && result.rowCount > 0 ? result.rows[0] : null;
  }

  /**
   * Delete a team and all its agents in a single transaction
   * Ensures referential integrity
   */
  async deleteWithAgents(
    id: string,
    expectedVersion: number,
    options?: TransactionOptions
  ): Promise<boolean> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');

    return this.txManager.withTransaction(async (client) => {
      // Verify team exists and version matches
      const checkResult = await client.query(
        `SELECT COALESCE(version, 0) as version FROM teams WHERE id = $1`,
        [id]
      );

      if (checkResult.rowCount === 0) {
        return false;
      }

      const currentVersion = checkResult.rows[0].version as number;
      
      if (currentVersion !== expectedVersion) {
        throw new OptimisticLockError(
          `Team ${id} was modified before deletion`,
          'teams',
          id,
          expectedVersion,
          currentVersion
        );
      }

      // Delete all associated agents first
      await client.query('DELETE FROM agents WHERE team_id = $1', [id]);

      // Delete the team
      const result = await client.query(
        'DELETE FROM teams WHERE id = $1 AND COALESCE(version, 0) = $2',
        [id, expectedVersion]
      );

      if (result.rowCount === 0) {
        throw new OptimisticLockError(
          `Team ${id} was modified during deletion`,
          'teams',
          id,
          expectedVersion
        );
      }

      logger.info(`[TeamRepository] Deleted team ${id} and all associated agents`);
      
      return true;
    }, { isolationLevel: 'SERIALIZABLE', ...options });
  }

  /**
   * Get team with accurate agent counts
   * Uses a consistent snapshot
   */
  async getWithAgentCounts(id: string): Promise<(TeamWithVersion & TeamAgentCount) | null> {
    if (!this.txManager) throw new Error('Transaction manager not initialized');

    return this.txManager.withTransaction(async (client) => {
      // Get team info
      const teamResult = await client.query<TeamWithVersion>(
        `SELECT *, COALESCE(version, 0) as version FROM teams WHERE id = $1`,
        [id]
      );

      if (teamResult.rowCount === 0) {
        return null;
      }

      // Get accurate counts from agents table
      const countsResult = await client.query<{
        status: string;
        count: string;
      }>(
        `SELECT status, COUNT(*) as count 
         FROM agents 
         WHERE team_id = $1 
         GROUP BY status`,
        [id]
      );

      const counts: TeamAgentCount = {
        total: 0,
        running: 0,
        completed: 0,
        failed: 0,
      };

      for (const row of countsResult.rows) {
        const count = parseInt(row.count, 10);
        counts.total += count;
        
        if (row.status === 'running') counts.running = count;
        else if (row.status === 'completed') counts.completed = count;
        else if (row.status === 'failed' || row.status === 'killed') counts.failed += count;
      }

      return {
        ...teamResult.rows[0],
        ...counts,
      };
    }, { isolationLevel: 'REPEATABLE READ', readOnly: true });
  }

  /**
   * Validate status transition
   */
  private validateStatusTransition(from: TeamStatus, to: TeamStatus): void {
    if (from === to) return;

    const allowedTransitions = VALID_TEAM_STATUS_TRANSITIONS[from];
    
    if (!allowedTransitions.includes(to)) {
      throw new Error(
        `Invalid team status transition: ${from} -> ${to}. ` +
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
      ALTER TABLE teams 
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE teams 
      ADD COLUMN IF NOT EXISTS total_agents INTEGER DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE teams 
      ADD COLUMN IF NOT EXISTS running_agents INTEGER DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE teams 
      ADD COLUMN IF NOT EXISTS completed_agents INTEGER DEFAULT 0
    `);

    await pool.query(`
      ALTER TABLE teams 
      ADD COLUMN IF NOT EXISTS failed_agents INTEGER DEFAULT 0
    `);

    await pool.query(`
      UPDATE teams 
      SET version = 0 
      WHERE version IS NULL
    `);

    logger.info('[TeamRepository] Ensured version and agent count columns exist');
  }
}

export default TeamRepositoryEnhanced;
