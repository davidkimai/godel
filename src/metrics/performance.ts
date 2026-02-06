/**
 * Performance Metrics Module
 * 
 * Comprehensive performance monitoring for Godel including:
 * - Latency tracking (p50, p95, p99)
 * - Throughput metrics (requests/sec, events/sec)
 * - Resource utilization (memory, CPU, connections)
 * - Database query performance
 * - Cache hit rates
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface LatencyMetrics {
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  avg: number;
  count: number;
}

export interface ThroughputMetrics {
  requestsPerSecond: number;
  eventsPerSecond: number;
  messagesPerSecond: number;
}

export interface ResourceMetrics {
  memoryUsage: {
    used: number;
    total: number;
    percent: number;
  };
  cpuUsage: number;
  activeConnections: number;
  connectionPoolUtilization: number;
}

export interface DatabaseMetrics {
  queryCount: number;
  slowQueries: number;
  avgQueryTime: number;
  maxQueryTime: number;
  connectionPoolSize: number;
  activeConnections: number;
}

export interface CacheMetrics {
  hitRate: number;
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  memoryUsage: number;
}

export interface PerformanceSnapshot {
  timestamp: number;
  latency: LatencyMetrics;
  throughput: ThroughputMetrics;
  resources: ResourceMetrics;
  database: DatabaseMetrics;
  cache: CacheMetrics;
}

export interface PerformanceAlert {
  id: string;
  type: 'warning' | 'critical';
  metric: string;
  value: number;
  threshold: number;
  message: string;
  timestamp: number;
}

// ============================================================================
// Performance Tracker
// ============================================================================

export class PerformanceTracker extends EventEmitter {
  private latencySamples: number[] = [];
  private maxSamples = 10000;
  private requestCount = 0;
  private lastRequestTime = Date.now();
  private throughputWindow = 60000; // 1 minute
  private alertThresholds = {
    latencyP95: 1000, // 1 second
    latencyP99: 2000, // 2 seconds
    memoryPercent: 80, // 80%
    errorRate: 0.05, // 5%
  };
  private alerts: PerformanceAlert[] = [];
  private maxAlerts = 100;

  // Metric counters
  private metrics = {
    requests: 0,
    errors: 0,
    events: 0,
    messages: 0,
    slowQueries: 0,
    queryTimes: [] as number[],
    cacheHits: 0,
    cacheMisses: 0,
    cacheEvictions: 0,
  };

  /**
   * Record a latency sample
   */
  recordLatency(durationMs: number): void {
    this.latencySamples.push(durationMs);
    this.requestCount++;

    // Keep samples under limit
    if (this.latencySamples.length > this.maxSamples) {
      this.latencySamples.shift();
    }

    // Check for alert
    if (durationMs > this.alertThresholds.latencyP99) {
      this.createAlert('critical', 'latency', durationMs, this.alertThresholds.latencyP99, 
        `High latency detected: ${durationMs}ms`);
    }
  }

  /**
   * Record a request
   */
  recordRequest(success: boolean): void {
    this.metrics.requests++;
    if (!success) {
      this.metrics.errors++;
    }
  }

  /**
   * Record an event
   */
  recordEvent(count = 1): void {
    this.metrics.events += count;
  }

  /**
   * Record a message
   */
  recordMessage(count = 1): void {
    this.metrics.messages += count;
  }

  /**
   * Record a database query
   */
  recordQuery(durationMs: number): void {
    this.metrics.queryTimes.push(durationMs);
    
    if (this.metrics.queryTimes.length > this.maxSamples) {
      this.metrics.queryTimes.shift();
    }

    // Flag slow queries (>100ms)
    if (durationMs > 100) {
      this.metrics.slowQueries++;
    }
  }

  /**
   * Record cache operation
   */
  recordCacheHit(): void {
    this.metrics.cacheHits++;
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
  }

  recordCacheEviction(): void {
    this.metrics.cacheEvictions++;
  }

  /**
   * Get latency metrics
   */
  getLatencyMetrics(): LatencyMetrics {
    if (this.latencySamples.length === 0) {
      return {
        p50: 0,
        p95: 0,
        p99: 0,
        min: 0,
        max: 0,
        avg: 0,
        count: 0,
      };
    }

    const sorted = [...this.latencySamples].sort((a, b) => a - b);
    const count = sorted.length;
    const sum = sorted.reduce((a, b) => a + b, 0);

    return {
      p50: sorted[Math.floor(count * 0.5)],
      p95: sorted[Math.floor(count * 0.95)],
      p99: sorted[Math.floor(count * 0.99)],
      min: sorted[0],
      max: sorted[count - 1],
      avg: sum / count,
      count,
    };
  }

  /**
   * Get throughput metrics
   */
  getThroughputMetrics(): ThroughputMetrics {
    const now = Date.now();
    const windowStart = now - this.throughputWindow;
    
    // Calculate requests per second over the last minute
    const timeDiff = Math.max((now - this.lastRequestTime) / 1000, 1);
    const requestsPerSecond = this.requestCount / timeDiff;
    const eventsPerSecond = this.metrics.events / timeDiff;
    const messagesPerSecond = this.metrics.messages / timeDiff;

    return {
      requestsPerSecond: Math.round(requestsPerSecond * 100) / 100,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      messagesPerSecond: Math.round(messagesPerSecond * 100) / 100,
    };
  }

  /**
   * Get resource metrics
   */
  getResourceMetrics(): ResourceMetrics {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    
    return {
      memoryUsage: {
        used: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
        total: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
        percent: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100),
      },
      cpuUsage: process.cpuUsage().user / 1000000, // seconds
      activeConnections: this.getActiveConnections(),
      connectionPoolUtilization: this.getConnectionPoolUtilization(),
    };
  }

  /**
   * Get database metrics
   */
  getDatabaseMetrics(): DatabaseMetrics {
    const queryTimes = this.metrics.queryTimes;
    const avgTime = queryTimes.length > 0 
      ? queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length 
      : 0;
    
    return {
      queryCount: queryTimes.length,
      slowQueries: this.metrics.slowQueries,
      avgQueryTime: Math.round(avgTime),
      maxQueryTime: queryTimes.length > 0 ? Math.max(...queryTimes) : 0,
      connectionPoolSize: 0, // Will be populated by caller
      activeConnections: 0, // Will be populated by caller
    };
  }

  /**
   * Get cache metrics
   */
  getCacheMetrics(): CacheMetrics {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    const hitRate = total > 0 ? this.metrics.cacheHits / total : 0;

    return {
      hitRate: Math.round(hitRate * 100) / 100,
      hits: this.metrics.cacheHits,
      misses: this.metrics.cacheMisses,
      evictions: this.metrics.cacheEvictions,
      size: total,
      memoryUsage: 0, // Will be populated by caller
    };
  }

  /**
   * Get a full performance snapshot
   */
  getSnapshot(): PerformanceSnapshot {
    return {
      timestamp: Date.now(),
      latency: this.getLatencyMetrics(),
      throughput: this.getThroughputMetrics(),
      resources: this.getResourceMetrics(),
      database: this.getDatabaseMetrics(),
      cache: this.getCacheMetrics(),
    };
  }

  /**
   * Get recent alerts
   */
  getAlerts(limit = 10): PerformanceAlert[] {
    return this.alerts.slice(-limit);
  }

  /**
   * Clear all metrics
   */
  reset(): void {
    this.latencySamples = [];
    this.metrics = {
      requests: 0,
      errors: 0,
      events: 0,
      messages: 0,
      slowQueries: 0,
      queryTimes: [],
      cacheHits: 0,
      cacheMisses: 0,
      cacheEvictions: 0,
    };
    this.requestCount = 0;
    this.lastRequestTime = Date.now();
    this.alerts = [];
  }

  /**
   * Set alert thresholds
   */
  setAlertThresholds(thresholds: Partial<typeof this.alertThresholds>): void {
    this.alertThresholds = { ...this.alertThresholds, ...thresholds };
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private createAlert(
    type: 'warning' | 'critical',
    metric: string,
    value: number,
    threshold: number,
    message: string
  ): void {
    const alert: PerformanceAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      type,
      metric,
      value,
      threshold,
      message,
      timestamp: Date.now(),
    };

    this.alerts.push(alert);
    
    if (this.alerts.length > this.maxAlerts) {
      this.alerts.shift();
    }

    this.emit('alert', alert);
    
    // Log critical alerts
    if (type === 'critical') {
      logger.warn('performance', `Performance alert: ${message}`, {
        metric,
        value,
        threshold,
      });
    }
  }

  private getActiveConnections(): number {
    // This would integrate with connection pool tracking
    return 0;
  }

  private getConnectionPoolUtilization(): number {
    // This would integrate with connection pool tracking
    return 0;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalTracker: PerformanceTracker | null = null;

export function getPerformanceTracker(): PerformanceTracker {
  if (!globalTracker) {
    globalTracker = new PerformanceTracker();
  }
  return globalTracker;
}

export function resetPerformanceTracker(): void {
  globalTracker = null;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Time a function execution and record latency
 */
export async function timeAsync<T>(
  name: string,
  fn: () => Promise<T>,
  tracker = getPerformanceTracker()
): Promise<T> {
  const start = performance.now();
  try {
    const result = await fn();
    tracker.recordLatency(performance.now() - start);
    return result;
  } catch (error) {
    tracker.recordRequest(false);
    throw error;
  }
}

/**
 * Time a synchronous function execution
 */
export function timeSync<T>(
  name: string,
  fn: () => T,
  tracker = getPerformanceTracker()
): T {
  const start = performance.now();
  try {
    const result = fn();
    tracker.recordLatency(performance.now() - start);
    return result;
  } catch (error) {
    tracker.recordRequest(false);
    throw error;
  }
}

/**
 * Create a performance middleware for Express/Fastify
 */
export function performanceMiddleware(tracker = getPerformanceTracker()) {
  return async (req: any, res: any, next: any) => {
    const start = performance.now();
    
    res.on('finish', () => {
      const duration = performance.now() - start;
      tracker.recordLatency(duration);
      tracker.recordRequest(res.statusCode < 400);
    });

    next();
  };
}

export default PerformanceTracker;
