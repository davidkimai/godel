"use strict";
/**
 * Swarm Repository - PostgreSQL Implementation
 *
 * Full CRUD operations for swarms with PostgreSQL persistence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SwarmRepository = void 0;
const pool_1 = require("../postgres/pool");
class SwarmRepository {
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
     * Create a new swarm
     */
    async create(input) {
        this.ensureInitialized();
        const { name, config = {}, status = 'creating' } = input;
        const result = await this.pool.query(`INSERT INTO swarms (name, config, status)
       VALUES ($1, $2, $3)
       RETURNING id, name, config, status, created_at, updated_at, completed_at`, [name, JSON.stringify(config), status]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find a swarm by ID
     */
    async findById(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT id, name, config, status, created_at, updated_at, completed_at
       FROM swarms 
       WHERE id = $1`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Find a swarm by name
     */
    async findByName(name) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT id, name, config, status, created_at, updated_at, completed_at
       FROM swarms 
       WHERE name = $1`, [name]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Update a swarm by ID
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
        const result = await this.pool.query(query, values);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Delete a swarm by ID (cascades to agents and events)
     */
    async delete(id) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM swarms WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
    /**
     * List swarms with filtering and pagination
     */
    async list(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Count swarms with optional filter
     */
    async count(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
        let paramIndex = 1;
        if (filter.status) {
            conditions.push(`status = $${paramIndex++}`);
            values.push(filter.status);
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await this.pool.query(`SELECT COUNT(*) as count FROM swarms ${whereClause}`, values);
        return parseInt(result.rows[0].count, 10);
    }
    /**
     * Get swarm summary with agent counts and budget info
     */
    async getSummary(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM swarm_summary WHERE id = $1`, [id]);
        return result.rows.length > 0 ? this.mapSummaryRow(result.rows[0]) : null;
    }
    /**
     * List swarm summaries
     */
    async listSummaries(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapSummaryRow(row));
    }
    /**
     * Check if a swarm exists
     */
    async exists(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT EXISTS(SELECT 1 FROM swarms WHERE id = $1) as exists`, [id]);
        return result.rows[0]?.exists || false;
    }
    /**
     * Update swarm status atomically
     */
    async updateStatus(id, status) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE swarms 
       SET status = $1, updated_at = NOW()
       WHERE id = $2
       RETURNING id, name, config, status, created_at, updated_at, completed_at`, [status, id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    // ============================================================================
    // Private helpers
    // ============================================================================
    ensureInitialized() {
        if (!this.pool) {
            throw new Error('SwarmRepository not initialized. Call initialize() first.');
        }
    }
    mapRow(row) {
        return {
            id: row.id,
            name: row.name,
            config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
            status: row.status,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at),
            completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
        };
    }
    mapSummaryRow(row) {
        return {
            id: row.id,
            name: row.name,
            status: row.status,
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
exports.SwarmRepository = SwarmRepository;
exports.default = SwarmRepository;
