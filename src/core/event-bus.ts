/**
 * Event Bus - Granular Event Streaming Architecture
 * 
 * This module provides a type-safe event bus for agent execution events
 * with persistent event logging for audit trails and dashboard streaming.
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';

// ============================================================================
// Event Types
// ============================================================================

export type AgentEventType =
  | 'agent_start'
  | 'agent_complete'
  | 'turn_start'
  | 'turn_end'
  | 'thinking_start'
  | 'thinking_delta'
  | 'thinking_end'
  | 'tool_call_start'
  | 'tool_call_end'
  | 'text_delta'
  | 'error';

export interface BaseAgentEvent {
  id: string;
  type: AgentEventType;
  timestamp: number;
  agentId: string;
  swarmId?: string;
  sessionId?: string;
  correlationId?: string;
  parentEventId?: string;
}

export interface AgentStartEvent extends BaseAgentEvent {
  type: 'agent_start';
  task: string;
  model: string;
  provider: string;
}

export interface AgentCompleteEvent extends BaseAgentEvent {
  type: 'agent_complete';
  result: string;
  totalCost: number;
  totalTokens: number;
  duration: number;
}

export interface TurnStartEvent extends BaseAgentEvent {
  type: 'turn_start';
  turnId: string;
  message: string;
}

export interface TurnEndEvent extends BaseAgentEvent {
  type: 'turn_end';
  turnId: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cost: number;
}

export interface ThinkingStartEvent extends BaseAgentEvent {
  type: 'thinking_start';
}

export interface ThinkingDeltaEvent extends BaseAgentEvent {
  type: 'thinking_delta';
  delta: string;
}

export interface ThinkingEndEvent extends BaseAgentEvent {
  type: 'thinking_end';
}

export interface ToolCallStartEvent extends BaseAgentEvent {
  type: 'tool_call_start';
  tool: string;
  args: unknown;
}

export interface ToolCallEndEvent extends BaseAgentEvent {
  type: 'tool_call_end';
  tool: string;
  result: unknown;
  duration: number;
  success: boolean;
}

export interface TextDeltaEvent extends BaseAgentEvent {
  type: 'text_delta';
  delta: string;
}

export interface ErrorEvent extends BaseAgentEvent {
  type: 'error';
  error: {
    message: string;
    stack?: string;
    code?: string;
  };
}

export type AgentEvent =
  | AgentStartEvent
  | AgentCompleteEvent
  | TurnStartEvent
  | TurnEndEvent
  | ThinkingStartEvent
  | ThinkingDeltaEvent
  | ThinkingEndEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | TextDeltaEvent
  | ErrorEvent;

// ============================================================================
// Event Handler Types
// ============================================================================

export type EventHandler<T extends AgentEvent = AgentEvent> = (event: T) => void | Promise<void>;
export type EventFilter = (event: AgentEvent) => boolean;

export interface Subscription {
  id: string;
  eventTypes: AgentEventType[];
  handler: EventHandler;
  filter?: EventFilter;
}

// ============================================================================
// Event Bus Configuration
// ============================================================================

export interface EventBusConfig {
  /** Enable persistent event logging to JSONL files */
  persistEvents?: boolean;
  /** Directory for event logs */
  eventsDir?: string;
  /** Maximum listeners per event type */
  maxListeners?: number;
  /** Enable synchronous event delivery (default: async) */
  syncDelivery?: boolean;
}

// ============================================================================
// Event Bus Implementation
// ============================================================================

export class AgentEventBus extends EventEmitter {
  private subscriptions: Map<string, Subscription> = new Map();
  private eventLog: AgentEvent[] = [];
  private config: EventBusConfig;
  private eventsFile?: string;
  private metrics = {
    eventsEmitted: 0,
    eventsDelivered: 0,
    subscriptionsCreated: 0,
    subscriptionsRemoved: 0,
  };

  constructor(config: EventBusConfig = {}) {
    super();
    this.config = {
      persistEvents: false,
      maxListeners: 1000,
      syncDelivery: false,
      ...config,
    };

    this.setMaxListeners(this.config.maxListeners!);

    // Setup persistence if enabled
    if (this.config.persistEvents) {
      this.setupPersistence();
    }
  }

  private setupPersistence(): void {
    const eventsDir = this.config.eventsDir || join(process.cwd(), '.dash', 'events');
    
    if (!existsSync(eventsDir)) {
      mkdirSync(eventsDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.eventsFile = join(eventsDir, `events-${timestamp}.jsonl`);
    
    // Write header
    writeFileSync(this.eventsFile, '');
  }

  /**
   * Emit an event to all subscribers
   */
  emitEvent<T extends AgentEvent>(event: T): void {
    // Add timestamp if not present
    if (!event.timestamp) {
      event.timestamp = Date.now();
    }

    // Persist event if enabled
    if (this.config.persistEvents && this.eventsFile) {
      this.persistEvent(event);
    }

    // Store in memory log
    this.eventLog.push(event);

    // Update metrics
    this.metrics.eventsEmitted++;

    // Deliver to subscribers
    this.deliverEvent(event);

    // Also emit via EventEmitter for compatibility
    // Use 'agent:event' as the event name to avoid special handling for 'error'
    super.emit('agent:event', event);
    // Also emit by specific type for listeners that want specific events
    if (event.type !== 'error') {
      super.emit(event.type, event);
    }
  }

  private persistEvent(event: AgentEvent): void {
    if (!this.eventsFile) return;
    
    try {
      const line = JSON.stringify(event) + '\n';
      appendFileSync(this.eventsFile, line);
    } catch (error) {
      logger.error('event-bus', `Failed to persist event: ${error}`);
    }
  }

  private deliverEvent(event: AgentEvent): void {
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
          logger.error('event-bus', `Handler error for subscription ${subscription.id}: ${error}`);
        });
      }
      this.metrics.eventsDelivered++;
    } catch (error) {
      logger.error('event-bus', `Handler error for subscription ${subscription.id}: ${error}`);
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
    return new ScopedEventBus(this, agentId, swarmId, sessionId);
  }

  /**
   * Get recent events from memory log
   */
  getRecentEvents(limit: number = 100): AgentEvent[] {
    return this.eventLog.slice(-limit);
  }

  /**
   * Get events filtered by criteria
   */
  getEvents(filter: {
    types?: AgentEventType[];
    agentId?: string;
    swarmId?: string;
    sessionId?: string;
    since?: number;
    until?: number;
  }): AgentEvent[] {
    return this.eventLog.filter(event => {
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
   * Get event metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Clear event log
   */
  clearLog(): void {
    this.eventLog = [];
  }

  /**
   * Get events file path (if persistence enabled)
   */
  getEventsFilePath(): string | undefined {
    return this.eventsFile;
  }
}

// ============================================================================
// Scoped Event Bus - Pre-configured with agent/swarm/session context
// ============================================================================

export class ScopedEventBus {
  constructor(
    private bus: AgentEventBus,
    private agentId: string,
    private swarmId?: string,
    private sessionId?: string
  ) {}

  private createBaseEvent(type: AgentEventType): Omit<BaseAgentEvent, 'type'> {
    return {
      id: `evt_${randomUUID().slice(0, 8)}`,
      timestamp: Date.now(),
      agentId: this.agentId,
      swarmId: this.swarmId,
      sessionId: this.sessionId,
    };
  }

  emitAgentStart(task: string, model: string, provider: string): void {
    const event: AgentStartEvent = {
      ...this.createBaseEvent('agent_start'),
      type: 'agent_start',
      task,
      model,
      provider,
    };
    this.bus.emitEvent(event);
  }

  emitAgentComplete(result: string, totalCost: number, totalTokens: number, duration: number): void {
    const event: AgentCompleteEvent = {
      ...this.createBaseEvent('agent_complete'),
      type: 'agent_complete',
      result,
      totalCost,
      totalTokens,
      duration,
    };
    this.bus.emitEvent(event);
  }

  emitTurnStart(turnId: string, message: string): void {
    const event: TurnStartEvent = {
      ...this.createBaseEvent('turn_start'),
      type: 'turn_start',
      turnId,
      message,
    };
    this.bus.emitEvent(event);
  }

  emitTurnEnd(turnId: string, usage: { promptTokens: number; completionTokens: number; totalTokens: number }, cost: number): void {
    const event: TurnEndEvent = {
      ...this.createBaseEvent('turn_end'),
      type: 'turn_end',
      turnId,
      usage,
      cost,
    };
    this.bus.emitEvent(event);
  }

  emitThinkingStart(): void {
    const event: ThinkingStartEvent = {
      ...this.createBaseEvent('thinking_start'),
      type: 'thinking_start',
    };
    this.bus.emitEvent(event);
  }

  emitThinkingDelta(delta: string): void {
    const event: ThinkingDeltaEvent = {
      ...this.createBaseEvent('thinking_delta'),
      type: 'thinking_delta',
      delta,
    };
    this.bus.emitEvent(event);
  }

  emitThinkingEnd(): void {
    const event: ThinkingEndEvent = {
      ...this.createBaseEvent('thinking_end'),
      type: 'thinking_end',
    };
    this.bus.emitEvent(event);
  }

  emitToolCallStart(tool: string, args: unknown): void {
    const event: ToolCallStartEvent = {
      ...this.createBaseEvent('tool_call_start'),
      type: 'tool_call_start',
      tool,
      args,
    };
    this.bus.emitEvent(event);
  }

  emitToolCallEnd(tool: string, result: unknown, duration: number, success: boolean): void {
    const event: ToolCallEndEvent = {
      ...this.createBaseEvent('tool_call_end'),
      type: 'tool_call_end',
      tool,
      result,
      duration,
      success,
    };
    this.bus.emitEvent(event);
  }

  emitTextDelta(delta: string): void {
    const event: TextDeltaEvent = {
      ...this.createBaseEvent('text_delta'),
      type: 'text_delta',
      delta,
    };
    this.bus.emitEvent(event);
  }

  emitError(error: { message: string; stack?: string; code?: string }): void {
    const event: ErrorEvent = {
      ...this.createBaseEvent('error'),
      type: 'error',
      error,
    };
    this.bus.emitEvent(event);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalEventBus: AgentEventBus | null = null;

export function getGlobalEventBus(config?: EventBusConfig): AgentEventBus {
  if (!globalEventBus) {
    globalEventBus = new AgentEventBus(config);
  }
  return globalEventBus;
}

export function resetGlobalEventBus(): void {
  globalEventBus = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function createEventId(): string {
  return `evt_${randomUUID().slice(0, 8)}`;
}

export function createCorrelationId(): string {
  return `corr_${randomUUID().slice(0, 8)}`;
}

export default AgentEventBus;