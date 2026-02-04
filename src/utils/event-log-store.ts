import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

export interface EventLogEntry {
  id: string;
  type: string;
  payload: any;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface EventLogStoreOptions {
  maxMemoryEvents?: number;
  persistenceBatchSize?: number;
  flushIntervalMs?: number;
}

export class EventLogStore extends EventEmitter {
  private buffer: EventLogEntry[] = [];
  private persisted: EventLogEntry[] = [];
  private options: Required<EventLogStoreOptions>;
  private flushTimer?: NodeJS.Timer;

  constructor(options: EventLogStoreOptions = {}) {
    super();
    this.options = {
      maxMemoryEvents: options.maxMemoryEvents || 10000,
      persistenceBatchSize: options.persistenceBatchSize || 100,
      flushIntervalMs: options.flushIntervalMs || 5000
    };

    this.startFlushTimer();
  }

  // Add event to buffer (circular buffer pattern)
  push(entry: EventLogEntry): void {
    // If buffer is full, remove oldest and persist
    if (this.buffer.length >= this.options.maxMemoryEvents) {
      const evicted = this.buffer.shift();
      if (evicted) {
        this.persisted.push(evicted);
        
        // Trim persisted if too large
        if (this.persisted.length > this.options.maxMemoryEvents * 2) {
          this.persisted = this.persisted.slice(-this.options.maxMemoryEvents);
        }
        
        this.emit('evicted', evicted);
      }
    }

    this.buffer.push(entry);
    this.emit('pushed', entry);
  }

  // Get recent events (from buffer + recent persisted)
  getRecent(count: number = 100): EventLogEntry[] {
    const fromPersisted = this.persisted.slice(-Math.min(count, this.persisted.length));
    const fromBuffer = this.buffer.slice(-Math.min(count - fromPersisted.length, this.buffer.length));
    return [...fromPersisted, ...fromBuffer];
  }

  // Query events by type
  queryByType(type: string, count: number = 100): EventLogEntry[] {
    return this.getRecent(count * 2).filter(e => e.type === type).slice(0, count);
  }

  // Get metrics
  getMetrics(): {
    bufferSize: number;
    persistedSize: number;
    totalEvents: number;
    memoryUsageMB: number;
  } {
    const bufferSize = this.buffer.length;
    const persistedSize = this.persisted.length;
    
    // Rough memory estimate
    const sampleEntry = JSON.stringify(this.buffer[0] || {});
    const avgEntrySize = sampleEntry.length * 2; // UTF-16
    const memoryUsageMB = ((bufferSize + persistedSize) * avgEntrySize) / (1024 * 1024);

    return {
      bufferSize,
      persistedSize,
      totalEvents: bufferSize + persistedSize,
      memoryUsageMB: Math.round(memoryUsageMB * 100) / 100
    };
  }

  // Manual flush to persisted
  flush(): void {
    if (this.buffer.length > 0) {
      this.persisted.push(...this.buffer);
      this.buffer = [];
      this.emit('flushed');
    }
  }

  // Clear all events
  clear(): void {
    this.buffer = [];
    this.persisted = [];
    this.emit('cleared');
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      if (this.buffer.length > this.options.persistenceBatchSize) {
        this.flush();
      }
    }, this.options.flushIntervalMs);
  }

  stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = undefined;
    }
    this.flush();
  }
}

// Singleton instance
let store: EventLogStore | null = null;

export function getEventLogStore(options?: EventLogStoreOptions): EventLogStore {
  if (!store) {
    store = new EventLogStore(options);
  }
  return store;
}

export function resetEventLogStore(): void {
  store?.stop();
  store = null;
}
