/**
 * Metrics System Tests
 * 
 * Tests for Counter, Gauge, Histogram, Registry, and Storage
 */


import {
  Counter,
  Gauge,
  Histogram,
  Summary,
  MetricsRegistry,
  InMemoryTimeSeriesStorage
} from './index.js';
import type { MetricDefinition } from './types.js';

describe('Counter', () => {
  let counter: Counter;

  beforeEach(() => {
    const def: MetricDefinition = {
      name: 'test_counter',
      type: 'counter',
      description: 'Test counter'
    };
    counter = new Counter(def);
  });

  it('should start at 0', () => {
    expect(counter.get()).toBe(0);
  });

  it('should increment by 1 by default', () => {
    counter.inc();
    expect(counter.get()).toBe(1);
  });

  it('should increment by custom amount', () => {
    counter.inc(5);
    expect(counter.get()).toBe(5);
  });

  it('should throw when decrementing', () => {
    expect(() => counter.inc(-1)).toThrow('Cannot decrement a counter');
  });

  it('should reset to 0', () => {
    counter.inc(10);
    counter.reset();
    expect(counter.get()).toBe(0);
  });
});

describe('Gauge', () => {
  let gauge: Gauge;

  beforeEach(() => {
    const def: MetricDefinition = {
      name: 'test_gauge',
      type: 'gauge',
      description: 'Test gauge'
    };
    gauge = new Gauge(def);
  });

  it('should start at 0', () => {
    expect(gauge.get()).toBe(0);
  });

  it('should set to specific value', () => {
    gauge.set(42);
    expect(gauge.get()).toBe(42);
  });

  it('should increment', () => {
    gauge.set(10);
    gauge.inc();
    expect(gauge.get()).toBe(11);
  });

  it('should decrement', () => {
    gauge.set(10);
    gauge.dec();
    expect(gauge.get()).toBe(9);
  });

  it('should increment by custom amount', () => {
    gauge.inc(5);
    expect(gauge.get()).toBe(5);
  });

  it('should decrement by custom amount', () => {
    gauge.set(10);
    gauge.dec(3);
    expect(gauge.get()).toBe(7);
  });

  it('should set to current timestamp', () => {
    const before = Date.now() / 1000;
    gauge.setToCurrentTime();
    const after = Date.now() / 1000;
    
    expect(gauge.get()).toBeGreaterThanOrEqual(before);
    expect(gauge.get()).toBeLessThanOrEqual(after);
  });

  it('should time function execution', async () => {
    const end = gauge.startTimer();
    await new Promise(resolve => setTimeout(resolve, 50));
    end();
    
    expect(gauge.get()).toBeGreaterThan(0.04);
  });
});

describe('Histogram', () => {
  let histogram: Histogram;

  beforeEach(() => {
    const def: MetricDefinition = {
      name: 'test_histogram',
      type: 'histogram',
      description: 'Test histogram',
      buckets: [0.1, 0.5, 1, 2, 5]
    };
    histogram = new Histogram(def);
  });

  it('should start with 0 observations', () => {
    expect(histogram.getCount()).toBe(0);
    expect(histogram.getSum()).toBe(0);
  });

  it('should observe values', () => {
    histogram.observe(0.5);
    histogram.observe(1.5);
    histogram.observe(2.5);
    
    expect(histogram.getCount()).toBe(3);
    expect(histogram.getSum()).toBe(4.5);
  });

  it('should track bucket counts', () => {
    histogram.observe(0.05);  // goes in 0.1 bucket
    histogram.observe(0.3);   // goes in 0.5 bucket
    histogram.observe(1.5);   // goes in 2 bucket
    histogram.observe(10);    // exceeds all buckets
    
    const buckets = histogram.getBuckets();
    expect(buckets.get(0.1)).toBe(1);
    expect(buckets.get(0.5)).toBe(2);
    expect(buckets.get(1)).toBe(2);
    expect(buckets.get(2)).toBe(3);
    expect(buckets.get(5)).toBe(3);
  });

  it('should calculate percentiles', () => {
    // Add 100 observations from 1 to 100
    for (let i = 1; i <= 100; i++) {
      histogram.observe(i);
    }
    
    expect(histogram.percentile(50)).toBe(50);   // p50
    expect(histogram.percentile(95)).toBe(95);   // p95
    expect(histogram.percentile(99)).toBe(99);   // p99
  });

  it('should calculate mean', () => {
    histogram.observe(10);
    histogram.observe(20);
    histogram.observe(30);
    
    expect(histogram.mean()).toBe(20);
  });

  it('should calculate min and max', () => {
    histogram.observe(5);
    histogram.observe(15);
    histogram.observe(10);
    
    expect(histogram.min()).toBe(5);
    expect(histogram.max()).toBe(15);
  });

  it('should calculate standard deviation', () => {
    histogram.observe(2);
    histogram.observe(4);
    histogram.observe(4);
    histogram.observe(4);
    histogram.observe(5);
    histogram.observe(5);
    histogram.observe(7);
    histogram.observe(9);
    
    const stdDev = histogram.stdDev();
    expect(stdDev).toBeGreaterThan(1.9);
    expect(stdDev).toBeLessThan(2.1);
  });

  it('should time function execution', async () => {
    const end = histogram.startTimer();
    await new Promise(resolve => setTimeout(resolve, 50));
    end();
    
    expect(histogram.getCount()).toBe(1);
    expect(histogram.getSum()).toBeGreaterThan(0.04);
  });

  it('should reset all observations', () => {
    histogram.observe(1);
    histogram.observe(2);
    histogram.reset();
    
    expect(histogram.getCount()).toBe(0);
    expect(histogram.getSum()).toBe(0);
    
    const buckets = histogram.getBuckets();
    for (const count of buckets.values()) {
      expect(count).toBe(0);
    }
  });
});

describe('Summary', () => {
  let summary: Summary;

  beforeEach(() => {
    const def: MetricDefinition = {
      name: 'test_summary',
      type: 'summary',
      description: 'Test summary',
      quantiles: [0.5, 0.9, 0.99]
    };
    summary = new Summary(def, { maxAgeSeconds: 60 });
  });

  it('should observe values', () => {
    summary.observe(1);
    summary.observe(2);
    summary.observe(3);
    
    expect(summary.getCount()).toBe(3);
    expect(summary.getSum()).toBe(6);
  });

  it('should calculate quantiles', () => {
    for (let i = 1; i <= 100; i++) {
      summary.observe(i);
    }
    
    expect(summary.quantile(0.5)).toBe(50);  // median
    expect(summary.quantile(0.9)).toBe(90);
    expect(summary.quantile(0.99)).toBe(99);
  });

  it('should time function execution', async () => {
    const end = summary.startTimer();
    await new Promise(resolve => setTimeout(resolve, 50));
    end();
    
    expect(summary.getCount()).toBe(1);
  });
});

describe('MetricsRegistry', () => {
  let registry: MetricsRegistry;

  beforeEach(() => {
    registry = new MetricsRegistry();
  });

  it('should register counter', () => {
    registry.register({
      name: 'requests',
      type: 'counter',
      description: 'Total requests'
    });
    
    expect(registry.has('requests')).toBe(true);
    registry.counter('requests').inc();
    expect(registry.counter('requests').get()).toBe(1);
  });

  it('should register gauge', () => {
    registry.register({
      name: 'queue_size',
      type: 'gauge',
      description: 'Queue size'
    });
    
    registry.gauge('queue_size').set(42);
    expect(registry.gauge('queue_size').get()).toBe(42);
  });

  it('should register histogram', () => {
    registry.register({
      name: 'latency',
      type: 'histogram',
      description: 'Request latency',
      buckets: [0.1, 0.5, 1]
    });
    
    registry.histogram('latency').observe(0.3);
    expect(registry.histogram('latency').getCount()).toBe(1);
  });

  it('should register summary', () => {
    registry.register({
      name: 'response_size',
      type: 'summary',
      description: 'Response size',
      quantiles: [0.5, 0.9]
    });
    
    registry.summary('response_size').observe(1024);
    expect(registry.summary('response_size').getCount()).toBe(1);
  });

  it('should throw when registering duplicate', () => {
    registry.register({
      name: 'requests',
      type: 'counter',
      description: 'Total requests'
    });
    
    expect(() => registry.register({
      name: 'requests',
      type: 'gauge',
      description: 'Duplicate'
    })).toThrow('Metric requests already registered');
  });

  it('should throw when accessing wrong type', () => {
    registry.register({
      name: 'requests',
      type: 'counter',
      description: 'Total requests'
    });
    
    expect(() => registry.gauge('requests')).toThrow('Gauge requests not found');
  });

  it('should throw when metric not found', () => {
    expect(() => registry.counter('nonexistent')).toThrow('Counter nonexistent not found');
  });

  it('should collect all metrics', () => {
    registry.register({ name: 'c', type: 'counter', description: 'C' });
    registry.register({ name: 'g', type: 'gauge', description: 'G' });
    
    registry.counter('c').inc();
    registry.gauge('g').set(42);
    
    const snapshots = registry.collect();
    
    expect(snapshots).toHaveLength(2);
    expect(snapshots.find(s => s.name === 'c')?.value).toBe(1);
    expect(snapshots.find(s => s.name === 'g')?.value).toBe(42);
  });

  it('should export to Prometheus format', () => {
    registry.register({ name: 'requests', type: 'counter', description: 'Requests' });
    registry.counter('requests').inc();
    
    const prom = registry.toPrometheus();
    
    expect(prom).toContain('# HELP requests Requests');
    expect(prom).toContain('# TYPE requests counter');
    expect(prom).toContain('requests 1');
  });

  it('should export histogram to Prometheus format', () => {
    registry.register({
      name: 'latency',
      type: 'histogram',
      description: 'Latency',
      buckets: [0.1, 0.5]
    });
    
    registry.histogram('latency').observe(0.3);
    
    const prom = registry.toPrometheus();
    
    expect(prom).toContain('# HELP latency Latency');
    expect(prom).toContain('# TYPE latency histogram');
    expect(prom).toContain('latency_bucket{le="0.1"} 0');
    expect(prom).toContain('latency_bucket{le="0.5"} 1');
    expect(prom).toContain('latency_bucket{le="+Inf"} 1');
    expect(prom).toContain('latency_sum 0.3');
    expect(prom).toContain('latency_count 1');
  });

  it('should export to JSON', () => {
    registry.register({ name: 'gauge', type: 'gauge', description: 'G' });
    registry.gauge('gauge').set(100);
    
    const json = registry.toJSON();
    
    expect(json).toHaveProperty('gauge');
    expect((json as Record<string, { value: number }>).gauge.value).toBe(100);
  });

  it('should apply prefix', () => {
    const prefixed = new MetricsRegistry({ prefix: 'app_' });
    
    prefixed.register({ name: 'requests', type: 'counter', description: 'R' });
    
    expect(prefixed.has('requests')).toBe(true);
    expect(prefixed.getMetricNames()).toContain('app_requests');
  });

  it('should unregister metrics', () => {
    registry.register({ name: 'temp', type: 'counter', description: 'Temp' });
    expect(registry.has('temp')).toBe(true);
    
    registry.unregister('temp');
    expect(registry.has('temp')).toBe(false);
  });

  it('should clear all metrics', () => {
    registry.register({ name: 'a', type: 'counter', description: 'A' });
    registry.register({ name: 'b', type: 'gauge', description: 'B' });
    
    registry.clear();
    
    expect(registry.getMetricNames()).toHaveLength(0);
  });

  it('should reset all metrics', () => {
    registry.register({ name: 'c', type: 'counter', description: 'C' });
    registry.register({ name: 'g', type: 'gauge', description: 'G' });
    
    registry.counter('c').inc(10);
    registry.gauge('g').set(20);
    
    registry.resetAll();
    
    expect(registry.counter('c').get()).toBe(0);
    expect(registry.gauge('g').get()).toBe(0);
  });

  it('should create helper functions', () => {
    registry.register({ name: 'c', type: 'counter', description: 'C' });
    registry.register({ name: 'g', type: 'gauge', description: 'G' });
    
    const helpers = registry.createHelpers();
    
    helpers.counter('c').inc();
    helpers.gauge('g').set(10);
    
    expect(registry.counter('c').get()).toBe(1);
    expect(registry.gauge('g').get()).toBe(10);
  });
});

describe('InMemoryTimeSeriesStorage', () => {
  let storage: InMemoryTimeSeriesStorage;

  beforeEach(() => {
    storage = new InMemoryTimeSeriesStorage();
  });

  it('should write and query single snapshot', async () => {
    const snapshot = {
      name: 'test',
      type: 'counter',
      value: 1,
      timestamp: Date.now()
    };
    
    await storage.write(snapshot);
    
    const results = await storage.query({
      metric: 'test',
      start: Date.now() - 1000,
      end: Date.now() + 1000
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(1);
  });

  it('should write batch snapshots', async () => {
    const now = Date.now();
    const snapshots = [
      { name: 'a', type: 'counter', value: 1, timestamp: now },
      { name: 'a', type: 'counter', value: 2, timestamp: now + 1 },
      { name: 'a', type: 'counter', value: 3, timestamp: now + 2 }
    ];
    
    await storage.writeBatch(snapshots);
    
    const results = await storage.query({
      metric: 'a',
      start: now - 1000,
      end: now + 1000
    });
    
    expect(results).toHaveLength(3);
  });

  it('should filter by time range', async () => {
    const now = Date.now();
    
    await storage.writeBatch([
      { name: 't', type: 'counter', value: 1, timestamp: now - 1000 },
      { name: 't', type: 'counter', value: 2, timestamp: now },
      { name: 't', type: 'counter', value: 3, timestamp: now + 1000 }
    ]);
    
    const results = await storage.query({
      metric: 't',
      start: now - 100,
      end: now + 100
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(2);
  });

  it('should filter by labels', async () => {
    const now = Date.now();
    
    await storage.writeBatch([
      { name: 't', type: 'counter', value: 1, labels: { env: 'prod' }, timestamp: now },
      { name: 't', type: 'counter', value: 2, labels: { env: 'dev' }, timestamp: now },
      { name: 't', type: 'counter', value: 3, labels: { env: 'prod' }, timestamp: now }
    ]);
    
    const results = await storage.query({
      metric: 't',
      start: now - 1000,
      end: now + 1000,
      labels: { env: 'prod' }
    });
    
    expect(results).toHaveLength(2);
  });

  it('should apply limit', async () => {
    const now = Date.now();
    
    await storage.writeBatch([
      { name: 't', type: 'counter', value: 1, timestamp: now },
      { name: 't', type: 'counter', value: 2, timestamp: now },
      { name: 't', type: 'counter', value: 3, timestamp: now }
    ]);
    
    const results = await storage.query({
      metric: 't',
      start: now - 1000,
      end: now + 1000,
      limit: 2
    });
    
    expect(results).toHaveLength(2);
  });

  it('should aggregate with avg', async () => {
    const now = Math.floor(Date.now() / 2000) * 2000; // Round to 2 second boundary
    
    await storage.writeBatch([
      { name: 't', type: 'gauge', value: 10, timestamp: now },
      { name: 't', type: 'gauge', value: 20, timestamp: now + 1000 },
      { name: 't', type: 'gauge', value: 30, timestamp: now + 2000 },
      { name: 't', type: 'gauge', value: 40, timestamp: now + 3000 }
    ]);
    
    const results = await storage.aggregate({
      metric: 't',
      start: now,
      end: now + 4000,
      function: 'avg',
      interval: 2000  // 2 second buckets
    });
    
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0].value).toBe(15);  // avg of 10, 20
    expect(results[results.length - 1].value).toBe(35);  // avg of 30, 40
  });

  it('should aggregate with sum', async () => {
    const now = Date.now();
    
    await storage.writeBatch([
      { name: 't', type: 'counter', value: 10, timestamp: now },
      { name: 't', type: 'counter', value: 20, timestamp: now + 1000 }
    ]);
    
    const results = await storage.aggregate({
      metric: 't',
      start: now - 1000,
      end: now + 5000,
      function: 'sum',
      interval: 5000
    });
    
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(30);
  });

  it('should aggregate with min/max', async () => {
    const now = Date.now();
    
    await storage.writeBatch([
      { name: 't', type: 'gauge', value: 50, timestamp: now },
      { name: 't', type: 'gauge', value: 10, timestamp: now + 500 },
      { name: 't', type: 'gauge', value: 100, timestamp: now + 1000 }
    ]);
    
    const minResult = await storage.aggregate({
      metric: 't',
      start: now - 1000,
      end: now + 5000,
      function: 'min',
      interval: 5000
    });
    
    const maxResult = await storage.aggregate({
      metric: 't',
      start: now - 1000,
      end: now + 5000,
      function: 'max',
      interval: 5000
    });
    
    expect(minResult[0].value).toBe(10);
    expect(maxResult[0].value).toBe(100);
  });

  it('should aggregate with count', async () => {
    const now = Date.now();
    
    await storage.writeBatch([
      { name: 't', type: 'counter', value: 1, timestamp: now },
      { name: 't', type: 'counter', value: 1, timestamp: now + 500 },
      { name: 't', type: 'counter', value: 1, timestamp: now + 1000 }
    ]);
    
    const results = await storage.aggregate({
      metric: 't',
      start: now - 1000,
      end: now + 5000,
      function: 'count',
      interval: 5000
    });
    
    expect(results[0].value).toBe(3);
    expect(results[0].count).toBe(3);
  });

  it('should enforce max size limit', async () => {
    const limitedStorage = new InMemoryTimeSeriesStorage({ maxSize: 3 });
    const now = Date.now();
    
    await limitedStorage.writeBatch([
      { name: 't', type: 'counter', value: 1, timestamp: now },
      { name: 't', type: 'counter', value: 2, timestamp: now + 1 },
      { name: 't', type: 'counter', value: 3, timestamp: now + 2 },
      { name: 't', type: 'counter', value: 4, timestamp: now + 3 }
    ]);
    
    expect(limitedStorage.size()).toBe(3);
  });

  it('should clear all data', async () => {
    await storage.write({
      name: 't',
      type: 'counter',
      value: 1,
      timestamp: Date.now()
    });
    
    storage.clear();
    
    expect(storage.size()).toBe(0);
  });
});

describe('Integration', () => {
  it('should collect and store metrics end-to-end', async () => {
    const registry = new MetricsRegistry();
    const storage = new InMemoryTimeSeriesStorage();
    
    // Register metrics
    registry.register({
      name: 'http_requests',
      type: 'counter',
      description: 'HTTP requests'
    });
    
    registry.register({
      name: 'latency',
      type: 'histogram',
      description: 'Latency',
      buckets: [0.1, 0.5, 1]
    });
    
    // Use metrics
    registry.counter('http_requests').inc();
    registry.counter('http_requests').inc();
    registry.histogram('latency').observe(0.3);
    
    // Collect and store
    const snapshots = registry.collect();
    await storage.writeBatch(snapshots);
    
    // Query back
    const requestCounts = await storage.query({
      metric: 'http_requests',
      start: Date.now() - 1000,
      end: Date.now() + 1000
    });
    
    expect(requestCounts).toHaveLength(1);
    expect(requestCounts[0].value).toBe(2);
  });

  it('should handle empty batch writes', async () => {
    const storage = new InMemoryTimeSeriesStorage();
    
    await expect(storage.writeBatch([])).resolves.not.toThrow();
  });
});
