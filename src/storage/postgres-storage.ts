/**
 * PostgreSQL Storage Implementation - SPEC-T2
 * 
 * Hybrid SQLite/PostgreSQL storage for API CRUD operations.
 * PostgreSQL is for PRODUCTION workloads.
 * 
 * Features:
 * - Full CRUD operations for agents and swarms
 * - Connection pooling for scalability
 * - UUIDs and JSONB for metadata
 * - Health check endpoint
 */

import { logger } from '../utils/logger';
import { PostgresPool, getPool } from './postgres/pool';

export interface PostgresConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  maxConnections?: number;
}

// ============================================================================
// PostgresStorage Class
// ============================================================================

export class PostgresStorage {
  private pool: PostgresPool | null = null;
  private initialized = false;

  constructor(private config?: PostgresConfig) {}

  /**
   * Check if storage is initialized
   */
  isReady(): boolean {
    return this.initialized && this.pool !== null;
  }

  /**
   * Initialize the storage with configuration
   */
  async initialize(config?: PostgresConfig): Promise<void> {
    if (this.initialized) return;

    const postgresConfig = config || this.config || {
      host: process.env['POSTGRES_HOST'] || 'localhost',
      port: parseInt(process.env['POSTGRES_PORT'] || '5432'),
      database: process.env['POSTGRES_DB'] || 'dash',
      user: process.env['POSTGRES_USER'] || 'dash',
      password: process.env['POSTGRES_PASSWORD'] || 'dash_password',
      ssl: process.env['POSTGRES_SSL'] === 'true',
      maxConnections: parseInt(process.env['POSTGRES_MAX_CONNECTIONS'] || '20'),
    };

    try {
      this.pool = await getPool({
        host: postgresConfig.host,
        port: postgresConfig.port,
        database: postgresConfig.database,
        user: postgresConfig.user,
        password: postgresConfig.password,
        poolSize: postgresConfig.maxConnections || 20,
        minPoolSize: 2,
        maxPoolSize: postgresConfig.maxConnections || 20,
        connectionTimeoutMs: 5000,
        idleTimeoutMs: 30000,
        acquireTimeoutMs: 5000,
        statementTimeoutMs: 30000,
        retryAttempts: 3,
        retryDelayMs: 1000,
        retryMaxDelayMs: 10000,
        ssl: postgresConfig.ssl || false,
        keepAlive: true,
        keepAliveInitialDelayMs: 0,
        maxUses: 7500,
        applicationName: 'dash',
      });

      this.initialized = true;
    } catch (error) {
      logger.error('Failed to initialize PostgreSQL storage:', error);
      throw error;
    }
  }

  /**
   * Ensure the storage is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized || !this.pool) {
      throw new Error('PostgreSQL storage not initialized. Call initialize() first.');
    }
  }

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * Check if the database connection is healthy
   */
  async healthCheck(): Promise<boolean> {
    try {
      if (!this.pool) {
        return false;
      }
      const health = await this.pool.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  /**
   * Create a new agent
   */
  async createAgent(agent: {
    id?: string;
    name: string;
    provider: string;
    model: string;
    status?: string;
    metadata?: Record<string, unknown>;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<string> {
    this.ensureInitialized();

    const now = agent.createdAt || Date.now();
    const id = agent.id || crypto.randomUUID();
    
    await this.pool!.query(
      `INSERT INTO agents (id, label, status, model, task, config, spawned_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        agent.name,
        agent.status || 'pending',
        agent.model,
        '',
        JSON.stringify(agent.metadata || {}),
        new Date(now),
        new Date(now),
      ]
    );

    return id;
  }

  /**
   * Get an agent by ID
   */
  async getAgent(id: string): Promise<{
    id: string;
    name: string;
    provider: string;
    model: string;
    status: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  } | null> {
    this.ensureInitialized();

    interface AgentRow {
      id: string;
      label: string | null;
      model: string;
      status: string;
      config: string | Record<string, unknown>;
      spawned_at: string;
      updated_at: string;
    }

    const result = await this.pool!.query<AgentRow>(
      `SELECT * FROM agents WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;

    return {
      id: row.id,
      name: row.label || '',
      provider: '',
      model: row.model,
      status: row.status,
      metadata: config,
      createdAt: new Date(row.spawned_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  /**
   * Update an agent
   */
  async updateAgent(id: string, data: Partial<{
    name: string;
    provider: string;
    model: string;
    status: string;
    metadata: Record<string, unknown>;
  }>): Promise<void> {
    this.ensureInitialized();

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`label = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.model !== undefined) {
      updates.push(`model = $${paramIndex++}`);
      values.push(data.model);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }
    if (data.metadata !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify(data.metadata));
    }

    if (updates.length === 0) return;

    values.push(id);

    await this.pool!.query(
      `UPDATE agents SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Delete an agent
   */
  async deleteAgent(id: string): Promise<void> {
    this.ensureInitialized();
    await this.pool!.query(`DELETE FROM agents WHERE id = $1`, [id]);
  }

  /**
   * List all agents
   */
  async listAgents(): Promise<Array<{
    id: string;
    name: string;
    provider: string;
    model: string;
    status: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }>> {
    this.ensureInitialized();

    interface AgentRow {
      id: string;
      label: string | null;
      model: string;
      status: string;
      config: string | Record<string, unknown>;
      spawned_at: string;
      updated_at: string;
    }

    const result = await this.pool!.query<AgentRow>(`SELECT * FROM agents ORDER BY spawned_at DESC`);

    return result.rows.map(row => {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      return {
        id: row.id,
        name: row.label || '',
        provider: '',
        model: row.model,
        status: row.status,
        metadata: config,
        createdAt: new Date(row.spawned_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      };
    });
  }

  // ============================================================================
  // Swarm Operations
  // ============================================================================

  /**
   * Create a new swarm
   */
  async createSwarm(swarm: {
    id?: string;
    name: string;
    task: string;
    agentIds: string[];
    status?: string;
    metadata?: Record<string, unknown>;
    createdAt?: number;
    updatedAt?: number;
  }): Promise<string> {
    this.ensureInitialized();

    const now = swarm.createdAt || Date.now();
    const id = swarm.id || crypto.randomUUID();
    
    await this.pool!.query(
      `INSERT INTO swarms (id, name, config, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        swarm.name,
        JSON.stringify({ task: swarm.task, ...swarm.metadata }),
        swarm.status || 'creating',
        new Date(now),
        new Date(now),
      ]
    );

    return id;
  }

  /**
   * Get a swarm by ID
   */
  async getSwarm(id: string): Promise<{
    id: string;
    name: string;
    task: string;
    agentIds: string[];
    status: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  } | null> {
    this.ensureInitialized();

    interface SwarmRow {
      id: string;
      name: string;
      config: string | Record<string, unknown>;
      status: string;
      created_at: string;
      updated_at: string;
    }

    const result = await this.pool!.query<SwarmRow>(
      `SELECT * FROM swarms WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;

    return {
      id: row.id,
      name: row.name,
      task: (config.task as string) || '',
      agentIds: [],
      status: row.status,
      metadata: config,
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
    };
  }

  /**
   * Update a swarm
   */
  async updateSwarm(id: string, data: Partial<{
    name: string;
    task: string;
    agentIds: string[];
    status: string;
    metadata: Record<string, unknown>;
  }>): Promise<void> {
    this.ensureInitialized();

    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      values.push(data.name);
    }
    if (data.task !== undefined) {
      updates.push(`config = $${paramIndex++}`);
      values.push(JSON.stringify({ task: data.task, ...data.metadata }));
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      values.push(data.status);
    }

    if (updates.length === 0) return;

    values.push(id);

    await this.pool!.query(
      `UPDATE swarms SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
      values
    );
  }

  /**
   * Delete a swarm
   */
  async deleteSwarm(id: string): Promise<void> {
    this.ensureInitialized();
    await this.pool!.query(`DELETE FROM swarms WHERE id = $1`, [id]);
  }

  /**
   * List all swarms
   */
  async listSwarms(): Promise<Array<{
    id: string;
    name: string;
    task: string;
    agentIds: string[];
    status: string;
    metadata?: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  }>> {
    this.ensureInitialized();

    interface SwarmRow {
      id: string;
      name: string;
      config: string | Record<string, unknown>;
      status: string;
      created_at: string;
      updated_at: string;
    }

    const result = await this.pool!.query<SwarmRow>(`SELECT * FROM swarms ORDER BY created_at DESC`);

    return result.rows.map(row => {
      const config = typeof row.config === 'string' ? JSON.parse(row.config) : row.config;
      return {
        id: row.id,
        name: row.name,
        task: (config.task as string) || '',
        agentIds: [],
        status: row.status,
        metadata: config,
        createdAt: new Date(row.created_at).getTime(),
        updatedAt: new Date(row.updated_at).getTime(),
      };
    });
  }

  // ============================================================================
  // Generic CRUD Operations
  // ============================================================================

  /**
   * Create a record in a table
   */
  async create(table: string, data: Record<string, unknown>): Promise<string> {
    this.ensureInitialized();
    
    const id = crypto.randomUUID();
    const now = Date.now();
    
    const keys = Object.keys(data);
    const values = Object.values(data);
    
    const query = `
      INSERT INTO ${table} (id, ${keys.join(', ')}, created_at, updated_at)
      VALUES ($1, ${keys.map((_, i) => `$${i + 2}`).join(', ')}, $${keys.length + 2}, $${keys.length + 3})
      RETURNING id
    `;
    
    const result = await this.pool!.query<{ id: string }>(query, [id, ...values, now, now]);
    return result.rows[0].id;
  }

  /**
   * Read a record from a table
   */
  async read(table: string, id: string): Promise<Record<string, unknown> | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<Record<string, unknown>>(`SELECT * FROM ${table} WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  /**
   * Update a record in a table
   */
  async update(table: string, id: string, data: Record<string, unknown>): Promise<void> {
    this.ensureInitialized();
    
    const now = Date.now();
    
    const keys = Object.keys(data);
    const setClause = keys.map((k, i) => `${k} = $${i + 1}`).join(', ');
    const values = [...Object.values(data), now, id];
    
    await this.pool!.query(
      `UPDATE ${table} SET ${setClause}, updated_at = $${keys.length + 1} WHERE id = $${keys.length + 2}`,
      values
    );
  }

  /**
   * Delete a record from a table
   */
  async delete(table: string, id: string): Promise<void> {
    this.ensureInitialized();
    await this.pool!.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
  }

  /**
   * List all records from a table
   */
  async list(table: string): Promise<Record<string, unknown>[]> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<Record<string, unknown>>(`SELECT * FROM ${table}`);
    return result.rows;
  }

  // ============================================================================
  // Close Connection
  // ============================================================================

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
    this.initialized = false;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPostgresStorage: PostgresStorage | null = null;
let initializationPromise: Promise<PostgresStorage> | null = null;

export async function getGlobalPostgresStorage(config?: PostgresConfig): Promise<PostgresStorage> {
  if (globalPostgresStorage?.isReady()) {
    return globalPostgresStorage;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    const storage = new PostgresStorage(config);
    await storage.initialize(config);
    globalPostgresStorage = storage;
    return storage;
  })();

  return initializationPromise;
}

export function resetGlobalPostgresStorage(): void {
  globalPostgresStorage?.close();
  globalPostgresStorage = null;
  initializationPromise = null;
}

export default PostgresStorage;
