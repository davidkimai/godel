/**
 * Event Repository - PostgreSQL Implementation
 * 
 * Full CRUD operations for events with PostgreSQL persistence.
 * Optimized for time-series data patterns.
 */

import { PostgresPool, getPool } from '../postgres/pool';
import type { PostgresConfig } from '../postgres/config';

export type EventSeverity = 'debug' | 'info' | 'warning' | 'error' | 'critical';
export type EntityType = 'agent' | 'task' | 'system';

export interface Event {
  id: string;
  swarm_id?: string;
  agent_id?: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: Date;
  correlation_id?: string;
  parent_event_id?: string;
  entity_type: EntityType;
  severity: EventSeverity;
}

export interface EventCreateInput {
  source?: string;
  swarm_id?: string;
  agent_id?: string;
  type: string;
  payload?: Record<string, unknown>;
  correlation_id?: string;
  parent_event_id?: string;
  entity_type?: EntityType;
  severity?: EventSeverity;
  timestamp?: Date;
}

export interface EventFilter {
  swarm_id?: string;
  agent_id?: string;
  /** @deprecated Use swarm_id instead */
  swarmId?: string;
  /** @deprecated Use agent_id instead */
  agentId?: string;
  types?: string[];
  entity_type?: EntityType;
  severity?: EventSeverity;
  since?: Date;
  until?: Date;
  limit?: number;
  offset?: number;
}

export interface EventStats {
  total: number;
  byType: Record<string, number>;
  bySeverity: Record<EventSeverity, number>;
}

export interface EventStats24h {
  type: string;
  event_count: number;
  unique_agents: number;
  unique_swarms: number;
  first_occurrence: Date;
  last_occurrence: Date;
}

export class EventRepository {
  private pool: PostgresPool | null = null;
  private config?: Partial<PostgresConfig>;

  constructor(config?: Partial<PostgresConfig>) {
    this.config = config;
  }

  /**
   * Initialize the repository with a database pool
   */
  async initialize(): Promise<void> {
    this.pool = await getPool(this.config);
  }

  /**
   * Create a new event
   */
  async create(input: EventCreateInput): Promise<Event> {
    this.ensureInitialized();

    try {
      const result = await this.pool!.query<EventRow>(
        `INSERT INTO events (
          swarm_id, agent_id, type, payload, timestamp,
          correlation_id, parent_event_id, entity_type, severity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          input.swarm_id || null,
          input.agent_id || null,
          input.type,
          JSON.stringify(input.payload || {}),
          input.timestamp?.toISOString() || new Date().toISOString(),
          input.correlation_id || null,
          input.parent_event_id || null,
          input.entity_type || 'system',
          input.severity || 'info',
        ]
      );

      return this.mapRow(result.rows[0]);
    } catch (error) {
      if (!isLegacyEventSchemaError(error)) {
        throw error;
      }

      // Legacy schema compatibility (event_type/source columns).
      const fallback = await this.pool!.query<EventRow>(
        `INSERT INTO events (
          swarm_id, agent_id, event_type, source, payload, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [
          input.swarm_id || null,
          input.agent_id || null,
          input.type,
          JSON.stringify({
            source: input.source || 'self-improvement',
            entity_type: input.entity_type || 'system',
            severity: input.severity || 'info',
            correlation_id: input.correlation_id || null,
            parent_event_id: input.parent_event_id || null,
          }),
          JSON.stringify(input.payload || {}),
          input.timestamp?.toISOString() || new Date().toISOString(),
        ]
      );

      return this.mapRow(fallback.rows[0]);
    }
  }

  /**
   * Find an event by ID
   */
  async findById(id: string): Promise<Event | null> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<EventRow>(
      `SELECT * FROM events WHERE id = $1`,
      [id]
    );

    return result.rows.length > 0 ? this.mapRow(result.rows[0]) : null;
  }

  /**
   * Find events by agent ID
   */
  async findByAgentId(agentId: string, limit: number = 100): Promise<Event[]> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<EventRow>(
      `SELECT * FROM events 
       WHERE agent_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [agentId, limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find events by swarm ID
   */
  async findBySwarmId(swarmId: string, limit: number = 100): Promise<Event[]> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<EventRow>(
      `SELECT * FROM events 
       WHERE swarm_id = $1 
       ORDER BY timestamp DESC 
       LIMIT $2`,
      [swarmId, limit]
    );

    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Find events with filter
   */
  async findByFilter(filter: EventFilter): Promise<Event[]> {
    this.ensureInitialized();
    
    const { whereClause, values, paramIndex } = this.buildWhereClause(filter);
    
    let query = `SELECT * FROM events ${whereClause} ORDER BY timestamp DESC`;
    
    const finalValues = [...values];
    let finalParamIndex = paramIndex;

    if (filter.limit) {
      query += ` LIMIT $${finalParamIndex++}`;
      finalValues.push(filter.limit);
    }

    if (filter.offset) {
      query += ` OFFSET $${finalParamIndex++}`;
      finalValues.push(filter.offset);
    }

    const result = await this.pool!.query<EventRow>(query, finalValues);
    return result.rows.map(row => this.mapRow(row));
  }

  /**
   * Count events with filter
   */
  async count(filter: Omit<EventFilter, 'limit' | 'offset'> = {}): Promise<number> {
    this.ensureInitialized();
    
    const { whereClause, values } = this.buildWhereClause(filter);
    
    const result = await this.pool!.query<{ count: string }>(
      `SELECT COUNT(*) as count FROM events ${whereClause}`,
      values
    );

    return parseInt(result.rows[0].count, 10);
  }

  /**
   * Get event statistics
   */
  async getStats(timeWindowHours: number = 24): Promise<EventStats> {
    this.ensureInitialized();
    
    const since = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000);
    
    const [totalResult, byTypeResult, bySeverityResult] = await Promise.all([
      this.pool!.query<{ count: string }>(
        'SELECT COUNT(*) as count FROM events WHERE timestamp >= $1',
        [since.toISOString()]
      ),
      this.pool!.query<{ type: string; count: string }>(
        `SELECT type, COUNT(*) as count 
         FROM events 
         WHERE timestamp >= $1 
         GROUP BY type`,
        [since.toISOString()]
      ),
      this.pool!.query<{ severity: EventSeverity; count: string }>(
        `SELECT severity, COUNT(*) as count 
         FROM events 
         WHERE timestamp >= $1 
         GROUP BY severity`,
        [since.toISOString()]
      ),
    ]);

    const byType: Record<string, number> = {};
    for (const row of byTypeResult.rows) {
      byType[row.type] = parseInt(row.count, 10);
    }

    const bySeverity: Record<EventSeverity, number> = {
      debug: 0,
      info: 0,
      warning: 0,
      error: 0,
      critical: 0,
    };
    for (const row of bySeverityResult.rows) {
      bySeverity[row.severity] = parseInt(row.count, 10);
    }

    return {
      total: parseInt(totalResult.rows[0].count, 10),
      byType,
      bySeverity,
    };
  }

  /**
   * Get 24h event statistics view
   */
  async getStats24h(): Promise<EventStats24h[]> {
    this.ensureInitialized();
    
    const result = await this.pool!.query<EventStats24hRow>(
      'SELECT * FROM event_stats_24h ORDER BY event_count DESC'
    );

    return result.rows.map(row => ({
      type: row.type,
      event_count: parseInt(String(row.event_count), 10),
      unique_agents: parseInt(String(row.unique_agents), 10),
      unique_swarms: parseInt(String(row.unique_swarms), 10),
      first_occurrence: new Date(row.first_occurrence),
      last_occurrence: new Date(row.last_occurrence),
    }));
  }

  /**
   * List all events (paginated)
   */
  async list(options: { limit?: number; offset?: number } = {}): Promise<Event[]> {
    return this.findByFilter({
      limit: options.limit,
      offset: options.offset,
    });
  }

  /**
   * Create multiple events in a batch
   */
  async createBatch(inputs: EventCreateInput[]): Promise<Event[]> {
    this.ensureInitialized();
    
    if (inputs.length === 0) return [];

    return this.pool!.withTransaction(async (client) => {
      const events: Event[] = [];
      
      for (const input of inputs) {
        const result = await client.query<EventRow>(
          `INSERT INTO events (
            swarm_id, agent_id, type, payload, timestamp,
            correlation_id, parent_event_id, entity_type, severity
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING *`,
          [
            input.swarm_id || null,
            input.agent_id || null,
            input.type,
            JSON.stringify(input.payload || {}),
            input.timestamp?.toISOString() || new Date().toISOString(),
            input.correlation_id || null,
            input.parent_event_id || null,
            input.entity_type || 'system',
            input.severity || 'info',
          ]
        );
        events.push(this.mapRow(result.rows[0]));
      }
      
      return events;
    });
  }

  /**
   * Delete old events (for cleanup)
   */
  async deleteOld(olderThan: Date): Promise<number> {
    this.ensureInitialized();
    
    const result = await this.pool!.query(
      'DELETE FROM events WHERE timestamp < $1',
      [olderThan.toISOString()]
    );

    return result.rowCount;
  }

  /**
   * Get event timeline for a specific entity
   */
  async getTimeline(
    entityType: EntityType,
    entityId: string,
    options: { limit?: number; since?: Date; until?: Date } = {}
  ): Promise<Event[]> {
    this.ensureInitialized();
    
    const conditions: string[] = ['entity_type = $1'];
    const values: unknown[] = [entityType];
    let paramIndex = 2;

    if (entityType === 'agent') {
      conditions.push(`agent_id = $${paramIndex++}`);
    } else if (entityType === 'task') {
      // For task events, we might store task_id in payload or have a separate column
      conditions.push(`payload->>'task_id' = $${paramIndex++}`);
    } else {
      conditions.push(`swarm_id = $${paramIndex++}`);
    }
    values.push(entityId);

    if (options.since) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(options.since.toISOString());
    }
    if (options.until) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(options.until.toISOString());
    }

    let query = `SELECT * FROM events WHERE ${conditions.join(' AND ')} ORDER BY timestamp DESC`;
    
    if (options.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(options.limit);
    }

    const result = await this.pool!.query<EventRow>(query, values);
    return result.rows.map(row => this.mapRow(row));
  }

  // ============================================================================
  // Private helpers
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.pool) {
      throw new Error('EventRepository not initialized. Call initialize() first.');
    }
  }

  private buildWhereClause(filter: EventFilter): {
    whereClause: string;
    values: unknown[];
    paramIndex: number;
  } {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    // Support both snake_case and camelCase (camelCase is deprecated)
    const swarmId = filter.swarm_id ?? filter.swarmId;
    const agentId = filter.agent_id ?? filter.agentId;

    if (swarmId) {
      conditions.push(`swarm_id = $${paramIndex++}`);
      values.push(swarmId);
    }
    if (agentId) {
      conditions.push(`agent_id = $${paramIndex++}`);
      values.push(agentId);
    }
    if (filter.types?.length) {
      conditions.push(`type = ANY($${paramIndex++})`);
      values.push(filter.types);
    }
    if (filter.entity_type) {
      conditions.push(`entity_type = $${paramIndex++}`);
      values.push(filter.entity_type);
    }
    if (filter.severity) {
      conditions.push(`severity = $${paramIndex++}`);
      values.push(filter.severity);
    }
    if (filter.since) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      values.push(filter.since.toISOString());
    }
    if (filter.until) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      values.push(filter.until.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, values, paramIndex };
  }

  private mapRow(row: EventRow): Event {
    const source = this.parseJson(row.source || null);
    const type = row.type || row.event_type || 'unknown';
    const entityType = (
      row.entity_type
      || (typeof source['entity_type'] === 'string' ? source['entity_type'] : 'system')
    ) as EntityType;
    const severity = (
      row.severity
      || (typeof source['severity'] === 'string' ? source['severity'] : 'info')
    ) as EventSeverity;

    return {
      id: row.id,
      swarm_id: row.swarm_id || undefined,
      agent_id: row.agent_id || undefined,
      type,
      payload: this.parseJson(row.payload),
      timestamp: new Date(row.timestamp),
      correlation_id: row.correlation_id || (typeof source['correlation_id'] === 'string' ? source['correlation_id'] : undefined),
      parent_event_id: row.parent_event_id || (typeof source['parent_event_id'] === 'string' ? source['parent_event_id'] : undefined),
      entity_type: entityType,
      severity,
    };
  }

  private parseJson(value: string | Record<string, unknown> | null): Record<string, unknown> {
    if (!value) return {};
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return {};
      }
    }
    return value as Record<string, unknown>;
  }
}

// Database row types
interface EventRow {
  id: string;
  swarm_id?: string;
  agent_id?: string;
  type?: string;
  event_type?: string;
  source?: string | Record<string, unknown>;
  payload: string | Record<string, unknown>;
  timestamp: string;
  correlation_id?: string;
  parent_event_id?: string;
  entity_type?: string;
  severity?: string;
}

interface EventStats24hRow {
  type: string;
  event_count: number | string;
  unique_agents: number | string;
  unique_swarms: number | string;
  first_occurrence: string;
  last_occurrence: string;
}

export default EventRepository;

function isLegacyEventSchemaError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes('column "type"')
    || message.includes('column "entity_type"')
    || message.includes('column "severity"')
  );
}
