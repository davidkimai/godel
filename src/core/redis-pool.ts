/**
 * Redis Connection Pool
 * 
 * Manages Redis connections with pooling, reuse, and health monitoring.
 * Optimized for high-concurrency scenarios with 50+ concurrent sessions.
 */

import Redis, { RedisOptions } from 'ioredis';
import { logger } from '../utils/logger';
import { EventEmitter } from 'events';

export interface RedisPoolConfig {
  /** Redis connection URL */
  url?: string;
  /** Redis connection options */
  options?: RedisOptions;
  /** Minimum connections in pool */
  minConnections?: number;
  /** Maximum connections in pool */
  maxConnections?: number;
  /** Connection timeout in ms */
  connectionTimeoutMs?: number;
  /** Idle timeout in ms */
  idleTimeoutMs?: number;
  /** Health check interval in ms */
  healthCheckIntervalMs?: number;
  /** Enable connection multiplexing for pub/sub */
  multiplexPubSub?: boolean;
}

interface PooledConnection {
  redis: Redis;
  id: string;
  createdAt: number;
  lastUsed: number;
  useCount: number;
  inUse: boolean;
  isHealthy: boolean;
}

interface PoolMetrics {
  totalConnections: number;
  availableConnections: number;
  inUseConnections: number;
  pendingRequests: number;
  totalRequests: number;
  failedRequests: number;
  avgWaitTimeMs: number;
}

/**
 * Redis Connection Pool
 * Manages a pool of Redis connections for optimal performance
 */
export class RedisConnectionPool extends EventEmitter {
  private pool: Map<string, PooledConnection> = new Map();
  private config: Required<RedisPoolConfig>;
  private pendingRequests: Array<{
    resolve: (conn: PooledConnection) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
    startTime: number;
  }> = [];
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private metrics = {
    totalRequests: 0,
    failedRequests: 0,
    totalWaitTime: 0,
  };
  private isShuttingDown = false;
  private sharedSubscriber: Redis | null = null;

  constructor(config: RedisPoolConfig = {}) {
    super();
    this.config = {
      url: config.url || process.env['REDIS_URL'] || 'redis://localhost:6379/0',
      options: config.options || {},
      minConnections: config.minConnections || 5,
      maxConnections: config.maxConnections || 20,
      connectionTimeoutMs: config.connectionTimeoutMs || 5000,
      idleTimeoutMs: config.idleTimeoutMs || 300000, // 5 minutes
      healthCheckIntervalMs: config.healthCheckIntervalMs || 30000,
      multiplexPubSub: config.multiplexPubSub !== false,
    };
  }

  /**
   * Initialize the pool with minimum connections
   */
  async initialize(): Promise<void> {
    logger.info('redis-pool', `Initializing Redis pool (min: ${this.config.minConnections}, max: ${this.config.maxConnections})`);
    
    // Create minimum connections
    const promises: Promise<void>[] = [];
    for (let i = 0; i < this.config.minConnections; i++) {
      promises.push(this.createConnection().then(() => {}));
    }

    await Promise.all(promises);
    
    // Start health checks
    this.startHealthChecks();
    
    logger.info('redis-pool', `Redis pool initialized with ${this.pool.size} connections`);
  }

  /**
   * Get a connection from the pool
   */
  async acquire(): Promise<Redis> {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    this.metrics.totalRequests++;
    const startTime = Date.now();

    // Try to get an available connection
    const available = this.getAvailableConnection();
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      available.useCount++;
      this.metrics.totalWaitTime += Date.now() - startTime;
      return available.redis;
    }

    // Create new connection if under limit
    if (this.pool.size < this.config.maxConnections) {
      try {
        const conn = await this.createConnection();
        conn.inUse = true;
        this.metrics.totalWaitTime += Date.now() - startTime;
        return conn.redis;
      } catch (error) {
        this.metrics.failedRequests++;
        throw error;
      }
    }

    // Wait for a connection to become available
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.pendingRequests.findIndex(r => r.timeout === timeout);
        if (index > -1) {
          this.pendingRequests.splice(index, 1);
        }
        this.metrics.failedRequests++;
        reject(new Error(`Timeout waiting for Redis connection (${this.config.connectionTimeoutMs}ms)`));
      }, this.config.connectionTimeoutMs);

      this.pendingRequests.push({
        resolve: (conn) => resolve(conn.redis),
        reject,
        timeout,
        startTime,
      });
    });
  }

  /**
   * Release a connection back to the pool
   */
  release(redis: Redis): void {
    for (const conn of this.pool.values()) {
      if (conn.redis === redis) {
        conn.inUse = false;
        conn.lastUsed = Date.now();
        
        // Check if there are pending requests
        if (this.pendingRequests.length > 0) {
          const pending = this.pendingRequests.shift()!;
          clearTimeout(pending.timeout);
          conn.inUse = true;
          this.metrics.totalWaitTime += Date.now() - pending.startTime;
          pending.resolve(conn);
        }
        return;
      }
    }
  }

  /**
   * Get a dedicated subscriber connection (multiplexed if enabled)
   */
  async getSubscriber(): Promise<Redis> {
    if (this.config.multiplexPubSub) {
      if (!this.sharedSubscriber) {
        this.sharedSubscriber = new Redis(this.config.url, {
          ...this.config.options,
          retryStrategy: (times) => Math.min(times * 100, 3000),
        });
        
        this.sharedSubscriber.on('error', (err) => {
          logger.error('redis-pool', 'Subscriber error: ' + err.message);
        });
      }
      return this.sharedSubscriber;
    }
    
    return this.acquire();
  }

  /**
   * Release subscriber connection
   */
  releaseSubscriber(redis: Redis): void {
    if (this.config.multiplexPubSub && redis === this.sharedSubscriber) {
      // Don't release multiplexed subscriber
      return;
    }
    this.release(redis);
  }

  /**
   * Execute a function with a pooled connection
   */
  async withConnection<T>(fn: (redis: Redis) => Promise<T>): Promise<T> {
    const conn = await this.acquire();
    try {
      return await fn(conn);
    } finally {
      this.release(conn);
    }
  }

  /**
   * Get pool metrics
   */
  getMetrics(): PoolMetrics {
    const available = Array.from(this.pool.values()).filter(c => !c.inUse && c.isHealthy);
    const inUse = Array.from(this.pool.values()).filter(c => c.inUse);
    const pending = this.pendingRequests.length;
    
    const avgWaitTime = this.metrics.totalRequests > 0 
      ? this.metrics.totalWaitTime / this.metrics.totalRequests 
      : 0;

    return {
      totalConnections: this.pool.size,
      availableConnections: available.length,
      inUseConnections: inUse.length,
      pendingRequests: pending,
      totalRequests: this.metrics.totalRequests,
      failedRequests: this.metrics.failedRequests,
      avgWaitTimeMs: Math.round(avgWaitTime),
    };
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): Array<{
    id: string;
    createdAt: number;
    lastUsed: number;
    useCount: number;
    inUse: boolean;
    isHealthy: boolean;
    age: number;
  }> {
    const now = Date.now();
    return Array.from(this.pool.values()).map(conn => ({
      id: conn.id,
      createdAt: conn.createdAt,
      lastUsed: conn.lastUsed,
      useCount: conn.useCount,
      inUse: conn.inUse,
      isHealthy: conn.isHealthy,
      age: now - conn.createdAt,
    }));
  }

  /**
   * Close all connections and shutdown pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    
    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Reject pending requests
    for (const pending of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Pool is shutting down'));
    }
    this.pendingRequests = [];

    // Close shared subscriber
    if (this.sharedSubscriber) {
      await this.sharedSubscriber.quit();
      this.sharedSubscriber = null;
    }

    // Close all connections
    const closePromises = Array.from(this.pool.values()).map(async (conn) => {
      try {
        await conn.redis.quit();
      } catch {
        // Ignore errors during shutdown
      }
    });

    await Promise.all(closePromises);
    this.pool.clear();

    logger.info('redis-pool', 'Redis pool shutdown complete');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async createConnection(): Promise<PooledConnection> {
    const id = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    const redis = new Redis(this.config.url, {
      ...this.config.options,
      lazyConnect: true,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 100, 3000);
      },
    });

    await redis.connect();

    const conn: PooledConnection = {
      redis,
      id,
      createdAt: Date.now(),
      lastUsed: Date.now(),
      useCount: 0,
      inUse: false,
      isHealthy: true,
    };

    // Setup error handling
    redis.on('error', (err) => {
      logger.error('redis-pool', `Connection ${id} error: ${err.message}`);
      conn.isHealthy = false;
    });

    redis.on('end', () => {
      conn.isHealthy = false;
      this.pool.delete(id);
    });

    this.pool.set(id, conn);
    return conn;
  }

  private getAvailableConnection(): PooledConnection | null {
    // Remove expired connections first
    const now = Date.now();
    for (const [id, conn] of this.pool) {
      if (!conn.inUse && now - conn.lastUsed > this.config.idleTimeoutMs) {
        this.removeConnection(id);
        continue;
      }
      
      if (!conn.inUse && conn.isHealthy) {
        return conn;
      }
    }
    return null;
  }

  private async removeConnection(id: string): Promise<void> {
    const conn = this.pool.get(id);
    if (!conn) return;

    this.pool.delete(id);
    try {
      await conn.redis.quit();
    } catch {
      // Ignore errors
    }
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckIntervalMs);
  }

  private async performHealthCheck(): Promise<void> {
    const now = Date.now();
    
    for (const [id, conn] of this.pool) {
      // Skip connections in use
      if (conn.inUse) continue;
      
      // Remove idle connections exceeding minimum
      if (this.pool.size > this.config.minConnections && 
          now - conn.lastUsed > this.config.idleTimeoutMs) {
        await this.removeConnection(id);
        continue;
      }

      // Check health
      try {
        await conn.redis.ping();
        conn.isHealthy = true;
      } catch {
        conn.isHealthy = false;
        await this.removeConnection(id);
        
        // Create replacement if under minimum
        if (this.pool.size < this.config.minConnections) {
          await this.createConnection().catch(() => {});
        }
      }
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalPool: RedisConnectionPool | null = null;
let initializationPromise: Promise<RedisConnectionPool> | null = null;

/**
 * Get or create the global Redis connection pool
 */
export async function getRedisPool(config?: RedisPoolConfig): Promise<RedisConnectionPool> {
  if (globalPool) {
    return globalPool;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    globalPool = new RedisConnectionPool(config);
    await globalPool.initialize();
    return globalPool;
  })();

  return initializationPromise;
}

/**
 * Reset the global pool (useful for testing)
 */
export async function resetRedisPool(): Promise<void> {
  if (globalPool) {
    await globalPool.shutdown();
    globalPool = null;
  }
  initializationPromise = null;
}

/**
 * Get pool metrics
 */
export function getPoolMetrics(): PoolMetrics | null {
  return globalPool?.getMetrics() || null;
}

export default RedisConnectionPool;
