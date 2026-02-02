"use strict";
/**
 * Agent Repository with Caching
 *
 * CRUD operations for agents in SQLite with LRU caching.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRepository = void 0;
const sqlite_1 = require("../sqlite");
const cache_1 = require("../../utils/cache");
class AgentRepository {
    constructor() {
        // Cache for individual agents (30 second TTL)
        this.cache = new cache_1.LRUCache({ maxSize: 200, defaultTTL: 30000 });
        // Cache for agent lists by swarm (10 second TTL - more volatile)
        this.swarmCache = new cache_1.LRUCache({ maxSize: 50, defaultTTL: 10000 });
    }
    async create(data) {
        const db = await (0, sqlite_1.getDb)();
        const id = `agent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        const agent = {
            id,
            label: data.label,
            status: data.status || 'idle',
            model: data.model || 'unknown',
            task: data.task || '',
            spawned_at: now,
            retry_count: 0,
            max_retries: data.max_retries || 3
        };
        await db.run(`INSERT INTO agents (id, label, status, model, task, spawned_at, retry_count, max_retries, swarm_id, parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [agent.id, agent.label, agent.status, agent.model, agent.task,
            agent.spawned_at, agent.retry_count, agent.max_retries,
            data.swarm_id || null, data.parent_id || null]);
        // Cache the new agent
        this.cache.set(agent.id, agent);
        // Invalidate swarm cache if agent belongs to a swarm
        if (data.swarm_id) {
            this.swarmCache.delete(data.swarm_id);
        }
        return agent;
    }
    async findById(id) {
        // Check cache first
        const cached = this.cache.get(id);
        if (cached) {
            return cached;
        }
        const db = await (0, sqlite_1.getDb)();
        const row = await db.get('SELECT * FROM agents WHERE id = ?', [id]);
        if (!row)
            return undefined;
        const agent = this.mapRow(row);
        // Cache the result
        this.cache.set(id, agent);
        return agent;
    }
    async findBySwarmId(swarmId) {
        // Check cache first
        const cached = this.swarmCache.get(swarmId);
        if (cached) {
            return cached;
        }
        const db = await (0, sqlite_1.getDb)();
        const rows = await db.all('SELECT * FROM agents WHERE swarm_id = ?', [swarmId]);
        const agents = rows.map(row => this.mapRow(row));
        // Cache the list
        this.swarmCache.set(swarmId, agents);
        // Also cache individual agents
        for (const agent of agents) {
            this.cache.set(agent.id, agent);
        }
        return agents;
    }
    async list() {
        const db = await (0, sqlite_1.getDb)();
        const rows = await db.all('SELECT * FROM agents ORDER BY spawned_at DESC');
        return rows.map(row => this.mapRow(row));
    }
    async updateStatus(id, status) {
        const db = await (0, sqlite_1.getDb)();
        const now = new Date().toISOString();
        let query = 'UPDATE agents SET status = ?';
        const params = [status];
        if (status === 'completed' || status === 'failed') {
            query += ', completed_at = ?';
            params.push(now);
        }
        query += ' WHERE id = ?';
        params.push(id);
        await db.run(query, params);
        // Invalidate cache
        this.invalidateAgent(id);
    }
    /**
     * Update an agent with partial data
     */
    async update(id, data) {
        const db = await (0, sqlite_1.getDb)();
        const fields = [];
        const values = [];
        for (const [key, value] of Object.entries(data)) {
            if (value !== undefined) {
                fields.push(`${key} = ?`);
                values.push(value);
            }
        }
        if (fields.length === 0)
            return;
        values.push(id);
        const query = `UPDATE agents SET ${fields.join(', ')} WHERE id = ?`;
        await db.run(query, values);
        // Invalidate cache
        this.invalidateAgent(id);
    }
    /**
     * Invalidate cache entries for an agent
     */
    invalidateAgent(id) {
        const agent = this.cache.get(id);
        this.cache.delete(id);
        // Invalidate swarm cache if we know the swarm
        if (agent?.swarm_id) {
            this.swarmCache.delete(agent.swarm_id);
        }
    }
    /**
     * Clear all caches
     */
    clearCache() {
        this.cache.clear();
        this.swarmCache.clear();
    }
    mapRow(row) {
        return {
            id: row.id,
            label: row.label,
            status: row.status,
            model: row.model,
            task: row.task,
            spawned_at: row.spawned_at,
            completed_at: row.completed_at,
            runtime: row.runtime,
            pause_time: row.pause_time,
            paused_by: row.paused_by,
            swarm_id: row.swarm_id,
            parent_id: row.parent_id,
            child_ids: row.child_ids ? JSON.parse(row.child_ids) : undefined,
            context: row.context ? JSON.parse(row.context) : undefined,
            code: row.code ? JSON.parse(row.code) : undefined,
            reasoning: row.reasoning ? JSON.parse(row.reasoning) : undefined,
            retry_count: row.retry_count,
            max_retries: row.max_retries,
            last_error: row.last_error,
            budget_limit: row.budget_limit,
            safety_boundaries: row.safety_boundaries ? JSON.parse(row.safety_boundaries) : undefined,
            metadata: row.metadata ? JSON.parse(row.metadata) : undefined
        };
    }
}
exports.AgentRepository = AgentRepository;
exports.default = AgentRepository;
//# sourceMappingURL=AgentRepository.js.map