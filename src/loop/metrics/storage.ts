/**
 * Time-Series Storage - Storage backends for metrics data
 * 
 * Supports PostgreSQL with TimescaleDB for production use
 * and in-memory storage for testing/development.
 */

import { MetricSnapshot } from './registry.js';

export interface QueryOptions {
  metric: string;
  start: number;       // Start timestamp (ms)
  end: number;         // End timestamp (ms)
  labels?: Record<string, string>;
  interval?: number;   // Aggregation interval (ms)
  limit?: number;      // Max results
}

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface AggregateOptions {
  metric: string;
  start: number;
  end: number;
  function: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'first' | 'last';
  interval: number;    // Bucket size (ms)
  labels?: Record<string, string>;
}

export interface AggregateResult {
  timestamp: number;
  value: number;
  count?: number;      // Number of points aggregated
}

export interface TimeSeriesStorage {
  write(snapshot: MetricSnapshot): Promise<void>;
  writeBatch(snapshots: MetricSnapshot[]): Promise<void>;
  query(options: QueryOptions): Promise<TimeSeriesPoint[]>;
  aggregate(options: AggregateOptions): Promise<AggregateResult[]>;
  close?(): Promise<void>;
}

/**
 * Database interface for storage implementations
 */
export interface Database {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/**
 * PostgreSQL implementation with TimescaleDB support
 */
export class PostgresTimeSeriesStorage implements TimeSeriesStorage {
  constructor(private db: Database) {}

  async write(snapshot: MetricSnapshot): Promise<void> {
    await this.db.query(
      `INSERT INTO metrics (name, type, value, labels, timestamp)
       VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))`,
      [
        snapshot.name,
        snapshot.type,
        snapshot.value,
        JSON.stringify(snapshot.labels || {}),
        snapshot.timestamp
      ]
    );
  }

  async writeBatch(snapshots: MetricSnapshot[]): Promise<void> {
    if (snapshots.length === 0) return;

    const values = snapshots.map((s, i) => 
      `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, to_timestamp($${i * 5 + 5} / 1000.0))`
    ).join(',');

    const params = snapshots.flatMap(s => [
      s.name,
      s.type,
      s.value,
      JSON.stringify(s.labels || {}),
      s.timestamp
    ]);

    await this.db.query(
      `INSERT INTO metrics (name, type, value, labels, timestamp)
       VALUES ${values}`,
      params
    );
  }

  async query(options: QueryOptions): Promise<TimeSeriesPoint[]> {
    let sql = `
      SELECT timestamp, value, labels
      FROM metrics
      WHERE name = $1
        AND timestamp BETWEEN to_timestamp($2 / 1000.0) AND to_timestamp($3 / 1000.0)
    `;
    const params: unknown[] = [options.metric, options.start, options.end];

    if (options.labels) {
      let paramIndex = 4;
      for (const [key, value] of Object.entries(options.labels)) {
        sql += ` AND labels->>'${key}' = $${paramIndex}`;
        params.push(value);
        paramIndex++;
      }
    }

    sql += ' ORDER BY timestamp ASC';

    if (options.limit) {
      sql += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    const result = await this.db.query(sql, params);
    return (result.rows as Array<{ timestamp: Date; value: number; labels: Record<string, string> }>)
      .map(row => ({
        timestamp: row.timestamp.getTime(),
        value: typeof row.value === 'string' ? parseFloat(row.value) : row.value,
        labels: row.labels
      }));
  }

  async aggregate(options: AggregateOptions): Promise<AggregateResult[]> {
    const aggFunction = this.getAggregateFunction(options.function);
    
    let sql = `
      SELECT 
        time_bucket($4::interval, timestamp) as bucket,
        ${aggFunction}(value) as value,
        count(*) as count
      FROM metrics
      WHERE name = $1
        AND timestamp BETWEEN to_timestamp($2 / 1000.0) AND to_timestamp($3 / 1000.0)
    `;
    const params: unknown[] = [
      options.metric,
      options.start,
      options.end,
      `${options.interval} milliseconds`
    ];

    if (options.labels) {
      let paramIndex = 5;
      for (const [key, value] of Object.entries(options.labels)) {
        sql += ` AND labels->>'${key}' = $${paramIndex}`;
        params.push(value);
        paramIndex++;
      }
    }

    sql += `
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const result = await this.db.query(sql, params);
    return (result.rows as Array<{ bucket: Date; value: number; count: string }>)
      .map(row => ({
        timestamp: row.bucket.getTime(),
        value: typeof row.value === 'string' ? parseFloat(row.value) : row.value,
        count: parseInt(row.count, 10)
      }));
  }

  private getAggregateFunction(fn: string): string {
    switch (fn) {
      case 'avg': return 'avg';
      case 'sum': return 'sum';
      case 'min': return 'min';
      case 'max': return 'max';
      case 'count': return 'count';
      case 'first': return 'first';
      case 'last': return 'last';
      default: return 'avg';
    }
  }
}

/**
 * In-memory storage for testing and development
 */
export class InMemoryTimeSeriesStorage implements TimeSeriesStorage {
  private data: MetricSnapshot[] = [];
  private maxSize: number;

  constructor(options: { maxSize?: number } = {}) {
    this.maxSize = options.maxSize || 100000;
  }

  async write(snapshot: MetricSnapshot): Promise<void> {
    this.data.push(snapshot);
    this.enforceSizeLimit();
  }

  async writeBatch(snapshots: MetricSnapshot[]): Promise<void> {
    this.data.push(...snapshots);
    this.enforceSizeLimit();
  }

  private enforceSizeLimit(): void {
    if (this.data.length > this.maxSize) {
      // Remove oldest entries
      this.data = this.data.slice(-this.maxSize);
    }
  }

  async query(options: QueryOptions): Promise<TimeSeriesPoint[]> {
    let results = this.data.filter(s => 
      s.name === options.metric &&
      s.timestamp >= options.start &&
      s.timestamp <= options.end
    );

    if (options.labels) {
      results = results.filter(s => 
        s.labels && this.matchesLabels(s.labels, options.labels!)
      );
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results.map(s => ({
      timestamp: s.timestamp,
      value: s.value,
      labels: s.labels
    }));
  }

  async aggregate(options: AggregateOptions): Promise<AggregateResult[]> {
    const points = await this.query({
      metric: options.metric,
      start: options.start,
      end: options.end,
      labels: options.labels
    });

    // Group by interval buckets
    const buckets = new Map<number, number[]>();
    
    for (const point of points) {
      const bucketTime = Math.floor(point.timestamp / options.interval) * options.interval;
      if (!buckets.has(bucketTime)) {
        buckets.set(bucketTime, []);
      }
      buckets.get(bucketTime)!.push(point.value);
    }

    // Aggregate each bucket
    const results: AggregateResult[] = [];
    for (const [timestamp, values] of buckets) {
      let value: number;
      switch (options.function) {
        case 'avg':
          value = values.reduce((a, b) => a + b, 0) / values.length;
          break;
        case 'sum':
          value = values.reduce((a, b) => a + b, 0);
          break;
        case 'min':
          value = Math.min(...values);
          break;
        case 'max':
          value = Math.max(...values);
          break;
        case 'count':
          value = values.length;
          break;
        case 'first':
          value = values[0];
          break;
        case 'last':
          value = values[values.length - 1];
          break;
        default:
          value = values.reduce((a, b) => a + b, 0) / values.length;
      }
      results.push({ timestamp, value, count: values.length });
    }

    return results.sort((a, b) => a.timestamp - b.timestamp);
  }

  private matchesLabels(
    snapshotLabels: Record<string, string>,
    queryLabels: Record<string, string>
  ): boolean {
    for (const [key, value] of Object.entries(queryLabels)) {
      if (snapshotLabels[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all stored snapshots
   */
  getAll(): MetricSnapshot[] {
    return [...this.data];
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data = [];
  }

  /**
   * Get storage size
   */
  size(): number {
    return this.data.length;
  }
}

/**
 * SQL schema for metrics table with TimescaleDB
 */
export const CREATE_METRICS_TABLE = `
-- Create metrics table
CREATE TABLE IF NOT EXISTS metrics (
  id SERIAL,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  labels JSONB DEFAULT '{}',
  timestamp TIMESTAMP NOT NULL
);

-- Convert to hypertable (TimescaleDB)
-- This will fail if TimescaleDB extension is not installed
SELECT create_hypertable('metrics', 'timestamp', if_not_exists => TRUE);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics(name);
CREATE INDEX IF NOT EXISTS idx_metrics_timestamp ON metrics(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_labels ON metrics USING GIN(labels);
CREATE INDEX IF NOT EXISTS idx_metrics_name_timestamp ON metrics(name, timestamp DESC);
`;

/**
 * SQL for creating continuous aggregates (TimescaleDB feature)
 * Useful for pre-aggregating common queries
 */
export const CREATE_CONTINUOUS_AGGREGATES = `
-- 1-minute aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1min
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 minute', timestamp) as bucket,
  name,
  avg(value) as avg,
  min(value) as min,
  max(value) as max,
  sum(value) as sum,
  count(*) as count
FROM metrics
GROUP BY bucket, name;

-- 1-hour aggregation
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1hour
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 hour', timestamp) as bucket,
  name,
  avg(value) as avg,
  min(value) as min,
  max(value) as max,
  sum(value) as sum,
  count(*) as count
FROM metrics
GROUP BY bucket, name;
`;
