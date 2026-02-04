/**
 * Swarm Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for swarms with PostgreSQL persistence.
 */

import { PostgresPool, getPool } from '../postgres/pool';
import type { PostgresConfig } from '../postgres/config';

export type SwarmStatus = 'creating' | 'active' | 'scaling' | 'paused' | 'completed' | 'failed' | 'destroyed';

export interface Swarm {
  id: string;
  name: string;
  config: Record<string, unknown>;
  status: SwarmStatus;
  budget_allocated?: number;
  budget_consumed?: number;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface SwarmCreateInput {
  id?: string;
  name: string;
  config?: Record<string, unknown>;
  status?: SwarmStatus;
  agents?: string[];
  created_at?: Date;
  budget_allocated?: number;
  budget_consumed?: number;
  budget_remaining?: number;
  metrics?: {
    totalAgents?: number;
    completedAgents?: number;
    failedAgents?: number;
  };
}

export interface SwarmUpdateInput {
  name?: string;
  config?: Record<string, unknown>;
  status?: SwarmStatus;
  completed_at?: Date;
}

export interface SwarmFilter {
  status?: SwarmStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at' | 'name';
  orderDirection?: 'asc' | 'desc';
}

export interface SwarmSummary {
  id: string;
  name: string;
  status: SwarmStatus;
  created_at: Date;
  config: Record<string, unknown>;
  running_agents: number;
  total_agents: number;
  budget_allocated: number;
  budget_consumed: number;
  budget_percentage: number;
}

export class SwarmRepository {
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
   * Create a new swarm
   */
  async create(input: SwarmCreateInput): Promise<Swarm> {
    this.ensureInitialized();
    
    const { name, config = {}, status = 'creating' } = input;
    
    const result = await this.pool!.query<SwarmRow>(
      `INSERT INTO swarms (name, config, status)
       VALUES ($1, $2, $3)
       RETURNING id, name, config, status, created_at, updated_at, completed_at`,
      [name, JSON.stringify(config), status]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find a swarm by ID
   */
  async findById(id: string): Promise<Swarm | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SwarmRow>(
      `SELECT id, name, config, status, created_at, updated_at, completed_at
       FROM swarms 
       WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find a swarm by name
   */
  async findByName(name: string): Promise<Swarm | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SwarmRow>(
      `SELECT id, name, config, status, created_at, updated_at, completed_at
       FROM swarms 
       WHERE name = $1`,
      [name]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update a swarm by ID
   */
  async update(id: string, input: SwarmUpdateInput): Promise<Swarm | null> {
    this.ensureInitialized();
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.config !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(input.config));
    }
    if (input.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(input.status);
    }
    if (input.completed_at !== undefined) {
      updates.push(`completed_at = $${paramIndex++}`);
      values.push(input.completed_at);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE swarms 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, name, config, status, created_at, updated_at, completed_at
    `;

    const result = await this.pool!.query<SwarmRow>(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete a swarm by ID (cascades to agents and events)
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM swarms WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * List swarms with filtering and pagination
   */
  async list(filter: SwarmFilter = {}): Promise<Swarm[]> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderBy = filter.orderBy || 'created_at';
    const orderDirection = filter.orderDirection?.toUpperCase() || 'DESC';
    
    let query = `
      SELECT id, name, config, status, created_at, updated_at, completed_at
      FROM swarms 
      ${whereClause}
      ORDER BY ${orderBy} ${orderDirection}
    `;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filter.offset);
    }

    const result = await this.pool!.query<SwarmRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Count swarms with optional filter
   */
  async count(filter: { status?: SwarmStatus } = {}): Promise<number> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    const result = await this.pool!.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM swarms ${whereClause}`,
      values
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get swarm summary with agent counts and budget info
   */
  async getSummary(id: string): Promise<SwarmSummary | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SwarmSummaryRow>(
      `SELECT * FROM swarm_summary WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapSummaryRow(result.rows[0]) : null;
  }

  /**
   * List swarm summaries
   */
  async listSummaries(filter: SwarmFilter = {}): Promise<SwarmSummary[]> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.status) {
      conditions.push(`status = $${paramIndex++}`);
      values.push(filter.status);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const orderDirection = filter.orderDirection?.toUpperCase() || 'DESC';
    
    let query = `
      SELECT * FROM swarm_summary 
      ${whereClause}
      ORDER BY created_at ${orderDirection}
    `;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filter.offset);
    }

    const result = await this.pool!.query<SwarmSummaryRow>(query, values);
    return result.rows.map(row => this.mapSummaryRow(row));
  }

  /**
   * Check if a swarm exists
   */
  async exists(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM swarms WHERE id = $1) as exists`,
      [id]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Update swarm status atomically
   */
  async updateStatus(id: string, status: SwarmStatus): Promise<Swarm | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SwarmRow>(
      `UPDATE swarms 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, config, status, created_at, updated_at, completed_at`,
      [status, id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('SwarmRepository not initialized. Call initialize() first.');
    }
  }

  private mapRow(row: SwarmRow): Swarm {
    return {
      id: row.id,
      name: row.name,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      status: row.status as SwarmStatus,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  private mapSummaryRow(row: SwarmSummaryRow): SwarmSummary {
    return {
      id: row.id,
      name: row.name,
      status: row.status as SwarmStatus,
      created_at: new Date(row.created_at),
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      running_agents: parseInt(String(row.running_agents), 10),
      total_agents: parseInt(String(row.total_agents), 10),
      budget_allocated: parseFloat(String(row.budget_allocated || 0)),
      budget_consumed: parseFloat(String(row.budget_consumed || 0)),
      budget_percentage: parseFloat(String(row.budget_percentage || 0)),
    };
  }
}

// Database row types
interface SwarmRow {
  id: string;
  name: string;
  config: string | Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface SwarmSummaryRow {
  id: string;
  name: string;
  status: string;
  created_at: string;
  config: string | Record<string, unknown>;
  running_agents: number | string;
  total_agents: number | string;
  budget_allocated: number | string;
  budget_consumed: number | string;
  budget_percentage: number | string;
}

export default SwarmRepository;
