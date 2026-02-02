/**
 * Event Repository
 * 
 * CRUD operations for events in SQLite.
 */

import { getDb } from '../sqlite';

export interface Event {
  id: string;
  timestamp: string;
  type: string;
  agent_id?: string;
  swarm_id?: string;
  severity: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface EventFilter {
  agentId?: string;
  swarmId?: string;
  types?: string[];
  severity?: Event['severity'];
  since?: Date;
  until?: Date;
}

export class EventRepository {
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
      `INSERT INTO events (id, timestamp, type, agent_id, swarm_id, severity, message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [event.id, event.timestamp, event.type, event.agent_id, event.swarm_id,
       event.severity, event.message, JSON.stringify(event.metadata || {})]
    );

    return event;
  }

  async findById(id: string): Promise<Event | undefined> {
    const db = await getDb();
    const row = await db.get('SELECT * FROM events WHERE id = ?', [id]);
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async findByAgentId(agentId: string, limit = 100): Promise<Event[]> {
    const db = await getDb();
    const rows = await db.all(
      'SELECT * FROM events WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?',
      [agentId, limit]
    );
    return rows.map(row => this.mapRow(row));
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
      conditions.push(`type IN (${filter.types.map(() => '?').join(', ')})`);
      params.push(...filter.types);
    }
    if (filter.severity) {
      conditions.push('severity = ?');
      params.push(filter.severity);
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
    bySeverity: Record<string, number>;
  }> {
    const db = await getDb();
    const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();
    
    const rows = await db.all(
      'SELECT type, severity, COUNT(*) as count FROM events WHERE timestamp >= ? GROUP BY type, severity',
      [since]
    );

    const byType: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
      byType[row.type] = (byType[row.type] || 0) + row.count;
      bySeverity[row.severity] = (bySeverity[row.severity] || 0) + row.count;
      total += row.count;
    }

    return { total, byType, bySeverity };
  }

  async list(options: { limit?: number; offset?: number } = {}): Promise<Event[]> {
    return this.findByFilter({}, options);
  }

  private mapRow(row: any): Event {
    return {
      ...row,
      metadata: JSON.parse(row.metadata || '{}')
    };
  }
}
