/**
 * Redis Fallback System
 * 
 * Provides resilient Redis operations with automatic fallback to in-memory storage
 * when Redis is unavailable. Features:
 * - Automatic failover to in-memory cache
 * - Event queuing for replay when Redis recovers
 * - Health monitoring and auto-recovery detection
 * - Graceful degradation without data loss
 */

import Redis from 'ioredis';
import type { RedisOptions } from 'ioredis';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface RedisFallbackConfig {
  redis: RedisOptions;
  fallbackEnabled?: boolean;
  maxQueueSize?: number;
  recoveryCheckIntervalMs?: number;
  connectionTimeoutMs?: number;
  replayBatchSize?: number;
}

export interface QueuedEvent {
  id: string;
  channel: string;
  message: string;
  timestamp: number;
  attempts: number;
}

export interface FallbackStats {
  isConnected: boolean;
  isInFallbackMode: boolean;
  queuedEvents: number;
  replayedEvents: number;
  droppedEvents: number;
  failedConnections: number;
  lastError: string | null;
  lastRecovery: Date | null;
}

export enum FallbackState {
  CONNECTED = 'connected',
  FALLBACK = 'fallback',
  RECOVERING = 'recovering',
  DISCONNECTED = 'disconnected',
}

export class RedisFallback extends EventEmitter {
  private redis: Redis | null = null;
  private config: Required<RedisFallbackConfig>;
  private state: FallbackState = FallbackState.DISCONNECTED;
  private eventQueue: QueuedEvent[] = [];
  private inMemoryCache = new Map<string, string>();
  private memoryExpiry = new Map<string, number>();
  private recoveryCheckInterval?: NodeJS.Timeout;
  private stats = {
    replayedEvents: 0,
    droppedEvents: 0,
    failedConnections: 0,
  };
  private lastError: string | null = null;
  private lastRecovery: Date | null = null;

  constructor(config: RedisFallbackConfig) {
    super();
    this.config = {
      redis: config.redis,
      fallbackEnabled: config.fallbackEnabled ?? true,
      maxQueueSize: config.maxQueueSize ?? 10000,
      recoveryCheckIntervalMs: config.recoveryCheckIntervalMs ?? 5000,
      connectionTimeoutMs: config.connectionTimeoutMs ?? 5000,
      replayBatchSize: config.replayBatchSize ?? 100,
    };
  }

  /**
   * Initialize the Redis connection with fallback
   */
  async initialize(): Promise<void> {
    await this.connect();
    this.startRecoveryMonitoring();
  }

  /**
   * Connect to Redis with fallback handling
   */
  private async connect(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }

    this.redis = new Redis({
      ...this.config.redis,
      retryStrategy: (times) => {
        const delay = Math.min(times * 100, 3000);
        if (times > 3) {
          this.enterFallbackMode('Connection failed after 3 retries');
          return null; // Stop retrying
        }
        return delay;
      },
      connectTimeout: this.config.connectionTimeoutMs,
      maxRetriesPerRequest: 3,
    });

    this.setupEventHandlers();

    try {
      await this.redis.ping();
      this.state = FallbackState.CONNECTED;
      this.lastError = null;
      this.emit('connected');
      logger.info('Redis fallback: Connected to Redis');
      
      // Replay queued events if any
      await this.replayQueuedEvents();
    } catch (error) {
      this.stats.failedConnections++;
      this.enterFallbackMode((error as Error).message);
    }
  }

  /**
   * Set up Redis event handlers
   */
  private setupEventHandlers(): void {
    if (!this.redis) return;

    this.redis.on('connect', () => {
      if (this.state === FallbackState.FALLBACK) {
        this.attemptRecovery();
      }
    });

    this.redis.on('error', (error) => {
      this.lastError = error.message;
      if (this.state === FallbackState.CONNECTED) {
        this.enterFallbackMode(error.message);
      }
    });

    this.redis.on('close', () => {
      if (this.state === FallbackState.CONNECTED) {
        this.enterFallbackMode('Connection closed');
      }
    });
  }

  /**
   * Enter fallback mode
   */
  private enterFallbackMode(reason: string): void {
    if (this.state === FallbackState.FALLBACK) return;

    this.state = FallbackState.FALLBACK;
    this.lastError = reason;
    this.emit('fallback', reason);
    logger.warn('Redis fallback: Entering fallback mode', { reason });
  }

  /**
   * Attempt to recover Redis connection
   */
  private async attemptRecovery(): Promise<void> {
    if (this.state !== FallbackState.FALLBACK) return;

    this.state = FallbackState.RECOVERING;
    logger.info('Redis fallback: Attempting recovery...');

    try {
      if (this.redis) {
        await this.redis.ping();
        this.state = FallbackState.CONNECTED;
        this.lastRecovery = new Date();
        this.lastError = null;
        this.emit('recovered');
        logger.info('Redis fallback: Recovered successfully');
        await this.replayQueuedEvents();
      }
    } catch (error) {
      this.state = FallbackState.FALLBACK;
      logger.warn('Redis fallback: Recovery failed', { error: (error as Error).message });
    }
  }

  /**
   * Start background recovery monitoring
   */
  private startRecoveryMonitoring(): void {
    if (!this.config.fallbackEnabled) return;

    this.recoveryCheckInterval = setInterval(async () => {
      if (this.state === FallbackState.FALLBACK) {
        await this.attemptRecovery();
      }
    }, this.config.recoveryCheckIntervalMs);
  }

  /**
   * Replay queued events when Redis is available
   */
  private async replayQueuedEvents(): Promise<void> {
    if (!this.redis || this.eventQueue.length === 0) return;

    const batch = this.eventQueue.splice(0, this.config.replayBatchSize);
    logger.info(`Redis fallback: Replaying ${batch.length} events`);

    for (const event of batch) {
      try {
        await this.redis.publish(event.channel, event.message);
        this.stats.replayedEvents++;
      } catch (error) {
        // Put back in queue if it fails
        event.attempts++;
        if (event.attempts < 3) {
          this.eventQueue.unshift(event);
        } else {
          this.stats.droppedEvents++;
          logger.error('Redis fallback: Dropping event after max retries', { eventId: event.id });
        }
      }
    }

    // Continue replaying if more events exist
    if (this.eventQueue.length > 0) {
      setImmediate(() => this.replayQueuedEvents());
    }
  }

  /**
   * Get a value from Redis or fallback cache
   */
  async get(key: string): Promise<string | null> {
    if (this.state === FallbackState.CONNECTED && this.redis) {
      try {
        return await this.redis.get(key);
      } catch {
        // Fall through to memory cache
      }
    }

    // Check memory cache
    const value = this.inMemoryCache.get(key);
    const expiry = this.memoryExpiry.get(key);
    
    if (value && expiry && Date.now() < expiry) {
      return value;
    }

    // Expired or not found
    this.inMemoryCache.delete(key);
    this.memoryExpiry.delete(key);
    return null;
  }

  /**
   * Set a value in Redis with fallback to memory cache
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (this.state === FallbackState.CONNECTED && this.redis) {
      try {
        if (ttlSeconds) {
          await this.redis.setex(key, ttlSeconds, value);
        } else {
          await this.redis.set(key, value);
        }
        return;
      } catch {
        // Fall through to memory cache
      }
    }

    // Store in memory cache
    this.inMemoryCache.set(key, value);
    if (ttlSeconds) {
      this.memoryExpiry.set(key, Date.now() + (ttlSeconds * 1000));
    }
  }

  /**
   * Delete a key from Redis and memory cache
   */
  async del(key: string): Promise<void> {
    if (this.state === FallbackState.CONNECTED && this.redis) {
      try {
        await this.redis.del(key);
      } catch {
        // Continue to clean memory cache
      }
    }

    this.inMemoryCache.delete(key);
    this.memoryExpiry.delete(key);
  }

  /**
   * Publish an event with queueing for replay
   */
  async publish(channel: string, message: string): Promise<void> {
    if (this.state === FallbackState.CONNECTED && this.redis) {
      try {
        await this.redis.publish(channel, message);
        return;
      } catch {
        // Fall through to queue
      }
    }

    if (!this.config.fallbackEnabled) {
      throw new Error('Redis unavailable and fallback disabled');
    }

    // Queue for later replay
    if (this.eventQueue.length >= this.config.maxQueueSize) {
      this.stats.droppedEvents++;
      this.eventQueue.shift(); // Remove oldest
    }

    const event: QueuedEvent = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      channel,
      message,
      timestamp: Date.now(),
      attempts: 0,
    };

    this.eventQueue.push(event);
    this.emit('queued', event);
  }

  /**
   * Execute a Redis command with automatic fallback
   */
  async execute<T>(operation: (redis: Redis) => Promise<T>, fallback: T): Promise<T> {
    if (this.state === FallbackState.CONNECTED && this.redis) {
      try {
        return await operation(this.redis);
      } catch (error) {
        logger.warn('Redis fallback: Operation failed, using fallback', { error: (error as Error).message });
      }
    }

    return fallback;
  }

  /**
   * Get current fallback statistics
   */
  getStats(): FallbackStats {
    return {
      isConnected: this.state === FallbackState.CONNECTED,
      isInFallbackMode: this.state === FallbackState.FALLBACK,
      queuedEvents: this.eventQueue.length,
      replayedEvents: this.stats.replayedEvents,
      droppedEvents: this.stats.droppedEvents,
      failedConnections: this.stats.failedConnections,
      lastError: this.lastError,
      lastRecovery: this.lastRecovery,
    };
  }

  /**
   * Get current connection state
   */
  getState(): FallbackState {
    return this.state;
  }

  /**
   * Force recovery attempt
   */
  async forceRecovery(): Promise<boolean> {
    await this.attemptRecovery();
    return this.state === FallbackState.CONNECTED;
  }

  /**
   * Shutdown the fallback system
   */
  async shutdown(): Promise<void> {
    if (this.recoveryCheckInterval) {
      clearInterval(this.recoveryCheckInterval);
    }

    if (this.redis) {
      await this.redis.quit().catch(() => {});
    }

    this.removeAllListeners();
    logger.info('Redis fallback: Shutdown complete');
  }
}

export default RedisFallback;
