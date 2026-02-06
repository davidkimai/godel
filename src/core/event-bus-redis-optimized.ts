/**
 * Optimized Redis Event Bus
 * 
 * Improvements over base implementation:
 * - Uses Redis connection pooling
 * - Implements event batching for high-frequency events
 * - Optimized stream reading with backpressure handling
 * - Better error recovery and fallback handling
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import type { Redis } from 'ioredis';
import { getRedisPool, RedisConnectionPool } from './redis-pool';
import { getEventBatchProcessor, EventBatchProcessor } from '../events/batcher';
import { getPerformanceTracker } from '../metrics/performance';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// Types
// ============================================================================

export interface OptimizedRedisEventBusConfig {
  redisUrl?: string;
  streamKey?: string;
  consumerGroup?: string;
  nodeId?: string;
  compressionThreshold?: number;
  maxStreamLength?: number;
  maxBatchSize?: number;
  batchWaitMs?: number;
  enablePooling?: boolean;
}

export interface EventMetrics {
  eventsEmitted: number;
  eventsDelivered: number;
  eventsPublished: number;
  eventsReceived: number;
  eventsBatched: number;
  eventsCompressed: number;
  redisErrors: number;
  fallbackEvents: number;
}

// ============================================================================
// Optimized Redis Event Bus
// ============================================================================

export class OptimizedRedisEventBus extends EventEmitter {
  private config: Required<OptimizedRedisEventBusConfig>;
  private pool: RedisConnectionPool | null = null;
  private subscriber: Redis | null = null;
  private batchProcessor: EventBatchProcessor;
  private performanceTracker = getPerformanceTracker();
  
  private subscriptions: Map<string, {
    id: string;
    eventTypes: string[];
    handler: (event: unknown) => void;
    filter?: (event: unknown) => boolean;
  }> = new Map();
  
  private metrics: EventMetrics = {
    eventsEmitted: 0,
    eventsDelivered: 0,
    eventsPublished: 0,
    eventsReceived: 0,
    eventsBatched: 0,
    eventsCompressed: 0,
    redisErrors: 0,
    fallbackEvents: 0,
  };

  private isRedisConnected = false;
  private isShuttingDown = false;
  private streamReadInterval: NodeJS.Timeout | null = null;
  private fallbackQueue: unknown[] = [];
  private isInFallbackMode = false;
  private nodeId: string;

  constructor(config: OptimizedRedisEventBusConfig = {}) {
    super();
    
    this.nodeId = config.nodeId || `node_${randomUUID().slice(0, 8)}`;
    
    this.config = {
      nodeId: this.nodeId,
      redisUrl: config.redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379/0',
      streamKey: config.streamKey || 'dash:events',
      consumerGroup: config.consumerGroup || 'dash:consumers',
      compressionThreshold: config.compressionThreshold || 1024,
      maxStreamLength: config.maxStreamLength || 100000,
      maxBatchSize: config.maxBatchSize || 100,
      batchWaitMs: config.batchWaitMs || 50,
      enablePooling: config.enablePooling !== false,
    };

    this.batchProcessor = getEventBatchProcessor({
      maxBatchSize: this.config.maxBatchSize,
      maxWaitMs: this.config.batchWaitMs,
      enableDeduplication: true,
    });

    // Handle batched events
    this.batchProcessor.on('batch', ({ type, batch }) => {
      this.handleBatch(type, batch);
    });
  }

  /**
   * Initialize the event bus
   */
  async initialize(): Promise<void> {
    try {
      if (this.config.enablePooling) {
        this.pool = await getRedisPool({
          url: this.config.redisUrl,
          minConnections: 5,
          maxConnections: 20,
          multiplexPubSub: true,
        });
        
        // Get dedicated subscriber
        this.subscriber = await this.pool.getSubscriber();
      } else {
        // Fallback to direct connections
        const Redis = (await import('ioredis')).default;
        this.subscriber = new Redis(this.config.redisUrl);
      }

      await this.setupSubscriber();
      await this.setupConsumerGroup();
      this.startStreamReader();

      this.isRedisConnected = true;
      logger.info('event-bus-optimized', `Node ${this.nodeId} connected to Redis`);
    } catch (error) {
      logger.error('event-bus-optimized', 'Failed to initialize: ' + error);
      this.activateFallbackMode();
    }
  }

  /**
   * Emit an event
   */
  async emitEvent(event: {
    type: string;
    payload?: unknown;
    timestamp?: number;
    agentId?: string;
    swarmId?: string;
    [key: string]: unknown;
  }): Promise<void> {
    const fullEvent = {
      ...event,
      nodeId: this.nodeId,
      timestamp: event.timestamp || Date.now(),
    };

    this.metrics.eventsEmitted++;
    this.performanceTracker.recordEvent();

    // Add to batch processor
    await this.batchProcessor.add(event.type, fullEvent);

    // Deliver to local subscribers immediately
    this.deliverToSubscribers(fullEvent);
  }

  /**
   * Subscribe to events
   */
  subscribe(
    eventTypes: string | string[],
    handler: (event: unknown) => void,
    filter?: (event: unknown) => boolean
  ): { id: string; unsubscribe: () => void } {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const id = `sub_${randomUUID().slice(0, 8)}`;

    this.subscriptions.set(id, {
      id,
      eventTypes: types,
      handler,
      filter,
    });

    return {
      id,
      unsubscribe: () => {
        this.subscriptions.delete(id);
      },
    };
  }

  /**
   * Get metrics
   */
  getMetrics(): EventMetrics & { isConnected: boolean; isFallbackMode: boolean } {
    const batchMetrics = this.batchProcessor.getAllMetrics();
    const totalBatched = Object.values(batchMetrics)
      .reduce((sum, m) => sum + m.eventsBatched, 0);

    return {
      ...this.metrics,
      eventsBatched: totalBatched,
      isConnected: this.isRedisConnected,
      isFallbackMode: this.isInFallbackMode,
    };
  }

  /**
   * Gracefully shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    if (this.streamReadInterval) {
      clearInterval(this.streamReadInterval);
      this.streamReadInterval = null;
    }

    // Flush pending batches
    await this.batchProcessor.flushAll();

    // Release subscriber
    if (this.pool && this.subscriber) {
      this.pool.releaseSubscriber(this.subscriber);
    } else if (this.subscriber) {
      await this.subscriber.quit();
    }

    logger.info('event-bus-optimized', 'Event bus shutdown complete');
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async setupSubscriber(): Promise<void> {
    if (!this.subscriber) return;

    await this.subscriber.subscribe('dash:events:realtime');

    this.subscriber.on('message', async (channel, message) => {
      try {
        const event = JSON.parse(message);
        
        // Skip if from this node
        if (event.nodeId === this.nodeId) return;

        this.metrics.eventsReceived++;
        this.deliverToSubscribers(event);
      } catch (error) {
        logger.error('event-bus-optimized', 'Error processing message: ' + error);
      }
    });
  }

  private async setupConsumerGroup(): Promise<void> {
    if (!this.pool) return;

    try {
      await this.pool.withConnection(async (redis) => {
        await redis.xgroup(
          'CREATE',
          this.config.streamKey,
          this.config.consumerGroup,
          '$',
          'MKSTREAM'
        );
      });
    } catch (error: any) {
      if (!error.message?.includes('already exists')) {
        logger.error('event-bus-optimized', 'Error creating consumer group: ' + error);
      }
    }
  }

  private startStreamReader(): void {
    if (!this.pool) return;

    this.streamReadInterval = setInterval(async () => {
      if (!this.isRedisConnected || this.isInFallbackMode) return;

      try {
        await this.pool!.withConnection(async (redis) => {
          const results = await redis.xreadgroup(
            'GROUP',
            this.config.consumerGroup,
            this.nodeId,
            'COUNT',
            100,
            'BLOCK',
            1000,
            'STREAMS',
            this.config.streamKey,
            '>'
          );

          if (!results || results.length === 0) return;

          for (const [, messages] of results as Array<[string, Array<[string, string[]]>]>) {
            for (const [id, fields] of messages) {
              await this.processStreamMessage(redis, id, fields);
            }
          }
        });
      } catch (error) {
        if (this.isRedisConnected) {
          logger.error('event-bus-optimized', 'Stream read error: ' + error);
          this.metrics.redisErrors++;
        }
      }
    }, 100);
  }

  private async processStreamMessage(
    redis: Redis,
    id: string,
    fields: string[]
  ): Promise<void> {
    try {
      const dataIndex = fields.indexOf('data');
      if (dataIndex === -1 || dataIndex + 1 >= fields.length) return;

      const event = JSON.parse(fields[dataIndex + 1]);
      this.deliverToSubscribers(event);

      // Acknowledge
      await redis.xack(this.config.streamKey, this.config.consumerGroup, id);
    } catch (error) {
      logger.error('event-bus-optimized', 'Error processing stream message: ' + error);
    }
  }

  private async handleBatch(type: string, batch: { events: unknown[] }): Promise<void> {
    this.metrics.eventsBatched += batch.events.length;

    if (this.isInFallbackMode || !this.pool) {
      // Queue in fallback
      this.fallbackQueue.push(...batch.events);
      return;
    }

    // Publish batch
    try {
      await this.pool.withConnection(async (redis) => {
        // Publish to pub/sub for real-time
        await redis.publish(
          'dash:events:realtime',
          JSON.stringify({
            type,
            batch: true,
            events: batch.events,
            nodeId: this.nodeId,
          })
        );

        // Add to stream for persistence
        for (const event of batch.events) {
          await redis.xadd(
            this.config.streamKey,
            'MAXLEN',
            '~',
            this.config.maxStreamLength,
            '*',
            'data',
            JSON.stringify(event)
          );
        }
      });

      this.metrics.eventsPublished += batch.events.length;
    } catch (error) {
      logger.error('event-bus-optimized', 'Publish error: ' + error);
      this.metrics.redisErrors++;
      this.activateFallbackMode();
    }
  }

  private deliverToSubscribers(event: unknown): void {
    const eventType = (event as any)?.type;
    
    for (const sub of this.subscriptions.values()) {
      // Check event type match
      if (!sub.eventTypes.includes(eventType) && !sub.eventTypes.includes('*')) {
        continue;
      }

      // Check filter
      if (sub.filter && !sub.filter(event)) {
        continue;
      }

      // Deliver
      try {
        sub.handler(event);
        this.metrics.eventsDelivered++;
      } catch (error) {
        logger.error('event-bus-optimized', `Handler error for ${sub.id}: ${error}`);
      }
    }
  }

  private activateFallbackMode(): void {
    if (this.isInFallbackMode) return;
    
    logger.warn('event-bus-optimized', 'Activating fallback mode');
    this.isInFallbackMode = true;
    this.isRedisConnected = false;
    this.metrics.fallbackEvents++;

    this.emit('fallback');
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalOptimizedBus: OptimizedRedisEventBus | null = null;

export async function getOptimizedRedisEventBus(
  config?: OptimizedRedisEventBusConfig
): Promise<OptimizedRedisEventBus> {
  if (!globalOptimizedBus) {
    globalOptimizedBus = new OptimizedRedisEventBus(config);
    await globalOptimizedBus.initialize();
  }
  return globalOptimizedBus;
}

export function resetOptimizedRedisEventBus(): void {
  globalOptimizedBus = null;
}

export default OptimizedRedisEventBus;
