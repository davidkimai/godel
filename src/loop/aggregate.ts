/**
 * Event Sourced Aggregates
 *
 * Base classes for event-sourced domain aggregates. Provides event
 * application, state reconstruction, and snapshot management.
 *
 * @module loop/aggregate
 */

import { v4 as uuidv4 } from 'uuid';
import type { GodelEvent, EventMetadata } from './event-replay';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Snapshot of aggregate state
 */
export interface AggregateSnapshot {
  /** Aggregate ID */
  id: string;
  /** Aggregate type */
  type: string;
  /** Snapshot version */
  version: number;
  /** Snapshot timestamp */
  timestamp: number;
  /** Serialized state */
  state: Record<string, unknown>;
  /** Event count at snapshot time */
  eventCount: number;
}

/**
 * Options for creating events
 */
export interface EmitOptions {
  /** Event priority */
  priority?: 'low' | 'normal' | 'high' | 'critical';
  /** Correlation ID for tracing */
  correlationId?: string;
  /** Causation ID (parent event) */
  causationId?: string;
  /** User/agent who triggered */
  triggeredBy?: string;
}

/**
 * Aggregate event handler function type
 */
export type EventHandler<T = unknown> = (payload: T) => void;

// ============================================================================
// Base Event Sourced Aggregate
// ============================================================================

/**
 * Base class for event-sourced aggregates
 *
 * Provides core event sourcing functionality including:
 * - Event emission and application
 * - State version tracking
 * - Snapshot support
 * - Optimistic concurrency control
 *
 * @example
 * ```typescript
 * class OrderAggregate extends EventSourcedAggregate {
 *   private status: 'pending' | 'confirmed' | 'shipped' = 'pending';
 *   private items: OrderItem[] = [];
 *
 *   addItem(product: Product, quantity: number): void {
 *     this.emit('item_added', { productId: product.id, quantity });
 *   }
 *
 *   confirm(): void {
 *     if (this.status !== 'pending') {
 *       throw new Error('Order already confirmed');
 *     }
 *     this.emit('order_confirmed', { confirmedAt: Date.now() });
 *   }
 *
 *   protected getEventHandler(type: string): Function | undefined {
 *     const handlers: Record<string, Function> = {
 *       'item_added': (p: { productId: string; quantity: number }) => {
 *         this.items.push(p);
 *       },
 *       'order_confirmed': () => {
 *         this.status = 'confirmed';
 *       },
 *     };
 *     return handlers[type];
 *   }
 * }
 * ```
 */
export abstract class EventSourcedAggregate {
  private uncommittedEvents: GodelEvent[] = [];
  private version: number = 0;
  private initialVersion: number = 0;
  private id: string;

  constructor(id?: string) {
    this.id = id || uuidv4();
  }

  /**
   * Get the aggregate ID
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get current version (number of applied events)
   */
  getVersion(): number {
    return this.version;
  }

  /**
   * Get the initial version (for concurrency checks)
   */
  getInitialVersion(): number {
    return this.initialVersion;
  }

  /**
   * Apply a historical event to restore state
   *
   * @param event - Event to apply
   * @param isReplaying - Whether this is part of a replay (skips uncommitted tracking)
   */
  applyEvent(event: GodelEvent, isReplaying: boolean = false): void {
    const handler = this.getEventHandler(event.type);
    if (handler) {
      handler.call(this, event.payload);
    }

    this.version = event.metadata.version;

    if (!isReplaying) {
      this.uncommittedEvents.push(event);
    }
  }

  /**
   * Load events into the aggregate (replay mode)
   *
   * @param events - Events to load
   */
  loadFromHistory(events: GodelEvent[]): void {
    for (const event of events) {
      this.applyEvent(event, true);
    }
    this.initialVersion = this.version;
    this.uncommittedEvents = []; // Clear any events applied during load
  }

  /**
   * Emit a new event
   *
   * @param type - Event type
   * @param payload - Event payload
   * @param options - Event options
   */
  protected emit(
    type: string,
    payload: Record<string, unknown>,
    options: EmitOptions = {}
  ): void {
    const event: GodelEvent = {
      id: uuidv4(),
      type,
      source: this.getId(),
      timestamp: Date.now(),
      payload,
      metadata: {
        version: ++this.version,
        priority: options.priority || 'normal',
        correlationId: options.correlationId,
        causationId: options.causationId,
        triggeredBy: options.triggeredBy,
      },
    };

    this.uncommittedEvents.push(event);

    // Apply immediately to update state
    const handler = this.getEventHandler(type);
    if (handler) {
      handler.call(this, payload);
    }
  }

  /**
   * Get all uncommitted events
   */
  getUncommittedEvents(): GodelEvent[] {
    return [...this.uncommittedEvents];
  }

  /**
   * Mark all events as committed
   */
  markCommitted(): void {
    this.initialVersion = this.version;
    this.uncommittedEvents = [];
  }

  /**
   * Check if there are uncommitted changes
   */
  hasUncommittedChanges(): boolean {
    return this.uncommittedEvents.length > 0;
  }

  /**
   * Create a snapshot of current state
   *
   * @returns Snapshot object
   */
  abstract createSnapshot(): AggregateSnapshot;

  /**
   * Restore state from a snapshot
   *
   * @param snapshot - Snapshot to restore from
   */
  abstract restoreFromSnapshot(snapshot: AggregateSnapshot): void;

  /**
   * Get event handler for a specific event type
   *
   * @param type - Event type
   * @returns Handler function or undefined
   */
  protected abstract getEventHandler(type: string): EventHandler<unknown> | undefined;

  /**
   * Validate current state (throw if invalid)
   */
  abstract validate(): void;

  /**
   * Get aggregate type identifier
   */
  abstract getType(): string;
}

// ============================================================================
// Agent Aggregate
// ============================================================================

/**
 * Agent states
 */
export type AgentAggregateState =
  | 'created'
  | 'initializing'
  | 'idle'
  | 'busy'
  | 'paused'
  | 'error'
  | 'stopping'
  | 'stopped';

/**
 * Agent capabilities
 */
export interface AgentCapabilities {
  skills: string[];
  languages: string[];
  specialties: string[];
  costPerHour: number;
  avgSpeed: number;
  reliability: number;
}

/**
 * Task assignment info
 */
export interface TaskInfo {
  taskId: string;
  title?: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  startedAt?: number;
}

/**
 * Agent Aggregate for event sourcing
 *
 * Represents an agent's lifecycle and state as a series of events.
 * Can be reconstructed from events for audit and recovery.
 *
 * @example
 * ```typescript
 * const agent = new AgentAggregate('agent-1', capabilities);
 * agent.initialize();
 * agent.assignTask({ taskId: 'task-1', title: 'Build API' });
 * agent.completeTask({ result: 'success' }, 60000);
 *
 * // Persist events
 * await repository.saveEvents(agent.getUncommittedEvents());
 * agent.markCommitted();
 * ```
 */
export class AgentAggregate extends EventSourcedAggregate {
  private state: AgentAggregateState = 'created';
  private capabilities: AgentCapabilities;
  private currentTask?: TaskInfo;
  private taskCount: number = 0;
  private failedCount: number = 0;
  private totalRuntime: number = 0;
  private lastError?: string;
  private consecutiveErrors: number = 0;
  private metadata: Record<string, unknown> = {};

  constructor(id: string, capabilities: AgentCapabilities) {
    super(id);
    this.capabilities = capabilities;
  }

  // ============================================================================
  // Commands
  // ============================================================================

  /**
   * Initialize the agent
   */
  initialize(triggeredBy?: string): void {
    if (this.state !== 'created') {
      throw new Error('Agent already initialized');
    }

    this.emit(
      'agent.initialized',
      { agentId: this.getId() },
      { triggeredBy }
    );
  }

  /**
   * Mark agent as ready for work
   */
  markReady(): void {
    if (this.state !== 'initializing') {
      throw new Error('Agent not in initializing state');
    }

    this.emit('agent.ready', { agentId: this.getId() });
  }

  /**
   * Assign a task to the agent
   */
  assignTask(task: TaskInfo): void {
    if (this.state !== 'idle') {
      throw new Error('Agent not available for work');
    }

    this.emit('agent.task_assigned', {
      agentId: this.getId(),
      taskId: task.taskId,
      title: task.title,
      priority: task.priority,
    });
  }

  /**
   * Start working on the assigned task
   */
  startTask(): void {
    if (this.state !== 'busy') {
      throw new Error('No task assigned');
    }

    this.emit('agent.task_started', {
      agentId: this.getId(),
      taskId: this.currentTask?.taskId,
      startedAt: Date.now(),
    });
  }

  /**
   * Complete the current task
   */
  completeTask(result: unknown, duration: number): void {
    if (this.state !== 'busy') {
      throw new Error('No task in progress');
    }

    this.emit('agent.task_completed', {
      agentId: this.getId(),
      taskId: this.currentTask?.taskId,
      result,
      duration,
    });
  }

  /**
   * Fail the current task
   */
  failTask(error: string): void {
    this.emit('agent.task_failed', {
      agentId: this.getId(),
      taskId: this.currentTask?.taskId,
      error,
    });
  }

  /**
   * Pause the agent
   */
  pause(reason?: string): void {
    if (this.state === 'stopped' || this.state === 'stopping') {
      throw new Error('Cannot pause stopped agent');
    }

    this.emit('agent.paused', {
      agentId: this.getId(),
      reason,
      previousState: this.state,
    });
  }

  /**
   * Resume the agent
   */
  resume(): void {
    if (this.state !== 'paused') {
      throw new Error('Agent not paused');
    }

    this.emit('agent.resumed', {
      agentId: this.getId(),
      previousState: this.state,
    });
  }

  /**
   * Mark agent as stopping
   */
  stop(reason?: string): void {
    if (this.state === 'stopped') {
      return;
    }

    this.emit('agent.stopping', {
      agentId: this.getId(),
      reason,
    });
  }

  /**
   * Record an error
   */
  recordError(error: string): void {
    this.emit('agent.error_recorded', {
      agentId: this.getId(),
      error,
      consecutiveErrors: this.consecutiveErrors + 1,
    });
  }

  /**
   * Update capabilities
   */
  updateCapabilities(capabilities: Partial<AgentCapabilities>): void {
    this.emit('agent.capabilities_updated', {
      agentId: this.getId(),
      capabilities: { ...this.capabilities, ...capabilities },
      previousCapabilities: this.capabilities,
    });
  }

  // ============================================================================
  // Queries
  // ============================================================================

  /**
   * Get current state
   */
  getState(): AgentAggregateState {
    return this.state;
  }

  /**
   * Get capabilities
   */
  getCapabilities(): AgentCapabilities {
    return { ...this.capabilities };
  }

  /**
   * Get current task
   */
  getCurrentTask(): TaskInfo | undefined {
    return this.currentTask;
  }

  /**
   * Get task statistics
   */
  getStats(): {
    totalTasks: number;
    failedTasks: number;
    successRate: number;
    totalRuntime: number;
    averageDuration: number;
  } {
    const successRate =
      this.taskCount > 0
        ? (this.taskCount - this.failedCount) / this.taskCount
        : 0;

    return {
      totalTasks: this.taskCount,
      failedTasks: this.failedCount,
      successRate,
      totalRuntime: this.totalRuntime,
      averageDuration:
        this.taskCount > 0 ? this.totalRuntime / this.taskCount : 0,
    };
  }

  /**
   * Check if agent is available for work
   */
  isAvailable(): boolean {
    return this.state === 'idle';
  }

  /**
   * Check if agent is healthy
   */
  isHealthy(): boolean {
    return this.consecutiveErrors < 3 && this.state !== 'error';
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  protected getEventHandler(type: string): EventHandler<unknown> | undefined {
    const handlers: Record<string, EventHandler> = {
      'agent.initialized': () => {
        this.state = 'initializing';
      },
      'agent.ready': () => {
        this.state = 'idle';
        this.consecutiveErrors = 0;
      },
      'agent.task_assigned': (p: unknown) => {
        const payload = p as { taskId: string; title?: string; priority?: string };
        this.state = 'busy';
        this.currentTask = {
          taskId: payload.taskId,
          title: payload.title,
          priority: payload.priority as TaskInfo['priority'],
        };
      },
      'agent.task_started': (p: unknown) => {
        const payload = p as { startedAt: number };
        if (this.currentTask) {
          this.currentTask.startedAt = payload.startedAt;
        }
      },
      'agent.task_completed': (p: unknown) => {
        const payload = p as { duration: number };
        this.state = 'idle';
        this.taskCount++;
        this.totalRuntime += payload.duration;
        this.currentTask = undefined;
        this.consecutiveErrors = 0;
      },
      'agent.task_failed': (p: unknown) => {
        const payload = p as { error: string };
        this.state = 'error';
        this.taskCount++;
        this.failedCount++;
        this.lastError = payload.error;
        this.consecutiveErrors++;
        this.currentTask = undefined;
      },
      'agent.paused': (p: unknown) => {
        const payload = p as { previousState: string };
        this.state = 'paused';
        this.metadata['pausedFrom'] = payload.previousState;
      },
      'agent.resumed': () => {
        this.state = (this.metadata['pausedFrom'] as AgentAggregateState) || 'idle';
        delete this.metadata['pausedFrom'];
      },
      'agent.stopping': () => {
        this.state = 'stopping';
      },
      'agent.stopped': () => {
        this.state = 'stopped';
        this.currentTask = undefined;
      },
      'agent.error_recorded': (p: unknown) => {
        const payload = p as { error: string; consecutiveErrors: number };
        this.lastError = payload.error;
        this.consecutiveErrors = payload.consecutiveErrors;
        if (this.consecutiveErrors >= 3) {
          this.state = 'error';
        }
      },
      'agent.capabilities_updated': (p: unknown) => {
        const payload = p as { capabilities: AgentCapabilities };
        this.capabilities = payload.capabilities;
      },
    };

    return handlers[type];
  }

  // ============================================================================
  // Snapshot Support
  // ============================================================================

  createSnapshot(): AggregateSnapshot {
    return {
      id: this.getId(),
      type: this.getType(),
      version: this.getVersion(),
      timestamp: Date.now(),
      state: {
        state: this.state,
        capabilities: this.capabilities,
        currentTask: this.currentTask,
        taskCount: this.taskCount,
        failedCount: this.failedCount,
        totalRuntime: this.totalRuntime,
        lastError: this.lastError,
        consecutiveErrors: this.consecutiveErrors,
        metadata: this.metadata,
      },
      eventCount: this.getVersion(),
    };
  }

  restoreFromSnapshot(snapshot: AggregateSnapshot): void {
    const state = snapshot.state;
    this.state = state['state'] as AgentAggregateState;
    this.capabilities = state['capabilities'] as AgentCapabilities;
    this.currentTask = state['currentTask'] as TaskInfo | undefined;
    this.taskCount = (state['taskCount'] as number) || 0;
    this.failedCount = (state['failedCount'] as number) || 0;
    this.totalRuntime = (state['totalRuntime'] as number) || 0;
    this.lastError = state['lastError'] as string | undefined;
    this.consecutiveErrors = (state['consecutiveErrors'] as number) || 0;
    this.metadata = (state['metadata'] as Record<string, unknown>) || {};

    // Set version from snapshot
    this.loadFromHistory([]); // Clear any pending events
    (this as unknown as { version: number }).version = snapshot.version;
    (this as unknown as { initialVersion: number }).initialVersion = snapshot.version;
  }

  validate(): void {
    if (!this.capabilities) {
      throw new Error('Agent must have capabilities');
    }
    if (this.taskCount < 0 || this.failedCount < 0) {
      throw new Error('Task counts cannot be negative');
    }
    if (this.failedCount > this.taskCount) {
      throw new Error('Failed count cannot exceed total task count');
    }
  }

  getType(): string {
    return 'agent';
  }
}

// ============================================================================
// Aggregate Repository
// ============================================================================

/**
 * Repository interface for loading and saving aggregates
 */
export interface AggregateRepository<T extends EventSourcedAggregate> {
  /**
   * Load an aggregate by ID
   */
  load(id: string): Promise<T | null>;

  /**
   * Save an aggregate (store uncommitted events)
   */
  save(aggregate: T): Promise<void>;

  /**
   * Get the latest snapshot for an aggregate
   */
  getSnapshot(id: string): Promise<AggregateSnapshot | null>;

  /**
   * Save a snapshot
   */
  saveSnapshot(snapshot: AggregateSnapshot): Promise<void>;

  /**
   * Get events for an aggregate since a version
   */
  getEventsSince(id: string, version: number): Promise<GodelEvent[]>;
}

// ============================================================================
// Snapshot Store
// ============================================================================

/**
 * In-memory snapshot store for testing
 */
export class InMemorySnapshotStore {
  private snapshots = new Map<string, AggregateSnapshot>();

  async get(id: string): Promise<AggregateSnapshot | null> {
    return this.snapshots.get(id) || null;
  }

  async save(snapshot: AggregateSnapshot): Promise<void> {
    this.snapshots.set(snapshot.id, snapshot);
  }

  async delete(id: string): Promise<void> {
    this.snapshots.delete(id);
  }

  clear(): void {
    this.snapshots.clear();
  }
}
