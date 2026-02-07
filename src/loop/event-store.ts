/**
 * Event Store - Persistent storage for Godel events
 * Supports PostgreSQL for production and in-memory for testing
 */

import type { GodelEvent, EventMetadata } from './events/types';
import { logger } from '../utils/logger';

/**
 * Event store interface
 * Defines the contract for event persistence
 */
export interface EventStore {
  /**
   * Append an event to the store
   * @param event - Event to store
   */
  append(event: GodelEvent): Promise<void>;

  /**
   * Get all events in a stream (correlation chain)
   * @param streamId - Correlation ID
   * @returns Array of events in chronological order
   */
  getStream(streamId: string): Promise<GodelEvent[]>;

  /**
   * Get all events with optional pagination
   * @param options - Query options
   * @returns Array of events
   */
  getAll(options?: { after?: number; limit?: number }): Promise<GodelEvent[]>;

  /**
   * Query events by type
   * @param type - Event type
   * @param options - Query options
   * @returns Array of matching events
   */
  getByType(type: string, options?: { limit?: number; since?: number }): Promise<GodelEvent[]>;

  /**
   * Query events by source
   * @param source - Source agent/component
   * @param options - Query options
   * @returns Array of matching events
   */
  getBySource(source: string, options?: { limit?: number; since?: number }): Promise<GodelEvent[]>;

  /**
   * Close the event store connection
   */
  close(): Promise<void>;
}

/**
 * Database interface abstraction
 */
export interface Database {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * PostgreSQL event store implementation
 */
export class PostgresEventStore implements EventStore {
  private db: Database;
  private batchSize: number;
  private flushInterval: number;
  private buffer: GodelEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;

  constructor(db: Database, options: { batchSize?: number; flushInterval?: number } = {}) {
    this.db = db;
    this.batchSize = options.batchSize || 100;
    this.flushInterval = options.flushInterval || 5000;
    this.startFlushTimer();
  }

  /**
   * Append an event to the store
   * Events are buffered and written in batches for performance
   */
  async append(event: GodelEvent): Promise<void> {
    this.buffer.push(event);

    if (this.buffer.length >= this.batchSize) {
      await this.flush();
    }
  }

  /**
   * Immediately flush all buffered events
   */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) {
      return;
    }

    const events = [...this.buffer];
    this.buffer = [];

    try {
      // Use a transaction for batch insert
      await this.db.query('BEGIN');

      for (const event of events) {
        await this.db.query(
          `INSERT INTO events (id, type, source, target, payload, metadata, timestamp)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO NOTHING`,
          [
            event.id,
            event.type,
            event.source,
            event.target || null,
            JSON.stringify(event.payload),
            JSON.stringify(event.metadata),
            new Date(event.timestamp)
          ]
        );
      }

      await this.db.query('COMMIT');
      logger.debug('Flushed events to store', { count: events.length });
    } catch (error) {
      await this.db.query('ROLLBACK').catch(() => {});
      logger.error('Failed to flush events', { error, count: events.length });
      // Re-add events to buffer for retry
      this.buffer.unshift(...events);
      throw error;
    }
  }

  /**
   * Get all events in a correlation stream
   */
  async getStream(streamId: string): Promise<GodelEvent[]> {
    await this.flush(); // Ensure all buffered events are persisted

    const result = await this.db.query(
      `SELECT * FROM events 
       WHERE metadata->>'correlationId' = $1
       ORDER BY timestamp ASC`,
      [streamId]
    );

    return result.rows.map(row => this.mapRowToEvent(row as EventRow));
  }

  /**
   * Get all events with pagination
   */
  async getAll(options: { after?: number; limit?: number } = {}): Promise<GodelEvent[]> {
    await this.flush();

    let query = 'SELECT * FROM events';
    const params: unknown[] = [];

    if (options.after) {
      query += ' WHERE timestamp > $1';
      params.push(new Date(options.after));
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapRowToEvent(row as EventRow));
  }

  /**
   * Get events by type
   */
  async getByType(type: string, options: { limit?: number; since?: number } = {}): Promise<GodelEvent[]> {
    await this.flush();

    let query = 'SELECT * FROM events WHERE type = $1';
    const params: unknown[] = [type];

    if (options.since) {
      query += ` AND timestamp > $${params.length + 1}`;
      params.push(new Date(options.since));
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapRowToEvent(row as EventRow));
  }

  /**
   * Get events by source
   */
  async getBySource(source: string, options: { limit?: number; since?: number } = {}): Promise<GodelEvent[]> {
    await this.flush();

    let query = 'SELECT * FROM events WHERE source = $1';
    const params: unknown[] = [source];

    if (options.since) {
      query += ` AND timestamp > $${params.length + 1}`;
      params.push(new Date(options.since));
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapRowToEvent(row as EventRow));
  }

  /**
   * Close the event store
   */
  async close(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    await this.flush();
  }

  /**
   * Start the periodic flush timer
   */
  private startFlushTimer(): void {
    if (this.flushInterval > 0) {
      this.flushTimer = setInterval(() => {
        this.flush().catch(error => {
          logger.error('Periodic flush failed', { error });
        });
      }, this.flushInterval);
    }
  }

  /**
   * Map a database row to a GodelEvent
   */
  private mapRowToEvent(row: EventRow): GodelEvent {
    return {
      id: row.id,
      type: row.type,
      source: row.source,
      target: row.target || undefined,
      timestamp: new Date(row.timestamp).getTime(),
      payload: typeof row.payload === 'string' ? JSON.parse(row.payload) : row.payload,
      metadata: typeof row.metadata === 'string' 
        ? JSON.parse(row.metadata) 
        : row.metadata as EventMetadata
    };
  }
}

/**
 * Database row structure
 */
interface EventRow {
  id: string;
  type: string;
  source: string;
  target: string | null;
  payload: string | unknown;
  metadata: string | EventMetadata;
  timestamp: Date | string;
}

/**
 * In-memory event store for testing
 */
export class InMemoryEventStore implements EventStore {
  private events: GodelEvent[] = [];

  async append(event: GodelEvent): Promise<void> {
    this.events.push(event);
  }

  async getStream(streamId: string): Promise<GodelEvent[]> {
    return this.events
      .filter(e => e.metadata.correlationId === streamId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async getAll(options: { after?: number; limit?: number } = {}): Promise<GodelEvent[]> {
    let events = [...this.events];

    if (options.after) {
      events = events.filter(e => e.timestamp > options.after!);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  async getByType(type: string, options: { limit?: number; since?: number } = {}): Promise<GodelEvent[]> {
    let events = this.events.filter(e => e.type === type);

    if (options.since) {
      events = events.filter(e => e.timestamp > options.since!);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  async getBySource(source: string, options: { limit?: number; since?: number } = {}): Promise<GodelEvent[]> {
    let events = this.events.filter(e => e.source === source);

    if (options.since) {
      events = events.filter(e => e.timestamp > options.since!);
    }

    events.sort((a, b) => b.timestamp - a.timestamp);

    if (options.limit) {
      events = events.slice(0, options.limit);
    }

    return events;
  }

  async close(): Promise<void> {
    // Nothing to close for in-memory store
  }

  /**
   * Clear all events (useful for testing)
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get event count
   */
  get count(): number {
    return this.events.length;
  }
}

/**
 * SQL to create the events table
 */
export const CREATE_EVENTS_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY,
  type VARCHAR(255) NOT NULL,
  source VARCHAR(255) NOT NULL,
  target VARCHAR(255),
  payload JSONB NOT NULL,
  metadata JSONB NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
CREATE INDEX IF NOT EXISTS idx_events_correlation ON events((metadata->>'correlationId'));
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at);
`;

/**
 * Factory function to create appropriate event store
 */
export function createEventStore(
  db?: Database,
  options?: { batchSize?: number; flushInterval?: number }
): EventStore {
  if (db) {
    return new PostgresEventStore(db, options);
  }
  return new InMemoryEventStore();
}
