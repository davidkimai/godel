"use strict";
/**
 * Session Repository - PostgreSQL Implementation
 *
 * Full CRUD operations for sessions with PostgreSQL persistence.
 * Sessions store tree_data for conversation/session state.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionRepository = void 0;
const pool_1 = require("../postgres/pool");
class SessionRepository {
    constructor(config) {
        this.pool = null;
        this.config = config;
    }
    /**
     * Initialize the repository with a database pool
     */
    async initialize() {
        this.pool = await (0, pool_1.getPool)(this.config);
    }
    /**
     * Create a new session
     */
    async create(input = {}) {
        this.ensureInitialized();
        const result = await this.pool.query(`INSERT INTO sessions (tree_data, current_branch, metadata, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`, [
            JSON.stringify(input.tree_data || {}),
            input.current_branch || null,
            JSON.stringify(input.metadata || {}),
            input.expires_at?.toISOString() || null,
        ]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find a session by ID
     */
    async findById(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM sessions WHERE id = $1`, [id]);
        if (result.rows.length === 0)
            return null;
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
    async update(id, input) {
        this.ensureInitialized();
        const updates = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Delete a session by ID
     */
    async delete(id) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM sessions WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
    /**
     * List sessions with filtering and pagination
     */
    async list(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Count sessions (excluding expired by default)
     */
    async count(includeExpired = false) {
        this.ensureInitialized();
        let query = 'SELECT COUNT(*) as count FROM sessions';
        if (!includeExpired) {
            query += ' WHERE (expires_at IS NULL OR expires_at > NOW())';
        }
        const result = await this.pool.query(query);
        return parseInt(result.rows[0].count, 10);
    }
    /**
     * Check if a session exists and is not expired
     */
    async exists(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT EXISTS(
        SELECT 1 FROM sessions 
        WHERE id = $1 
        AND (expires_at IS NULL OR expires_at > NOW())
      ) as exists`, [id]);
        return result.rows[0]?.exists || false;
    }
    /**
     * Update tree data for a session
     */
    async updateTreeData(id, treeData, branch) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE sessions 
       SET tree_data = $1, 
           current_branch = COALESCE($2, current_branch),
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`, [JSON.stringify(treeData), branch || null, id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Merge metadata (shallow merge)
     */
    async mergeMetadata(id, metadata) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE sessions 
       SET metadata = metadata || $1::jsonb,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`, [JSON.stringify(metadata), id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Get session by current branch
     */
    async findByBranch(branch) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM sessions 
       WHERE current_branch = $1 
       AND (expires_at IS NULL OR expires_at > NOW())`, [branch]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Clean up expired sessions
     */
    async cleanupExpired() {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM sessions WHERE expires_at IS NOT NULL AND expires_at <= NOW()');
        return result.rowCount;
    }
    /**
     * Extend session expiration
     */
    async extendExpiration(id, expiresAt) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE sessions 
       SET expires_at = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING *`, [expiresAt.toISOString(), id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    // ============================================================================
    // Private helpers
    // ============================================================================
    ensureInitialized() {
        if (!this.pool) {
            throw new Error('SessionRepository not initialized. Call initialize() first.');
        }
    }
    mapRow(row) {
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
    parseJson(value) {
        if (!value)
            return {};
        if (typeof value === 'string') {
            try {
                return JSON.parse(value);
            }
            catch {
                return {};
            }
        }
        return value;
    }
}
exports.SessionRepository = SessionRepository;
exports.default = SessionRepository;
