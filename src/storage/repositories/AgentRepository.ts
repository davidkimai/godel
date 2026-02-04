/**
 * Agent Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for agents with PostgreSQL persistence.
 */

import { PostgresPool, getPool } from '../postgres/pool';
import type { PostgresConfig } from '../postgres/config';

export type AgentStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'blocked' | 'killed';
export type LifecycleState = 'initializing' | 'spawning' | 'running' | 'pausing' | 'paused' | 'resuming' | 'completing' | 'failed' | 'cleaning_up' | 'destroyed';

export interface Agent {
  id: string;
  swarm_id?: string;
  label?: string;
  status: AgentStatus;
  lifecycle_state: LifecycleState;
  model: string;
  task: string;
  config: Record<string, unknown>;
  context?: Record<string, unknown>;
  code?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  safety_boundaries?: Record<string, unknown>;
  spawned_at: Date;
  completed_at?: Date;
  pause_time?: Date;
  paused_by?: string;
  runtime: number;
  retry_count: number;
  max_retries: number;
  last_error?: string;
  budget_limit?: number;
  metadata: Record<string, unknown>;
}

export interface AgentCreateInput {
  swarm_id?: string;
  label?: string;
  status?: AgentStatus;
  lifecycle_state?: LifecycleState;
  model: string;
  task: string;
  config?: Record<string, unknown>;
  context?: Record<string, unknown>;
  code?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  safety_boundaries?: Record<string, unknown>;
  max_retries?: number;
  budget_limit?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentUpdateInput {
  label?: string;
  status?: AgentStatus;
  lifecycle_state?: LifecycleState;
  model?: string;
  task?: string;
  config?: Record<string, unknown>;
  context?: Record<string, unknown>;
  code?: Record<string, unknown>;
  reasoning?: Record<string, unknown>;
  safety_boundaries?: Record<string, unknown>;
  completed_at?: Date;
  pause_time?: Date;
  paused_by?: string;
  runtime?: number;
  retry_count?: number;
  max_retries?: number;
  last_error?: string;
  budget_limit?: number;
  metadata?: Record<string, unknown>;
}

export interface AgentFilter {
  swarm_id?: string;
  status?: AgentStatus;
  lifecycle_state?: LifecycleState;
  model?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'spawned_at' | 'updated_at' | 'status';
  orderDirection?: 'asc' | 'desc';
}

export interface AgentActivity {
  id: string;
  label?: string;
  status: AgentStatus;
  lifecycle_state: LifecycleState;
  model: string;
  task: string;
  swarm_id?: string;
  swarm_name?: string;
  spawned_at: Date;
  completed_at?: Date;
  duration_seconds: number;
  retry_count: number;
  runtime: number;
}

export class AgentRepository {
  private pool: PostgresPool | null = null;
  private config?: Partial<PostgresConfig>;

  constructor(config?: Partial<PostgresConfig>) {
    this.config = config;
  }

  /**
   * Initialize the repository with a database pool
   */
  async initialize(): Promise<void> {
    this.pool = await getPool(this.config);
  }

  /**
   * Create a new agent
   */
  async create(input: AgentCreateInput): Promise<Agent> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `INSERT INTO agents (
        swarm_id, label, status, lifecycle_state, model, task, config,
        context, code, reasoning, safety_boundaries, max_retries, budget_limit, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find an agent by ID
   */
  async findById(id: string): Promise<Agent | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `SELECT * FROM agents WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find agents by swarm ID
   */
  async findBySwarmId(swarmId: string): Promise<Agent[]> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `SELECT * FROM agents WHERE swarm_id = $1 ORDER BY spawned_at DESC`,
      [swarmId]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Update an agent by ID
   */
  async update(id: string, input: AgentUpdateInput): Promise<Agent | null> {
    this.ensureInitialized();
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const jsonFields = ['config', 'context', 'code', 'reasoning', 'safety_boundaries', 'metadata'];
    
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex++}`);
        if (jsonFields.includes(key)) {
          values.push(JSON.stringify(value));
        } else if (value instanceof Date) {
          values.push(value.toISOString());
        } else {
          values.push(value);
        }
      }
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE agents 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool!.query<AgentRow>(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete an agent by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM agents WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * List agents with filtering and pagination
   */
  async list(filter: AgentFilter = {}): Promise<Agent[]> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.swarm_id) {
      conditions.push(`swarm_id = $${paramIndex++}`);
      values.push(filter.swarm_id);
    }
    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }
    if (filter.lifecycle_state) {
      conditions.push(`lifecycle_state = $${paramIndex++}`);
      values.push(filter.lifecycle_state);
    }
    if (filter.model) {
      conditions.push(`model = $${paramIndex++}`);
      values.push(filter.model);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = filter.orderBy || 'spawned_at';
    const orderDirection = filter.orderDirection?.toUpperCase() || 'DESC';
    
    let query = `SELECT * FROM agents ${whereClause} ORDER BY ${orderBy} ${orderDirection}`;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filter.offset);
    }

    const result = await this.pool!.query<AgentRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Count agents with optional filter
   */
  async count(filter: { swarm_id?: string; status?: AgentStatus } = {}): Promise<number> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.swarm_id) {
      conditions.push(`swarm_id = $${paramIndex++}`);
      values.push(filter.swarm_id);
    }
    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const result = await this.pool!.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM agents ${whereClause}`,
      values
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get agent counts grouped by status
   */
  async getCountsByStatus(): Promise<Record<AgentStatus | 'total', number>> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<{ status: AgentStatus; count: string }>(
      `SELECT status, COUNT(*) as count FROM agents GROUP BY status`
    );

    const counts: Record<AgentStatus | 'total', number> = {
      pending: 0,
      running: 0,
      paused: 0,
      completed: 0,
      failed: 0,
      blocked: 0,
      killed: 0,
      total: 0,
    };

    for (const row of result.rows) {
      counts[row.status] = parseInt(row.count, 10);
      counts.total += counts[row.status];
    }

    return counts;
  }

  /**
   * Update agent status atomically
   */
  async updateStatus(id: string, status: AgentStatus): Promise<Agent | null> {
    this.ensureInitialized();
    
    const updates = ['status = $1'];
    const values: unknown[] = [status];
    
    if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = NOW()');
    }
    
    values.push(id);
    
    const result = await this.pool!.query<AgentRow>(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`,
      values
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update lifecycle state
   */
  async updateLifecycleState(id: string, state: LifecycleState): Promise<Agent | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `UPDATE agents SET lifecycle_state = $1 WHERE id = $2 RETURNING *`,
      [state, id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Pause an agent
   */
  async pause(id: string, pausedBy?: string): Promise<Agent | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `UPDATE agents 
       SET status = 'paused', 
           lifecycle_state = 'paused',
           pause_time = NOW(),
           paused_by = $1
       WHERE id = $2 
       RETURNING *`,
      [pausedBy || null, id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Resume an agent
   */
  async resume(id: string): Promise<Agent | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `UPDATE agents 
       SET status = 'running', 
           lifecycle_state = 'running',
           pause_time = NULL,
           paused_by = NULL
       WHERE id = $1 
       RETURNING *`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Increment retry count
   */
  async incrementRetry(id: string): Promise<Agent | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<AgentRow>(
      `UPDATE agents SET retry_count = retry_count + 1 WHERE id = $1 RETURNING *`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get agent activity view
   */
  async getActivity(filter: { swarm_id?: string; limit?: number } = {}): Promise<AgentActivity[]> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.swarm_id) {
      conditions.push(`swarm_id = $${paramIndex++}`);
      values.push(filter.swarm_id);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    let query = `SELECT * FROM agent_activity ${whereClause} ORDER BY spawned_at DESC`;
    
    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    const result = await this.pool!.query<AgentActivityRow>(query, values);
    return result.rows.map(row => this.mapActivityRow(row));
  }

  /**
   * Bulk delete agents by swarm ID
   */
  async deleteBySwarmId(swarmId: string): Promise<number> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM agents WHERE swarm_id = $1',
      [swarmId]
    );

    return result.rowCount;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Create multiple agents in a single transaction
   * Uses batch insert for improved performance
   */
  async createMany(inputs: AgentCreateInput[]): Promise<Agent[]> {
    this.ensureInitialized();
    
    if (inputs.length === 0) return [];

    const client = await this.pool!.getClient();
    try {
      await client.query('BEGIN');

      const created: Agent[] = [];
      const batchSize = 100; // Process in batches to avoid parameter limits

      for (let i = 0; i < inputs.length; i += batchSize) {
        const batch = inputs.slice(i, i + batchSize);
        const promises = batch.map(async (input) => {
          const result = await client.query<AgentRow>(
            `INSERT INTO agents (
              swarm_id, label, status, lifecycle_state, model, task, config,
              context, code, reasoning, safety_boundaries, max_retries, budget_limit, metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
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
          return this.mapRow(result.rows[0]);
        });

        const batchResults = await Promise.all(promises);
        created.push(...batchResults);
      }

      await client.query('COMMIT');
      return created;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update multiple agents atomically by IDs
   * Returns the number of updated records
   */
  async updateMany(ids: string[], input: AgentUpdateInput): Promise<number> {
    this.ensureInitialized();
    
    if (ids.length === 0) return 0;
    if (Object.keys(input).length === 0) return 0;

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    const jsonFields = ['config', 'context', 'code', 'reasoning', 'safety_boundaries', 'metadata'];
    
    for (const [key, value] of Object.entries(input)) {
      if (value !== undefined) {
        updates.push(`${key} = $${paramIndex++}`);
        if (jsonFields.includes(key)) {
          values.push(JSON.stringify(value));
        } else if (value instanceof Date) {
          values.push(value.toISOString());
        } else {
          values.push(value);
        }
      }
    }

    if (updates.length === 0) return 0;

    // Add IDs as a parameterized array
    const idArray = ids;
    values.push(JSON.stringify(idArray));

    const query = `
      UPDATE agents 
      SET ${updates.join(', ')}
      WHERE id = ANY($${paramIndex})
    `;

    const result = await this.pool!.query(query, values);
    return result.rowCount || 0;
  }

  /**
   * Delete multiple agents by IDs
   * Returns the number of deleted records
   */
  async deleteMany(ids: string[]): Promise<number> {
    this.ensureInitialized();
    
    if (ids.length === 0) return 0;

    const result = await this.pool!.query(
      'DELETE FROM agents WHERE id = ANY($1)',
      [JSON.stringify(ids)]
    );

    return result.rowCount || 0;
  }

  /**
   * Find multiple agents by IDs
   * Returns a map of ID to Agent for efficient lookup
   */
  async findByIds(ids: string[]): Promise<Map<string, Agent>> {
    this.ensureInitialized();
    
    if (ids.length === 0) return new Map();

    const result = await this.pool!.query<AgentRow>(
      'SELECT * FROM agents WHERE id = ANY($1)',
      [JSON.stringify(ids)]
    );

    const map = new Map<string, Agent>();
    for (const row of result.rows) {
      map.set(row.id, this.mapRow(row));
    }
    return map;
  }

  /**
   * Bulk update status for multiple agents
   * Optimized for high-throughput status changes
   */
  async updateStatusMany(
    ids: string[],
    status: AgentStatus
  ): Promise<number> {
    this.ensureInitialized();
    
    if (ids.length === 0) return 0;

    const updates = ['status = $1'];
    const values: unknown[] = [status];
    
    if (status === 'completed' || status === 'failed') {
      updates.push('completed_at = NOW()');
    }

    values.push(JSON.stringify(ids));

    const result = await this.pool!.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = ANY($${values.length})`,
      values
    );

    return result.rowCount || 0;
  }

  /**
   * Count agents with multiple status filters
   * More efficient than multiple count queries
   */
  async countByStatuses(statuses: AgentStatus[]): Promise<Map<AgentStatus, number>> {
    this.ensureInitialized();
    
    if (statuses.length === 0) return new Map();

    const result = await this.pool!.query<{ status: AgentStatus; count: string }>(
      `SELECT status, COUNT(*) as count FROM agents 
       WHERE status = ANY($1) 
       GROUP BY status`,
      [JSON.stringify(statuses)]
    );

    const map = new Map<AgentStatus, number>();
    for (const row of result.rows) {
      map.set(row.status, parseInt(row.count, 10));
    }
    return map;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('AgentRepository not initialized. Call initialize() first.');
    }
  }

  private mapRow(row: AgentRow): Agent {
    return {
      id: row.id,
      swarm_id: row.swarm_id || undefined,
      label: row.label || undefined,
      status: row.status as AgentStatus,
      lifecycle_state: row.lifecycle_state as LifecycleState,
      model: row.model,
      task: row.task,
      config: this.parseJson(row.config),
      context: row.context ? this.parseJson(row.context) : undefined,
      code: row.code ? this.parseJson(row.code) : undefined,
      reasoning: row.reasoning ? this.parseJson(row.reasoning) : undefined,
      safety_boundaries: row.safety_boundaries ? this.parseJson(row.safety_boundaries) : undefined,
      spawned_at: new Date(row.spawned_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      pause_time: row.pause_time ? new Date(row.pause_time) : undefined,
      paused_by: row.paused_by || undefined,
      runtime: row.runtime || 0,
      retry_count: row.retry_count || 0,
      max_retries: row.max_retries || 3,
      last_error: row.last_error || undefined,
      budget_limit: row.budget_limit ? parseFloat(String(row.budget_limit)) : undefined,
      metadata: this.parseJson(row.metadata),
    };
  }

  private mapActivityRow(row: AgentActivityRow): AgentActivity {
    return {
      id: row.id,
      label: row.label || undefined,
      status: row.status as AgentStatus,
      lifecycle_state: row.lifecycle_state as LifecycleState,
      model: row.model,
      task: row.task,
      swarm_id: row.swarm_id || undefined,
      swarm_name: row.swarm_name || undefined,
      spawned_at: new Date(row.spawned_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
      duration_seconds: parseFloat(String(row.duration_seconds || 0)),
      retry_count: row.retry_count || 0,
      runtime: row.runtime || 0,
    };
  }

  private parseJson(value: string | Record<string, unknown> | null): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value as Record<string, unknown>;
  }
}

// Database row types
interface AgentRow {
  id: string;
  swarm_id?: string;
  label?: string;
  status: string;
  lifecycle_state: string;
  model: string;
  task: string;
  config: string | Record<string, unknown>;
  context?: string | Record<string, unknown>;
  code?: string | Record<string, unknown>;
  reasoning?: string | Record<string, unknown>;
  safety_boundaries?: string | Record<string, unknown>;
  spawned_at: string;
  completed_at?: string;
  pause_time?: string;
  paused_by?: string;
  runtime: number;
  retry_count: number;
  max_retries: number;
  last_error?: string;
  budget_limit?: number | string;
  metadata: string | Record<string, unknown>;
}

interface AgentActivityRow {
  id: string;
  label?: string;
  status: string;
  lifecycle_state: string;
  model: string;
  task: string;
  swarm_id?: string;
  swarm_name?: string;
  spawned_at: string;
  completed_at?: string;
  duration_seconds: number | string;
  retry_count: number;
  runtime: number;
}

export default AgentRepository;
