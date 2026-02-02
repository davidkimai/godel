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
import type { Database } from 'better-sqlite3';

// ============================================================================
// Types
// ============================================================================

export interface StorageConfig {
  dbPath: string;
  enableWAL?: boolean; // Write-Ahead Logging for better concurrency
  busyTimeout?: number; // Milliseconds to wait when DB is locked
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

// ============================================================================
// SQLite Storage
// ============================================================================

export class SQLiteStorage {
  private db: any; // Database instance (better-sqlite3)
  private config: StorageConfig;
  private activeTransaction: Transaction | null = null;
  private readonly DEFAULT_BUSY_TIMEOUT = 5000; // 5 seconds
  private statementCache: Map<string, any> = new Map();
  private readonly MAX_CACHED_STATEMENTS = 100;

  constructor(config: StorageConfig) {
    this.config = {
      enableWAL: true,
      busyTimeout: this.DEFAULT_BUSY_TIMEOUT,
      ...config,
    };
  }

  /**
   * Initialize the database connection and schema
   */
  async initialize(): Promise<void> {
    // Dynamic import to avoid issues if better-sqlite3 is not installed
    const Database = await import('better-sqlite3').then(m => m.default);
    
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
  private getCachedStatement(sql: string): any {
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
  clearStatementCache(): void {
    for (const stmt of this.statementCache.values()) {
      stmt.finalize();
    }
    this.statementCache.clear();
  }

  /**
   * Execute a SQL statement (INSERT, UPDATE, DELETE)
   */
  async run(sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowid: number }> {
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
  async get(sql: string, ...params: unknown[]): Promise<any> {
    const stmt = this.getCachedStatement(sql);
    return stmt.get(...params);
  }

  /**
   * Get all rows from the database
   */
  async all(sql: string, ...params: unknown[]): Promise<any[]> {
    const stmt = this.getCachedStatement(sql);
    return stmt.all(...params);
  }

  /**
   * Create database schema
   */
  private createSchema(): void {
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

    // Create indexes for better query performance
    this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)`);
    this.getDb().exec(`CREATE INDEX IF NOT EXISTS idx_agents_swarm ON agents(swarm_id)`);
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
  beginTransaction(): Transaction {
    if (this.activeTransaction) {
      throw new Error('Transaction already in progress');
    }

    this.getDb().exec('BEGIN');
    
    const transaction: Transaction = {
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
  withTransaction<T>(operations: (tx: Transaction) => T): T {
    const tx = this.beginTransaction();
    try {
      const result = operations(tx);
      tx.commit();
      return result;
    } catch (error) {
      tx.rollback();
      throw error;
    }
  }

  /**
   * Check if a transaction is active
   */
  hasActiveTransaction(): boolean {
    return this.activeTransaction !== null && this.activeTransaction.isActive;
  }

  // ============================================================================
  // Agent Operations with Transaction Support
  // ============================================================================

  /**
   * Create an agent (with optional transaction)
   */
  createAgent(agent: Agent): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO agents (
        id, label, status, model, task, spawned_at, completed_at, runtime,
        pause_time, paused_by, swarm_id, parent_id, child_ids, context,
        code, reasoning, retry_count, max_retries, last_error, budget_limit,
        safety_boundaries, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      agent.id,
      agent.label || null,
      agent.status,
      agent.model,
      agent.task,
      agent.spawnedAt.toISOString(),
      agent.completedAt?.toISOString() || null,
      agent.runtime,
      agent.pauseTime?.toISOString() || null,
      agent.pausedBy || null,
      agent.swarmId || null,
      agent.parentId || null,
      JSON.stringify(agent.childIds),
      JSON.stringify(agent.context),
      agent.code ? JSON.stringify(agent.code) : null,
      agent.reasoning ? JSON.stringify(agent.reasoning) : null,
      agent.retryCount,
      agent.maxRetries,
      agent.lastError || null,
      agent.budgetLimit || null,
      agent.safetyBoundaries ? JSON.stringify(agent.safetyBoundaries) : null,
      JSON.stringify(agent.metadata)
    );
  }

  /**
   * Get database instance or throw error if not initialized
   */
  private getDb(): any {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    return this.db;
  }

  /**
   * Update an agent (with optional transaction)
   */
  updateAgent(id: string, updates: Partial<Agent> & Record<string, unknown>): void {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    // Build dynamic update query
    for (const [key, value] of Object.entries(updates)) {
      const column = this.camelToSnake(key);
      setClauses.push(`${column} = ?`);
      
      // Serialize objects/arrays to JSON
      if (typeof value === 'object' && value !== null) {
        if (value instanceof Date) {
          values.push(value.toISOString());
        } else {
          values.push(JSON.stringify(value));
        }
      } else {
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
  getAgent(id: string): Agent | null {
    const stmt = this.getDb().prepare('SELECT * FROM agents WHERE id = ?');
    const row = stmt.get(id) as QueryResult | undefined;
    
    if (!row) return null;
    return this.rowToAgent(row);
  }

  /**
   * Get agents by status
   */
  getAgentsByStatus(status: AgentStatus): Agent[] {
    const stmt = this.getDb().prepare('SELECT * FROM agents WHERE status = ?');
    const rows = stmt.all(status) as QueryResult[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Get agents by swarm
   */
  getAgentsBySwarm(swarmId: string): Agent[] {
    const stmt = this.getDb().prepare('SELECT * FROM agents WHERE swarm_id = ?');
    const rows = stmt.all(swarmId) as QueryResult[];
    return rows.map(row => this.rowToAgent(row));
  }

  /**
   * Delete an agent
   */
  deleteAgent(id: string): void {
    const stmt = this.getDb().prepare('DELETE FROM agents WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Batch create agents (transactional)
   * RACE CONDITION FIX: All-or-nothing batch operation
   */
  batchCreateAgents(agents: Agent[]): void {
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
  batchUpdateAgents(updates: Array<{ id: string; changes: Partial<Agent> }>): void {
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
  createSwarm(swarm: {
    id: string;
    name: string;
    status: string;
    config: Record<string, unknown>;
    agents: string[];
    createdAt: Date;
    budget: { allocated: number; consumed: number; remaining: number };
    metrics: Record<string, unknown>;
  }): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO swarms (
        id, name, status, config, agents, created_at,
        budget_allocated, budget_consumed, budget_remaining, metrics
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      swarm.id,
      swarm.name,
      swarm.status,
      JSON.stringify(swarm.config),
      JSON.stringify(swarm.agents),
      swarm.createdAt.toISOString(),
      swarm.budget.allocated,
      swarm.budget.consumed,
      swarm.budget.remaining,
      JSON.stringify(swarm.metrics)
    );
  }

  /**
   * Update a swarm
   */
  updateSwarm(id: string, updates: Record<string, unknown>): void {
    const setClauses: string[] = [];
    const values: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      const column = this.camelToSnake(key);
      setClauses.push(`${column} = ?`);

      if (key === 'config' || key === 'metrics') {
        values.push(JSON.stringify(value));
      } else if (key === 'agents' && Array.isArray(value)) {
        values.push(JSON.stringify(value));
      } else if (value instanceof Date) {
        values.push(value.toISOString());
      } else {
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
  getSwarm(id: string): Record<string, unknown> | null {
    const stmt = this.getDb().prepare('SELECT * FROM swarms WHERE id = ?');
    const row = stmt.get(id) as QueryResult | undefined;
    
    if (!row) return null;
    return this.rowToSwarm(row);
  }

  /**
   * Get all swarms
   */
  getAllSwarms(): Array<Record<string, unknown>> {
    const stmt = this.getDb().prepare('SELECT * FROM swarms ORDER BY created_at DESC');
    const rows = stmt.all() as QueryResult[];
    return rows.map(row => this.rowToSwarm(row));
  }

  /**
   * Delete a swarm (transactional with agent cleanup)
   * RACE CONDITION FIX: Ensures swarm and agents are deleted together
   */
  deleteSwarm(id: string): void {
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
  storeEvent(event: {
    id: string;
    timestamp: Date;
    eventType: string;
    source?: Record<string, unknown>;
    payload?: Record<string, unknown>;
    agentId?: string;
    swarmId?: string;
  }): void {
    const stmt = this.getDb().prepare(`
      INSERT INTO events (id, timestamp, event_type, source, payload, agent_id, swarm_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.timestamp.toISOString(),
      event.eventType,
      event.source ? JSON.stringify(event.source) : null,
      event.payload ? JSON.stringify(event.payload) : null,
      event.agentId || null,
      event.swarmId || null
    );
  }

  /**
   * Get events by agent
   */
  getEventsByAgent(agentId: string, limit: number = 100): Array<Record<string, unknown>> {
    const stmt = this.getDb().prepare(
      'SELECT * FROM events WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(agentId, limit) as QueryResult[];
    return rows.map(row => this.rowToEvent(row));
  }

  /**
   * Get events by swarm
   */
  getEventsBySwarm(swarmId: string, limit: number = 100): Array<Record<string, unknown>> {
    const stmt = this.getDb().prepare(
      'SELECT * FROM events WHERE swarm_id = ? ORDER BY timestamp DESC LIMIT ?'
    );
    const rows = stmt.all(swarmId, limit) as QueryResult[];
    return rows.map(row => this.rowToEvent(row));
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Close the database connection
   */
  close(): void {
    this.clearStatementCache();
    if (this.db) {
      this.db.close();
    }
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Convert database row to Agent object
   */
  private rowToAgent(row: QueryResult): Agent {
    return {
      id: row['id'] as string,
      label: row['label'] as string | undefined,
      status: row['status'] as AgentStatus,
      model: row['model'] as string,
      task: row['task'] as string,
      spawnedAt: new Date(row['spawned_at'] as string),
      completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
      runtime: (row['runtime'] as number) || 0,
      pauseTime: row['pause_time'] ? new Date(row['pause_time'] as string) : undefined,
      pausedBy: row['paused_by'] as string | undefined,
      swarmId: row['swarm_id'] as string | undefined,
      parentId: row['parent_id'] as string | undefined,
      childIds: row['child_ids'] ? JSON.parse(row['child_ids'] as string) : [],
      context: row['context'] ? JSON.parse(row['context'] as string) : {
        inputContext: [],
        outputContext: [],
        sharedContext: [],
        contextSize: 0,
        contextWindow: 100000,
        contextUsage: 0
      },
      code: row['code'] ? JSON.parse(row['code'] as string) : undefined,
      reasoning: row['reasoning'] ? JSON.parse(row['reasoning'] as string) : {
        traces: [],
        decisions: [],
        confidence: 1.0
      },
      retryCount: (row['retry_count'] as number) || 0,
      maxRetries: (row['max_retries'] as number) || 3,
      lastError: row['last_error'] as string | undefined,
      budgetLimit: row['budget_limit'] as number | undefined,
      safetyBoundaries: row['safety_boundaries'] ? JSON.parse(row['safety_boundaries'] as string) : undefined,
      metadata: row['metadata'] ? JSON.parse(row['metadata'] as string) : {},
    };
  }

  /**
   * Convert database row to Swarm object
   */
  private rowToSwarm(row: QueryResult): Record<string, unknown> {
    return {
      id: row['id'],
      name: row['name'],
      status: row['status'],
      config: JSON.parse(row['config'] as string),
      agents: JSON.parse(row['agents'] as string),
      createdAt: new Date(row['created_at'] as string),
      completedAt: row['completed_at'] ? new Date(row['completed_at'] as string) : undefined,
      budget: {
        allocated: row['budget_allocated'],
        consumed: row['budget_consumed'],
        remaining: row['budget_remaining'],
      },
      metrics: JSON.parse(row['metrics'] as string),
    };
  }

  /**
   * Convert database row to Event object
   */
  private rowToEvent(row: QueryResult): Record<string, unknown> {
    return {
      id: row['id'],
      timestamp: new Date(row['timestamp'] as string),
      eventType: row['event_type'],
      source: row['source'] ? JSON.parse(row['source'] as string) : undefined,
      payload: row['payload'] ? JSON.parse(row['payload'] as string) : undefined,
      agentId: row['agent_id'],
      swarmId: row['swarm_id'],
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalSQLiteStorage: SQLiteStorage | null = null;
let initializationPromise: Promise<SQLiteStorage> | null = null;

export async function getGlobalSQLiteStorage(config?: StorageConfig): Promise<SQLiteStorage> {
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

export function resetGlobalSQLiteStorage(): void {
  globalSQLiteStorage?.close();
  globalSQLiteStorage = null;
  initializationPromise = null;
}

/**
 * Get the database instance (alias for getGlobalSQLiteStorage)
 * Used by repositories for database access
 */
export async function getDb(config?: StorageConfig): Promise<SQLiteStorage> {
  return getGlobalSQLiteStorage(config);
}

/**
 * Initialize the database (alias for getGlobalSQLiteStorage)
 * Used for explicit initialization with config
 */
export async function initDatabase(config: StorageConfig): Promise<SQLiteStorage> {
  return getGlobalSQLiteStorage(config);
}

/**
 * Close the database connection (alias for resetGlobalSQLiteStorage)
 */
export function closeDatabase(): void {
  resetGlobalSQLiteStorage();
}

// In-memory store for non-persistent storage needs
export const memoryStore: any = {
  metadata: new Map<string, unknown>(),
  agentsData: new Map<string, unknown>(),
  eventsData: new Map<string, unknown>(),
  get agents() {
    return {
      get: (id: string) => memoryStore.agentsData.get(id),
      set: (id: string, value: unknown) => memoryStore.agentsData.set(id, value),
    };
  },
  get events() {
    return {
      create: (event: any) => memoryStore.eventsData.set(event.id, event),
      get: (id: string) => memoryStore.eventsData.get(id),
      set: (id: string, value: unknown) => memoryStore.eventsData.set(id, value),
    };
  },
};

export default SQLiteStorage;
