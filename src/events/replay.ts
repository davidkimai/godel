/**
 * Event Replay - Historical event replay system
 * Provides replay functionality for debugging and auditing
 */

import { logger } from '../utils/logger';
import { EventEmitter } from './emitter';

import type {
  MissionEvent,
  EventFilter,
  EventType} from './types';

/**
 * Helper function to safely get field values from MissionEvent
 * for CSV export with dynamic field access
 */
function getEventFieldValue(event: MissionEvent, field: string): unknown {
  switch (field) {
    case 'id':
      return event.id;
    case 'timestamp':
      return event.timestamp;
    case 'eventType':
      return event.eventType;
    case 'source':
      return JSON.stringify(event.source);
    case 'correlationId':
      return event.correlationId;
    default:
      // For payload fields, check if they exist
      if ('payload' in event && typeof event.payload === 'object' && event.payload !== null) {
        return (event.payload as Record<string, unknown>)[field];
      }
      return undefined;
  }
}

interface ReplaySession {
  id: string;
  since: Date;
  until?: Date;
  agentId?: string;
  eventTypes?: EventType[];
  events: MissionEvent[];
  replaySpeed: number; // 1 = real-time, 2 = 2x speed, etc.
  startedAt: Date;
  completedAt?: Date;
}

export class EventReplay {
  private emitter: EventEmitter;
  private replayHistory: MissionEvent[] = [];
  private activeSessions: Map<string, ReplaySession> = new Map();
  private readonly maxHistorySize: number = 100000;

  constructor(emitter?: EventEmitter) {
    this.emitter = emitter || new EventEmitter();
  }

  /**
   * Replay historical events since a given time
   */
  replay(
    since: Date,
    options?: {
      until?: Date;
      agentId?: string;
      taskId?: string;
      eventTypes?: EventType[];
      filter?: EventFilter;
      speed?: number;
    }
  ): ReplaySession {
    const sessionId = this.generateSessionId();
    
    // Build filter from options
    const filter: EventFilter = {
      since,
      until: options?.until,
      agentIds: options?.agentId ? [options.agentId] : undefined,
      taskIds: options?.taskId ? [options.taskId] : undefined,
      eventTypes: options?.eventTypes,
      ...options?.filter,
    };

    // Get events from history
    const events = this.emitter.getHistory(filter);

    const session: ReplaySession = {
      id: sessionId,
      since,
      until: options?.until,
      agentId: options?.agentId,
      eventTypes: options?.eventTypes,
      events,
      replaySpeed: options?.speed || 1,
      startedAt: new Date(),
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  /**
   * Replay events with real-time delivery to callback
   */
  async replayWithCallback(
    since: Date,
    callback: (_event: MissionEvent) => void | Promise<void>,
    options?: {
      until?: Date;
      agentId?: string;
      eventTypes?: EventType[];
      speed?: number;
      interval?: number; // ms between events
    }
  ): Promise<ReplaySession> {
    const session = this.replay(since, options);
    const speed = options?.speed || 1;
    const interval = options?.interval || (1000 / speed); // Default: 1 second per event at 1x speed

    for (const event of session.events) {
      await callback(event);
      
      // Calculate delay based on actual time difference between events
      const realDelay = options?.interval 
        ? interval 
        : Math.min(interval, 100); // Cap at 100ms for smooth playback

      await this.delay(realDelay);
    }

    session.completedAt = new Date();
    return session;
  }

  /**
   * Get replay session by ID
   */
  getSession(sessionId: string): ReplaySession | undefined {
    return this.activeSessions.get(sessionId);
  }

  /**
   * Get all active replay sessions
   */
  getActiveSessions(): ReplaySession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Cancel a replay session
   */
  cancelSession(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      this.activeSessions.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Cancel all active sessions
   */
  cancelAllSessions(): void {
    this.activeSessions.clear();
  }

  /**
   * Store event in replay history
   */
  store(event: MissionEvent): void {
    this.replayHistory.push(event);
    if (this.replayHistory.length > this.maxHistorySize) {
      this.replayHistory.shift();
    }
  }

  /**
   * Get events from replay history
   */
  getHistory(
    options?: {
      since?: Date;
      until?: Date;
      agentId?: string;
      eventTypes?: EventType[];
      limit?: number;
    }
  ): MissionEvent[] {
    let events = [...this.replayHistory];

    // Apply filters
    if (options?.since) {
      events = events.filter((e) => e.timestamp >= options.since!);
    }
    if (options?.until) {
      events = events.filter((e) => e.timestamp <= options.until!);
    }
    if (options?.agentId) {
      events = events.filter((e) => e.source.agentId === options.agentId);
    }
    if (options?.eventTypes && options.eventTypes.length > 0) {
      events = events.filter((e) => options.eventTypes!.includes(e.eventType));
    }

    // Apply limit
    if (options?.limit) {
      events = events.slice(-options.limit);
    }

    return events;
  }

  /**
   * Export events for external use
   */
  export(
    options?: {
      since?: Date;
      format?: 'json' | 'csv';
      fields?: string[];
    }
  ): string {
    const events = this.getHistory({ since: options?.since });
    const fields = options?.fields || ['id', 'timestamp', 'eventType', 'source', 'payload'];

    if (options?.format === 'csv') {
      return this.exportToCsv(events, fields);
    }

    return JSON.stringify(events, null, 2);
  }

  /**
   * Export events to CSV format
   */
  private exportToCsv(events: MissionEvent[], fields: string[]): string {
    const headers = fields.join(',');
    const rows = events.map((event) =>
      fields
        .map((field) => {
          // Safely access dynamic fields on MissionEvent
          const value = getEventFieldValue(event, field);
          if (value === undefined || value === null) {
            return '';
          }
          if (typeof value === 'object') {
            return JSON.stringify(value).replace(/"/g, '""');
          }
          return String(value);
        })
        .join(',')
    );

    return [headers, ...rows].join('\n');
  }

  /**
   * Get statistics about replay history
   */
  getStats(): {
    totalEvents: number;
    byType: { [key: string]: number };
    byAgent: { [key: string]: number };
    timeRange: { oldest: Date | null; newest: Date | null };
    activeSessions: number;
  } {
    const byType: { [key: string]: number } = {};
    const byAgent: { [key: string]: number } = {};
    let oldest: Date | null = null;
    let newest: Date | null = null;

    for (const event of this.replayHistory) {
      // Count by type
      byType[event.eventType] = (byType[event.eventType] || 0) + 1;

      // Count by agent
      if (event.source.agentId) {
        byAgent[event.source.agentId] = (byAgent[event.source.agentId] || 0) + 1;
      }

      // Track time range
      if (!oldest || event.timestamp < oldest) oldest = event.timestamp;
      if (!newest || event.timestamp > newest) newest = event.timestamp;
    }

    return {
      totalEvents: this.replayHistory.length,
      byType,
      byAgent,
      timeRange: { oldest, newest },
      activeSessions: this.activeSessions.size,
    };
  }

  /**
   * Clear replay history
   */
  clearHistory(): void {
    this.replayHistory = [];
    this.cancelAllSessions();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `replay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Factory function for creating replay with options
export function createReplay(
  emitter?: EventEmitter,
  options?: {
    maxHistorySize?: number;
  }
): EventReplay {
  const replay = new EventReplay(emitter);
  if (options?.maxHistorySize) {
    // This would require modifying the class to accept this in constructor
    logger.warn('maxHistorySize option not yet implemented');
  }
  return replay;
}
