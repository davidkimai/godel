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
import type { Agent, AgentStatus } from '../models/agent';
export interface StorageConfig {
    dbPath: string;
    enableWAL?: boolean;
    busyTimeout?: number;
}
export interface Transaction {
    commit(): void;
    rollback(): void;
    isActive: boolean;
}
export interface QueryResult {
    id: string;
    [key: string]: unknown;
}
export declare class SQLiteStorage {
    private db;
    private config;
    private activeTransaction;
    private readonly DEFAULT_BUSY_TIMEOUT;
    private statementCache;
    private readonly MAX_CACHED_STATEMENTS;
    constructor(config: StorageConfig);
    /**
     * Initialize the database connection and schema
     */
    initialize(): Promise<void>;
    /**
     * Get or create a cached prepared statement
     */
    private getCachedStatement;
    /**
     * Clear the prepared statement cache
     */
    clearStatementCache(): void;
    /**
     * Execute a SQL statement (INSERT, UPDATE, DELETE)
     */
    run(sql: string, ...params: unknown[]): Promise<{
        changes: number;
        lastInsertRowid: number;
    }>;
    /**
     * Get a single row from the database
     */
    get(sql: string, ...params: unknown[]): Promise<any>;
    /**
     * Get all rows from the database
     */
    all(sql: string, ...params: unknown[]): Promise<any[]>;
    /**
     * Create database schema
     */
    private createSchema;
    /**
     * Begin a transaction
     * RACE CONDITION FIX: All multi-step operations should use transactions
     */
    beginTransaction(): Transaction;
    /**
     * Execute operations within a transaction
     * RACE CONDITION FIX: Automatic rollback on error
     */
    withTransaction<T>(operations: (tx: Transaction) => T): T;
    /**
     * Check if a transaction is active
     */
    hasActiveTransaction(): boolean;
    /**
     * Create an agent (with optional transaction)
     */
    createAgent(agent: Agent): void;
    /**
     * Get database instance or throw error if not initialized
     */
    private getDb;
    /**
     * Update an agent (with optional transaction)
     */
    updateAgent(id: string, updates: Partial<Agent> & Record<string, unknown>): void;
    /**
     * Get an agent by ID
     */
    getAgent(id: string): Agent | null;
    /**
     * Get agents by status
     */
    getAgentsByStatus(status: AgentStatus): Agent[];
    /**
     * Get agents by swarm
     */
    getAgentsBySwarm(swarmId: string): Agent[];
    /**
     * Delete an agent
     */
    deleteAgent(id: string): void;
    /**
     * Batch create agents (transactional)
     * RACE CONDITION FIX: All-or-nothing batch operation
     */
    batchCreateAgents(agents: Agent[]): void;
    /**
     * Batch update agents (transactional)
     * RACE CONDITION FIX: All-or-nothing batch operation
     */
    batchUpdateAgents(updates: Array<{
        id: string;
        changes: Partial<Agent>;
    }>): void;
    /**
     * Create a swarm
     */
    createSwarm(swarm: {
        id: string;
        name: string;
        status: string;
        config: Record<string, unknown>;
        agents: string[];
        createdAt: Date;
        budget: {
            allocated: number;
            consumed: number;
            remaining: number;
        };
        metrics: Record<string, unknown>;
    }): void;
    /**
     * Update a swarm
     */
    updateSwarm(id: string, updates: Record<string, unknown>): void;
    /**
     * Get a swarm by ID
     */
    getSwarm(id: string): Record<string, unknown> | null;
    /**
     * Get all swarms
     */
    getAllSwarms(): Array<Record<string, unknown>>;
    /**
     * Delete a swarm (transactional with agent cleanup)
     * RACE CONDITION FIX: Ensures swarm and agents are deleted together
     */
    deleteSwarm(id: string): void;
    /**
     * Store an event
     */
    storeEvent(event: {
        id: string;
        timestamp: Date;
        eventType: string;
        source?: Record<string, unknown>;
        payload?: Record<string, unknown>;
        agentId?: string;
        swarmId?: string;
    }): void;
    /**
     * Get events by agent
     */
    getEventsByAgent(agentId: string, limit?: number): Array<Record<string, unknown>>;
    /**
     * Get events by swarm
     */
    getEventsBySwarm(swarmId: string, limit?: number): Array<Record<string, unknown>>;
    /**
     * Close the database connection
     */
    close(): void;
    /**
     * Convert camelCase to snake_case
     */
    private camelToSnake;
    /**
     * Convert database row to Agent object
     */
    private rowToAgent;
    /**
     * Convert database row to Swarm object
     */
    private rowToSwarm;
    /**
     * Convert database row to Event object
     */
    private rowToEvent;
}
export declare function getGlobalSQLiteStorage(config?: StorageConfig): Promise<SQLiteStorage>;
export declare function resetGlobalSQLiteStorage(): void;
/**
 * Get the database instance (alias for getGlobalSQLiteStorage)
 * Used by repositories for database access
 */
export declare function getDb(config?: StorageConfig): Promise<SQLiteStorage>;
/**
 * Initialize the database (alias for getGlobalSQLiteStorage)
 * Used for explicit initialization with config
 */
export declare function initDatabase(config: StorageConfig): Promise<SQLiteStorage>;
/**
 * Close the database connection (alias for resetGlobalSQLiteStorage)
 */
export declare function closeDatabase(): void;
export declare const memoryStore: any;
export default SQLiteStorage;
//# sourceMappingURL=sqlite.d.ts.map