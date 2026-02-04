/**
 * PostgreSQL Connection Pool
 * 
 * Manages database connections with retry logic for transient failures.
 * Uses pg-pool for connection management.
 * Reads configuration from the centralized config system.
 */

import type { PoolClient } from 'pg';
import { logger } from '../../utils/logger';
import { getConfig, type DatabaseConfig } from '../../config';

// We'll use dynamic import for pg-pool to avoid type issues

export interface PostgresPoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  
  // Pool configuration
  poolSize: number;
  minPoolSize: number;
  maxPoolSize: number;
  
  // Connection timeouts
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  acquireTimeoutMs: number;
  statementTimeoutMs: number;
  
  // Retry configuration
  retryAttempts: number;
  retryDelayMs: number;
  retryMaxDelayMs: number;
  
  // SSL configuration
  ssl: boolean | { rejectUnauthorized: boolean; ca?: string; cert?: string; key?: string };
  
  // Performance settings
  keepAlive: boolean;
  keepAliveInitialDelayMs: number;
  maxUses: number;
  
  // Application name for debugging
  applicationName: string;
}

/**
 * Convert Dash database config to pool config
 */
function toPoolConfig(config: DatabaseConfig): PostgresPoolConfig {
  // Parse the connection URL if provided
  let parsedUrl: URL | null = null;
  try {
    parsedUrl = new URL(config.url);
  } catch {
    // Use individual settings if URL parsing fails
  }

  if (parsedUrl) {
    return {
      host: parsedUrl.hostname,
      port: parseInt(parsedUrl.port, 10) || 5432,
      database: parsedUrl.pathname.slice(1),
      user: decodeURIComponent(parsedUrl.username),
      password: decodeURIComponent(parsedUrl.password),
      poolSize: config.poolSize,
      minPoolSize: config.minPoolSize,
      maxPoolSize: config.maxPoolSize,
      connectionTimeoutMs: config.connectionTimeoutMs,
      idleTimeoutMs: config.idleTimeoutMs,
      acquireTimeoutMs: config.acquireTimeoutMs,
      statementTimeoutMs: config.statementTimeoutMs ?? 30000,
      retryAttempts: config.retryAttempts,
      retryDelayMs: config.retryDelayMs,
      retryMaxDelayMs: config.retryMaxDelayMs ?? 10000,
      ssl: config.ssl,
      keepAlive: config.keepAlive ?? true,
      keepAliveInitialDelayMs: config.keepAliveInitialDelayMs ?? 0,
      maxUses: config.maxUses ?? 7500,
      applicationName: config.applicationName ?? 'dash',
    };
  }

  return {
    host: 'localhost',
    port: 5432,
    database: 'dash',
    user: 'dash',
    password: 'dash',
    poolSize: config.poolSize,
    minPoolSize: config.minPoolSize,
    maxPoolSize: config.maxPoolSize,
    connectionTimeoutMs: config.connectionTimeoutMs,
    idleTimeoutMs: config.idleTimeoutMs,
    acquireTimeoutMs: config.acquireTimeoutMs,
    statementTimeoutMs: config.statementTimeoutMs ?? 30000,
    retryAttempts: config.retryAttempts,
    retryDelayMs: config.retryDelayMs,
    retryMaxDelayMs: config.retryMaxDelayMs ?? 10000,
    ssl: config.ssl,
    keepAlive: config.keepAlive ?? true,
    keepAliveInitialDelayMs: config.keepAliveInitialDelayMs ?? 0,
    maxUses: config.maxUses ?? 7500,
    applicationName: config.applicationName ?? 'dash',
  };
}

export class PostgresPool {
  private pool: any | null = null;
  private config: PostgresPoolConfig;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<PostgresPoolConfig>) {
    // Will be set in initialize()
    this.config = config as PostgresPoolConfig;
  }

  /**
   * Initialize the connection pool with retry logic
   */
  async initialize(): Promise<void> {
    // Load configuration if not provided
    if (!this.config) {
      const dashConfig = await getConfig();
      this.config = toPoolConfig(dashConfig.database);
    }

    let attempts = 0;
    const maxAttempts = this.config.retryAttempts;
    
    while (attempts < maxAttempts) {
      try {
        await this.connect();
        this.isConnected = true;
        logger.info(`PostgreSQL connected (pool: ${this.config.minPoolSize}-${this.config.maxPoolSize})`);
        return;
      } catch (error) {
        attempts++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        if (attempts >= maxAttempts) {
          logger.error(`Failed to connect to PostgreSQL after ${maxAttempts} attempts: ${errorMessage}`);
          throw new Error(`Database connection failed: ${errorMessage}`);
        }
        
        logger.warn(`PostgreSQL connection attempt ${attempts}/${maxAttempts} failed, retrying in ${this.config.retryDelayMs}ms...`);
        await this.delay(this.config.retryDelayMs);
      }
    }
  }

  /**
   * Create and connect the pool
   */
  private async connect(): Promise<void> {
    const { default: PgPool } = await import('pg-pool');
    const { Client } = await import('pg');
    
    this.pool = new PgPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      min: this.config.minPoolSize,
      max: this.config.maxPoolSize,
      idleTimeoutMillis: this.config.idleTimeoutMs,
      connectionTimeoutMillis: this.config.connectionTimeoutMs,
      ssl: this.config.ssl,
      Client: Client,
      keepAlive: this.config.keepAlive,
      keepAliveInitialDelayMillis: this.config.keepAliveInitialDelayMs,
      maxUses: this.config.maxUses,
    });

    // Set application_name for debugging
    await this.pool.query(`SET application_name = '${this.config.applicationName}'`);

    // Set statement timeout
    await this.pool.query(`SET statement_timeout = ${this.config.statementTimeoutMs}`);

    // Set up event handlers
    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected PostgreSQL pool error:', err.message);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.pool.on('connect', () => {
      this.isConnected = true;
    });

    // Test the connection
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      try {
        await this.initialize();
      } catch (error) {
        logger.error('Reconnection attempt failed');
      }
    }, this.config.retryDelayMs);
  }

  /**
   * Execute a query with automatic retry for transient failures
   */
  async query<T = unknown>(
    text: string, 
    params?: unknown[],
    retryOptions?: { attempts?: number; delayMs?: number }
  ): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }

    const maxAttempts = retryOptions?.attempts ?? 3;
    const baseDelayMs = retryOptions?.delayMs ?? 500;
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        const result = await this.pool.query(text, params);
        return {
          rows: result.rows as T[],
          rowCount: result.rowCount || 0,
        };
      } catch (error) {
        attempts++;
        
        // Only retry on transient errors
        if (this.isTransientError(error) && attempts < maxAttempts) {
          const delayMs = Math.min(baseDelayMs * Math.pow(2, attempts - 1), this.config.retryMaxDelayMs);
          logger.warn(`Query failed with transient error, retrying (${attempts}/${maxAttempts}) in ${delayMs}ms...`);
          await this.delay(delayMs);
          continue;
        }
        
        throw error;
      }
    }

    throw new Error('Query failed after max retries');
  }

  // ============================================================================
  // Bulk Operations
  // ============================================================================

  /**
   * Execute multiple queries in a single batch (for performance)
   * All queries are executed in a single transaction
   */
  async batch<T = unknown>(
    queries: Array<{ text: string; params?: unknown[] }>
  ): Promise<Array<{ rows: T[]; rowCount: number }>> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }

    const client = await this.pool.connect() as PoolClient;
    try {
      await client.query('BEGIN');
      const results: Array<{ rows: T[]; rowCount: number }> = [];

      for (const query of queries) {
        const result = await client.query(query.text, query.params);
        results.push({
          rows: result.rows as T[],
          rowCount: result.rowCount || 0,
        });
      }

      await client.query('COMMIT');
      return results;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Execute a bulk insert with a single query
   * Uses VALUES clause with multiple value sets
   */
  async bulkInsert<T = unknown>(
    table: string,
    columns: string[],
    values: unknown[][]
  ): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }

    if (values.length === 0) {
      return { rows: [], rowCount: 0 };
    }

    const valuePlaceholders: string[] = [];
    const allParams: unknown[] = [];
    let paramIndex = 1;

    for (const row of values) {
      const placeholders = row.map(() => `$${paramIndex++}`).join(', ');
      valuePlaceholders.push(`(${placeholders})`);
      allParams.push(...row);
    }

    const query = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES ${valuePlaceholders.join(', ')}
      RETURNING *
    `;

    const result = await this.pool.query(query, allParams);
    return {
      rows: result.rows as T[],
      rowCount: result.rowCount || 0,
    };
  }

  /**
   * Execute queries in parallel (for independent operations)
   */
  async parallel<T = unknown>(
    queries: Array<{ text: string; params?: unknown[] }>
  ): Promise<Array<{ rows: T[]; rowCount: number }>> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }

    const promises = queries.map(async (query) => {
      const result = await this.pool.query(query.text, query.params);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
      };
    });

    return Promise.all(promises);
  }

  // ============================================================================
  // Transaction Helpers
  // ============================================================================

  /**
   * Get a client from the pool for transaction handling
   */
  async getClient(): Promise<PoolClient> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }
    return this.pool.connect() as Promise<PoolClient>;
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.getClient();
    
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {}); // Ignore rollback errors
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Check if error is transient and retryable
   */
  private isTransientError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    
    const transientCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      '08000', // connection_exception
      '08003', // connection_does_not_exist
      '08006', // connection_failure
      '40001', // serialization_failure
      '40P01', // deadlock_detected
      '55P03', // lock_not_available
    ];
    
    const code = (error as { code?: string }).code;
    return transientCodes.includes(code || '') || 
           transientCodes.some(c => error.message.includes(c));
  }

  /**
   * Get pool statistics
   */
  getStats(): { total: number; idle: number; waiting: number; isConnected: boolean } {
    return {
      total: this.pool?.totalCount || 0,
      idle: this.pool?.idleCount || 0,
      waiting: this.pool?.waitingCount || 0,
      isConnected: this.isConnected,
    };
  }

  /**
   * Check if pool is healthy
   */
  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.pool) {
      return { healthy: false, message: 'Pool not initialized' };
    }

    try {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        return { healthy: true };
      } finally {
        client.release();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { healthy: false, message };
    }
  }

  /**
   * Close the pool gracefully
   */
  async close(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('PostgreSQL pool closed');
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
let globalPool: PostgresPool | null = null;
let initializationPromise: Promise<PostgresPool> | null = null;

/**
 * Get or create the global PostgreSQL pool
 */
export async function getPool(config?: Partial<PostgresPoolConfig>): Promise<PostgresPool> {
  if (globalPool?.getStats().isConnected) {
    return globalPool;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    globalPool = new PostgresPool(config);
    await globalPool.initialize();
    return globalPool;
  })();

  return initializationPromise;
}

/**
 * Reset the global pool (useful for testing)
 */
export async function resetPool(): Promise<void> {
  if (globalPool) {
    await globalPool.close();
    globalPool = null;
  }
  initializationPromise = null;
}

export default PostgresPool;
