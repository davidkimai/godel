/**
 * Metrics Collection for Load Testing
 * 
 * Provides histograms, counters, and gauges for comprehensive
 * load test metrics including latency, throughput, errors, and resources.
 */

import { EventEmitter } from 'events';

// ============================================================================
// Types
// ============================================================================

export interface HistogramSnapshot {
  count: number;
  sum: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p75: number;
  p90: number;
  p95: number;
  p99: number;
  p999: number;
}

export interface CounterSnapshot {
  value: number;
  rate: number; // per second
}

export interface GaugeSnapshot {
  value: number;
  min: number;
  max: number;
  mean: number;
}

export interface MetricSnapshot {
  timestamp: number;
  histograms: Record<string, HistogramSnapshot>;
  counters: Record<string, CounterSnapshot>;
  gauges: Record<string, GaugeSnapshot>;
}

export interface MetricLabels {
  [key: string]: string | number;
}

// ============================================================================
// Histogram
// ============================================================================

export class Histogram {
  private values: number[] = [];
  private _sum = 0;
  private _count = 0;
  private _min = Infinity;
  private _max = -Infinity;

  /**
   * Record a value
   */
  record(value: number): void {
    this.values.push(value);
    this._sum += value;
    this._count++;
    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);
  }

  /**
   * Get snapshot of current state
   */
  snapshot(): HistogramSnapshot {
    if (this._count === 0) {
      return {
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        mean: 0,
        p50: 0,
        p75: 0,
        p90: 0,
        p95: 0,
        p99: 0,
        p999: 0,
      };
    }

    const sorted = [...this.values].sort((a, b) => a - b);

    return {
      count: this._count,
      sum: this._sum,
      min: this._min,
      max: this._max,
      mean: this._sum / this._count,
      p50: this.getPercentile(sorted, 0.5),
      p75: this.getPercentile(sorted, 0.75),
      p90: this.getPercentile(sorted, 0.9),
      p95: this.getPercentile(sorted, 0.95),
      p99: this.getPercentile(sorted, 0.99),
      p999: this.getPercentile(sorted, 0.999),
    };
  }

  /**
   * Reset the histogram
   */
  reset(): void {
    this.values = [];
    this._sum = 0;
    this._count = 0;
    this._min = Infinity;
    this._max = -Infinity;
  }

  private getPercentile(sorted: number[], percentile: number): number {
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, index)];
  }

  get count(): number { return this._count; }
  get sum(): number { return this._sum; }
}

// ============================================================================
// Counter
// ============================================================================

export class Counter {
  private _value = 0;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Increment the counter
   */
  increment(delta = 1): void {
    this._value += delta;
  }

  /**
   * Get snapshot of current state
   */
  snapshot(): CounterSnapshot {
    const elapsedSeconds = (Date.now() - this.startTime) / 1000;
    return {
      value: this._value,
      rate: elapsedSeconds > 0 ? this._value / elapsedSeconds : 0,
    };
  }

  /**
   * Reset the counter
   */
  reset(): void {
    this._value = 0;
    this.startTime = Date.now();
  }

  get value(): number { return this._value; }
}

// ============================================================================
// Gauge
// ============================================================================

export class Gauge {
  private _value = 0;
  private _min = Infinity;
  private _max = -Infinity;
  private _sum = 0;
  private _count = 0;

  /**
   * Set the gauge value
   */
  set(value: number): void {
    this._value = value;
    this._min = Math.min(this._min, value);
    this._max = Math.max(this._max, value);
    this._sum += value;
    this._count++;
  }

  /**
   * Get snapshot of current state
   */
  snapshot(): GaugeSnapshot {
    return {
      value: this._value,
      min: this._min === Infinity ? 0 : this._min,
      max: this._max === -Infinity ? 0 : this._max,
      mean: this._count > 0 ? this._sum / this._count : 0,
    };
  }

  /**
   * Reset the gauge
   */
  reset(): void {
    this._value = 0;
    this._min = Infinity;
    this._max = -Infinity;
    this._sum = 0;
    this._count = 0;
  }

  get value(): number { return this._value; }
}

// ============================================================================
// Metrics Registry
// ============================================================================

export class MetricsRegistry extends EventEmitter {
  private histograms = new Map<string, Histogram>();
  private counters = new Map<string, Counter>();
  private gauges = new Map<string, Gauge>();
  private labels = new Map<string, MetricLabels>();

  /**
   * Get or create a histogram
   */
  histogram(name: string, labels?: MetricLabels): Histogram {
    const key = this.key(name, labels);
    if (!this.histograms.has(key)) {
      this.histograms.set(key, new Histogram());
      if (labels) this.labels.set(key, labels);
    }
    return this.histograms.get(key)!;
  }

  /**
   * Get or create a counter
   */
  counter(name: string, labels?: MetricLabels): Counter {
    const key = this.key(name, labels);
    if (!this.counters.has(key)) {
      this.counters.set(key, new Counter());
      if (labels) this.labels.set(key, labels);
    }
    return this.counters.get(key)!;
  }

  /**
   * Get or create a gauge
   */
  gauge(name: string, labels?: MetricLabels): Gauge {
    const key = this.key(name, labels);
    if (!this.gauges.has(key)) {
      this.gauges.set(key, new Gauge());
      if (labels) this.labels.set(key, labels);
    }
    return this.gauges.get(key)!;
  }

  /**
   * Record a latency value
   */
  recordLatency(name: string, value: number, labels?: MetricLabels): void {
    this.histogram(`${name}_latency`, labels).record(value);
    this.emit('latency', { name, value, labels });
  }

  /**
   * Increment an error counter
   */
  recordError(type: string, labels?: MetricLabels): void {
    this.counter('errors_total', { type, ...labels }).increment();
    this.counter('errors_total', labels).increment();
    this.emit('error', { type, labels });
  }

  /**
   * Record throughput
   */
  recordThroughput(name: string, count: number, labels?: MetricLabels): void {
    this.counter(`${name}_total`, labels).increment(count);
    this.emit('throughput', { name, count, labels });
  }

  /**
   * Record resource usage
   */
  recordResource(type: 'cpu' | 'memory' | 'queue', value: number, labels?: MetricLabels): void {
    this.gauge(`${type}_usage`, labels).set(value);
    this.emit('resource', { type, value, labels });
  }

  /**
   * Get snapshot of all metrics
   */
  snapshot(): MetricSnapshot {
    const snapshot: MetricSnapshot = {
      timestamp: Date.now(),
      histograms: {},
      counters: {},
      gauges: {},
    };

    for (const [key, histogram] of Array.from(this.histograms.entries())) {
      snapshot.histograms[key] = histogram.snapshot();
    }

    for (const [key, counter] of Array.from(this.counters.entries())) {
      snapshot.counters[key] = counter.snapshot();
    }

    for (const [key, gauge] of Array.from(this.gauges.entries())) {
      snapshot.gauges[key] = gauge.snapshot();
    }

    return snapshot;
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    for (const histogram of Array.from(this.histograms.values())) {
      histogram.reset();
    }
    for (const counter of Array.from(this.counters.values())) {
      counter.reset();
    }
    for (const gauge of Array.from(this.gauges.values())) {
      gauge.reset();
    }
  }

  /**
   * Get metric names
   */
  getMetricNames(): { histograms: string[]; counters: string[]; gauges: string[] } {
    return {
      histograms: Array.from(this.histograms.keys()),
      counters: Array.from(this.counters.keys()),
      gauges: Array.from(this.gauges.keys()),
    };
  }

  /**
   * Generate a unique key for metric with labels
   */
  private key(name: string, labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

// ============================================================================
// Resource Monitor
// ============================================================================

export interface ResourceSnapshot {
  timestamp: number;
  cpu: {
    usagePercent: number;
    user: number;
    system: number;
  };
  memory: {
    usedMB: number;
    totalMB: number;
    percent: number;
    heapUsedMB: number;
    heapTotalMB: number;
    externalMB: number;
    rssMB: number;
  };
  eventLoop: {
    lagMs: number;
    utilization: number;
  };
}

export class ResourceMonitor extends EventEmitter {
  private interval: NodeJS.Timeout | null = null;
  private readonly snapshots: ResourceSnapshot[] = [];
  private maxSnapshots: number;
  private lastCpuUsage: NodeJS.CpuUsage | null = null;

  constructor(options: { maxSnapshots?: number } = {}) {
    super();
    this.maxSnapshots = options.maxSnapshots || 1000;
  }

  /**
   * Start monitoring resources
   */
  start(intervalMs = 1000): void {
    if (this.interval) return;

    this.lastCpuUsage = process.cpuUsage();
    
    this.interval = setInterval(() => {
      const snapshot = this.captureSnapshot();
      this.snapshots.push(snapshot);

      // Keep only recent snapshots
      if (this.snapshots.length > this.maxSnapshots) {
        this.snapshots.shift();
      }

      this.emit('snapshot', snapshot);
    }, intervalMs);
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  /**
   * Get latest snapshot
   */
  getLatest(): ResourceSnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1] : null;
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): ResourceSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Calculate average resource usage
   */
  getAverages(): { cpu: number; memory: number; eventLoopLag: number } {
    if (this.snapshots.length === 0) {
      return { cpu: 0, memory: 0, eventLoopLag: 0 };
    }

    const cpuSum = this.snapshots.reduce((sum, s) => sum + s.cpu.usagePercent, 0);
    const memorySum = this.snapshots.reduce((sum, s) => sum + s.memory.percent, 0);
    const lagSum = this.snapshots.reduce((sum, s) => sum + s.eventLoop.lagMs, 0);

    return {
      cpu: cpuSum / this.snapshots.length,
      memory: memorySum / this.snapshots.length,
      eventLoopLag: lagSum / this.snapshots.length,
    };
  }

  /**
   * Get peak resource usage
   */
  getPeaks(): { cpu: number; memory: number; eventLoopLag: number } {
    if (this.snapshots.length === 0) {
      return { cpu: 0, memory: 0, eventLoopLag: 0 };
    }

    return {
      cpu: Math.max(...this.snapshots.map(s => s.cpu.usagePercent)),
      memory: Math.max(...this.snapshots.map(s => s.memory.percent)),
      eventLoopLag: Math.max(...this.snapshots.map(s => s.eventLoop.lagMs)),
    };
  }

  /**
   * Capture current resource snapshot
   */
  private captureSnapshot(): ResourceSnapshot {
    const memUsage = process.memoryUsage();
    const totalMem = require('os').totalmem();
    
    // Calculate CPU usage
    let cpuPercent = 0;
    if (this.lastCpuUsage) {
      const currentUsage = process.cpuUsage(this.lastCpuUsage);
      const totalUsage = (currentUsage.user + currentUsage.system) / 1000; // Convert to ms
      cpuPercent = Math.min(100, (totalUsage / 1000) * 100); // Assuming 1s interval
    }
    this.lastCpuUsage = process.cpuUsage();

    return {
      timestamp: Date.now(),
      cpu: {
        usagePercent: cpuPercent,
        user: this.lastCpuUsage.user / 1000000, // Convert to seconds
        system: this.lastCpuUsage.system / 1000000,
      },
      memory: {
        usedMB: memUsage.heapUsed / 1024 / 1024,
        totalMB: totalMem / 1024 / 1024,
        percent: (memUsage.heapUsed / totalMem) * 100,
        heapUsedMB: memUsage.heapUsed / 1024 / 1024,
        heapTotalMB: memUsage.heapTotal / 1024 / 1024,
        externalMB: memUsage.external / 1024 / 1024,
        rssMB: memUsage.rss / 1024 / 1024,
      },
      eventLoop: {
        lagMs: 0, // Would require event-loop-lag package for accurate measurement
        utilization: 0,
      },
    };
  }
}

// ============================================================================
// Error Tracker
// ============================================================================

export interface ErrorRecord {
  timestamp: number;
  type: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}

export class ErrorTracker extends EventEmitter {
  private errors: ErrorRecord[] = [];
  private errorCounts = new Map<string, number>();
  private maxErrors: number;

  constructor(options: { maxErrors?: number } = {}) {
    super();
    this.maxErrors = options.maxErrors || 10000;
  }

  /**
   * Track an error
   */
  track(error: Error | string, type = 'generic', context?: Record<string, unknown>): void {
    const record: ErrorRecord = {
      timestamp: Date.now(),
      type,
      message: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      context,
    };

    this.errors.push(record);
    
    const count = this.errorCounts.get(type) || 0;
    this.errorCounts.set(type, count + 1);

    // Trim old errors if exceeded max
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }

    this.emit('error', record);
  }

  /**
   * Get error summary
   */
  getSummary(): { total: number; byType: Record<string, number>; recent: ErrorRecord[] } {
    const byType: Record<string, number> = {};
    for (const [type, count] of Array.from(this.errorCounts.entries())) {
      byType[type] = count;
    }

    return {
      total: this.errors.length,
      byType,
      recent: this.errors.slice(-100), // Last 100 errors
    };
  }

  /**
   * Get error rate (errors per minute)
   */
  getErrorRate(timeWindowMinutes = 1): number {
    const cutoff = Date.now() - (timeWindowMinutes * 60 * 1000);
    const recentErrors = this.errors.filter(e => e.timestamp >= cutoff);
    return recentErrors.length / timeWindowMinutes;
  }

  /**
   * Reset error tracking
   */
  reset(): void {
    this.errors = [];
    this.errorCounts.clear();
  }

  /**
   * Check if error threshold exceeded
   */
  isThresholdExceeded(threshold: number, timeWindowMinutes = 1): boolean {
    return this.getErrorRate(timeWindowMinutes) > threshold;
  }
}

// ============================================================================
// Latency Distribution
// ============================================================================

export interface LatencyDistribution {
  buckets: { threshold: number; count: number; percentage: number }[];
  total: number;
}

export class LatencyDistributionTracker {
  private buckets = new Map<number, number>();
  private thresholds: number[];
  private total = 0;

  constructor(thresholds: number[] = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000]) {
    this.thresholds = thresholds.sort((a, b) => a - b);
    for (const threshold of this.thresholds) {
      this.buckets.set(threshold, 0);
    }
  }

  /**
   * Record a latency value
   */
  record(latencyMs: number): void {
    this.total++;
    for (const threshold of this.thresholds) {
      if (latencyMs <= threshold) {
        this.buckets.set(threshold, (this.buckets.get(threshold) || 0) + 1);
        break;
      }
    }
  }

  /**
   * Get distribution snapshot
   */
  getDistribution(): LatencyDistribution {
    const buckets: LatencyDistribution['buckets'] = [];
    let cumulative = 0;

    for (const threshold of this.thresholds) {
      const count = this.buckets.get(threshold) || 0;
      cumulative += count;
      buckets.push({
        threshold,
        count,
        percentage: this.total > 0 ? (cumulative / this.total) * 100 : 0,
      });
    }

    return { buckets, total: this.total };
  }

  /**
   * Get percentage under threshold
   */
  getPercentageUnder(threshold: number): number {
    const distribution = this.getDistribution();
    const bucket = distribution.buckets.find(b => b.threshold >= threshold);
    return bucket ? bucket.percentage : 0;
  }

  /**
   * Reset distribution
   */
  reset(): void {
    for (const threshold of this.thresholds) {
      this.buckets.set(threshold, 0);
    }
    this.total = 0;
  }
}

// ============================================================================
// Predefined Metrics
// ============================================================================

export const PredefinedMetrics = {
  /** Latency buckets for HTTP-style requests (in ms) */
  httpLatencies: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000],
  
  /** Latency buckets for agent operations (in ms) */
  agentLatencies: [5, 10, 25, 50, 100, 250, 500, 1000],
  
  /** Latency buckets for event processing (in ms) */
  eventLatencies: [1, 5, 10, 25, 50, 100, 250],
};

// ============================================================================
// Export singleton instance
// ============================================================================

export const globalRegistry = new MetricsRegistry();
export const globalResourceMonitor = new ResourceMonitor();
export const globalErrorTracker = new ErrorTracker();

export default {
  MetricsRegistry,
  ResourceMonitor,
  ErrorTracker,
  LatencyDistributionTracker,
  Histogram,
  Counter,
  Gauge,
  globalRegistry,
  globalResourceMonitor,
  globalErrorTracker,
  PredefinedMetrics,
};
