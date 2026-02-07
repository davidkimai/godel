/**
 * Event Replay Engine
 *
 * Enables system state reconstruction from events for audit, recovery, and debugging.
 * Supports both sequential and parallel replay modes with progress tracking.
 *
 * @module loop/event-replay
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import type { EventRepository, Event as StorageEvent } from '../storage/repositories/EventRepository';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Priority level for events
 */
export type EventPriority = 'low' | 'normal' | 'high' | 'critical';

/**
 * Metadata attached to each event
 */
export interface EventMetadata {
  /** Event version for optimistic concurrency */
  version: number;
  /** Event priority */
  priority: EventPriority;
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Causation ID (parent event) */
  causationId?: string;
  /** User/agent who triggered the event */
  triggeredBy?: string;
}

/**
 * Core event structure for the Godel Loop
 */
export interface GodelEvent {
  /** Unique event ID */
  id: string;
  /** Event type */
  type: string;
  /** Event source (aggregate ID) */
  source: string;
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Event payload */
  payload: Record<string, unknown>;
  /** Event metadata */
  metadata: EventMetadata;
}

/**
 * Options for event replay
 */
export interface ReplayOptions {
  /** Start timestamp (inclusive) */
  from?: number;
  /** End timestamp (inclusive) */
  to?: number;
  /** Event filter function */
  filter?: (event: GodelEvent) => boolean;
  /** Batch size for processing (default: 1000) */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (processed: number, total: number) => void;
  /** Process events in parallel where causality allows */
  parallel?: boolean;
  /** Maximum parallel workers (default: 4) */
  maxParallelWorkers?: number;
  /** Stop on first error */
  stopOnError?: boolean;
  /** Maximum failure percentage (0-1) before aborting */
  maxFailureRate?: number;
}

/**
 * Result of a replay operation
 */
export interface ReplayResult {
  /** Total events processed */
  processed: number;
  /** Number of failed events */
  failed: number;
  /** Duration in milliseconds */
  duration: number;
  /** Detailed errors */
  errors: Array<{ event: GodelEvent; error: Error }>;
  /** Events skipped by filter */
  skipped: number;
}

/**
 * Event store interface for replay operations
 */
export interface EventStore {
  /** Get all events with optional filtering */
  getAll(options: {
    after?: number;
    before?: number;
    limit?: number;
    types?: string[];
  }): Promise<GodelEvent[]>;
  /** Get events for a specific stream */
  getStream(streamId: string): Promise<GodelEvent[]>;
  /** Get events by correlation ID */
  getByCorrelationId(correlationId: string): Promise<GodelEvent[]>;
}

/**
 * Handler for projecting events into read models
 */
export interface ProjectionHandler {
  /** Handle a single event */
  handle(event: GodelEvent): Promise<void>;
  /** Handler name for logging */
  readonly name: string;
}

// ============================================================================
// Event Store Implementation
// ============================================================================

/**
 * PostgreSQL-backed event store for replay operations
 */
export class PostgresEventStore implements EventStore {
  constructor(private repository: EventRepository) {}

  async getAll(options: {
    after?: number;
    before?: number;
    limit?: number;
    types?: string[];
  }): Promise<GodelEvent[]> {
    const events = await this.repository.findByFilter({
      since: options.after ? new Date(options.after) : undefined,
      until: options.before ? new Date(options.before) : undefined,
      limit: options.limit ?? 10000,
      types: options.types,
    });

    return events.map(e => this.toGodelEvent(e));
  }

  async getStream(streamId: string): Promise<GodelEvent[]> {
    const events = await this.repository.findByFilter({
      agent_id: streamId,
      limit: 10000,
    });

    return events.map(e => this.toGodelEvent(e));
  }

  async getByCorrelationId(correlationId: string): Promise<GodelEvent[]> {
    const events = await this.repository.findByFilter({
      limit: 10000,
    });

    // Filter by correlation ID in memory since it may be in payload
    return events
      .filter(e => e.correlation_id === correlationId || e.payload['correlationId'] === correlationId)
      .map(e => this.toGodelEvent(e))
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  private toGodelEvent(event: StorageEvent): GodelEvent {
    return {
      id: event.id,
      type: event.type,
      source: event.agent_id || event.team_id || 'system',
      timestamp: event.timestamp.getTime(),
      payload: event.payload,
      metadata: {
        version: 1,
        priority: this.mapSeverityToPriority(event.severity),
        correlationId: event.correlation_id,
      },
    };
  }

  private mapSeverityToPriority(severity: string): EventPriority {
    switch (severity) {
      case 'critical': return 'critical';
      case 'error': return 'high';
      case 'warning': return 'normal';
      default: return 'low';
    }
  }
}

// ============================================================================
// Event Replay Engine
// ============================================================================

/**
 * Event Replay Engine
 *
 * Replays events from the event store to reconstruct system state.
 * Supports sequential replay (preserves causality) and parallel replay
 * (processes independent event streams concurrently).
 *
 * @example
 * ```typescript
 * const replay = new EventReplayEngine(eventStore, handlers);
 *
 * // Sequential replay (default) - preserves causality
 * const result = await replay.replay({
 *   from: Date.now() - 86400000,
 *   onProgress: (p, t) => console.log(`${p}/${t}`)
 * });
 *
 * // Parallel replay - faster for independent streams
 * const result = await replay.replay({
 *   parallel: true,
 *   maxParallelWorkers: 8
 * });
 * ```
 */
export class EventReplayEngine extends EventEmitter {
  private isRunning = false;
  private abortController = new AbortController();

  constructor(
    private eventStore: EventStore,
    private projectionHandlers: Map<string, ProjectionHandler>
  ) {
    super();
  }

  /**
   * Replay events from the event store
   *
   * @param options - Replay options
   * @returns Replay result with statistics
   */
  async replay(options: ReplayOptions = {}): Promise<ReplayResult> {
    if (this.isRunning) {
      throw new Error('Replay already in progress');
    }

    this.isRunning = true;
    this.abortController = new AbortController();
    const startTime = Date.now();

    const result: ReplayResult = {
      processed: 0,
      failed: 0,
      duration: 0,
      errors: [],
      skipped: 0,
    };

    try {
      // Fetch events
      this.emit('replay:fetching', { from: options.from, to: options.to });

      const events = await this.eventStore.getAll({
        after: options.from,
        before: options.to,
        limit: options.batchSize ? undefined : 10000,
      });

      // Apply filter if provided
      const targetEvents = options.filter
        ? events.filter(e => {
            const include = options.filter!(e);
            if (!include) result.skipped++;
            return include;
          })
        : events;

      // Sort by timestamp for deterministic replay
      targetEvents.sort((a, b) => a.timestamp - b.timestamp);

      this.emit('replay:started', {
        total: targetEvents.length,
        mode: options.parallel ? 'parallel' : 'sequential',
      });

      if (options.parallel) {
        await this.replayParallel(targetEvents, result, options);
      } else {
        await this.replaySequential(targetEvents, result, options);
      }

      result.duration = Date.now() - startTime;

      this.emit('replay:completed', result);

      return result;
    } catch (error) {
      result.duration = Date.now() - startTime;
      this.emit('replay:error', { error, result });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Replay events for a specific stream
   *
   * @param streamId - Stream/correlation ID
   * @returns Replay result
   */
  async replayStream(streamId: string): Promise<ReplayResult> {
    const events = await this.eventStore.getStream(streamId);

    return this.replay({
      filter: e => e.metadata.correlationId === streamId || e.source === streamId,
    });
  }

  /**
   * Replay events by correlation ID
   *
   * @param correlationId - Correlation ID to replay
   * @returns Replay result
   */
  async replayCorrelation(correlationId: string): Promise<ReplayResult> {
    const events = await this.eventStore.getByCorrelationId(correlationId);

    return this.replay({
      filter: e => e.metadata.correlationId === correlationId,
    });
  }

  /**
   * Abort the current replay operation
   */
  abort(): void {
    if (this.isRunning) {
      this.abortController.abort();
      this.emit('replay:aborted');
    }
  }

  /**
   * Check if a replay is currently running
   */
  get running(): boolean {
    return this.isRunning;
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private async replaySequential(
    events: GodelEvent[],
    result: ReplayResult,
    options: ReplayOptions
  ): Promise<void> {
    const maxFailureRate = options.maxFailureRate ?? 0.1;
    const reportInterval = 100;

    for (let i = 0; i < events.length; i++) {
      if (this.abortController.signal.aborted) {
        throw new Error('Replay aborted');
      }

      const event = events[i];

      try {
        await this.processEvent(event);
        result.processed++;
      } catch (error) {
        result.failed++;
        result.errors.push({ event, error: error as Error });

        this.emit('replay:event:error', { event, error });

        if (options.stopOnError) {
          throw new Error(`Event processing failed: ${(error as Error).message}`);
        }

        // Check failure threshold
        if (result.failed > events.length * maxFailureRate) {
          throw new Error(
            `Too many failures (${result.failed}/${events.length}), stopping replay`
          );
        }
      }

      // Report progress
      if (options.onProgress && (i + 1) % reportInterval === 0) {
        options.onProgress(i + 1, events.length);
      }
    }

    // Final progress report
    if (options.onProgress) {
      options.onProgress(events.length, events.length);
    }
  }

  private async replayParallel(
    events: GodelEvent[],
    result: ReplayResult,
    options: ReplayOptions
  ): Promise<void> {
    const maxWorkers = options.maxParallelWorkers ?? 4;

    // Group events by correlation ID for parallel processing
    const groups = this.groupByCorrelationId(events);

    this.emit('replay:parallel:groups', { groupCount: groups.length });

    // Process groups with limited concurrency
    const semaphore = new Semaphore(maxWorkers);
    const maxFailureRate = options.maxFailureRate ?? 0.1;

    await Promise.all(
      groups.map(async (group, groupIndex) => {
        await semaphore.acquire();

        try {
          for (const event of group) {
            if (this.abortController.signal.aborted) {
              throw new Error('Replay aborted');
            }

            try {
              await this.processEvent(event);
              result.processed++;
            } catch (error) {
              result.failed++;
              result.errors.push({ event, error: error as Error });

              this.emit('replay:event:error', { event, error });

              if (options.stopOnError) {
                throw new Error(`Event processing failed: ${(error as Error).message}`);
              }

              // Check failure threshold
              if (result.failed > events.length * maxFailureRate) {
                throw new Error(
                  `Too many failures (${result.failed}/${events.length}), stopping replay`
                );
              }
            }
          }

          // Report progress per group completion
          if (options.onProgress) {
            const progress = Math.round(((groupIndex + 1) / groups.length) * events.length);
            options.onProgress(Math.min(progress, events.length), events.length);
          }
        } finally {
          semaphore.release();
        }
      })
    );

    // Final progress report
    if (options.onProgress) {
      options.onProgress(events.length, events.length);
    }
  }

  private async processEvent(event: GodelEvent): Promise<void> {
    // Emit for all handlers
    const handlers = Array.from(this.projectionHandlers.values());

    await Promise.all(
      handlers.map(async handler => {
        try {
          await handler.handle(event);
        } catch (error) {
          this.emit('replay:handler:error', {
            handler: handler.name,
            event,
            error,
          });
          throw error;
        }
      })
    );

    this.emit('replay:event:processed', { event });
  }

  private groupByCorrelationId(events: GodelEvent[]): GodelEvent[][] {
    const groups = new Map<string, GodelEvent[]>();

    for (const event of events) {
      const id = event.metadata.correlationId || event.source || 'unknown';
      if (!groups.has(id)) {
        groups.set(id, []);
      }
      groups.get(id)!.push(event);
    }

    // Sort events within each group by timestamp
    for (const group of groups.values()) {
      group.sort((a, b) => a.timestamp - b.timestamp);
    }

    return Array.from(groups.values());
  }
}

// ============================================================================
// Utility Classes
// ============================================================================

/**
 * Simple semaphore for limiting concurrent operations
 */
class Semaphore {
  private permits: number;
  private queue: Array<() => void> = [];

  constructor(initial: number) {
    this.permits = initial;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.queue.push(resolve);
    });
  }

  release(): void {
    if (this.queue.length > 0) {
      const resolve = this.queue.shift()!;
      resolve();
    } else {
      this.permits++;
    }
  }
}

// ============================================================================
// In-Memory Event Store (for testing)
// ============================================================================

/**
 * In-memory event store for testing replay functionality
 */
export class InMemoryEventStore implements EventStore {
  private events: GodelEvent[] = [];

  addEvent(event: GodelEvent): void {
    this.events.push(event);
  }

  addEvents(events: GodelEvent[]): void {
    this.events.push(...events);
  }

  clear(): void {
    this.events = [];
  }

  async getAll(options: {
    after?: number;
    before?: number;
    limit?: number;
    types?: string[];
  }): Promise<GodelEvent[]> {
    let result = [...this.events];

    if (options.after) {
      result = result.filter(e => e.timestamp >= options.after!);
    }
    if (options.before) {
      result = result.filter(e => e.timestamp <= options.before!);
    }
    if (options.types?.length) {
      result = result.filter(e => options.types!.includes(e.type));
    }

    result.sort((a, b) => a.timestamp - b.timestamp);

    if (options.limit) {
      result = result.slice(0, options.limit);
    }

    return result;
  }

  async getStream(streamId: string): Promise<GodelEvent[]> {
    return this.events
      .filter(e => e.source === streamId || e.metadata.correlationId === streamId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getByCorrelationId(correlationId: string): Promise<GodelEvent[]> {
    return this.events
      .filter(e => e.metadata.correlationId === correlationId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }
}

// ============================================================================
// Replay Builder
// ============================================================================

/**
 * Builder for configuring and executing event replays
 *
 * @example
 * ```typescript
 * const result = await ReplayBuilder.create(eventStore)
 *   .withHandler('agent', agentReadModel)
 *   .withHandler('task', taskReadModel)
 *   .from(Date.now() - 86400000)
 *   .parallel(4)
 *   .onProgress((p, t) => console.log(`${p}/${t}`))
 *   .replay();
 * ```
 */
export class ReplayBuilder {
  private handlers = new Map<string, ProjectionHandler>();
  private options: ReplayOptions = {};

  static create(eventStore: EventStore): ReplayBuilder {
    return new ReplayBuilder(eventStore);
  }

  private constructor(private eventStore: EventStore) {}

  withHandler(name: string, handler: ProjectionHandler): this {
    this.handlers.set(name, handler);
    return this;
  }

  from(timestamp: number): this {
    this.options.from = timestamp;
    return this;
  }

  to(timestamp: number): this {
    this.options.to = timestamp;
    return this;
  }

  filter(fn: (event: GodelEvent) => boolean): this {
    this.options.filter = fn;
    return this;
  }

  batchSize(size: number): this {
    this.options.batchSize = size;
    return this;
  }

  parallel(maxWorkers?: number): this {
    this.options.parallel = true;
    if (maxWorkers) {
      this.options.maxParallelWorkers = maxWorkers;
    }
    return this;
  }

  sequential(): this {
    this.options.parallel = false;
    return this;
  }

  stopOnError(): this {
    this.options.stopOnError = true;
    return this;
  }

  maxFailureRate(rate: number): this {
    this.options.maxFailureRate = rate;
    return this;
  }

  onProgress(fn: (processed: number, total: number) => void): this {
    this.options.onProgress = fn;
    return this;
  }

  async replay(): Promise<ReplayResult> {
    const engine = new EventReplayEngine(this.eventStore, this.handlers);
    return engine.replay(this.options);
  }
}
