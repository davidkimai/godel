import { createLogger } from '../../utils/logger.js';

/**
 * Module logger
 */
const log = createLogger('time-series-storage');

/**
 * Time Series Storage Interface for Alerting
 * 
 * Abstracts metric storage for the alerting system.
 */

/**
 * Single data point in a time series
 */
export interface TimeSeriesPoint {
  /** Timestamp in milliseconds */
  timestamp: number;
  /** Metric value */
  value: number;
  /** Optional labels/tags */
  labels: Record<string, string>;
}

/**
 * Query options for time series data
 */
export interface TimeSeriesQuery {
  /** Metric name */
  metric: string;
  /** Start timestamp (inclusive) */
  start: number;
  /** End timestamp (inclusive) */
  end: number;
  /** Optional label filters */
  labels?: Record<string, string>;
}

/**
 * Time series storage interface
 * Implementations can use Redis, PostgreSQL, InfluxDB, Prometheus, etc.
 */
export interface TimeSeriesStorage {
  /**
   * Query time series data
   * @param query - Query parameters
   * @returns Array of data points matching the query
   */
  query(query: TimeSeriesQuery): Promise<TimeSeriesPoint[]>;
  
  /**
   * Write a data point to storage
   * @param metric - Metric name
   * @param value - Metric value
   * @param labels - Optional labels/tags
   * @param timestamp - Optional timestamp (defaults to now)
   */
  write(metric: string, value: number, labels?: Record<string, string>, timestamp?: number): Promise<void>;
}

/**
 * In-memory implementation of time series storage
 * Useful for testing and development
 */
export class InMemoryTimeSeriesStorage implements TimeSeriesStorage {
  private data: Map<string, TimeSeriesPoint[]> = new Map();
  private maxPointsPerMetric: number;

  constructor(options: { maxPointsPerMetric?: number } = {}) {
    this.maxPointsPerMetric = options.maxPointsPerMetric || 10000;
  }

  async query(query: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
    const key = this.getKey(query.metric, query.labels);
    const points = this.data.get(key) || [];
    
    return points.filter(p => 
      p.timestamp >= query.start && 
      p.timestamp <= query.end
    );
  }

  async write(metric: string, value: number, labels?: Record<string, string>, timestamp?: number): Promise<void> {
    const key = this.getKey(metric, labels);
    const points = this.data.get(key) || [];
    
    points.push({
      timestamp: timestamp ?? Date.now(),
      value,
      labels: labels || {}
    });
    
    // Keep only the most recent points
    if (points.length > this.maxPointsPerMetric) {
      points.splice(0, points.length - this.maxPointsPerMetric);
    }
    
    this.data.set(key, points);
  }

  /**
   * Get all metric names currently stored
   */
  getMetricNames(): string[] {
    const names = new Set<string>();
    for (const key of this.data.keys()) {
      const metricName = key.split('{')[0];
      names.add(metricName);
    }
    return Array.from(names);
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.data.clear();
  }

  private getKey(metric: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return metric;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${metric}{${labelStr}}`;
  }
}

/**
 * Metrics registry adapter that wraps the loop metrics registry
 * to provide time series storage interface
 */
export class MetricsRegistryAdapter implements TimeSeriesStorage {
  private history: Map<string, TimeSeriesPoint[]> = new Map();
  private maxHistory: number;

  constructor(options: { maxHistory?: number } = {}) {
    this.maxHistory = options.maxHistory || 1000;
  }

  async query(query: TimeSeriesQuery): Promise<TimeSeriesPoint[]> {
    const key = this.getKey(query.metric, query.labels);
    const points = this.history.get(key) || [];
    
    return points.filter(p => 
      p.timestamp >= query.start && 
      p.timestamp <= query.end
    );
  }

  async write(metric: string, value: number, labels?: Record<string, string>, timestamp?: number): Promise<void> {
    const key = this.getKey(metric, labels);
    const points = this.history.get(key) || [];
    
    points.push({
      timestamp: timestamp ?? Date.now(),
      value,
      labels: labels || {}
    });
    
    // Keep only the most recent points
    if (points.length > this.maxHistory) {
      points.splice(0, points.length - this.maxHistory);
    }
    
    this.history.set(key, points);
  }

  /**
   * Record a metric value from the metrics registry
   */
  recordFromRegistry(metricName: string, value: number, labels?: Record<string, string>): void {
    this.write(metricName, value, labels).catch((err) => {
      log.logError('Failed to record metric from registry', err, { metricName, value });
    });
  }

  private getKey(metric: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return metric;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${metric}{${labelStr}}`;
  }
}
