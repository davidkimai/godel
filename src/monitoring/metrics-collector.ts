import { EventEmitter } from 'events';
import { createServer } from 'http';

export interface MetricValue {
  value: number;
  timestamp: Date;
  labels: Record<string, string>;
}

export interface MetricDefinition {
  name: string;
  help: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  labelNames: string[];
}

export interface HistogramBucket {
  upperBound: number;
  count: number;
}

export interface HistogramMetric extends MetricDefinition {
  type: 'histogram';
  buckets: HistogramBucket[];
  sum: number;
  count: number;
}

export interface MetricsCollectorConfig {
  port?: number;
  path?: string;
  defaultLabels?: Record<string, string>;
  prefix?: string;
}

export interface VMMetrics {
  spawnDuration: number;
  bootTime: number;
  memoryUsage: number;
  cpuUsage: number;
  diskIO: number;
  networkIO: number;
}

export class MetricsCollector extends EventEmitter {
  private metrics: Map<string, MetricDefinition> = new Map();
  private counters: Map<string, Map<string, number>> = new Map();
  private gauges: Map<string, Map<string, number>> = new Map();
  private histograms: Map<string, Map<string, HistogramMetric>> = new Map();
  private config: Required<MetricsCollectorConfig>;
  private server?: ReturnType<typeof createServer>;
  private vmMetrics: Map<string, VMMetrics> = new Map();
  private collectionInterval?: ReturnType<typeof setInterval>;

  constructor(config: MetricsCollectorConfig = {}) {
    super();
    this.config = {
      port: config.port || 9090,
      path: config.path || '/metrics',
      defaultLabels: config.defaultLabels || {},
      prefix: config.prefix || 'rlm_',
    };
    this.registerDefaultMetrics();
  }

  private registerDefaultMetrics(): void {
    this.registerCounter('vm_spawns_total', 'Total number of VM spawns', ['status', 'pool_hit']);
    this.registerGauge('vm_spawn_duration_ms', 'VM spawn duration in milliseconds', ['spec_id']);
    this.registerGauge('vm_boot_time_ms', 'VM boot time in milliseconds', ['spec_id']);
    this.registerGauge('pool_ready_vms', 'Number of VMs in ready state', []);
    this.registerGauge('pool_running_vms', 'Number of running VMs', []);
    this.registerGauge('pool_hit_rate', 'Pool hit rate percentage', []);
    this.registerHistogram('spawn_latency_ms', 'VM spawn latency distribution', ['priority'], [10, 25, 50, 100, 200, 500]);
    this.registerCounter('snapshot_operations_total', 'Total snapshot operations', ['operation', 'status']);
    this.registerGauge('snapshot_size_bytes', 'Snapshot size in bytes', ['vm_id']);
    this.registerGauge('active_restores', 'Number of active restore operations', []);
    this.registerGauge('fork_operations_active', 'Number of active fork operations', []);
    this.registerCounter('health_checks_total', 'Total health checks performed', ['status']);
    this.registerGauge('resource_usage_cpu', 'CPU usage percentage', ['vm_id']);
    this.registerGauge('resource_usage_memory', 'Memory usage in MB', ['vm_id']);
  }

  start(): void {
    this.server = createServer((req, res) => {
      if (req.url === this.config.path && req.method === 'GET') {
        const metrics = this.exportPrometheusFormat();
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(metrics);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    this.server.listen(this.config.port, () => {
      console.log(`Metrics server listening on port ${this.config.port}`);
      this.emit('metrics:started', { port: this.config.port });
    });

    // Start periodic VM metrics collection
    this.collectionInterval = setInterval(() => {
      this.collectVMMetrics();
    }, 30000); // Every 30 seconds
  }

  stop(): void {
    if (this.server) {
      this.server.close();
    }
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }
  }

  registerCounter(name: string, help: string, labelNames: string[]): void {
    const fullName = `${this.config.prefix}${name}`;
    this.metrics.set(fullName, {
      name: fullName,
      help,
      type: 'counter',
      labelNames,
    });
    this.counters.set(fullName, new Map());
  }

  registerGauge(name: string, help: string, labelNames: string[]): void {
    const fullName = `${this.config.prefix}${name}`;
    this.metrics.set(fullName, {
      name: fullName,
      help,
      type: 'gauge',
      labelNames,
    });
    this.gauges.set(fullName, new Map());
  }

  registerHistogram(name: string, help: string, labelNames: string[], buckets: number[]): void {
    const fullName = `${this.config.prefix}${name}`;
    const histogramDef: HistogramMetric = {
      name: fullName,
      help,
      type: 'histogram',
      labelNames,
      buckets: buckets.map(b => ({ upperBound: b, count: 0 })),
      sum: 0,
      count: 0,
    };
    this.metrics.set(fullName, histogramDef);
    this.histograms.set(fullName, new Map());
  }

  incCounter(name: string, labels: Record<string, string> = {}, value = 1): void {
    const fullName = `${this.config.prefix}${name}`;
    const counter = this.counters.get(fullName);
    if (!counter) return;

    const labelKey = this.labelsToKey({ ...this.config.defaultLabels, ...labels });
    const current = counter.get(labelKey) || 0;
    counter.set(labelKey, current + value);

    this.emit('metric:counter', { name: fullName, labels, value: current + value });
  }

  setGauge(name: string, labels: Record<string, string> = {}, value: number): void {
    const fullName = `${this.config.prefix}${name}`;
    const gauge = this.gauges.get(fullName);
    if (!gauge) return;

    const labelKey = this.labelsToKey({ ...this.config.defaultLabels, ...labels });
    gauge.set(labelKey, value);

    this.emit('metric:gauge', { name: fullName, labels, value });
  }

  observeHistogram(name: string, labels: Record<string, string> = {}, value: number): void {
    const fullName = `${this.config.prefix}${name}`;
    const histograms = this.histograms.get(fullName);
    if (!histograms) return;

    const labelKey = this.labelsToKey({ ...this.config.defaultLabels, ...labels });
    let histogram = histograms.get(labelKey);
    
    if (!histogram) {
      const def = this.metrics.get(fullName) as HistogramMetric;
      histogram = {
        ...def,
        buckets: def.buckets.map(b => ({ ...b })),
        sum: 0,
        count: 0,
      };
      histograms.set(labelKey, histogram);
    }

    histogram.sum += value;
    histogram.count++;
    
    for (const bucket of histogram.buckets) {
      if (value <= bucket.upperBound) {
        bucket.count++;
      }
    }

    this.emit('metric:histogram', { name: fullName, labels, value });
  }

  private labelsToKey(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
  }

  recordVMMetrics(vmId: string, metrics: Partial<VMMetrics>): void {
    const current = this.vmMetrics.get(vmId) || {
      spawnDuration: 0,
      bootTime: 0,
      memoryUsage: 0,
      cpuUsage: 0,
      diskIO: 0,
      networkIO: 0,
    };
    
    this.vmMetrics.set(vmId, { ...current, ...metrics });

    if (metrics.spawnDuration !== undefined) {
      this.setGauge('vm_spawn_duration_ms', { vm_id: vmId }, metrics.spawnDuration);
    }
    if (metrics.bootTime !== undefined) {
      this.setGauge('vm_boot_time_ms', { vm_id: vmId }, metrics.bootTime);
    }
    if (metrics.memoryUsage !== undefined) {
      this.setGauge('resource_usage_memory', { vm_id: vmId }, metrics.memoryUsage);
    }
    if (metrics.cpuUsage !== undefined) {
      this.setGauge('resource_usage_cpu', { vm_id: vmId }, metrics.cpuUsage);
    }
  }

  recordSpawn(status: 'success' | 'failure', poolHit: boolean, durationMs: number): void {
    this.incCounter('vm_spawns_total', { status, pool_hit: String(poolHit) });
    this.observeHistogram('spawn_latency_ms', {}, durationMs);
  }

  recordSnapshotOperation(operation: 'create' | 'restore' | 'delete', status: 'success' | 'failure'): void {
    this.incCounter('snapshot_operations_total', { operation, status });
  }

  recordPoolMetrics(readyVMs: number, runningVMs: number, hitRate: number): void {
    this.setGauge('pool_ready_vms', {}, readyVMs);
    this.setGauge('pool_running_vms', {}, runningVMs);
    this.setGauge('pool_hit_rate', {}, hitRate);
  }

  private collectVMMetrics(): void {
    for (const [vmId, metrics] of this.vmMetrics) {
      this.emit('metrics:collected', { vmId, metrics });
    }
  }

  private exportPrometheusFormat(): string {
    const lines: string[] = [];

    for (const [name, def] of this.metrics) {
      lines.push(`# HELP ${name} ${def.help}`);
      lines.push(`# TYPE ${name} ${def.type}`);

      if (def.type === 'counter') {
        const counter = this.counters.get(name);
        if (counter) {
          for (const [labelKey, value] of counter) {
            const labels = this.keyToLabels(labelKey);
            const labelStr = this.formatLabels(labels);
            lines.push(`${name}${labelStr} ${value}`);
          }
        }
      } else if (def.type === 'gauge') {
        const gauge = this.gauges.get(name);
        if (gauge) {
          for (const [labelKey, value] of gauge) {
            const labels = this.keyToLabels(labelKey);
            const labelStr = this.formatLabels(labels);
            lines.push(`${name}${labelStr} ${value}`);
          }
        }
      } else if (def.type === 'histogram') {
        const histograms = this.histograms.get(name);
        if (histograms) {
          for (const [labelKey, histogram] of histograms) {
            const labels = this.keyToLabels(labelKey);
            
            for (const bucket of histogram.buckets) {
              const bucketLabels = { ...labels, le: String(bucket.upperBound) };
              lines.push(`${name}_bucket${this.formatLabels(bucketLabels)} ${bucket.count}`);
            }
            
            const infLabels = { ...labels, le: '+Inf' };
            lines.push(`${name}_bucket${this.formatLabels(infLabels)} ${histogram.count}`);
            lines.push(`${name}_sum${this.formatLabels(labels)} ${histogram.sum}`);
            lines.push(`${name}_count${this.formatLabels(labels)} ${histogram.count}`);
          }
        }
      }
    }

    return lines.join('\n') + '\n';
  }

  private keyToLabels(key: string): Record<string, string> {
    const labels: Record<string, string> = {};
    if (!key) return labels;
    
    for (const part of key.split(',')) {
      const [k, v] = part.split('=');
      if (k && v) labels[k] = v;
    }
    return labels;
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels);
    if (entries.length === 0) return '';
    
    const labelStr = entries.map(([k, v]) => `${k}="${v}"`).join(',');
    return `{${labelStr}}`;
  }

  getMetricsSnapshot(): Record<string, unknown> {
    return {
      counters: Object.fromEntries(this.counters),
      gauges: Object.fromEntries(this.gauges),
      histograms: Object.fromEntries(this.histograms),
      vmMetrics: Object.fromEntries(this.vmMetrics),
    };
  }
}

export function createMetricsCollector(config?: MetricsCollectorConfig): MetricsCollector {
  return new MetricsCollector(config);
}

export default MetricsCollector;
