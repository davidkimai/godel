/**
 * Team Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for teams with PostgreSQL persistence.
 */

import { PostgresPool, getPool } from '../postgres/pool';
import type { PostgresConfig } from '../postgres/config';

export type TeamStatus = 'creating' | 'active' | 'scaling' | 'paused' | 'completed' | 'failed' | 'destroyed';

export interface Team {
  id: string;
  name: string;
  config: Record<string, unknown>;
  status: TeamStatus;
  budget_allocated?: number;
  budget_consumed?: number;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
}

export interface TeamCreateInput {
  id?: string;
  name: string;
  config?: Record<string, unknown>;
  status?: TeamStatus;
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

export interface TeamUpdateInput {
  name?: string;
  config?: Record<string, unknown>;
  status?: TeamStatus;
  completed_at?: Date;
}

export interface TeamFilter {
  status?: TeamStatus;
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at' | 'name';
  orderDirection?: 'asc' | 'desc';
}

export interface TeamSummary {
  id: string;
  name: string;
  status: TeamStatus;
  created_at: Date;
  config: Record<string, unknown>;
  running_agents: number;
  total_agents: number;
  budget_allocated: number;
  budget_consumed: number;
  budget_percentage: number;
}

export class TeamRepository {
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
   * Create a new team
   */
  async create(input: TeamCreateInput): Promise<Team> {
    this.ensureInitialized();
    
    const { name, config = {}, status = 'creating' } = input;
    
    const result = await this.pool!.query<TeamRow>(
      `INSERT INTO teams (name, config, status)
       VALUES ($1, $2, $3)
       RETURNING id, name, config, status, created_at, updated_at, completed_at`,
      [name, JSON.stringify(config), status]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find a team by ID
   */
  async findById(id: string): Promise<Team | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<TeamRow>(
      `SELECT id, name, config, status, created_at, updated_at, completed_at
       FROM teams 
       WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find a team by name
   */
  async findByName(name: string): Promise<Team | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<TeamRow>(
      `SELECT id, name, config, status, created_at, updated_at, completed_at
       FROM teams 
       WHERE name = $1`,
      [name]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update a team by ID
   */
  async update(id: string, input: TeamUpdateInput): Promise<Team | null> {
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
      UPDATE teams 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING id, name, config, status, created_at, updated_at, completed_at
    `;

    const result = await this.pool!.query<TeamRow>(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete a team by ID (cascades to agents and events)
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM teams WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * List teams with filtering and pagination
   */
  async list(filter: TeamFilter = {}): Promise<Team[]> {
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
      FROM teams 
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

    const result = await this.pool!.query<TeamRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Count teams with optional filter
   */
  async count(filter: { status?: TeamStatus } = {}): Promise<number> {
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
      `SELECT COUNT(*) as count FROM teams ${whereClause}`,
      values
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get team summary with agent counts and budget info
   */
  async getSummary(id: string): Promise<TeamSummary | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<TeamSummaryRow>(
      `SELECT * FROM team_summary WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapSummaryRow(result.rows[0]) : null;
  }

  /**
   * List team summaries
   */
  async listSummaries(filter: TeamFilter = {}): Promise<TeamSummary[]> {
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
      SELECT * FROM team_summary 
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

    const result = await this.pool!.query<TeamSummaryRow>(query, values);
    return result.rows.map(row => this.mapSummaryRow(row));
  }

  /**
   * Check if a team exists
   */
  async exists(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM teams WHERE id = $1) as exists`,
      [id]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Update team status atomically
   */
  async updateStatus(id: string, status: TeamStatus): Promise<Team | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<TeamRow>(
      `UPDATE teams 
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
      throw new Error('TeamRepository not initialized. Call initialize() first.');
    }
  }

  private mapRow(row: TeamRow): Team {
    return {
      id: row.id,
      name: row.name,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      status: row.status as TeamStatus,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }

  private mapSummaryRow(row: TeamSummaryRow): TeamSummary {
    return {
      id: row.id,
      name: row.name,
      status: row.status as TeamStatus,
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
interface TeamRow {
  id: string;
  name: string;
  config: string | Record<string, unknown>;
  status: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

interface TeamSummaryRow {
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

export default TeamRepository;
