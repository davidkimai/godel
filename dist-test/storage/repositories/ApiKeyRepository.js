"use strict";
/**
 * API Key Repository - PostgreSQL Implementation
 *
 * Full CRUD operations for API keys with PostgreSQL persistence.
 * Provides hashed key storage, scope management, and usage tracking.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApiKeyRepository = void 0;
const pool_1 = require("../postgres/pool");
class ApiKeyRepository {
    constructor(config) {
        this.pool = null;
        this.config = config;
    }
    /**
     * Initialize the repository with a database pool
     */
    async initialize() {
        try {
            this.pool = await (0, pool_1.getPool)(this.config);
        }
        catch (error) {
            // If global pool fails and we have config, create a private pool
            if (this.config) {
                this.pool = new pool_1.PostgresPool(this.config);
                await this.pool.initialize();
            }
            else {
                throw error;
            }
        }
    }
    /**
     * Create a new API key
     */
    async create(input) {
        this.ensureInitialized();
        const result = await this.pool.query(`INSERT INTO api_keys (key_hash, name, scopes, rate_limit, user_id, metadata, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`, [
            input.key_hash,
            input.name,
            JSON.stringify(input.scopes || ['read']),
            input.rate_limit || 100,
            input.user_id || null,
            JSON.stringify(input.metadata || {}),
            input.expires_at?.toISOString() || null,
        ]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find an API key by ID
     */
    async findById(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM api_keys WHERE id = $1`, [id]);
        if (result.rows.length === 0)
            return null;
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find an API key by its hash
     */
    async findByKeyHash(keyHash) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM api_keys WHERE key_hash = $1`, [keyHash]);
        if (result.rows.length === 0)
            return null;
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find an API key by its hash that is active and not revoked/expired
     */
    async findValidKey(keyHash) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM api_keys 
       WHERE key_hash = $1 
       AND is_active = true 
       AND is_revoked = false
       AND (expires_at IS NULL OR expires_at > NOW())`, [keyHash]);
        if (result.rows.length === 0)
            return null;
        return this.mapRow(result.rows[0]);
    }
    /**
     * Update an API key by ID
     */
    async update(id, input) {
        this.ensureInitialized();
        const updates = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Revoke an API key
     */
    async revoke(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE api_keys 
       SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Update the last used timestamp
     */
    async updateLastUsed(id) {
        this.ensureInitialized();
        await this.pool.query(`UPDATE api_keys 
       SET last_used_at = NOW(), updated_at = NOW()
       WHERE id = $1`, [id]);
    }
    /**
     * Delete an API key by ID
     */
    async delete(id) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM api_keys WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
    /**
     * List API keys with filtering and pagination
     */
    async list(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Count API keys
     */
    async count(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return parseInt(result.rows[0].count, 10);
    }
    /**
     * Check if an API key exists
     */
    async exists(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT EXISTS(SELECT 1 FROM api_keys WHERE id = $1) as exists`, [id]);
        return result.rows[0]?.exists || false;
    }
    /**
     * Check if a key hash is valid and active
     */
    async isValidKey(keyHash) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT EXISTS(
        SELECT 1 FROM api_keys 
        WHERE key_hash = $1 
        AND is_active = true 
        AND is_revoked = false
        AND (expires_at IS NULL OR expires_at > NOW())
      ) as exists`, [keyHash]);
        return result.rows[0]?.exists || false;
    }
    /**
     * Rotate an API key (revoke old, create new with same properties)
     */
    async rotate(id, newKeyHash) {
        this.ensureInitialized();
        return this.pool.withTransaction(async (client) => {
            // Get the old key
            const oldResult = await client.query('SELECT * FROM api_keys WHERE id = $1', [id]);
            if (oldResult.rows.length === 0) {
                return { oldKey: null, newKey: null };
            }
            const oldKey = this.mapRow(oldResult.rows[0]);
            // Revoke the old key
            await client.query(`UPDATE api_keys 
         SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
         WHERE id = $1`, [id]);
            // Create new key with same properties
            const newResult = await client.query(`INSERT INTO api_keys (key_hash, name, scopes, rate_limit, user_id, metadata, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`, [
                newKeyHash,
                `${oldKey.name} (rotated)`,
                JSON.stringify(oldKey.scopes),
                oldKey.rate_limit,
                oldKey.user_id || null,
                JSON.stringify({ ...oldKey.metadata, rotatedFrom: oldKey.id }),
                oldKey.expires_at?.toISOString() || null,
            ]);
            const newKey = this.mapRow(newResult.rows[0]);
            return { oldKey, newKey };
        });
    }
    /**
     * Clean up expired keys (soft delete by revoking)
     */
    async cleanupExpired() {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE api_keys 
       SET is_revoked = true, revoked_at = NOW(), updated_at = NOW()
       WHERE expires_at IS NOT NULL 
       AND expires_at <= NOW()
       AND is_revoked = false`);
        return result.rowCount;
    }
    // ============================================================================
    // Private helpers
    // ============================================================================
    ensureInitialized() {
        if (!this.pool) {
            throw new Error('ApiKeyRepository not initialized. Call initialize() first.');
        }
    }
    mapRow(row) {
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
    parseScopes(value) {
        if (!value)
            return ['read'];
        if (Array.isArray(value))
            return value;
        try {
            return JSON.parse(value);
        }
        catch {
            return ['read'];
        }
    }
    parseJson(value) {
        if (!value)
            return {};
        if (typeof value === 'object')
            return value;
        try {
            return JSON.parse(value);
        }
        catch {
            return {};
        }
    }
}
exports.ApiKeyRepository = ApiKeyRepository;
exports.default = ApiKeyRepository;
