/**
 * Session Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for sessions with PostgreSQL persistence.
 * Sessions store tree_data for conversation/session state.
 */

import { PostgresPool, getPool } from '../postgres/pool';
import type { PostgresConfig } from '../postgres/config';

export interface Session {
  id: string;
  tree_data: Record<string, unknown>;
  current_branch?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
}

export interface SessionCreateInput {
  tree_data?: Record<string, unknown>;
  current_branch?: string;
  metadata?: Record<string, unknown>;
  expires_at?: Date;
}

export interface SessionUpdateInput {
  tree_data?: Record<string, unknown>;
  current_branch?: string;
  metadata?: Record<string, unknown>;
  expires_at?: Date;
}

export interface SessionFilter {
  limit?: number;
  offset?: number;
  includeExpired?: boolean;
}

export class SessionRepository {
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
   * Create a new session
   */
  async create(input: SessionCreateInput = {}): Promise<Session> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SessionRow>(
      `INSERT INTO sessions (tree_data, current_branch, metadata, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        JSON.stringify(input.tree_data || {}),
        input.current_branch || null,
        JSON.stringify(input.metadata || {}),
        input.expires_at?.toISOString() || null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find a session by ID
   */
  async findById(id: string): Promise<Session | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SessionRow>(
      `SELECT * FROM sessions WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    
    const session = this.mapRow(result.rows[0]);
    
    // Check if session is expired
    if (session.expires_at && session.expires_at < new Date()) {
      return null;
    }
    
    return session;
  }

  /**
   * Update a session by ID
   */
  async update(id: string, input: SessionUpdateInput): Promise<Session | null> {
    this.ensureInitialized();
    
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.tree_data !== undefined) {
      updates.push(`tree_data = $${paramIndex++}`);
      values.push(JSON.stringify(input.tree_data));
    }
    if (input.current_branch !== undefined) {
      updates.push(`current_branch = $${paramIndex++}`);
      values.push(input.current_branch);
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.expires_at !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(input.expires_at?.toISOString() || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE sessions 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool!.query<SessionRow>(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Delete a session by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM sessions WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * List sessions with filtering and pagination
   */
  async list(filter: SessionFilter = {}): Promise<Session[]> {
    this.ensureInitialized();
    
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (!filter.includeExpired) {
      conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    let query = `SELECT * FROM sessions ${whereClause} ORDER BY updated_at DESC`;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filter.offset);
    }

    const result = await this.pool!.query<SessionRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Count sessions (excluding expired by default)
   */
  async count(includeExpired: boolean = false): Promise<number> {
    this.ensureInitialized();
    
    let query = 'SELECT COUNT(*) as count FROM sessions';
    
    if (!includeExpired) {
      query += ' WHERE (expires_at IS NULL OR expires_at > NOW())';
    }
    
    const result = await this.pool!.query<{ count: string }>(query);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Check if a session exists and is not expired
   */
  async exists(id: string): Promise<boolean> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<{ exists: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM sessions 
        WHERE id = $1 
        AND (expires_at IS NULL OR expires_at > NOW())
      ) as exists`,
      [id]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Update tree data for a session
   */
  async updateTreeData(
    id: string, 
    treeData: Record<string, unknown>,
    branch?: string
  ): Promise<Session | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SessionRow>(
      `UPDATE sessions 
       SET tree_data = $1, 
           current_branch = COALESCE($2, current_branch),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [JSON.stringify(treeData), branch || null, id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Merge metadata (shallow merge)
   */
  async mergeMetadata(id: string, metadata: Record<string, unknown>): Promise<Session | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SessionRow>(
      `UPDATE sessions 
       SET metadata = metadata || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [JSON.stringify(metadata), id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Get session by current branch
   */
  async findByBranch(branch: string): Promise<Session | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SessionRow>(
      `SELECT * FROM sessions 
       WHERE current_branch = $1 
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [branch]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpired(): Promise<number> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= NOW()'
    );

    return result.rowCount;
  }

  /**
   * Extend session expiration
   */
  async extendExpiration(id: string, expiresAt: Date): Promise<Session | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<SessionRow>(
      `UPDATE sessions 
       SET expires_at = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [expiresAt.toISOString(), id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Create multiple sessions in a single transaction
   */
  async createMany(inputs: SessionCreateInput[]): Promise<Session[]> {
    this.ensureInitialized();
    
    if (inputs.length === 0) return [];

    const client = await this.pool!.getClient();
    try {
      await client.query('BEGIN');

      const created: Session[] = [];
      const batchSize = 100;

      for (let i = 0; i < inputs.length; i += batchSize) {
        const batch = inputs.slice(i, i + batchSize);
        const promises = batch.map(async (input) => {
          const result = await client.query<SessionRow>(
            `INSERT INTO sessions (tree_data, current_branch, metadata, expires_at)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
              JSON.stringify(input.tree_data || {}),
              input.current_branch || null,
              JSON.stringify(input.metadata || {}),
              input.expires_at?.toISOString() || null,
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
   * Update multiple sessions by IDs
   */
  async updateMany(
    ids: string[],
    input: SessionUpdateInput
  ): Promise<number> {
    this.ensureInitialized();
    
    if (ids.length === 0) return 0;

    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.tree_data !== undefined) {
      updates.push(`tree_data = $${paramIndex++}`);
      values.push(JSON.stringify(input.tree_data));
    }
    if (input.current_branch !== undefined) {
      updates.push(`current_branch = $${paramIndex++}`);
      values.push(input.current_branch);
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.expires_at !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(input.expires_at?.toISOString() || null);
    }

    if (updates.length === 1) return 0; // Only updated_at changed

    values.push(JSON.stringify(ids));

    const result = await this.pool!.query(
      `UPDATE sessions SET ${updates.join(', ')} WHERE id = ANY($${paramIndex})`,
      values
    );

    return result.rowCount || 0;
  }

  /**
   * Delete multiple sessions by IDs
   */
  async deleteMany(ids: string[]): Promise<number> {
    this.ensureInitialized();
    
    if (ids.length === 0) return 0;

    const result = await this.pool!.query(
      'DELETE FROM sessions WHERE id = ANY($1)',
      [JSON.stringify(ids)]
    );

    return result.rowCount || 0;
  }

  /**
   * Find multiple sessions by IDs
   */
  async findByIds(ids: string[]): Promise<Map<string, Session>> {
    this.ensureInitialized();
    
    if (ids.length === 0) return new Map();

    const result = await this.pool!.query<SessionRow>(
      'SELECT * FROM sessions WHERE id = ANY($1)',
      [JSON.stringify(ids)]
    );

    const map = new Map<string, Session>();
    for (const row of result.rows) {
      // Filter out expired sessions
      if (!row.expires_at || new Date(row.expires_at) > new Date()) {
        map.set(row.id, this.mapRow(row));
      }
    }
    return map;
  }

  /**
   * Check if multiple sessions exist
   */
  async existsMany(ids: string[]): Promise<Map<string, boolean>> {
    this.ensureInitialized();
    
    if (ids.length === 0) return new Map();

    const result = await this.pool!.query<{ id: string; exists: boolean }>(
      `SELECT id, 
        (expires_at IS NULL OR expires_at > NOW()) as exists
       FROM sessions WHERE id = ANY($1)`,
      [JSON.stringify(ids)]
    );

    const map = new Map<string, boolean>();
    for (const row of result.rows) {
      map.set(row.id, row.exists);
    }
    return map;
  }

  /**
   * Cleanup all expired sessions in bulk
   */
  async cleanupAllExpired(): Promise<number> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= NOW()'
    );

    return result.rowCount || 0;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('SessionRepository not initialized. Call initialize() first.');
    }
  }

  private mapRow(row: SessionRow): Session {
    return {
      id: row.id,
      tree_data: this.parseJson(row.tree_data),
      current_branch: row.current_branch || undefined,
      metadata: this.parseJson(row.metadata),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
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
interface SessionRow {
  id: string;
  tree_data: string | Record<string, unknown>;
  current_branch?: string;
  metadata: string | Record<string, unknown>;
  created_at: string;
  updated_at: string;
  expires_at?: string;
}

export default SessionRepository;
