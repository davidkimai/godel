/**
 * Redis Event Bus - Scalable Event Streaming with Redis
 * 
 * This module provides a Redis-backed event bus for horizontal scaling
 * with pub/sub for real-time events, Redis Streams for persistence,
 * and automatic fallback to in-memory when Redis is unavailable.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { promisify } from 'util';
import { gzip, gunzip } from 'zlib';
import Redis, { RedisOptions } from 'ioredis';
import { z } from 'zod';
import {
  AgentEvent,
  AgentEventType,
  BaseAgentEvent,
  AgentStartEvent,
  AgentCompleteEvent,
  TurnStartEvent,
  TurnEndEvent,
  ThinkingStartEvent,
  ThinkingDeltaEvent,
  ThinkingEndEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  TextDeltaEvent,
  ErrorEvent,
  EventHandler,
  EventFilter,
  Subscription,
  AgentEventBus,
  ScopedEventBus,
  EventBusConfig as BaseEventBusConfig,
} from './event-bus';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

// ============================================================================
// JSON Schema Validation with Zod
// ============================================================================

const BaseEventSchema = z.object({
  id: z.string(),
  type: z.enum([
    'agent_start', 'agent_complete', 'turn_start', 'turn_end',
    'thinking_start', 'thinking_delta', 'thinking_end',
    'tool_call_start', 'tool_call_end', 'text_delta', 'error'
  ]),
  timestamp: z.number(),
  agentId: z.string(),
  swarmId: z.string().optional(),
  sessionId: z.string().optional(),
  correlationId: z.string().optional(),
  parentEventId: z.string().optional(),
  nodeId: z.string().optional(),
});

const AgentStartEventSchema = BaseEventSchema.extend({
  type: z.literal('agent_start'),
  task: z.string(),
  model: z.string(),
  provider: z.string(),
});

const AgentCompleteEventSchema = BaseEventSchema.extend({
  type: z.literal('agent_complete'),
  result: z.string(),
  totalCost: z.number(),
  totalTokens: z.number(),
  duration: z.number(),
});

const TurnStartEventSchema = BaseEventSchema.extend({
  type: z.literal('turn_start'),
  turnId: z.string(),
  message: z.string(),
});

const TurnEndEventSchema = BaseEventSchema.extend({
  type: z.literal('turn_end'),
  turnId: z.string(),
  usage: z.object({
    promptTokens: z.number(),
    completionTokens: z.number(),
    totalTokens: z.number(),
  }),
  cost: z.number(),
});

const ThinkingStartEventSchema = BaseEventSchema.extend({
  type: z.literal('thinking_start'),
});

const ThinkingDeltaEventSchema = BaseEventSchema.extend({
  type: z.literal('thinking_delta'),
  delta: z.string(),
});

const ThinkingEndEventSchema = BaseEventSchema.extend({
  type: z.literal('thinking_end'),
});

const ToolCallStartEventSchema = BaseEventSchema.extend({
  type: z.literal('tool_call_start'),
  tool: z.string(),
  args: z.unknown(),
});

const ToolCallEndEventSchema = BaseEventSchema.extend({
  type: z.literal('tool_call_end'),
  tool: z.string(),
  result: z.unknown(),
  duration: z.number(),
  success: z.boolean(),
});

const TextDeltaEventSchema = BaseEventSchema.extend({
  type: z.literal('text_delta'),
  delta: z.string(),
});

const ErrorEventSchema = BaseEventSchema.extend({
  type: z.literal('error'),
  error: z.object({
    message: z.string(),
    stack: z.string().optional(),
    code: z.string().optional(),
  }),
});

const AgentEventSchema = z.discriminatedUnion('type', [
  AgentStartEventSchema,
  AgentCompleteEventSchema,
  TurnStartEventSchema,
  TurnEndEventSchema,
  ThinkingStartEventSchema,
  ThinkingDeltaEventSchema,
  ThinkingEndEventSchema,
  ToolCallStartEventSchema,
  ToolCallEndEventSchema,
  TextDeltaEventSchema,
  ErrorEventSchema,
]);

// ============================================================================
// Configuration Types
// ============================================================================

export interface RedisEventBusConfig extends BaseEventBusConfig {
  /** Redis connection URL (e.g., redis://localhost:6379/0) */
  redisUrl?: string;
  /** Redis connection options */
  redisOptions?: RedisOptions;
  /** Stream key for event persistence (default: dash:events) */
  streamKey?: string;
  /** Consumer group name for multi-node support */
  consumerGroup?: string;
  /** This node's unique ID (auto-generated if not provided) */
  nodeId?: string;
  /** Enable compression for events larger than this size (bytes, default: 1024) */
  compressionThreshold?: number;
  /** Maximum events to keep in stream (trimming, default: 100000) */
  maxStreamLength?: number;
  /** Retry configuration for Redis operations */
  retryConfig?: {
    maxRetries?: number;
    retryDelayMs?: number;
    retryDelayMultiplier?: number;
  };
  /** Fallback configuration when Redis is unavailable */
  fallbackConfig?: {
    /** Max events to queue in memory during Redis outage (default: 10000) */
    maxQueuedEvents?: number;
    /** Alert callback when falling back to memory */
    onFallback?: (error: Error) => void;
    /** Alert callback when recovered */
    onRecovered?: () => void;
  };
  /** Event versioning configuration */
  versioning?: {
    /** Current event version (default: 1) */
    currentVersion: number;
    /** Enable strict version checking */
    strictVersioning: boolean;
  };
}

interface SerializedEvent {
  version: number;
  compressed: boolean;
  data: string;
  timestamp: number;
  nodeId: string;
  eventType: string;
}

// ============================================================================
// Redis Event Bus Implementation
// ============================================================================

export class RedisEventBus extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private config: RedisEventBusConfig & Required<Omit<RedisEventBusConfig, keyof BaseEventBusConfig>> & BaseEventBusConfig;
  private nodeId: string;
  private metrics = {
    eventsEmitted: 0,
    eventsDelivered: 0,
    eventsPublished: 0,
    eventsReceived: 0,
    subscriptionsCreated: 0,
    subscriptionsRemoved: 0,
    redisErrors: 0,
    fallbackEvents: 0,
    compressedEvents: 0,
  };

  // Redis connections
  private publisher: Redis | null = null;
  private subscriber: Redis | null = null;
  private streamClient: Redis | null = null;
  private isRedisConnected = false;
  private isShuttingDown = false;

  // Fallback mechanism
  private fallbackBus: AgentEventBus | null = null;
  private fallbackQueue: AgentEvent[] = [];
  private isInFallbackMode = false;
  private recoveryInterval: NodeJS.Timeout | null = null;

  // Stream reading
  private streamReadInterval: NodeJS.Timeout | null = null;
  private lastStreamId = '0';

  // Multi-node support
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private knownNodes: Map<string, { lastSeen: number; metadata: Record<string, unknown> }> = new Map();

  constructor(config: RedisEventBusConfig = {}) {
    super();
    
    this.nodeId = config.nodeId || `node_${randomUUID().slice(0, 8)}`;
    
    this.config = {
      persistEvents: true,
      maxListeners: 1000,
      syncDelivery: false,
      redisUrl: config.redisUrl || process.env['REDIS_URL'] || 'redis://localhost:6379/0',
      redisOptions: config.redisOptions || {},
      streamKey: config.streamKey || 'dash:events',
      consumerGroup: config.consumerGroup || 'dash:consumers',
      nodeId: this.nodeId,
      compressionThreshold: config.compressionThreshold || 1024,
      maxStreamLength: config.maxStreamLength || 100000,
      retryConfig: {
        maxRetries: 3,
        retryDelayMs: 1000,
        retryDelayMultiplier: 2,
        ...config.retryConfig,
      },
      fallbackConfig: {
        maxQueuedEvents: 10000,
        onFallback: (err) => console.warn('[RedisEventBus] Fallback mode activated:', err.message),
        onRecovered: () => console.info('[RedisEventBus] Recovered from fallback mode'),
        ...config.fallbackConfig,
      },
      versioning: {
        currentVersion: 1,
        strictVersioning: false,
        ...config.versioning,
      },
      ...config,
    };

    this.setMaxListeners(this.config.maxListeners);
    
    // Initialize fallback bus
    this.fallbackBus = new AgentEventBus({
      persistEvents: false,
      maxListeners: this.config.maxListeners,
      syncDelivery: this.config.syncDelivery,
    });

    // Setup Redis connections
    this.initializeRedis();
  }

  // ============================================================================
  // Redis Connection Management
  // ============================================================================

  private async initializeRedis(): Promise<void> {
    try {
      // Create separate connections for pub/sub and streams
      this.publisher = new Redis(this.config.redisUrl, {
        ...this.config.redisOptions,
        retryStrategy: (times) => {
          if (times > this.config.retryConfig.maxRetries) {
            return null; // Stop retrying
          }
          return Math.min(times * this.config.retryConfig.retryDelayMs, 10000);
        },
      });

      this.subscriber = new Redis(this.config.redisUrl, {
        ...this.config.redisOptions,
        retryStrategy: (times) => {
          if (times > this.config.retryConfig.maxRetries) {
            return null;
          }
          return Math.min(times * this.config.retryConfig.retryDelayMs, 10000);
        },
      });

      this.streamClient = new Redis(this.config.redisUrl, {
        ...this.config.redisOptions,
        retryStrategy: (times) => {
          if (times > this.config.retryConfig.maxRetries) {
            return null;
          }
          return Math.min(times * this.config.retryConfig.retryDelayMs, 10000);
        },
      });

      // Setup event handlers
      this.setupRedisEventHandlers();

      // Setup subscriber
      await this.setupSubscriber();

      // Setup consumer group
      await this.setupConsumerGroup();

      // Start stream reader
      this.startStreamReader();

      // Start heartbeat for multi-node discovery
      this.startHeartbeat();

      // Start recovery checker
      this.startRecoveryChecker();

      this.isRedisConnected = true;
      console.info(`[RedisEventBus] Node ${this.nodeId} connected to Redis`);
    } catch (error) {
      console.error('[RedisEventBus] Failed to connect to Redis:', error);
      this.activateFallbackMode(error as Error);
    }
  }

  private setupRedisEventHandlers(): void {
    if (!this.publisher || !this.subscriber || !this.streamClient) return;

    const handleError = (conn: string) => (error: Error) => {
      console.error(`[RedisEventBus] ${conn} connection error:`, error);
      this.metrics.redisErrors++;
      if (!this.isInFallbackMode) {
        this.activateFallbackMode(error);
      }
    };

    const handleDisconnect = (conn: string) => () => {
      console.warn(`[RedisEventBus] ${conn} disconnected`);
      this.isRedisConnected = false;
      if (!this.isInFallbackMode) {
        this.activateFallbackMode(new Error(`${conn} disconnected`));
      }
    };

    const handleReconnect = (conn: string) => () => {
      console.info(`[RedisEventBus] ${conn} reconnected`);
      this.isRedisConnected = true;
    };

    this.publisher.on('error', handleError('publisher'));
    this.publisher.on('disconnect', handleDisconnect('publisher'));
    this.publisher.on('connect', handleReconnect('publisher'));

    this.subscriber.on('error', handleError('subscriber'));
    this.subscriber.on('disconnect', handleDisconnect('subscriber'));
    this.subscriber.on('connect', handleReconnect('subscriber'));

    this.streamClient.on('error', handleError('stream'));
    this.streamClient.on('disconnect', handleDisconnect('stream'));
    this.streamClient.on('connect', handleReconnect('stream'));
  }

  private async setupSubscriber(): Promise<void> {
    if (!this.subscriber) return;

    // Subscribe to real-time events channel
    await this.subscriber.subscribe('dash:events:realtime');

    this.subscriber.on('message', async (channel, message) => {
      try {
        const serialized: SerializedEvent = JSON.parse(message);
        const event = await this.deserializeEvent(serialized);
        
        // Only process if not from this node (avoid duplicate processing)
        if (event.nodeId !== this.nodeId) {
          this.deliverEventToSubscribers(event);
          this.metrics.eventsReceived++;
        }
      } catch (error) {
        console.error('[RedisEventBus] Error processing pub/sub message:', error);
      }
    });
  }

  private async setupConsumerGroup(): Promise<void> {
    if (!this.streamClient) return;

    try {
      // Create consumer group if it doesn't exist
      await this.streamClient.xgroup(
        'CREATE',
        this.config.streamKey,
        this.config.consumerGroup,
        '$',
        'MKSTREAM'
      );
    } catch (error: any) {
      // Group already exists
      if (!error.message?.includes('already exists')) {
        console.error('[RedisEventBus] Error creating consumer group:', error);
      }
    }
  }

  // ============================================================================
  // Fallback Mechanism
  // ============================================================================

  private activateFallbackMode(error: Error): void {
    if (this.isInFallbackMode) return;
    
    console.warn(`[RedisEventBus] Activating fallback mode for node ${this.nodeId}`);
    this.isInFallbackMode = true;
    this.metrics.fallbackEvents++;
    
    this.config.fallbackConfig.onFallback?.(error);
    this.emit('fallback', error);

    // Sync fallback bus subscriptions with ours
    this.syncSubscriptionsToFallback();
  }

  private async recoverFromFallbackMode(): Promise<void> {
    if (!this.isInFallbackMode || !this.isRedisConnected) return;

    console.info(`[RedisEventBus] Recovering from fallback mode for node ${this.nodeId}`);
    
    try {
      // Replay queued events
      await this.replayQueuedEvents();
      
      this.isInFallbackMode = false;
      this.config.fallbackConfig.onRecovered?.();
      this.emit('recovered');
    } catch (error) {
      console.error('[RedisEventBus] Recovery failed:', error);
    }
  }

  private async replayQueuedEvents(): Promise<void> {
    if (!this.streamClient || this.fallbackQueue.length === 0) return;

    console.info(`[RedisEventBus] Replaying ${this.fallbackQueue.length} queued events`);

    for (const event of this.fallbackQueue) {
      try {
        await this.publishToStream(event);
      } catch (error) {
        console.error('[RedisEventBus] Failed to replay event:', error);
      }
    }

    this.fallbackQueue = [];
  }

  private startRecoveryChecker(): void {
    this.recoveryInterval = setInterval(async () => {
      if (this.isInFallbackMode && this.isRedisConnected) {
        await this.recoverFromFallbackMode();
      }
    }, 5000);
  }

  private syncSubscriptionsToFallback(): void {
    // Subscriptions are managed separately - fallback bus has its own
  }

  // ============================================================================
  // Stream Reading (Persistent Events)
  // ============================================================================

  private startStreamReader(): void {
    this.streamReadInterval = setInterval(async () => {
      if (!this.streamClient || !this.isRedisConnected) return;

      try {
        const results = await this.streamClient.xreadgroup(
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
            await this.processStreamMessage(id, fields);
          }
        }
      } catch (error) {
        // Stream errors are expected during reconnection
        if (this.isRedisConnected) {
          console.error('[RedisEventBus] Stream read error:', error);
        }
      }
    }, 100);
  }

  private async processStreamMessage(id: string, fields: string[]): Promise<void> {
    try {
      const dataIndex = fields.indexOf('data');
      if (dataIndex === -1 || dataIndex + 1 >= fields.length) return;

      const serialized: SerializedEvent = JSON.parse(fields[dataIndex + 1]);
      const event = await this.deserializeEvent(serialized);

      // Deliver to local subscribers
      this.deliverEventToSubscribers(event);
      
      // Acknowledge message
      if (this.streamClient) {
        await this.streamClient.xack(this.config.streamKey, this.config.consumerGroup, id);
      }
    } catch (error) {
      console.error('[RedisEventBus] Error processing stream message:', error);
    }
  }

  // ============================================================================
  // Multi-Node Support
  // ============================================================================

  private startHeartbeat(): void {
    const heartbeatKey = `dash:nodes:${this.nodeId}`;
    
    this.heartbeatInterval = setInterval(async () => {
      if (!this.streamClient || !this.isRedisConnected) return;

      try {
        await this.streamClient.setex(
          heartbeatKey,
          30, // 30 second TTL
          JSON.stringify({
            lastSeen: Date.now(),
            metadata: {
              subscriptions: this.subscriptions.size,
              eventsEmitted: this.metrics.eventsEmitted,
            },
          })
        );

        // Update known nodes
        await this.updateKnownNodes();
      } catch (error) {
        // Silent failure - heartbeat is non-critical
      }
    }, 10000);
  }

  private async updateKnownNodes(): Promise<void> {
    if (!this.streamClient) return;

    try {
      const keys = await this.streamClient.keys('dash:nodes:*');
      const now = Date.now();
      const ttl = 30000; // 30 seconds

      for (const key of keys) {
        const nodeId = key.replace('dash:nodes:', '');
        if (nodeId === this.nodeId) continue;

        const data = await this.streamClient.get(key);
        if (data) {
          const parsed = JSON.parse(data);
          if (now - parsed.lastSeen < ttl) {
            this.knownNodes.set(nodeId, parsed);
          } else {
            this.knownNodes.delete(nodeId);
          }
        }
      }
    } catch (error) {
      // Silent failure
    }
  }

  /**
   * Get list of active nodes in the cluster
   */
  getActiveNodes(): Array<{ nodeId: string; lastSeen: number; metadata: Record<string, unknown> }> {
    return Array.from(this.knownNodes.entries()).map(([nodeId, data]) => ({
      nodeId,
      ...data,
    }));
  }

  /**
   * Get this node's ID
   */
  getNodeId(): string {
    return this.nodeId;
  }

  // ============================================================================
  // Event Serialization
  // ============================================================================

  private async serializeEvent(event: AgentEvent): Promise<SerializedEvent> {
    const eventWithNode = { ...event, nodeId: this.nodeId };
    let data = JSON.stringify(eventWithNode);
    let compressed = false;

    // Compress if event is large
    if (data.length > this.config.compressionThreshold) {
      const compressedBuffer = await gzipAsync(Buffer.from(data));
      data = compressedBuffer.toString('base64');
      compressed = true;
      this.metrics.compressedEvents++;
    }

    return {
      version: this.config.versioning.currentVersion,
      compressed,
      data,
      timestamp: Date.now(),
      nodeId: this.nodeId,
      eventType: event.type,
    };
  }

  private async deserializeEvent(serialized: SerializedEvent): Promise<AgentEvent & { nodeId?: string }> {
    // Version check
    if (serialized.version !== this.config.versioning.currentVersion) {
      if (this.config.versioning.strictVersioning) {
        throw new Error(`Event version mismatch: expected ${this.config.versioning.currentVersion}, got ${serialized.version}`);
      }
      console.warn(`[RedisEventBus] Event version mismatch: ${serialized.version} vs ${this.config.versioning.currentVersion}`);
    }

    let data = serialized.data;

    // Decompress if needed
    if (serialized.compressed) {
      const decompressed = await gunzipAsync(Buffer.from(data, 'base64'));
      data = decompressed.toString('utf8');
    }

    const parsed = JSON.parse(data);
    
    // Validate with Zod schema
    const result = AgentEventSchema.safeParse(parsed);
    if (!result.success) {
      console.error('[RedisEventBus] Event validation failed:', result.error);
      throw new Error(`Event validation failed: ${result.error.message}`);
    }

    return result.data as AgentEvent & { nodeId?: string };
  }

  // ============================================================================
  // Event Publishing
  // ============================================================================

  private async publishToPubSub(event: AgentEvent): Promise<void> {
    if (!this.publisher || !this.isRedisConnected) {
      throw new Error('Redis not connected');
    }

    const serialized = await this.serializeEvent(event);
    await this.publisher.publish('dash:events:realtime', JSON.stringify(serialized));
    this.metrics.eventsPublished++;
  }

  private async publishToStream(event: AgentEvent): Promise<void> {
    if (!this.streamClient || !this.isRedisConnected) {
      throw new Error('Redis not connected');
    }

    const serialized = await this.serializeEvent(event);
    await this.streamClient.xadd(
      this.config.streamKey,
      'MAXLEN',
      '~',
      this.config.maxStreamLength,
      '*',
      'data',
      JSON.stringify(serialized),
      'nodeId',
      this.nodeId
    );
  }

  // ============================================================================
  // Event Delivery
  // ============================================================================

  private deliverEventToSubscribers(event: AgentEvent): void {
    Array.from(this.subscriptions.values()).forEach(subscription => {
      // Check if subscriber listens to this event type
      if (!subscription.eventTypes.includes(event.type)) {
        return;
      }

      // Apply custom filter if present
      if (subscription.filter && !subscription.filter(event)) {
        return;
      }

      // Deliver event
      this.deliverToSubscription(event, subscription);
    });
  }

  private deliverToSubscription(event: AgentEvent, subscription: Subscription): void {
    try {
      if (this.config.syncDelivery) {
        subscription.handler(event);
      } else {
        // Run async without awaiting
        Promise.resolve(subscription.handler(event)).catch((error) => {
          console.error(`[RedisEventBus] Handler error for subscription ${subscription.id}:`, error);
        });
      }
      this.metrics.eventsDelivered++;
    } catch (error) {
      console.error(`[RedisEventBus] Handler error for subscription ${subscription.id}:`, error);
    }
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Emit an event to all subscribers and persist to Redis
   */
  emitEvent<T extends AgentEvent>(event: T): void {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Update metrics
    this.metrics.eventsEmitted++;

    // If in fallback mode, queue to fallback bus
    if (this.isInFallbackMode) {
      if (this.fallbackQueue.length < this.config.fallbackConfig.maxQueuedEvents) {
        this.fallbackQueue.push(event);
      } else {
        console.warn('[RedisEventBus] Fallback queue full, dropping event');
      }
      
      // Also emit to fallback bus for immediate local delivery
      this.fallbackBus?.emitEvent(event);
      return;
    }

    // Publish to Redis (pub/sub for real-time, stream for persistence)
    Promise.all([
      this.publishToPubSub(event).catch((error) => {
        console.error('[RedisEventBus] Pub/sub publish failed:', error);
        this.activateFallbackMode(error);
      }),
      this.publishToStream(event).catch((error) => {
        console.error('[RedisEventBus] Stream publish failed:', error);
        // Don't activate fallback for stream errors - pub/sub is more critical
      }),
    ]).catch((error) => {
      console.error('[RedisEventBus] Event publishing failed:', error);
    });

    // Deliver to local subscribers immediately (don't wait for Redis)
    this.deliverEventToSubscribers(event);

    // Also emit via EventEmitter for compatibility
    super.emit('agent:event', event);
    if (event.type !== 'error') {
      super.emit(event.type, event);
    }
  }

  /**
   * Subscribe to specific event types
   */
  subscribe(
    eventTypes: AgentEventType | AgentEventType[],
    handler: EventHandler,
    filter?: EventFilter
  ): Subscription {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const subscription: Subscription = {
      id: `sub_${randomUUID().slice(0, 8)}`,
      eventTypes: types,
      handler,
      filter,
    };

    this.subscriptions.set(subscription.id, subscription);
    this.metrics.subscriptionsCreated++;

    // Also subscribe to fallback bus
    this.fallbackBus?.subscribe(eventTypes, handler, filter);

    return subscription;
  }

  /**
   * Subscribe to all event types
   */
  subscribeAll(handler: EventHandler, filter?: EventFilter): Subscription {
    const allTypes: AgentEventType[] = [
      'agent_start', 'agent_complete',
      'turn_start', 'turn_end',
      'thinking_start', 'thinking_delta', 'thinking_end',
      'tool_call_start', 'tool_call_end',
      'text_delta', 'error'
    ];
    return this.subscribe(allTypes, handler, filter);
  }

  /**
   * Unsubscribe from events
   */
  unsubscribe(subscription: Subscription | string): boolean {
    const id = typeof subscription === 'string' ? subscription : subscription.id;
    const existed = this.subscriptions.delete(id);
    if (existed) {
      this.metrics.subscriptionsRemoved++;
    }
    return existed;
  }

  /**
   * Create a scoped event bus for a specific agent/swarm
   */
  createScopedBus(agentId: string, swarmId?: string, sessionId?: string): ScopedEventBus {
    return new ScopedEventBus(this as any, agentId, swarmId, sessionId);
  }

  /**
   * Get event metrics
   */
  getMetrics(): typeof this.metrics & { isInFallbackMode: boolean; isRedisConnected: boolean; knownNodes: number } {
    return {
      ...this.metrics,
      isInFallbackMode: this.isInFallbackMode,
      isRedisConnected: this.isRedisConnected,
      knownNodes: this.knownNodes.size,
    };
  }

  /**
   * Get recent events from Redis stream
   */
  async getRecentEvents(limit: number = 100): Promise<AgentEvent[]> {
    if (!this.streamClient || !this.isRedisConnected) {
      return [];
    }

    try {
      const results = await this.streamClient.xrevrange(
        this.config.streamKey,
        '+',
        '-',
        'COUNT',
        limit
      );

      const events: AgentEvent[] = [];
      for (const [, fields] of results.reverse()) {
        const dataIndex = fields.indexOf('data');
        if (dataIndex !== -1 && dataIndex + 1 < fields.length) {
          try {
            const serialized: SerializedEvent = JSON.parse(fields[dataIndex + 1]);
            const event = await this.deserializeEvent(serialized);
            events.push(event as AgentEvent);
          } catch (error) {
            // Skip invalid events
          }
        }
      }

      return events;
    } catch (error) {
      console.error('[RedisEventBus] Error reading recent events:', error);
      return [];
    }
  }

  /**
   * Get events filtered by criteria (uses in-memory cache for recent events)
   */
  async getEvents(filter: {
    types?: AgentEventType[];
    agentId?: string;
    swarmId?: string;
    sessionId?: string;
    since?: number;
    until?: number;
    limit?: number;
  }): Promise<AgentEvent[]> {
    const events = await this.getRecentEvents(filter.limit || 1000);

    return events.filter(event => {
      if (filter.types && !filter.types.includes(event.type)) return false;
      if (filter.agentId && event.agentId !== filter.agentId) return false;
      if (filter.swarmId && event.swarmId !== filter.swarmId) return false;
      if (filter.sessionId && event.sessionId !== filter.sessionId) return false;
      if (filter.since && event.timestamp < filter.since) return false;
      if (filter.until && event.timestamp > filter.until) return false;
      return true;
    });
  }

  /**
   * Check if in fallback mode
   */
  isFallbackMode(): boolean {
    return this.isInFallbackMode;
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.isRedisConnected;
  }

  /**
   * Gracefully shutdown the event bus
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Clear intervals
    if (this.streamReadInterval) {
      clearInterval(this.streamReadInterval);
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    if (this.recoveryInterval) {
      clearInterval(this.recoveryInterval);
    }

    // Replay any queued events before shutting down
    if (this.isRedisConnected && this.fallbackQueue.length > 0) {
      await this.replayQueuedEvents();
    }

    // Close Redis connections
    await this.publisher?.quit();
    await this.subscriber?.quit();
    await this.streamClient?.quit();

    console.info(`[RedisEventBus] Node ${this.nodeId} shut down gracefully`);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalRedisEventBus: RedisEventBus | null = null;

export function getGlobalRedisEventBus(config?: RedisEventBusConfig): RedisEventBus {
  if (!globalRedisEventBus) {
    globalRedisEventBus = new RedisEventBus(config);
  }
  return globalRedisEventBus;
}

export function resetGlobalRedisEventBus(): void {
  globalRedisEventBus?.shutdown().catch(console.error);
  globalRedisEventBus = null;
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new Redis event bus with the given configuration
 */
export function createRedisEventBus(config?: RedisEventBusConfig): RedisEventBus {
  return new RedisEventBus(config);
}

/**
 * Create event bus with in-memory fallback only (no Redis)
 */
export function createMemoryEventBus(config?: BaseEventBusConfig): AgentEventBus {
  return new AgentEventBus(config);
}

export default RedisEventBus;
