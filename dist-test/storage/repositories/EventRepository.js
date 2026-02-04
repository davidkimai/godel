"use strict";
/**
 * Event Repository - PostgreSQL Implementation
 *
 * Full CRUD operations for events with PostgreSQL persistence.
 * Optimized for time-series data patterns.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventRepository = void 0;
const pool_1 = require("../postgres/pool");
class EventRepository {
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
     * Create a new event
     */
    async create(input) {
        this.ensureInitialized();
        const result = await this.pool.query(`INSERT INTO events (
        swarm_id, agent_id, type, payload, timestamp,
        correlation_id, parent_event_id, entity_type, severity
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`, [
            input.swarm_id || null,
            input.agent_id || null,
            input.type,
            JSON.stringify(input.payload || {}),
            input.timestamp?.toISOString() || new Date().toISOString(),
            input.correlation_id || null,
            input.parent_event_id || null,
            input.entity_type || 'system',
            input.severity || 'info',
        ]);
        return this.mapRow(result.rows[0]);
    }
    /**
     * Find an event by ID
     */
    async findById(id) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM events WHERE id = $1`, [id]);
        return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
    }
    /**
     * Find events by agent ID
     */
    async findByAgentId(agentId, limit = 100) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM events 
       WHERE agent_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`, [agentId, limit]);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Find events by swarm ID
     */
    async findBySwarmId(swarmId, limit = 100) {
        this.ensureInitialized();
        const result = await this.pool.query(`SELECT * FROM events 
       WHERE swarm_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`, [swarmId, limit]);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Find events with filter
     */
    async findByFilter(filter) {
        this.ensureInitialized();
        const { whereClause, values, paramIndex } = this.buildWhereClause(filter);
        let query = `SELECT * FROM events ${whereClause} ORDER BY timestamp DESC`;
        const finalValues = [...values];
        let finalParamIndex = paramIndex;
        if (filter.limit) {
            query += ` LIMIT $${finalParamIndex++}`;
            finalValues.push(filter.limit);
        }
        if (filter.offset) {
            query += ` OFFSET $${finalParamIndex++}`;
            finalValues.push(filter.offset);
        }
        const result = await this.pool.query(query, finalValues);
        return result.rows.map(row => this.mapRow(row));
    }
    /**
     * Count events with filter
     */
    async count(filter = {}) {
        this.ensureInitialized();
        const { whereClause, values } = this.buildWhereClause(filter);
        const result = await this.pool.query(`SELECT COUNT(*) as count FROM events ${whereClause}`, values);
        return parseInt(result.rows[0].count, 10);
    }
    /**
     * Get event statistics
     */
    async getStats(timeWindowHours = 24) {
        this.ensureInitialized();
        const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
        const [totalResult, byTypeResult, bySeverityResult] = await Promise.all([
            this.pool.query('SELECT COUNT(*) as count FROM events WHERE timestamp >= $1', [since.toISOString()]),
            this.pool.query(`SELECT type, COUNT(*) as count 
         FROM events 
         WHERE timestamp >= $1 
         GROUP BY type`, [since.toISOString()]),
            this.pool.query(`SELECT severity, COUNT(*) as count 
         FROM events 
         WHERE timestamp >= $1 
         GROUP BY severity`, [since.toISOString()]),
        ]);
        const byType = {};
        for (const row of byTypeResult.rows) {
            byType[row.type] = parseInt(row.count, 10);
        }
        const bySeverity = {
            debug: 0,
            info: 0,
            warning: 0,
            error: 0,
            critical: 0,
        };
        for (const row of bySeverityResult.rows) {
            bySeverity[row.severity] = parseInt(row.count, 10);
        }
        return {
            total: parseInt(totalResult.rows[0].count, 10),
            byType,
            bySeverity,
        };
    }
    /**
     * Get 24h event statistics view
     */
    async getStats24h() {
        this.ensureInitialized();
        const result = await this.pool.query('SELECT * FROM event_stats_24h ORDER BY event_count DESC');
        return result.rows.map(row => ({
            type: row.type,
            event_count: parseInt(String(row.event_count), 10),
            unique_agents: parseInt(String(row.unique_agents), 10),
            unique_swarms: parseInt(String(row.unique_swarms), 10),
            first_occurrence: new Date(row.first_occurrence),
            last_occurrence: new Date(row.last_occurrence),
        }));
    }
    /**
     * List all events (paginated)
     */
    async list(options = {}) {
        return this.findByFilter({
            limit: options.limit,
            offset: options.offset,
        });
    }
    /**
     * Create multiple events in a batch
     */
    async createBatch(inputs) {
        this.ensureInitialized();
        if (inputs.length === 0)
            return [];
        return this.pool.withTransaction(async (client) => {
            const events = [];
            for (const input of inputs) {
                const result = await client.query(`INSERT INTO events (
            swarm_id, agent_id, type, payload, timestamp,
            correlation_id, parent_event_id, entity_type, severity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`, [
                    input.swarm_id || null,
                    input.agent_id || null,
                    input.type,
                    JSON.stringify(input.payload || {}),
                    input.timestamp?.toISOString() || new Date().toISOString(),
                    input.correlation_id || null,
                    input.parent_event_id || null,
                    input.entity_type || 'system',
                    input.severity || 'info',
                ]);
                events.push(this.mapRow(result.rows[0]));
            }
            return events;
        });
    }
    /**
     * Delete old events (for cleanup)
     */
    async deleteOld(olderThan) {
        this.ensureInitialized();
        const result = await this.pool.query('DELETE FROM events WHERE timestamp < $1', [olderThan.toISOString()]);
        return result.rowCount;
    }
    /**
     * Get event timeline for a specific entity
     */
    async getTimeline(entityType, entityId, options = {}) {
        this.ensureInitialized();
        const conditions = ['entity_type = $1'];
        const values = [entityType];
        let paramIndex = 2;
        if (entityType === 'agent') {
            conditions.push(`agent_id = $${paramIndex++}`);
        }
        else if (entityType === 'task') {
            // For task events, we might store task_id in payload or have a separate column
            conditions.push(`payload->>'task_id' = $${paramIndex++}`);
        }
        else {
            conditions.push(`swarm_id = $${paramIndex++}`);
        }
        values.push(entityId);
        if (options.since) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            values.push(options.since.toISOString());
        }
        if (options.until) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            values.push(options.until.toISOString());
        }
        let query = `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;
        if (options.limit) {
            query += ` LIMIT $${paramIndex++}`;
            values.push(options.limit);
        }
        const result = await this.pool.query(query, values);
        return result.rows.map(row => this.mapRow(row));
    }
    // ============================================================================
    // Private helpers
    // ============================================================================
    ensureInitialized() {
        if (!this.pool) {
            throw new Error('EventRepository not initialized. Call initialize() first.');
        }
    }
    buildWhereClause(filter) {
        const conditions = [];
        const values = [];
        let paramIndex = 1;
        // Support both snake_case and camelCase (camelCase is deprecated)
        const swarmId = filter.swarm_id ?? filter.swarmId;
        const agentId = filter.agent_id ?? filter.agentId;
        if (swarmId) {
            conditions.push(`swarm_id = $${paramIndex++}`);
            values.push(swarmId);
        }
        if (agentId) {
            conditions.push(`agent_id = $${paramIndex++}`);
            values.push(agentId);
        }
        if (filter.types?.length) {
            conditions.push(`type = ANY($${paramIndex++})`);
            values.push(filter.types);
        }
        if (filter.entity_type) {
            conditions.push(`entity_type = $${paramIndex++}`);
            values.push(filter.entity_type);
        }
        if (filter.severity) {
            conditions.push(`severity = $${paramIndex++}`);
            values.push(filter.severity);
        }
        if (filter.since) {
            conditions.push(`timestamp >= $${paramIndex++}`);
            values.push(filter.since.toISOString());
        }
        if (filter.until) {
            conditions.push(`timestamp <= $${paramIndex++}`);
            values.push(filter.until.toISOString());
        }
        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        return { whereClause, values, paramIndex };
    }
    mapRow(row) {
        return {
            id: row.id,
            swarm_id: row.swarm_id || undefined,
            agent_id: row.agent_id || undefined,
            type: row.type,
            payload: this.parseJson(row.payload),
            timestamp: new Date(row.timestamp),
            correlation_id: row.correlation_id || undefined,
            parent_event_id: row.parent_event_id || undefined,
            entity_type: row.entity_type,
            severity: row.severity,
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
exports.EventRepository = EventRepository;
exports.default = EventRepository;
