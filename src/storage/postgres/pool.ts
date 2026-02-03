/**
 * PostgreSQL Connection Pool
 * 
 * Manages database connections with retry logic for transient failures.
 * Uses pg-pool for connection management.
 */

import Pool from 'pg-pool';
import { Client } from 'pg';
import { getPostgresConfig, PostgresConfig } from './config';
import { logger } from '../../utils/logger';

// Extend Pool type to include our custom methods
interface PgPool extends Pool {
  query: Pool['query'];
  connect: Pool['connect'];
  end: Pool['end'];
  on: Pool['on'];
  totalCount: number;
  idleCount: number;
  waitingCount: number;
}

export class PostgresPool {
  private pool: PgPool | null = null;
  private config: PostgresConfig;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<PostgresConfig>) {
    this.config = { ...getPostgresConfig(), ...config };
  }

  /**
   * Initialize the connection pool with retry logic
   */
  async initialize(): Promise<void> {
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
    const { Pool: PgPool } = await import('pg-pool');
    
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
      acquireTimeoutMillis: this.config.acquireTimeoutMs,
      ssl: this.config.ssl,
    }) as PgPool;

    // Set up event handlers
    this.pool.on('error', (err: Error) => {
      logger.error('Unexpected PostgreSQL pool error:', err);
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
    const delayMs = retryOptions?.delayMs ?? 500;
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
          logger.warn(`Query failed with transient error, retrying (${attempts}/${maxAttempts})...`);
          await this.delay(delayMs * attempts); // Exponential backoff
          continue;
        }
        
        throw error;
      }
    }

    throw new Error('Query failed after max retries');
  }

  /**
   * Get a client from the pool for transaction handling
   */
  async getClient(): Promise<Client> {
    if (!this.pool) {
      throw new Error('Pool not initialized. Call initialize() first.');
    }
    return this.pool.connect() as Promise<Client>;
  }

  /**
   * Execute a transaction with automatic rollback on error
   */
  async withTransaction<T>(
    callback: (client: Client) => Promise<T>
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
export async function getPool(config?: Partial<PostgresConfig>): Promise<PostgresPool> {
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
