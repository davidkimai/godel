/**
 * Event Bus - Central nervous system for agent coordination
 * Pub/sub event system with pattern matching, history, and middleware support
 */

import { EventEmitter as NodeEventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { GodelEvent, GodelEventMap, EventPriority, EventMetadata } from './events/types';
import { logger } from '../utils/logger';

/**
 * Event handler function type
 */
export type EventHandler<T = unknown> = (event: GodelEvent<T>) => void | Promise<void>;

/**
 * Typed event handler for specific event types
 */
export type TypedEventHandler<K extends keyof GodelEventMap = keyof GodelEventMap> = 
  (event: GodelEventMap[K]) => void | Promise<void>;

/**
 * Subscription configuration
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Event pattern (string with wildcards or RegExp) */
  pattern: string | RegExp;
  /** Handler function */
  handler: EventHandler;
  /** Optional filter function */
  filter?: (event: GodelEvent) => boolean;
  /** One-time subscription */
  once?: boolean;
  /** Subscription creation timestamp */
  createdAt: number;
}

/**
 * Options for publishing events
 */
export interface PublishOptions {
  /** Source agent/component */
  source?: string;
  /** Target agent/component */
  target?: string;
  /** Correlation ID for request tracking */
  correlationId?: string;
  /** Causation ID (event that caused this) */
  causationId?: string;
  /** Event version */
  version?: number;
  /** Event priority */
  priority?: EventPriority;
  /** Time to live in milliseconds */
  ttl?: number;
}

/**
 * Options for subscribing to events
 */
export interface SubscribeOptions {
  /** Filter function */
  filter?: (event: GodelEvent) => boolean;
  /** One-time subscription */
  once?: boolean;
}

/**
 * Options for querying event history
 */
export interface HistoryQueryOptions {
  /** Filter by event type */
  type?: string;
  /** Filter by source */
  source?: string;
  /** Filter by target */
  target?: string;
  /** Start timestamp (inclusive) */
  since?: number;
  /** End timestamp (inclusive) */
  until?: number;
  /** Maximum number of events to return */
  limit?: number;
  /** Correlation ID filter */
  correlationId?: string;
}

/**
 * Event middleware interface
 */
export interface EventMiddleware {
  /** Called before event is published */
  beforePublish?(event: GodelEvent): boolean | Promise<boolean>;
  /** Called after event is published */
  afterPublish?(event: GodelEvent): void | Promise<void>;
}

/**
 * Event bus statistics
 */
export interface EventBusStats {
  /** Total events published */
  totalEvents: number;
  /** Active subscription count */
  subscriptionCount: number;
  /** History size */
  historySize: number;
  /** Events by type */
  eventsByType: Record<string, number>;
  /** Handler error count */
  handlerErrors: number;
}

/**
 * EventBus - Central pub/sub system for agent coordination
 * 
 * Features:
 * - Pattern-based subscriptions with wildcards
 * - Event history with query capabilities
 * - Middleware support for cross-cutting concerns
 * - Typed event handlers
 * - Async/await support
 */
export class EventBus extends NodeEventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventHistory: GodelEvent[] = [];
  private maxHistorySize: number;
  private middlewares: EventMiddleware[] = [];
  private stats: EventBusStats;

  constructor(options: { maxHistorySize?: number } = {}) {
    super();
    this.maxHistorySize = options.maxHistorySize || 1000;
    this.stats = {
      totalEvents: 0,
      subscriptionCount: 0,
      historySize: 0,
      eventsByType: {},
      handlerErrors: 0
    };
  }

  /**
   * Publish an event to all matching subscribers
   * 
   * @param type - Event type (e.g., 'task:completed')
   * @param payload - Event data
   * @param options - Publishing options
   * @returns The published event
   * 
   * @example
   * ```typescript
   * await bus.publish('task:completed', {
   *   taskId: '123',
   *   agentId: 'agent-1',
   *   result: 'success',
   *   duration: 5000
   * });
   * ```
   */
  async publish<T>(
    type: string,
    payload: T,
    options: PublishOptions = {}
  ): Promise<GodelEvent<T>> {
    const event: GodelEvent<T> = {
      id: uuidv4(),
      type,
      source: options.source || 'system',
      target: options.target,
      timestamp: Date.now(),
      payload,
      metadata: {
        correlationId: options.correlationId || uuidv4(),
        causationId: options.causationId,
        version: options.version || 1,
        priority: options.priority || 'normal',
        ttl: options.ttl
      }
    };

    // Run pre-publish middlewares
    for (const middleware of this.middlewares) {
      if (middleware.beforePublish) {
        try {
          const result = await middleware.beforePublish(event);
          if (result === false) {
            logger.debug('Event cancelled by middleware', { eventId: event.id, type });
            return event;
          }
        } catch (error) {
          logger.error('Middleware beforePublish error', { error, eventId: event.id });
        }
      }
    }

    // Store in history
    this.addToHistory(event);

    // Update stats
    this.stats.totalEvents++;
    this.stats.eventsByType[type] = (this.stats.eventsByType[type] || 0) + 1;

    // Emit on Node EventEmitter for internal use
    this.emit('event', event);
    this.emit(event.type, event);

    // Notify pattern-based subscribers
    await this.notifySubscribers(event);

    // Run post-publish middlewares
    for (const middleware of this.middlewares) {
      if (middleware.afterPublish) {
        try {
          await middleware.afterPublish(event);
        } catch (error) {
          logger.error('Middleware afterPublish error', { error, eventId: event.id });
        }
      }
    }

    return event;
  }

  /**
   * Subscribe to events matching a pattern
   * 
   * @param pattern - Event pattern (e.g., 'agent:*', 'task:completed', or regex)
   * @param handler - Event handler function
   * @param options - Subscription options
   * @returns Subscription ID for unsubscribe
   * 
   * @example
   * ```typescript
   * // Subscribe to all agent events
   * const subId = bus.subscribe('agent:*', (event) => {
   *   console.log(`Agent event: ${event.type}`);
   * });
   * 
   * // Subscribe with filter
   * bus.subscribe('task:completed', handler, {
   *   filter: (e) => e.payload.duration > 1000
   * });
   * 
   * // One-time subscription
   * bus.subscribe('loop:started', handler, { once: true });
   * ```
   */
  subscribe(
    pattern: string | RegExp,
    handler: EventHandler,
    options: SubscribeOptions = {}
  ): string {
    const subscriptionId = uuidv4();

    const subscription: Subscription = {
      id: subscriptionId,
      pattern,
      handler,
      filter: options.filter,
      once: options.once,
      createdAt: Date.now()
    };

    this.subscriptions.set(subscriptionId, subscription);
    this.stats.subscriptionCount = this.subscriptions.size;

    logger.debug('Subscription created', { 
      subscriptionId, 
      pattern: pattern.toString(),
      once: options.once 
    });

    return subscriptionId;
  }

  /**
   * Subscribe to a specific event type with full type safety
   * Alias for subscribe() with type-safe handler
   * 
   * @param type - Event type from GodelEventMap
   * @param handler - Typed handler function
   * @param options - Subscription options
   * @returns Subscription ID
   * 
   * @example
   * ```typescript
   * bus.subscribeTyped('task:completed', (event) => {
   *   // event is fully typed as TaskCompletedEvent
   *   console.log(event.payload.result);
   * });
   * ```
   */
  subscribeTyped<K extends keyof GodelEventMap>(
    type: K,
    handler: TypedEventHandler<K>,
    options?: SubscribeOptions
  ): string {
    return this.subscribe(type, handler as EventHandler, options);
  }

  /**
   * Subscribe once to a specific event type
   * Alias for subscribe() with once option
   * 
   * @param type - Event type
   * @param handler - Handler function
   * @returns Subscription ID
   */
  subscribeOnce<K extends keyof GodelEventMap>(
    type: K,
    handler: TypedEventHandler<K>
  ): string {
    return this.subscribe(type, handler as EventHandler, { once: true });
  }

  /**
   * Unsubscribe from events
   * 
   * @param subscriptionId - ID returned from subscribe()
   * @returns True if subscription was found and removed
   */
  unsubscribe(subscriptionId: string): boolean {
    const sub = this.subscriptions.get(subscriptionId);
    if (!sub) {
      return false;
    }

    // Remove from Node EventEmitter if it was registered
    const eventName = this.patternToEventName(sub.pattern);
    this.off(eventName, sub.handler as (event: GodelEvent) => void);

    this.subscriptions.delete(subscriptionId);
    this.stats.subscriptionCount = this.subscriptions.size;

    logger.debug('Subscription removed', { subscriptionId });
    return true;
  }

  /**
   * Remove all subscriptions matching a pattern
   * 
   * @param pattern - Pattern to match
   * @returns Number of subscriptions removed
   */
  unsubscribePattern(pattern: string | RegExp): number {
    let count = 0;
    for (const [id, sub] of this.subscriptions) {
      if (this.patternsEqual(sub.pattern, pattern)) {
        this.unsubscribe(id);
        count++;
      }
    }
    return count;
  }

  /**
   * Wait for a specific event with optional timeout and filter
   * 
   * @param pattern - Event pattern to wait for
   * @param timeout - Timeout in milliseconds
   * @param filter - Additional filter function
   * @returns Promise that resolves with the event
   * @throws Error if timeout is reached
   * 
   * @example
   * ```typescript
   * const event = await bus.waitFor('task:completed', 5000, 
   *   (e) => e.payload.taskId === 'my-task'
   * );
   * ```
   */
  async waitFor(
    pattern: string | RegExp,
    timeout?: number,
    filter?: (event: GodelEvent) => boolean
  ): Promise<GodelEvent> {
    return new Promise((resolve, reject) => {
      let timeoutId: NodeJS.Timeout | null = null;

      const subId = this.subscribe(
        pattern,
        (event) => {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          this.unsubscribe(subId);
          resolve(event);
        },
        { filter, once: true }
      );

      if (timeout) {
        timeoutId = setTimeout(() => {
          this.unsubscribe(subId);
          reject(new Error(`Timeout waiting for event: ${pattern.toString()}`));
        }, timeout);
      }
    });
  }

  /**
   * Query event history with filters
   * 
   * @param options - Query options
   * @returns Array of matching events
   * 
   * @example
   * ```typescript
   * // Get last 100 task events
   * const events = bus.queryHistory({
   *   type: 'task:completed',
   *   limit: 100,
   *   since: Date.now() - 3600000 // Last hour
   * });
   * ```
   */
  queryHistory(options: HistoryQueryOptions = {}): GodelEvent[] {
    let events = [...this.eventHistory];

    if (options.type) {
      events = events.filter(e => this.matchesPattern(e.type, options.type!));
    }

    if (options.source) {
      events = events.filter(e => e.source === options.source);
    }

    if (options.target) {
      events = events.filter(e => e.target === options.target);
    }

    if (options.since) {
      events = events.filter(e => e.timestamp >= options.since!);
    }

    if (options.until) {
      events = events.filter(e => e.timestamp <= options.until!);
    }

    if (options.correlationId) {
      events = events.filter(e => e.metadata.correlationId === options.correlationId);
    }

    if (options.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  /**
   * Get a specific event by ID
   * 
   * @param eventId - Event ID
   * @returns Event or undefined if not found
   */
  getEvent(eventId: string): GodelEvent | undefined {
    return this.eventHistory.find(e => e.id === eventId);
  }

  /**
   * Get all events for a correlation ID
   * 
   * @param correlationId - Correlation ID
   * @returns Array of related events
   */
  getCorrelationChain(correlationId: string): GodelEvent[] {
    return this.eventHistory
      .filter(e => e.metadata.correlationId === correlationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Add middleware to the event pipeline
   * 
   * @param middleware - Middleware to add
   * 
   * @example
   * ```typescript
   * bus.use({
   *   beforePublish: (event) => {
   *     console.log('Publishing:', event.type);
   *     return true;
   *   }
   * });
   * ```
   */
  use(middleware: EventMiddleware): void {
    this.middlewares.push(middleware);
  }

  /**
   * Remove middleware from the pipeline
   * 
   * @param middleware - Middleware to remove
   * @returns True if middleware was found
   */
  unuse(middleware: EventMiddleware): boolean {
    const index = this.middlewares.indexOf(middleware);
    if (index !== -1) {
      this.middlewares.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get current event bus statistics
   */
  getStats(): EventBusStats {
    return { ...this.stats, historySize: this.eventHistory.length };
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
    this.stats.historySize = 0;
  }

  /**
   * Remove all subscriptions
   */
  unsubscribeAll(): void {
    this.subscriptions.clear();
    this.stats.subscriptionCount = 0;
    this.removeAllListeners();
  }

  /**
   * Dispose of the event bus, clearing all state
   */
  dispose(): void {
    this.unsubscribeAll();
    this.clearHistory();
    this.middlewares = [];
  }

  /**
   * Notify all matching subscribers of an event
   */
  private async notifySubscribers(event: GodelEvent): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const sub of this.subscriptions.values()) {
      if (!this.matchesPattern(event.type, sub.pattern)) {
        continue;
      }

      if (sub.filter && !sub.filter(event)) {
        continue;
      }

      const promise = this.executeHandler(sub, event);
      promises.push(promise);
    }

    // Wait for all handlers to complete
    await Promise.all(promises);
  }

  /**
   * Execute a subscription handler
   */
  private async executeHandler(sub: Subscription, event: GodelEvent): Promise<void> {
    try {
      await sub.handler(event);
      
      // Unsubscribe after execution if once=true
      if (sub.once) {
        this.unsubscribe(sub.id);
      }
    } catch (error) {
      this.stats.handlerErrors++;
      logger.error('Event handler error', { 
        subscriptionId: sub.id, 
        eventId: event.id,
        error 
      });
      this.emit('handler:error', { subscription: sub, event, error });
    }
  }

  /**
   * Check if an event type matches a pattern
   * Supports wildcards: 'agent:*' matches 'agent:state-changed'
   */
  private matchesPattern(eventType: string, pattern: string | RegExp): boolean {
    if (typeof pattern === 'string') {
      // Support wildcards: "agent:*" matches "agent:state-changed"
      const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
      return regex.test(eventType);
    }
    return pattern.test(eventType);
  }

  /**
   * Add event to history with size limit
   */
  private addToHistory(event: GodelEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
    this.stats.historySize = this.eventHistory.length;
  }

  /**
   * Convert pattern to event name for Node EventEmitter
   */
  private patternToEventName(pattern: string | RegExp): string {
    return typeof pattern === 'string' ? pattern : `regex:${pattern.source}`;
  }

  /**
   * Check if two patterns are equal
   */
  private patternsEqual(a: string | RegExp, b: string | RegExp): boolean {
    if (typeof a === 'string' && typeof b === 'string') {
      return a === b;
    }
    if (a instanceof RegExp && b instanceof RegExp) {
      return a.source === b.source && a.flags === b.flags;
    }
    return false;
  }
}

/**
 * Global event bus instance
 */
let globalEventBus: EventBus | null = null;

/**
 * Get or create the global event bus instance
 */
export function getGlobalEventBus(): EventBus {
  if (!globalEventBus) {
    globalEventBus = new EventBus();
  }
  return globalEventBus;
}

/**
 * Reset the global event bus (useful for testing)
 */
export function resetGlobalEventBus(): void {
  if (globalEventBus) {
    globalEventBus.dispose();
  }
  globalEventBus = new EventBus();
}
