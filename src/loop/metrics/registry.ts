/**
 * Metrics Registry - Central registry for all metrics
 * 
 * Manages metric registration, collection, and Prometheus export.
 */

import {
  MetricDefinition,
  Counter,
  Gauge,
  Histogram,
  Summary
} from './types.js';

export interface MetricSnapshot {
  name: string;
  type: string;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

export class MetricsRegistry {
  private metrics: Map<string, Counter | Gauge | Histogram | Summary> = new Map();
  private definitions: Map<string, MetricDefinition> = new Map();
  private prefix: string;

  constructor(options: { prefix?: string } = {}) {
    this.prefix = options.prefix || '';
  }

  /**
   * Register a new metric
   */
  register(definition: MetricDefinition): void {
    const fullName = this.prefix + definition.name;

    if (this.metrics.has(fullName)) {
      throw new Error(`Metric ${fullName} already registered`);
    }

    const fullDefinition = {
      ...definition,
      name: fullName
    };

    this.definitions.set(fullName, fullDefinition);

    switch (definition.type) {
      case 'counter':
        this.metrics.set(fullName, new Counter(fullDefinition));
        break;
      case 'gauge':
        this.metrics.set(fullName, new Gauge(fullDefinition));
        break;
      case 'histogram':
        this.metrics.set(fullName, new Histogram(fullDefinition));
        break;
      case 'summary':
        this.metrics.set(fullName, new Summary(fullDefinition));
        break;
      default:
        throw new Error(`Unknown metric type: ${definition.type}`);
    }
  }

  /**
   * Get a counter metric
   */
  counter(name: string): Counter {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || !(metric instanceof Counter)) {
      throw new Error(`Counter ${fullName} not found`);
    }
    return metric;
  }

  /**
   * Get a gauge metric
   */
  gauge(name: string): Gauge {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || !(metric instanceof Gauge)) {
      throw new Error(`Gauge ${fullName} not found`);
    }
    return metric;
  }

  /**
   * Get a histogram metric
   */
  histogram(name: string): Histogram {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || !(metric instanceof Histogram)) {
      throw new Error(`Histogram ${fullName} not found`);
    }
    return metric;
  }

  /**
   * Get a summary metric
   */
  summary(name: string): Summary {
    const fullName = this.prefix + name;
    const metric = this.metrics.get(fullName);
    if (!metric || !(metric instanceof Summary)) {
      throw new Error(`Summary ${fullName} not found`);
    }
    return metric;
  }

  /**
   * Get any metric by name
   */
  get(name: string): Counter | Gauge | Histogram | Summary | undefined {
    return this.metrics.get(this.prefix + name);
  }

  /**
   * Check if a metric exists
   */
  has(name: string): boolean {
    return this.metrics.has(this.prefix + name);
  }

  /**
   * Remove a metric from the registry
   */
  unregister(name: string): boolean {
    const fullName = this.prefix + name;
    this.definitions.delete(fullName);
    return this.metrics.delete(fullName);
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics.clear();
    this.definitions.clear();
  }

  /**
   * Get all registered metric names
   */
  getMetricNames(): string[] {
    return Array.from(this.metrics.keys());
  }

  /**
   * Collect all metrics as snapshots
   */
  collect(): MetricSnapshot[] {
    const snapshots: MetricSnapshot[] = [];

    for (const [name, metric] of this.metrics) {
      const def = this.definitions.get(name)!;

      if (metric instanceof Counter) {
        snapshots.push({
          name,
          type: 'counter',
          value: metric.get(),
          timestamp: Date.now()
        });
      } else if (metric instanceof Gauge) {
        snapshots.push({
          name,
          type: 'gauge',
          value: metric.get(),
          timestamp: Date.now()
        });
      } else if (metric instanceof Histogram) {
        // Export histogram buckets
        const buckets = metric.getBuckets();
        for (const [bucket, count] of buckets) {
          snapshots.push({
            name: `${name}_bucket`,
            type: 'histogram_bucket',
            value: count,
            labels: { le: bucket.toString() },
            timestamp: Date.now()
          });
        }
        // +Inf bucket (count of all observations)
        snapshots.push({
          name: `${name}_bucket`,
          type: 'histogram_bucket',
          value: metric.getCount(),
          labels: { le: '+Inf' },
          timestamp: Date.now()
        });
        snapshots.push({
          name: `${name}_sum`,
          type: 'histogram_sum',
          value: metric.getSum(),
          timestamp: Date.now()
        });
        snapshots.push({
          name: `${name}_count`,
          type: 'histogram_count',
          value: metric.getCount(),
          timestamp: Date.now()
        });
      } else if (metric instanceof Summary) {
        // Export summary quantiles
        const quantiles = def.quantiles || [0.5, 0.9, 0.99];
        for (const q of quantiles) {
          snapshots.push({
            name,
            type: 'summary',
            value: metric.quantile(q),
            labels: { quantile: q.toString() },
            timestamp: Date.now()
          });
        }
        snapshots.push({
          name: `${name}_sum`,
          type: 'summary_sum',
          value: metric.getSum(),
          timestamp: Date.now()
        });
        snapshots.push({
          name: `${name}_count`,
          type: 'summary_count',
          value: metric.getCount(),
          timestamp: Date.now()
        });
      }
    }

    return snapshots;
  }

  /**
   * Reset all metrics to their initial state
   */
  resetAll(): void {
    for (const metric of this.metrics.values()) {
      if (metric instanceof Counter) {
        metric.reset();
      } else if (metric instanceof Gauge) {
        metric.set(0);
      } else if (metric instanceof Histogram) {
        metric.reset();
      }
      // Summary doesn't have a reset method due to sliding window
    }
  }

  /**
   * Export metrics in Prometheus format
   */
  toPrometheus(): string {
    const lines: string[] = [];

    for (const [name, metric] of this.metrics) {
      const def = this.definitions.get(name)!;

      lines.push(`# HELP ${name} ${def.description}`);
      lines.push(`# TYPE ${name} ${def.type}`);

      if (metric instanceof Counter || metric instanceof Gauge) {
        lines.push(`${name} ${metric.get()}`);
      } else if (metric instanceof Histogram) {
        const buckets = metric.getBuckets();
        for (const [bucket, count] of buckets) {
          lines.push(`${name}_bucket{le="${bucket}"} ${count}`);
        }
        lines.push(`${name}_bucket{le="+Inf"} ${metric.getCount()}`);
        lines.push(`${name}_sum ${metric.getSum()}`);
        lines.push(`${name}_count ${metric.getCount()}`);
      } else if (metric instanceof Summary) {
        const quantiles = def.quantiles || [0.5, 0.9, 0.99];
        for (const q of quantiles) {
          lines.push(`${name}{quantile="${q}"} ${metric.quantile(q)}`);
        }
        lines.push(`${name}_sum ${metric.getSum()}`);
        lines.push(`${name}_count ${metric.getCount()}`);
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Export metrics as JSON
   */
  toJSON(): object {
    const result: Record<string, unknown> = {};

    for (const [name, metric] of this.metrics) {
      if (metric instanceof Counter || metric instanceof Gauge) {
        result[name] = {
          type: metric instanceof Counter ? 'counter' : 'gauge',
          value: metric.get()
        };
      } else if (metric instanceof Histogram) {
        const buckets = metric.getBuckets();
        result[name] = {
          type: 'histogram',
          count: metric.getCount(),
          sum: metric.getSum(),
          buckets: Object.fromEntries(buckets),
          p50: metric.percentile(50),
          p95: metric.percentile(95),
          p99: metric.percentile(99)
        };
      } else if (metric instanceof Summary) {
        result[name] = {
          type: 'summary',
          count: metric.getCount(),
          sum: metric.getSum(),
          quantiles: (metric.getDefinition().quantiles || [0.5, 0.9, 0.99])
            .map(q => ({ quantile: q, value: metric.quantile(q) }))
        };
      }
    }

    return result;
  }

  /**
   * Create a metrics object with methods for each registered metric
   * Convenient for destructuring: const { counter, gauge } = registry.createHelpers();
   */
  createHelpers(): {
    counter: (name: string) => Counter;
    gauge: (name: string) => Gauge;
    histogram: (name: string) => Histogram;
    summary: (name: string) => Summary;
  } {
    return {
      counter: (name: string) => this.counter(name),
      gauge: (name: string) => this.gauge(name),
      histogram: (name: string) => this.histogram(name),
      summary: (name: string) => this.summary(name)
    };
  }
}

/**
 * Create a default global registry
 */
export const defaultRegistry = new MetricsRegistry();

/**
 * Register a metric with the default registry
 */
export function register(definition: MetricDefinition): void {
  defaultRegistry.register(definition);
}

/**
 * Get a counter from the default registry
 */
export function counter(name: string): Counter {
  return defaultRegistry.counter(name);
}

/**
 * Get a gauge from the default registry
 */
export function gauge(name: string): Gauge {
  return defaultRegistry.gauge(name);
}

/**
 * Get a histogram from the default registry
 */
export function histogram(name: string): Histogram {
  return defaultRegistry.histogram(name);
}

/**
 * Get a summary from the default registry
 */
export function summary(name: string): Summary {
  return defaultRegistry.summary(name);
}

/**
 * Collect all metrics from the default registry
 */
export function collect(): MetricSnapshot[] {
  return defaultRegistry.collect();
}

/**
 * Export default registry in Prometheus format
 */
export function toPrometheus(): string {
  return defaultRegistry.toPrometheus();
}
