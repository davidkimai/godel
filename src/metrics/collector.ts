import { FastifyInstance } from 'fastify';

interface Metric {
  name: string;
  value: number;
  tags?: Record<string, string>;
  timestamp?: number;
}

interface CounterMetric {
  type: 'counter';
  value: number;
  tags?: Record<string, string>;
}

interface GaugeMetric {
  type: 'gauge';
  value: number;
  tags?: Record<string, string>;
}

interface HistogramMetric {
  type: 'histogram';
  value: number;
  tags?: Record<string, string>;
  buckets?: number[];
}

type MetricValue = CounterMetric | GaugeMetric | HistogramMetric;

class MetricsCollector {
  private metrics: Map<string, MetricValue> = new Map();
  private requestCounts: Map<string, number> = new Map();
  private responseTimes: number[] = [];
  private maxHistorySize = 1000;

  incrementCounter(name: string, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    const existing = this.metrics.get(key);
    if (existing && existing.type === 'counter') {
      existing.value += 1;
    } else {
      this.metrics.set(key, { type: 'counter', value: 1, tags });
    }
  }

  setGauge(name: string, value: number, tags?: Record<string, string>): void {
    const key = this.buildKey(name, tags);
    this.metrics.set(key, { type: 'gauge', value, tags });
  }

  recordHistogram(name: string, value: number, tags?: Record<string, string>, buckets?: number[]): void {
    const key = this.buildKey(name, tags);
    this.metrics.set(key, { type: 'histogram', value, tags, buckets });
  }

  recordRequest(method: string, route: string, statusCode: number, duration: number): void {
    const key = `${method}:${route}:${Math.floor(statusCode / 100)}xx`;
    this.requestCounts.set(key, (this.requestCounts.get(key) || 0) + 1);
    this.responseTimes.push(duration);
    if (this.responseTimes.length > this.maxHistorySize) {
      this.responseTimes.shift();
    }
  }

  private buildKey(name: string, tags?: Record<string, string>): string {
    if (!tags) return name;
    const tagString = Object.entries(tags)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    return `${name}{${tagString}}`;
  }

  getAllMetrics(): Record<string, MetricValue> {
    return Object.fromEntries(this.metrics);
  }

  getCounter(name: string): number {
    const metric = this.metrics.get(name);
    return metric?.type === 'counter' ? metric.value : 0;
  }

  getGauge(name: string): number {
    const metric = this.metrics.get(name);
    return metric?.type === 'gauge' ? metric.value : 0;
  }

  getHistogram(name: string): { min: number; max: number; avg: number; count: number } | null {
    const values = this.responseTimes;
    if (values.length === 0) return null;
    const sum = values.reduce((a, b) => a + b, 0);
    return {
      min: Math.min(...values),
      max: Math.max(...values),
      avg: sum / values.length,
      count: values.length,
    };
  }

  getRequestStats(): Record<string, number> {
    return Object.fromEntries(this.requestCounts);
  }

  reset(): void {
    this.metrics.clear();
    this.requestCounts.clear();
    this.responseTimes = [];
  }
}

export const metricsCollector = new MetricsCollector();

export function setupMetricsPlugin(fastify: FastifyInstance): void {
  fastify.addHook('onRequest', async (request) => {
    (request as any).startTime = Date.now();
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const startTime = (request as any).startTime;
    if (startTime) {
      const duration = Date.now() - startTime;
      const route = (request as any).routeBase?.opts?.url || request.url || 'unknown';
      metricsCollector.recordRequest(request.method || 'UNKNOWN', route, reply.statusCode, duration);
    }
  });
}

export async function metricsRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/metrics', async (_request, reply) => {
    const allMetrics = metricsCollector.getAllMetrics();
    const requestStats = metricsCollector.getRequestStats();
    const histogram = metricsCollector.getHistogram('response_time');

    const output: Record<string, any> = {
      counters: allMetrics,
      requests: requestStats,
      responseTime: histogram,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString(),
    };

    reply.send(output);
  });

  fastify.get('/metrics/counters', async (_request, reply) => {
    reply.send(metricsCollector.getAllMetrics());
  });

  fastify.get('/metrics/requests', async (_request, reply) => {
    reply.send(metricsCollector.getRequestStats());
  });
}
