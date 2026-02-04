"use strict";
/**
 * Agent Repository - PostgreSQL Implementation
 *
 * Full CRUD operations for agents with PostgreSQL persistence.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRepository = void 0;
const pool_1 = require("../postgres/pool");
class AgentRepository {
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
     * Create a new agent
     */
    async create(input) {
        this.ensureInitialized();
        const result = await this.pool.query(`INSERT INTO agents (
        swarm_id, label, status, lifecycle_state, model, task, config,
        context, code, reasoning, safety_boundaries, max_retries, budget_limit, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`, [
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
        ]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find an agent by ID
     */
    async findById(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM agents WHERE id = $1`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Find agents by swarm ID
     */
    async findBySwarmId(swarmId) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM agents WHERE swarm_id = $1 ORDER BY spawned_at DESC`, [swarmId]);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Update an agent by ID
     */
    async update(id, input) {
        this.ensureInitialized();
        const updates = [];
        const values = [];
        let paramIndex = 1;
        const jsonFields = ['config', 'context', 'code', 'reasoning', 'safety_boundaries', 'metadata'];
        for (const [key, value] of Object.entries(input)) {
            if (value !== undefined) {
                updates.push(`${key} = $${paramIndex++}`);
                if (jsonFields.includes(key)) {
                    values.push(JSON.stringify(value));
                }
                else if (value instanceof Date) {
                    values.push(value.toISOString());
                }
                else {
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
        const result = await this.pool.query(query, values);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Delete an agent by ID
     */
    async delete(id) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM agents WHERE id = $1', [id]);
        return result.rowCount > 0;
    }
    /**
     * List agents with filtering and pagination
     */
    async list(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Count agents with optional filter
     */
    async count(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(`SELECT COUNT(*) as count FROM agents ${whereClause}`, values);
        return parseInt(result.rows[0].count, 10);
    }
    /**
     * Get agent counts grouped by status
     */
    async getCountsByStatus() {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT status, COUNT(*) as count FROM agents GROUP BY status`);
        const counts = {
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
    async updateStatus(id, status) {
        this.ensureInitialized();
        const updates = ['status = $1'];
        const values = [status];
        if (status === 'completed' || status === 'failed') {
            updates.push('completed_at = NOW()');
        }
        values.push(id);
        const result = await this.pool.query(`UPDATE agents SET ${updates.join(', ')} WHERE id = $${values.length} RETURNING *`, values);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Update lifecycle state
     */
    async updateLifecycleState(id, state) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE agents SET lifecycle_state = $1 WHERE id = $2 RETURNING *`, [state, id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Pause an agent
     */
    async pause(id, pausedBy) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE agents 
       SET status = 'paused', 
           lifecycle_state = 'paused',
           pause_time = NOW(),
           paused_by = $1
       WHERE id = $2 
       RETURNING *`, [pausedBy || null, id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Resume an agent
     */
    async resume(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE agents 
       SET status = 'running', 
           lifecycle_state = 'running',
           pause_time = NULL,
           paused_by = NULL
       WHERE id = $1 
       RETURNING *`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Increment retry count
     */
    async incrementRetry(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`UPDATE agents SET retry_count = retry_count + 1 WHERE id = $1 RETURNING *`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Get agent activity view
     */
    async getActivity(filter = {}) {
        this.ensureInitialized();
        const conditions = [];
        const values = [];
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
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapActivityRow(row));
    }
    /**
     * Bulk delete agents by swarm ID
     */
    async deleteBySwarmId(swarmId) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM agents WHERE swarm_id = $1', [swarmId]);
        return result.rowCount;
    }
    // ============================================================================
    // Private helpers
    // ============================================================================
    ensureInitialized() {
        if (!this.pool) {
            throw new Error('AgentRepository not initialized. Call initialize() first.');
        }
    }
    mapRow(row) {
        return {
            id: row.id,
            swarm_id: row.swarm_id || undefined,
            label: row.label || undefined,
            status: row.status,
            lifecycle_state: row.lifecycle_state,
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
    mapActivityRow(row) {
        return {
            id: row.id,
            label: row.label || undefined,
            status: row.status,
            lifecycle_state: row.lifecycle_state,
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
exports.AgentRepository = AgentRepository;
exports.default = AgentRepository;
