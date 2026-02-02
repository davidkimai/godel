/**
 * Event Repository with Caching
 * 
 * CRUD operations for events in SQLite with LRU caching.
 */

import { getDb } from '../sqlite';
import { LRUCache } from '../../utils/cache';

export interface Event {
  id: string;
  timestamp: string;
  type: string;           // Maps to event_type column
  source?: string;        // JSON - who/what generated the event
  payload?: string;       // JSON - event data
  agent_id?: string;
  swarm_id?: string;
}

export interface EventFilter {
  agentId?: string;
  swarmId?: string;
  types?: string[];
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  since?: Date;
  until?: Date;
}

export class EventRepository {
  // Cache for individual events (short TTL as events are immutable)
  private cache: LRUCache<Event> = new LRUCache({ maxSize: 100, defaultTTL: 60000 });
  
  // Cache for event lists by agent (very short TTL as events change frequently)
  private agentCache: LRUCache<Event[]> = new LRUCache({ maxSize: 30, defaultTTL: 5000 });

  async create(data: Omit<Event, 'id' | 'timestamp'>): Promise<Event> {
    const db = await getDb();
    const id = `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    const event: Event = {
      id,
      timestamp,
      ...data
    };

    await db.run(
      `INSERT INTO events (id, timestamp, event_type, source, payload, agent_id, swarm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.timestamp, event.type, event.source || null, event.payload || null,
       event.agent_id || null, event.swarm_id || null]
    );

    // Cache the new event
    this.cache.set(event.id, event);
    
    // Invalidate agent cache if event belongs to an agent
    if (data.agent_id) {
      this.agentCache.delete(data.agent_id);
    }

    return event;
  }

  async findById(id: string): Promise<Event | undefined> {
    // Check cache first
    const cached = this.cache.get(id);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    const row = await db.get('SELECT * FROM events WHERE id = ?', [id]);
    if (!row) return undefined;
    
    const event = this.mapRow(row);
    this.cache.set(id, event);
    
    return event;
  }

  async findByAgentId(agentId: string, limit = 100): Promise<Event[]> {
    // Check cache first
    const cacheKey = `${agentId}:${limit}`;
    const cached = this.agentCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const db = await getDb();
    // Use the composite index (agent_id, timestamp DESC)
    const rows = await db.all(
      'SELECT * FROM events WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?',
      [agentId, limit]
    );
    const events = rows.map(row => this.mapRow(row));
    
    // Cache the result (short TTL since events are frequently added)
    this.agentCache.set(cacheKey, events);
    
    // Also cache individual events
    for (const event of events) {
      this.cache.set(event.id, event);
    }
    
    return events;
  }

  async findByFilter(filter: EventFilter, options: { limit?: number } = {}): Promise<Event[]> {
    const db = await getDb();
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.agentId) {
      conditions.push('agent_id = ?');
      params.push(filter.agentId);
    }
    if (filter.swarmId) {
      conditions.push('swarm_id = ?');
      params.push(filter.swarmId);
    }
    if (filter.types?.length) {
      conditions.push(`event_type IN (${filter.types.map(() => '?').join(', ')})`);
      params.push(...filter.types);
    }
    if (filter.since) {
      conditions.push('timestamp >= ?');
      params.push(filter.since.toISOString());
    }
    if (filter.until) {
      conditions.push('timestamp <= ?');
      params.push(filter.until.toISOString());
    }

    let query = 'SELECT * FROM events';
    if (conditions.length) {
      query += ' WHERE ' + conditions.join(' AND ');
    }
    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = await db.all(query, params);
    return rows.map(row => this.mapRow(row));
  }

  async getStats(timeWindowHours = 24): Promise<{
    total: number;
    byType: Record<string, number>;
  }> {
    const db = await getDb();
    const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();
    
    const rows = await db.all(
      'SELECT event_type as type, COUNT(*) as count FROM events WHERE timestamp >= ? GROUP BY event_type',
      [since]
    );

    const byType: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
      byType[row.type] = row.count;
      total += row.count;
    }

    return { total, byType };
  }

  async list(options: { limit?: number; offset?: number } = {}): Promise<Event[]> {
    return this.findByFilter({}, options);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.cache.clear();
    this.agentCache.clear();
  }

  private mapRow(row: any): Event {
    return {
      id: row.id,
      timestamp: row.timestamp,
      type: row.event_type,
      source: row.source,
      payload: row.payload,
      agent_id: row.agent_id,
      swarm_id: row.swarm_id
    };
  }
}

export default EventRepository;
