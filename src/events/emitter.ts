/**
 * Event Emitter - Core event emission system
 * Handles event publishing, filtering, and subscription management
 */

import {
  EventType,
  MissionEvent,
  BaseEvent,
  EventFilter,
  generateEventId,
  AgentStatusChangedPayload,
  TaskStatusChangedPayload,
} from './types';

type EventListener = (event: MissionEvent) => void;

export class EventEmitter {
  private listeners: Map<EventType, Set<EventListener>> = new Map();
  private allListeners: Set<EventListener> = new Set();
  private filteredListeners: Map<string, { filter: EventFilter; listener: EventListener }[]> = new Map();
  private eventHistory: MissionEvent[] = [];
  private readonly maxHistorySize: number = 10000;

  /**
   * Emit an event to all subscribers
   */
  emit(eventType: EventType, payload: any, source: BaseEvent['source'], correlationId?: string): MissionEvent {
    const event: MissionEvent = {
      id: generateEventId(),
      timestamp: new Date(),
      eventType,
      source,
      correlationId,
      payload,
    } as MissionEvent;

    // Store in history
    this.addToHistory(event);

    // Emit to type-specific listeners
    const typeListeners = this.listeners.get(eventType);
    if (typeListeners) {
      for (const listener of typeListeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${eventType}:`, error);
        }
      }
    }

    // Emit to filtered listeners
    const filtered = this.filteredListeners.get(eventType);
    if (filtered) {
      for (const { filter, listener } of filtered) {
        if (this.matchesFilter(event, filter)) {
          try {
            listener(event);
          } catch (error) {
            console.error(`Error in filtered event listener for ${eventType}:`, error);
          }
        }
      }
    }

    // Emit to "all" listeners
    for (const listener of this.allListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error('Error in all-listener:', error);
      }
    }

    return event;
  }

  /**
   * Subscribe to a specific event type
   */
  subscribe(eventType: EventType, listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Subscribe to all events
   */
  subscribeAll(listener: EventListener): () => void {
    this.allListeners.add(listener);
    return () => {
      this.allListeners.delete(listener);
    };
  }

  /**
   * Subscribe to events matching a filter
   */
  subscribeFiltered(filter: EventFilter, listener: EventListener): () => void {
    if (filter.eventTypes) {
      for (const eventType of filter.eventTypes) {
        if (!this.filteredListeners.has(eventType)) {
          this.filteredListeners.set(eventType, []);
        }
        this.filteredListeners.get(eventType)!.push({ filter, listener });
      }
    } else {
      // If no event types specified, subscribe to all with filter check
      return this.subscribeAll((event) => {
        if (this.matchesFilter(event, filter)) {
          listener(event);
        }
      });
    }

    // Return unsubscribe function
    return () => {
      if (filter.eventTypes) {
        for (const eventType of filter.eventTypes) {
          const filtered = this.filteredListeners.get(eventType);
          if (filtered) {
            const index = filtered.findIndex((f) => f.filter === filter && f.listener === listener);
            if (index !== -1) {
              filtered.splice(index, 1);
            }
          }
        }
      }
    };
  }

  /**
   * Unsubscribe from a specific event type
   */
  unsubscribe(eventType: EventType, listener?: EventListener): void {
    if (listener) {
      this.listeners.get(eventType)?.delete(listener);
    } else {
      this.listeners.delete(eventType);
    }
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeAll(): void {
    this.listeners.clear();
    this.allListeners.clear();
    this.filteredListeners.clear();
  }

  /**
   * Check if an event matches a filter
   */
  private matchesFilter(event: MissionEvent, filter: EventFilter): boolean {
    // Check event types
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      if (!filter.eventTypes.includes(event.eventType)) {
        return false;
      }
    }

    // Check agent IDs
    if (filter.agentIds && filter.agentIds.length > 0) {
      const eventAgentId = event.source.agentId;
      if (!eventAgentId || !filter.agentIds.includes(eventAgentId)) {
        return false;
      }
    }

    // Check task IDs
    if (filter.taskIds && filter.taskIds.length > 0) {
      const eventTaskId = event.source.taskId;
      if (!eventTaskId || !filter.taskIds.includes(eventTaskId)) {
        return false;
      }
    }

    // Check time range
    if (filter.since && event.timestamp < filter.since) {
      return false;
    }
    if (filter.until && event.timestamp > filter.until) {
      return false;
    }

    // Check correlation ID
    if (filter.correlationId && event.correlationId !== filter.correlationId) {
      return false;
    }

    return true;
  }

  /**
   * Add event to history (for replay)
   */
  private addToHistory(event: MissionEvent): void {
    this.eventHistory.push(event);
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }
  }

  /**
   * Get event history
   */
  getHistory(filter?: EventFilter): MissionEvent[] {
    if (!filter) {
      return [...this.eventHistory];
    }
    return this.eventHistory.filter((event) => this.matchesFilter(event, filter));
  }

  /**
   * Clear event history
   */
  clearHistory(): void {
    this.eventHistory = [];
  }

  // Convenience methods for common events

  /**
   * Emit agent status change event
   */
  emitAgentStatusChange(
    agentId: string,
    previousStatus: string,
    newStatus: string,
    reason?: string,
    correlationId?: string
  ): MissionEvent {
    const payload: AgentStatusChangedPayload = {
      agentId,
      previousStatus: previousStatus as any,
      newStatus: newStatus as any,
      reason,
    };
    return this.emit('agent.status_changed', payload, { agentId }, correlationId);
  }

  /**
   * Emit task status change event
   */
  emitTaskStatusChange(
    taskId: string,
    previousStatus: string,
    newStatus: string,
    assigneeId?: string,
    correlationId?: string
  ): MissionEvent {
    const payload: TaskStatusChangedPayload = {
      taskId,
      previousStatus: previousStatus as any,
      newStatus: newStatus as any,
      assigneeId,
    };
    return this.emit('task.status_changed', payload, { taskId }, correlationId);
  }

  /**
   * Get listener count for debugging
   */
  getListenerCount(): { [key: string]: number } {
    const counts: { [key: string]: number } = {};
    for (const [type, listeners] of this.listeners) {
      counts[type] = listeners.size;
    }
    counts['all'] = this.allListeners.size;
    return counts;
  }
}

// Singleton instance for global use
let globalEmitter: EventEmitter | null = null;

export function getGlobalEmitter(): EventEmitter {
  if (!globalEmitter) {
    globalEmitter = new EventEmitter();
  }
  return globalEmitter;
}

export function resetGlobalEmitter(): void {
  if (globalEmitter) {
    globalEmitter.unsubscribeAll();
    globalEmitter.clearHistory();
  }
  globalEmitter = new EventEmitter();
}
