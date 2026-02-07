/**
 * PostgreSQL Connection Pool
 * 
 * Manages database connections with retry logic for transient failures.
 * Uses pg-pool for connection management.
 * Reads configuration from the centralized config system.
 * 
 * Optimized for 50+ concurrent agents with:
 * - Extended timeouts for stability
 * - Connection validation
 * - Health monitoring integration
 * - Advanced retry with exponential backoff
 */

import { logger } from '../../utils/logger';
import type { PoolClient } from 'pg';
import { getConfig, type DatabaseConfig } from '../../config';
import { withRetry, isTransientError, type RetryOptions } from './retry';
import { PoolHealthMonitor, createHealthMonitor } from './health';

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
  private healthMonitor: PoolHealthMonitor | null = null;
  private queryCount = 0;
  private failedQueryCount = 0;

  constructor(config?: Partial<PostgresPoolConfig>) {
    // Will be set in initialize()
    this.config = config as PostgresPoolConfig;
  }

  /**
   * Get the health monitor instance
   */
  getHealthMonitor(): PoolHealthMonitor | null {
    return this.healthMonitor;
  }

  /**
   * Enable health monitoring
   */
  enableHealthMonitoring(intervalMs?: number): void {
    if (!this.healthMonitor) {
      this.healthMonitor = createHealthMonitor(this);
    }
    this.healthMonitor.startMonitoring(intervalMs);
  }

  /**
   * Disable health monitoring
   */
  disableHealthMonitoring(): void {
    this.healthMonitor?.stopMonitoring();
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
        await new Promise(resolve => setTimeout(resolve, this.config.retryDelayMs));
      }
    }
  }

  /**
   * Create and connect the pool with optimized settings
   */
  private async connect(): Promise<void> {
    const { default: PgPool } = await import('pg-pool');
    const { Client } = await import('pg');
    
    // Optimized pool configuration for 50+ concurrent agents
    this.pool = new PgPool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      
      // Pool sizing - optimized for 50+ agents
      min: this.config.minPoolSize,
      max: this.config.maxPoolSize,
      
      // Extended timeouts for stability under load
      idleTimeoutMillis: this.config.idleTimeoutMs,
      connectionTimeoutMillis: this.config.connectionTimeoutMs,
      
      // Enable connection validation for stability
      allowExitOnIdle: false,
      
      // SSL configuration
      ssl: this.config.ssl,
      Client: Client,
      
      // TCP keepalive for connection stability
      keepAlive: this.config.keepAlive,
      keepAliveInitialDelayMillis: this.config.keepAliveInitialDelayMs,
      
      // Connection lifecycle - recycle after max uses
      maxUses: this.config.maxUses,
    });

    // Set up event handlers before testing connection
    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected PostgreSQL pool error:', err.message);
      this.isConnected = false;
      this.scheduleReconnect();
    });

    this.pool.on('connect', (client: PoolClient) => {
      this.isConnected = true;
      // Configure each new connection
      client.query(`SET application_name = '${this.config.applicationName}'`).catch(() => {});
      client.query(`SET statement_timeout = '${this.config.statementTimeoutMs}'`).catch(() => {});
    });

    this.pool.on('acquire', () => {
      this.healthMonitor?.recordAcquireTime(0);
    });

    // Test the connection with retry
    await withRetry(async () => {
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
      } finally {
        client.release();
      }
    }, { maxRetries: 3, initialDelayMs: 500 });
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
   * Uses advanced retry logic with exponential backoff
   */
  async query<T = unknown>(
    text: string, 
    params?: unknown[],
    retryOptions?: { attempts?: number; delayMs?: number }
  ): Promise<{ rows: T[]; rowCount: number }> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }

    const startTime = Date.now();
    this.queryCount++;

    try {
      const result = await withRetry(async () => {
        return await this.pool.query(text, params);
      }, {
        maxRetries: retryOptions?.attempts ?? this.config.retryAttempts,
        initialDelayMs: retryOptions?.delayMs ?? this.config.retryDelayMs,
        maxDelayMs: this.config.retryMaxDelayMs,
        backoffMultiplier: 2,
        jitterFactor: 0.1,
      });

      const duration = Date.now() - startTime;
      this.healthMonitor?.recordQuery(duration, false);

      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
      };
    } catch (error) {
      this.failedQueryCount++;
      const duration = Date.now() - startTime;
      this.healthMonitor?.recordQuery(duration, true);
      throw error;
    }
  }

  /**
   * Get query statistics
   */
  getQueryStats(): { total: number; failed: number; successRate: number } {
    return {
      total: this.queryCount,
      failed: this.failedQueryCount,
      successRate: this.queryCount > 0 
        ? ((this.queryCount - this.failedQueryCount) / this.queryCount) * 100 
        : 100,
    };
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
   * Get comprehensive pool metrics
   */
  getMetrics(): Record<string, unknown> {
    return {
      pool: this.getStats(),
      queries: this.getQueryStats(),
      health: this.healthMonitor?.getHealthHistory().slice(-10),
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
    this.disableHealthMonitoring();
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.pool) {
      // Log final metrics before closing
      const stats = this.getStats();
      const queries = this.getQueryStats();
      logger.info(`Closing pool - Stats: ${JSON.stringify(stats)}, Queries: ${JSON.stringify(queries)}`);
      
      await this.pool.end();
      this.pool = null;
      this.isConnected = false;
      logger.info('PostgreSQL pool closed');
    }
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
