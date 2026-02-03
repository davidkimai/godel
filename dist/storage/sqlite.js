"use strict";
/**
 * SQLite Storage with Transaction Support - SPEC_v2.md Section 2.3
 *
 * Persistent storage for agents, swarms, and events using SQLite.
 *
 * RACE CONDITION FIXES v3:
 * - Transaction support for multi-step operations
 * - BEGIN → operations → COMMIT/ROLLBACK pattern
 * - Prevents partial writes and ensures atomic operations
 * - Uses better-sqlite3 for synchronous, transactional operations
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.memoryStore = exports.SQLiteStorage = void 0;
exports.getGlobalSQLiteStorage = getGlobalSQLiteStorage;
exports.resetGlobalSQLiteStorage = resetGlobalSQLiteStorage;
exports.getDb = getDb;
exports.initDatabase = initDatabase;
exports.closeDatabase = closeDatabase;
// ============================================================================
// SQLite Storage
// ============================================================================
class SQLiteStorage {
    constructor(config) {
        this.activeTransaction = null;
        this.DEFAULT_BUSY_TIMEOUT = 5000; // 5 seconds
        this.statementCache = new Map();
        this.MAX_CACHED_STATEMENTS = 100;
        this.config = {
            enableWAL: true,
            busyTimeout: this.DEFAULT_BUSY_TIMEOUT,
            ...config,
        };
    }
    /**
     * Initialize the database connection and schema
     */
    async initialize() {
        // Dynamic import to avoid issues if better-sqlite3 is not installed
        const Database = await Promise.resolve().then(() => __importStar(require('better-sqlite3'))).then(m => m.default);
        this.db = new Database(this.config.dbPath);
        // Enable WAL mode for better concurrency (if configured)
        if (this.config.enableWAL) {
            this.db.pragma('journal_mode = WAL');
        }
        // Set busy timeout to wait for locks instead of failing immediately
        this.db.pragma(`busy_timeout = ${this.config.busyTimeout}`);
        // Create tables
        this.createSchema();
    }
    /**
     * Get or create a cached prepared statement
     */
    getCachedStatement(sql) {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        let stmt = this.statementCache.get(sql);
        if (!stmt) {
            // Evict oldest if at capacity (simple FIFO)
            if (this.statementCache.size >= this.MAX_CACHED_STATEMENTS) {
                const firstKey = this.statementCache.keys().next().value;
                if (firstKey !== undefined) {
                    const oldStmt = this.statementCache.get(firstKey);
                    if (oldStmt) {
                        oldStmt.finalize();
                    }
                    this.statementCache.delete(firstKey);
                }
            }
            stmt = this.getDb().prepare(sql);
            this.statementCache.set(sql, stmt);
        }
        return stmt;
    }
    /**
     * Clear the prepared statement cache
     */
    clearStatementCache() {
        for (const stmt of this.statementCache.values()) {
            stmt.finalize();
        }
        this.statementCache.clear();
    }
    /**
     * Execute a SQL statement (INSERT, UPDATE, DELETE)
     */
    async run(sql, ...params) {
        const stmt = this.getCachedStatement(sql);
        const result = stmt.run(...params);
        return {
            changes: result.changes,
            lastInsertRowid: typeof result.lastInsertRowid === 'bigint'
                ? Number(result.lastInsertRowid)
                : result.lastInsertRowid
        };
    }
    /**
     * Get a single row from the database
     */
    async get(sql, ...params) {
        const stmt = this.getCachedStatement(sql);
        return stmt.get(...params);
    }
    /**
     * Get all rows from the database
     */
    async all(sql, ...params) {
        const stmt = this.getCachedStatement(sql);
        return stmt.all(...params);
    }
    /**
     * Create database schema
     */
    createSchema() {
        // Agents table
        this.getDb().exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        label TEXT,
        status TEXT NOT NULL,
        model TEXT NOT NULL,
        task TEXT NOT NULL,
        spawned_at TEXT NOT NULL,
        completed_at TEXT,
        runtime INTEGER DEFAULT 0,
        pause_time TEXT,
        paused_by TEXT,
        swarm_id TEXT,
        parent_id TEXT,
        child_ids TEXT, -- JSON array
        context TEXT, -- JSON
        code TEXT, -- JSON
        reasoning TEXT, -- JSON
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        last_error TEXT,
        budget_limit REAL,
        safety_boundaries TEXT, -- JSON
        metadata TEXT -- JSON
      )
    `);
        // Swarms table
        this.getDb().exec(`
      CREATE TABLE IF NOT EXISTS swarms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        status TEXT NOT NULL,
        config TEXT NOT NULL, -- JSON
        agents TEXT NOT NULL, -- JSON array
        created_at TEXT NOT NULL,
        completed_at TEXT,
        budget_allocated REAL,
        budget_consumed REAL,
        budget_remaining REAL,
        metrics TEXT -- JSON
      )
    `);
        // Events table
        this.getDb().exec(`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        source TEXT, -- JSON
        payload TEXT, -- JSON
        agent_id TEXT,
        swarm_id TEXT
      )
    `);
        // PERFORMANCE ROUND 2: Optimized indexes for common query patterns
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_swarm ON agents(swarm_id)`);
        // PERFORMANCE: Composite index for status-based counting (used by status command)
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_status_id ON agents(status, id)`);
        // PERFORMANCE: Index for sorting agents by spawn time (list commands)
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_spawned ON agents(spawned_at DESC)`);
        // PERFORMANCE: Covering index for lightweight status queries
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_lightweight ON agents(status, model, swarm_id, spawned_at)`);
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent_id)`);
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_events_swarm ON events(swarm_id)`);
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type)`);
        this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_events_time ON events(timestamp)`);
    }
    // ============================================================================
    // Transaction Support (RACE CONDITION FIX)
    // ============================================================================
    /**
     * Begin a transaction
     * RACE CONDITION FIX: All multi-step operations should use transactions
     */
    beginTransaction() {
        if (this.activeTransaction) {
            throw new Error('Transaction already in progress');
        }
        this.getDb().exec('BEGIN');
        const transaction = {
            isActive: true,
            commit: () => {
                if (!transaction.isActive) {
                    throw new Error('Transaction is not active');
                }
                this.getDb().exec('COMMIT');
                transaction.isActive = false;
                this.activeTransaction = null;
            },
            rollback: () => {
                if (!transaction.isActive) {
                    throw new Error('Transaction is not active');
                }
                this.getDb().exec('ROLLBACK');
                transaction.isActive = false;
                this.activeTransaction = null;
            },
        };
        this.activeTransaction = transaction;
        return transaction;
    }
    /**
     * Execute operations within a transaction
     * RACE CONDITION FIX: Automatic rollback on error
     */
    withTransaction(operations) {
        const tx = this.beginTransaction();
        try {
            const result = operations(tx);
            tx.commit();
            return result;
        }
        catch (error) {
            tx.rollback();
            throw error;
        }
    }
    /**
     * Check if a transaction is active
     */
    hasActiveTransaction() {
        return this.activeTransaction !== null && this.activeTransaction.isActive;
    }
    // ============================================================================
    // Agent Operations with Transaction Support
    // ============================================================================
    /**
     * Create an agent (with optional transaction)
     */
    createAgent(agent) {
        const stmt = this.getDb().prepare(`
      INSERT INTO agents (
        id, label, status, model, task, spawned_at, completed_at, runtime,
        pause_time, paused_by, swarm_id, parent_id, child_ids, context,
        code, reasoning, retry_count, max_retries, last_error, budget_limit,
        safety_boundaries, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(agent.id, agent.label || null, agent.status, agent.model, agent.task, agent.spawnedAt.toISOString(), agent.completedAt?.toISOString() || null, agent.runtime, agent.pauseTime?.toISOString() || null, agent.pausedBy || null, agent.swarmId || null, agent.parentId || null, JSON.stringify(agent.childIds), JSON.stringify(agent.context), agent.code ? JSON.stringify(agent.code) : null, agent.reasoning ? JSON.stringify(agent.reasoning) : null, agent.retryCount, agent.maxRetries, agent.lastError || null, agent.budgetLimit || null, agent.safetyBoundaries ? JSON.stringify(agent.safetyBoundaries) : null, JSON.stringify(agent.metadata));
    }
    /**
     * Get database instance or throw error if not initialized
     */
    getDb() {
        if (!this.db) {
            throw new Error('Database not initialized');
        }
        return this.db;
    }
    /**
     * Update an agent (with optional transaction)
     */
    updateAgent(id, updates) {
        const setClauses = [];
        const values = [];
        // Build dynamic update query
        for (const [key, value] of Object.entries(updates)) {
            const column = this.camelToSnake(key);
            setClauses.push(`${column} = ?`);
            // Serialize objects/arrays to JSON
            if (typeof value === 'object' && value !== null) {
                if (value instanceof Date) {
                    values.push(value.toISOString());
                }
                else {
                    values.push(JSON.stringify(value));
                }
            }
            else {
                values.push(value);
            }
        }
        // Add id to values
        values.push(id);
        const query = `UPDATE agents SET ${setClauses.join(', ')} WHERE id = ?`;
        const stmt = this.getDb().prepare(query);
        stmt.run(...values);
    }
    /**
     * Get an agent by ID
     */
    getAgent(id) {
        const stmt = this.getDb().prepare('SELECT * FROM agents WHERE id = ?');
        const row = stmt.get(id);
        if (!row)
            return null;
        return this.rowToAgent(row);
    }
    // ============================================================================
    // PERFORMANCE ROUND 2: Lightweight Query Methods
    // These methods avoid full object construction for read-only operations
    // ============================================================================
    /**
     * Get agent counts by status - O(1) aggregation query
     * PERFORMANCE: Avoids loading all agents into memory
     */
    getAgentCountsByStatus() {
        const stmt = this.getDb().prepare(`
      SELECT status, COUNT(*) as count 
      FROM agents 
      GROUP BY status
    `);
        const rows = stmt.all();
        const counts = {
            total: 0,
            running: 0,
            idle: 0,
            paused: 0,
            failed: 0,
            spawning: 0,
            completed: 0,
            killing: 0,
        };
        for (const row of rows) {
            counts[row.status] = row.count;
            counts['total'] += row.count;
        }
        return counts;
    }
    /**
     * Get lightweight agent info for listing
     * PERFORMANCE: Only selects needed columns, no JSON parsing
     */
    getAgentListLightweight(limit) {
        let query = `
      SELECT id, label, status, model, task, spawned_at, swarm_id, runtime, retry_count, max_retries
      FROM agents 
      ORDER BY spawned_at DESC
    `;
        if (limit) {
            query += ` LIMIT ${limit}`;
        }
        const stmt = this.getDb().prepare(query);
        const rows = stmt.all();
        return rows.map(row => ({
            id: row['id'],
            label: row['label'],
            status: row['status'],
            model: row['model'],
            task: row['task'],
            spawnedAt: row['spawned_at'],
            swarmId: row['swarm_id'],
            runtime: row['runtime'],
            retryCount: row['retry_count'] || 0,
            maxRetries: row['max_retries'] || 3,
        }));
    }
    /**
     * Get total agent count - O(1) indexed count query
     * PERFORMANCE: Uses index-only scan if possible
     */
    getAgentCount() {
        const stmt = this.getDb().prepare('SELECT COUNT(*) as count FROM agents');
        const row = stmt.get();
        return row?.count || 0;
    }
    /**
     * Get agents by status
     */
    getAgentsByStatus(status) {
        const stmt = this.getDb().prepare('SELECT * FROM agents WHERE status = ?');
        const rows = stmt.all(status);
        return rows.map(row => this.rowToAgent(row));
    }
    /**
     * Get agents by swarm
     */
    getAgentsBySwarm(swarmId) {
        const stmt = this.getDb().prepare('SELECT * FROM agents WHERE swarm_id = ?');
        const rows = stmt.all(swarmId);
        return rows.map(row => this.rowToAgent(row));
    }
    /**
     * Delete an agent
     */
    deleteAgent(id) {
        const stmt = this.getDb().prepare('DELETE FROM agents WHERE id = ?');
        stmt.run(id);
    }
    /**
     * Batch create agents (transactional)
     * RACE CONDITION FIX: All-or-nothing batch operation
     */
    batchCreateAgents(agents) {
        this.withTransaction(() => {
            for (const agent of agents) {
                this.createAgent(agent);
            }
        });
    }
    /**
     * Batch update agents (transactional)
     * RACE CONDITION FIX: All-or-nothing batch operation
     */
    batchUpdateAgents(updates) {
        this.withTransaction(() => {
            for (const { id, changes } of updates) {
                this.updateAgent(id, changes);
            }
        });
    }
    // ============================================================================
    // Swarm Operations with Transaction Support
    // ============================================================================
    /**
     * Create a swarm
     */
    createSwarm(swarm) {
        const stmt = this.getDb().prepare(`
      INSERT INTO swarms (
        id, name, status, config, agents, created_at,
        budget_allocated, budget_consumed, budget_remaining, metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(swarm.id, swarm.name, swarm.status, JSON.stringify(swarm.config), JSON.stringify(swarm.agents), swarm.createdAt.toISOString(), swarm.budget.allocated, swarm.budget.consumed, swarm.budget.remaining, JSON.stringify(swarm.metrics));
    }
    /**
     * Update a swarm
     */
    updateSwarm(id, updates) {
        const setClauses = [];
        const values = [];
        for (const [key, value] of Object.entries(updates)) {
            const column = this.camelToSnake(key);
            setClauses.push(`${column} = ?`);
            if (key === 'config' || key === 'metrics') {
                values.push(JSON.stringify(value));
            }
            else if (key === 'agents' && Array.isArray(value)) {
                values.push(JSON.stringify(value));
            }
            else if (value instanceof Date) {
                values.push(value.toISOString());
            }
            else {
                values.push(value);
            }
        }
        values.push(id);
        const query = `UPDATE swarms SET ${setClauses.join(', ')} WHERE id = ?`;
        const stmt = this.getDb().prepare(query);
        stmt.run(...values);
    }
    /**
     * Get a swarm by ID
     */
    getSwarm(id) {
        const stmt = this.getDb().prepare('SELECT * FROM swarms WHERE id = ?');
        const row = stmt.get(id);
        if (!row)
            return null;
        return this.rowToSwarm(row);
    }
    /**
     * Get all swarms
     */
    getAllSwarms() {
        const stmt = this.getDb().prepare('SELECT * FROM swarms ORDER BY created_at DESC');
        const rows = stmt.all();
        return rows.map(row => this.rowToSwarm(row));
    }
    /**
     * Delete a swarm (transactional with agent cleanup)
     * RACE CONDITION FIX: Ensures swarm and agents are deleted together
     */
    deleteSwarm(id) {
        this.withTransaction(() => {
            // Delete associated agents first
            const deleteAgents = this.getDb().prepare('DELETE FROM agents WHERE swarm_id = ?');
            deleteAgents.run(id);
            // Delete the swarm
            const deleteSwarm = this.getDb().prepare('DELETE FROM swarms WHERE id = ?');
            deleteSwarm.run(id);
        });
    }
    // ============================================================================
    // Event Operations
    // ============================================================================
    /**
     * Store an event
     */
    storeEvent(event) {
        const stmt = this.getDb().prepare(`
      INSERT INTO events (id, timestamp, event_type, source, payload, agent_id, swarm_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run(event.id, event.timestamp.toISOString(), event.eventType, event.source ? JSON.stringify(event.source) : null, event.payload ? JSON.stringify(event.payload) : null, event.agentId || null, event.swarmId || null);
    }
    /**
     * Get events by agent
     */
    getEventsByAgent(agentId, limit = 100) {
        const stmt = this.getDb().prepare('SELECT * FROM events WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?');
        const rows = stmt.all(agentId, limit);
        return rows.map(row => this.rowToEvent(row));
    }
    /**
     * Get events by swarm
     */
    getEventsBySwarm(swarmId, limit = 100) {
        const stmt = this.getDb().prepare('SELECT * FROM events WHERE swarm_id = ? ORDER BY timestamp DESC LIMIT ?');
        const rows = stmt.all(swarmId, limit);
        return rows.map(row => this.rowToEvent(row));
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
    /**
     * Close the database connection
     */
    close() {
        this.clearStatementCache();
        if (this.db) {
            this.db.close();
        }
    }
    /**
     * Convert camelCase to snake_case
     */
    camelToSnake(str) {
        return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
    }
    /**
     * Convert database row to Agent object
     */
    rowToAgent(row) {
        return {
            id: row['id'],
            label: row['label'],
            status: row['status'],
            model: row['model'],
            task: row['task'],
            spawnedAt: new Date(row['spawned_at']),
            completedAt: row['completed_at'] ? new Date(row['completed_at']) : undefined,
            runtime: row['runtime'] || 0,
            pauseTime: row['pause_time'] ? new Date(row['pause_time']) : undefined,
            pausedBy: row['paused_by'],
            swarmId: row['swarm_id'],
            parentId: row['parent_id'],
            childIds: row['child_ids'] ? JSON.parse(row['child_ids']) : [],
            context: row['context'] ? JSON.parse(row['context']) : {
                inputContext: [],
                outputContext: [],
                sharedContext: [],
                contextSize: 0,
                contextWindow: 100000,
                contextUsage: 0
            },
            code: row['code'] ? JSON.parse(row['code']) : undefined,
            reasoning: row['reasoning'] ? JSON.parse(row['reasoning']) : {
                traces: [],
                decisions: [],
                confidence: 1.0
            },
            retryCount: row['retry_count'] || 0,
            maxRetries: row['max_retries'] || 3,
            lastError: row['last_error'],
            budgetLimit: row['budget_limit'],
            safetyBoundaries: row['safety_boundaries'] ? JSON.parse(row['safety_boundaries']) : undefined,
            metadata: row['metadata'] ? JSON.parse(row['metadata']) : {},
        };
    }
    /**
     * Convert database row to Swarm object
     */
    rowToSwarm(row) {
        return {
            id: row['id'],
            name: row['name'],
            status: row['status'],
            config: JSON.parse(row['config']),
            agents: JSON.parse(row['agents']),
            createdAt: new Date(row['created_at']),
            completedAt: row['completed_at'] ? new Date(row['completed_at']) : undefined,
            budget: {
                allocated: row['budget_allocated'],
                consumed: row['budget_consumed'],
                remaining: row['budget_remaining'],
            },
            metrics: JSON.parse(row['metrics']),
        };
    }
    /**
     * Convert database row to Event object
     */
    rowToEvent(row) {
        return {
            id: row['id'],
            timestamp: new Date(row['timestamp']),
            eventType: row['event_type'],
            source: row['source'] ? JSON.parse(row['source']) : undefined,
            payload: row['payload'] ? JSON.parse(row['payload']) : undefined,
            agentId: row['agent_id'],
            swarmId: row['swarm_id'],
        };
    }
}
exports.SQLiteStorage = SQLiteStorage;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalSQLiteStorage = null;
let initializationPromise = null;
async function getGlobalSQLiteStorage(config) {
    if (globalSQLiteStorage) {
        return globalSQLiteStorage;
    }
    if (initializationPromise) {
        return initializationPromise;
    }
    if (!config) {
        throw new Error('SQLiteStorage requires config on first initialization');
    }
    initializationPromise = (async () => {
        const storage = new SQLiteStorage(config);
        await storage.initialize();
        globalSQLiteStorage = storage;
        return storage;
    })();
    return initializationPromise;
}
function resetGlobalSQLiteStorage() {
    globalSQLiteStorage?.close();
    globalSQLiteStorage = null;
    initializationPromise = null;
}
/**
 * Get the database instance (alias for getGlobalSQLiteStorage)
 * Used by repositories for database access
 */
async function getDb(config) {
    return getGlobalSQLiteStorage(config);
}
/**
 * Initialize the database (alias for getGlobalSQLiteStorage)
 * Used for explicit initialization with config
 */
async function initDatabase(config) {
    return getGlobalSQLiteStorage(config);
}
/**
 * Close the database connection (alias for resetGlobalSQLiteStorage)
 */
function closeDatabase() {
    resetGlobalSQLiteStorage();
}
// In-memory store for non-persistent storage needs
exports.memoryStore = {
    metadata: new Map(),
    agentsData: new Map(),
    eventsData: new Map(),
    get agents() {
        return {
            get: (id) => exports.memoryStore.agentsData.get(id),
            set: (id, value) => exports.memoryStore.agentsData.set(id, value),
        };
    },
    get events() {
        return {
            create: (event) => exports.memoryStore.eventsData.set(event.id, event),
            get: (id) => exports.memoryStore.eventsData.get(id),
            set: (id, value) => exports.memoryStore.eventsData.set(id, value),
        };
    },
};
exports.default = SQLiteStorage;
//# sourceMappingURL=sqlite.js.map