/**
 * API Key Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for API keys with PostgreSQL persistence.
 * Provides hashed key storage, scope management, and usage tracking.
 */

import { PostgresPool, getPool, type PostgresPoolConfig } from '../postgres/pool';

export interface ApiKey {
  id: string;
  key_hash: string;
  name: string;
  scopes: string[];
  rate_limit: number;
  is_active: boolean;
  is_revoked: boolean;
  revoked_at?: Date;
  user_id?: string;
  metadata: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  expires_at?: Date;
  last_used_at?: Date;
}

export interface ApiKeyCreateInput {
  key_hash: string;
  name: string;
  scopes?: string[];
  rate_limit?: number;
  user_id?: string;
  metadata?: Record<string, unknown>;
  expires_at?: Date;
}

export interface ApiKeyUpdateInput {
  name?: string;
  scopes?: string[];
  rate_limit?: number;
  is_active?: boolean;
  is_revoked?: boolean;
  metadata?: Record<string, unknown>;
  expires_at?: Date;
  last_used_at?: Date;
}

export interface ApiKeyFilter {
  limit?: number;
  offset?: number;
  includeRevoked?: boolean;
  includeExpired?: boolean;
  userId?: string;
  isActive?: boolean;
}

export class ApiKeyRepository {
  private pool: PostgresPool | null = null;
  private config?: Partial<PostgresPoolConfig>;

  constructor(config?: Partial<PostgresPoolConfig>) {
    this.config = config;
  }

  /**
   * Initialize the repository with a database pool
   */
  async initialize(): Promise<void> {
    try {
      this.pool = await getPool(this.config);
    } catch (error) {
      // If global pool fails and we have config, create a private pool
      if (this.config) {
        this.pool = new PostgresPool(this.config);
        await this.pool.initialize();
      } else {
        throw error;
      }
    }
  }

  /**
   * Create a new API key
   */
  async create(input: ApiKeyCreateInput): Promise<ApiKey> {
    this.ensureInitialized();

    const result = await this.pool!.query<ApiKeyRow>(
      `INSERT INTO api_keys (key_hash, name, scopes, rate_limit, user_id, metadata, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        input.key_hash,
        input.name,
        JSON.stringify(input.scopes || ['read']),
        input.rate_limit || 100,
        input.user_id || null,
        JSON.stringify(input.metadata || {}),
        input.expires_at?.toISOString() || null,
      ]
    );

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find an API key by ID
   */
  async findById(id: string): Promise<ApiKey | null> {
    this.ensureInitialized();

    const result = await this.pool!.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find an API key by its hash
   */
  async findByKeyHash(keyHash: string): Promise<ApiKey | null> {
    this.ensureInitialized();

    const result = await this.pool!.query<ApiKeyRow>(
      `SELECT * FROM api_keys WHERE key_hash = $1`,
      [keyHash]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Find an API key by its hash that is active and not revoked/expired
   */
  async findValidKey(keyHash: string): Promise<ApiKey | null> {
    this.ensureInitialized();

    const result = await this.pool!.query<ApiKeyRow>(
      `SELECT * FROM api_keys 
       WHERE key_hash = $1 
       AND is_active = true 
       AND is_revoked = false
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [keyHash]
    );

    if (result.rows.length === 0) return null;
    return this.mapRow(result.rows[0]);
  }

  /**
   * Update an API key by ID
   */
  async update(id: string, input: ApiKeyUpdateInput): Promise<ApiKey | null> {
    this.ensureInitialized();

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (input.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(input.name);
    }
    if (input.scopes !== undefined) {
      updates.push(`scopes = $${paramIndex++}`);
      values.push(JSON.stringify(input.scopes));
    }
    if (input.rate_limit !== undefined) {
      updates.push(`rate_limit = $${paramIndex++}`);
      values.push(input.rate_limit);
    }
    if (input.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(input.is_active);
    }
    if (input.is_revoked !== undefined) {
      updates.push(`is_revoked = $${paramIndex++}`);
      values.push(input.is_revoked);
      if (input.is_revoked) {
        updates.push(`revoked_at = $${paramIndex++}`);
        values.push(new Date().toISOString());
      }
    }
    if (input.metadata !== undefined) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(input.metadata));
    }
    if (input.expires_at !== undefined) {
      updates.push(`expires_at = $${paramIndex++}`);
      values.push(input.expires_at?.toISOString() || null);
    }
    if (input.last_used_at !== undefined) {
      updates.push(`last_used_at = $${paramIndex++}`);
      values.push(input.last_used_at?.toISOString() || null);
    }

    if (updates.length === 0) {
      return this.findById(id);
    }

    values.push(id);
    const query = `
      UPDATE api_keys 
      SET ${updates.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await this.pool!.query<ApiKeyRow>(query, values);
    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Revoke an API key
   */
  async revoke(id: string): Promise<ApiKey | null> {
    this.ensureInitialized();

    const result = await this.pool!.query<ApiKeyRow>(
      `UPDATE api_keys 
       SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Update the last used timestamp
   */
  async updateLastUsed(id: string): Promise<void> {
    this.ensureInitialized();

    await this.pool!.query(
      `UPDATE api_keys 
       SET last_used_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );
  }

  /**
   * Delete an API key by ID
   */
  async delete(id: string): Promise<boolean> {
    this.ensureInitialized();

    const result = await this.pool!.query(
      'DELETE FROM api_keys WHERE id = $1',
      [id]
    );

    return result.rowCount > 0;
  }

  /**
   * List API keys with filtering and pagination
   */
  async list(filter: ApiKeyFilter = {}): Promise<ApiKey[]> {
    this.ensureInitialized();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.userId !== undefined) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filter.userId);
    }

    if (filter.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      values.push(filter.isActive);
    }

    if (!filter.includeRevoked) {
      conditions.push(`is_revoked = false`);
    }

    if (!filter.includeExpired) {
      conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    let query = `SELECT * FROM api_keys ${whereClause} ORDER BY created_at DESC`;

    if (filter.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filter.offset);
    }

    const result = await this.pool!.query<ApiKeyRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Count API keys
   */
  async count(filter: Omit<ApiKeyFilter, 'limit' | 'offset'> = {}): Promise<number> {
    this.ensureInitialized();

    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (filter.userId !== undefined) {
      conditions.push(`user_id = $${paramIndex++}`);
      values.push(filter.userId);
    }

    if (filter.isActive !== undefined) {
      conditions.push(`is_active = $${paramIndex++}`);
      values.push(filter.isActive);
    }

    if (!filter.includeRevoked) {
      conditions.push(`is_revoked = false`);
    }

    if (!filter.includeExpired) {
      conditions.push(`(expires_at IS NULL OR expires_at > NOW())`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT COUNT(*) as count FROM api_keys ${whereClause}`;

    const result = await this.pool!.query<{ count: string }>(query, values);
    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Check if an API key exists
   */
  async exists(id: string): Promise<boolean> {
    this.ensureInitialized();

    const result = await this.pool!.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM api_keys WHERE id = $1) as exists`,
      [id]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Check if a key hash is valid and active
   */
  async isValidKey(keyHash: string): Promise<boolean> {
    this.ensureInitialized();

    const result = await this.pool!.query<{ exists: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM api_keys 
        WHERE key_hash = $1 
        AND is_active = true 
        AND is_revoked = false
        AND (expires_at IS NULL OR expires_at > NOW())
      ) as exists`,
      [keyHash]
    );

    return result.rows[0]?.exists || false;
  }

  /**
   * Rotate an API key (revoke old, create new with same properties)
   */
  async rotate(id: string, newKeyHash: string): Promise<{ oldKey: ApiKey | null; newKey: ApiKey | null }> {
    this.ensureInitialized();

    return this.pool!.withTransaction(async (client) => {
      // Get the old key
      const oldResult = await client.query<ApiKeyRow>(
        'SELECT * FROM api_keys WHERE id = $1',
        [id]
      );

      if (oldResult.rows.length === 0) {
        return { oldKey: null, newKey: null };
      }

      const oldKey = this.mapRow(oldResult.rows[0]);

      // Revoke the old key
      await client.query(
        `UPDATE api_keys 
         SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [id]
      );

      // Create new key with same properties
      const newResult = await client.query<ApiKeyRow>(
        `INSERT INTO api_keys (key_hash, name, scopes, rate_limit, user_id, metadata, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          newKeyHash,
          `${oldKey.name} (rotated)`,
          JSON.stringify(oldKey.scopes),
          oldKey.rate_limit,
          oldKey.user_id || null,
          JSON.stringify({ ...oldKey.metadata, rotatedFrom: oldKey.id }),
          oldKey.expires_at?.toISOString() || null,
        ]
      );

      const newKey = this.mapRow(newResult.rows[0]);

      return { oldKey, newKey };
    });
  }

  /**
   * Clean up expired keys (soft delete by revoking)
   */
  async cleanupExpired(): Promise<number> {
    this.ensureInitialized();

    const result = await this.pool!.query(
      `UPDATE api_keys 
       SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
       WHERE expires_at IS NOT NULL 
       AND expires_at <= NOW()
       AND is_revoked = false`
    );

    return result.rowCount;
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('ApiKeyRepository not initialized. Call initialize() first.');
    }
  }

  private mapRow(row: ApiKeyRow): ApiKey {
    return {
      id: row.id,
      key_hash: row.key_hash,
      name: row.name,
      scopes: this.parseScopes(row.scopes),
      rate_limit: row.rate_limit,
      is_active: row.is_active,
      is_revoked: row.is_revoked,
      revoked_at: row.revoked_at ? new Date(row.revoked_at) : undefined,
      user_id: row.user_id || undefined,
      metadata: this.parseJson(row.metadata),
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
      expires_at: row.expires_at ? new Date(row.expires_at) : undefined,
      last_used_at: row.last_used_at ? new Date(row.last_used_at) : undefined,
    };
  }

  private parseScopes(value: string | string[] | null): string[] {
    if (!value) return ['read'];
    if (Array.isArray(value)) return value;
    try {
      return JSON.parse(value);
    } catch {
      return ['read'];
    }
  }

  private parseJson(value: string | Record<string, unknown> | null): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'object') return value as Record<string, unknown>;
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
}

// Database row types
interface ApiKeyRow {
  id: string;
  key_hash: string;
  name: string;
  scopes: string | string[];
  rate_limit: number;
  is_active: boolean;
  is_revoked: boolean;
  revoked_at?: string;
  user_id?: string;
  metadata: string | Record<string, unknown>;
  created_at: string;
  updated_at: string;
  expires_at?: string;
  last_used_at?: string;
}

export default ApiKeyRepository;
