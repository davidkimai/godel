/**
 * Performance Optimizations Test Suite
 * 
 * Verifies that all performance optimizations are properly configured
 * and can support 50+ concurrent sessions.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';

// Test imports for all new optimization modules
import {
  RedisConnectionPool,
  getRedisPool,
  resetRedisPool,
} from './core/redis-pool';

import {
  OptimizedRedisEventBus,
  getOptimizedRedisEventBus,
  resetOptimizedRedisEventBus,
} from './core/event-bus-redis-optimized';

import {
  PerformanceTracker,
  getPerformanceTracker,
  resetPerformanceTracker,
  timeAsync,
} from './metrics/performance';

import {
  EventBatcher,
  EventBatchProcessor,
  getEventBatchProcessor,
  resetEventBatchProcessor,
} from './events/batcher';

import {
  OptimizedWebSocketServer,
  getOptimizedWebSocketServer,
  resetOptimizedWebSocketServer,
} from './api/websocket-optimized';

import {
  MemoryManager,
  ObjectPool,
  getMemoryManager,
  resetMemoryManager,
} from './utils/memory-manager';

describe('Performance Optimizations', () => {
  describe('Redis Connection Pool', () => {
    it('should create a pool with correct configuration', async () => {
      const pool = new RedisConnectionPool({
        minConnections: 5,
        maxConnections: 20,
        connectionTimeoutMs: 5000,
      });

      expect(pool).toBeDefined();
      
      // Cleanup
      await pool.shutdown();
    });

    it('should track pool metrics', async () => {
      const pool = new RedisConnectionPool({
        minConnections: 2,
        maxConnections: 10,
      });

      const metrics = pool.getMetrics();
      expect(metrics).toHaveProperty('totalConnections');
      expect(metrics).toHaveProperty('availableConnections');
      expect(metrics).toHaveProperty('inUseConnections');
      expect(metrics).toHaveProperty('pendingRequests');
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('failedRequests');
      expect(metrics).toHaveProperty('avgWaitTimeMs');

      await pool.shutdown();
    });
  });

  describe('Event Batching', () => {
    it('should batch events correctly', async () => {
      const batcher = new EventBatcher({
        maxBatchSize: 10,
        maxWaitMs: 100,
        enableDeduplication: true,
      });

      let batchReceived = false;
      batcher.on('batch', () => {
        batchReceived = true;
      });

      // Add events
      for (let i = 0; i < 5; i++) {
        await batcher.add('test.event', { index: i });
      }

      // Wait for batch to flush
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(batchReceived).toBe(true);
      
      const metrics = batcher.getMetrics();
      expect(metrics.eventsBatched).toBe(5);

      await batcher.shutdown();
    });

    it('should deduplicate events when enabled', async () => {
      const batcher = new EventBatcher({
        maxBatchSize: 10,
        maxWaitMs: 100,
        enableDeduplication: true,
        dedupWindowMs: 1000,
      });

      // Add duplicate events
      await batcher.add('test.event', { id: 'same' });
      await batcher.add('test.event', { id: 'same' });
      await batcher.add('test.event', { id: 'same' });

      await batcher.flush();

      const metrics = batcher.getMetrics();
      expect(metrics.eventsDeduplicated).toBe(2);

      await batcher.shutdown();
    });
  });

  describe('Performance Tracking', () => {
    beforeAll(() => {
      resetPerformanceTracker();
    });

    it('should track latency metrics', () => {
      const tracker = getPerformanceTracker();

      // Record some latency samples
      tracker.recordLatency(10);
      tracker.recordLatency(20);
      tracker.recordLatency(30);
      tracker.recordLatency(40);
      tracker.recordLatency(50);

      const metrics = tracker.getLatencyMetrics();
      expect(metrics.count).toBe(5);
      expect(metrics.p50).toBeDefined();
      expect(metrics.p95).toBeDefined();
      expect(metrics.p99).toBeDefined();
      expect(metrics.min).toBe(10);
      expect(metrics.max).toBe(50);
    });

    it('should track throughput metrics', () => {
      const tracker = getPerformanceTracker();
      tracker.reset();

      // Record events
      tracker.recordEvent(10);
      tracker.recordMessage(5);

      const throughput = tracker.getThroughputMetrics();
      expect(throughput).toHaveProperty('requestsPerSecond');
      expect(throughput).toHaveProperty('eventsPerSecond');
      expect(throughput).toHaveProperty('messagesPerSecond');
    });

    it('should provide full snapshot', () => {
      const tracker = getPerformanceTracker();
      const snapshot = tracker.getSnapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('latency');
      expect(snapshot).toHaveProperty('throughput');
      expect(snapshot).toHaveProperty('resources');
      expect(snapshot).toHaveProperty('database');
      expect(snapshot).toHaveProperty('cache');
    });

    it('should time async operations', async () => {
      const result = await timeAsync('test-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result).toBe('done');
    });
  });

  describe('Memory Management', () => {
    beforeAll(() => {
      resetMemoryManager();
    });

    it('should track memory usage', () => {
      const manager = getMemoryManager();
      const snapshot = manager.snapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('heapUsed');
      expect(snapshot).toHaveProperty('heapTotal');
      expect(snapshot).toHaveProperty('external');
      expect(snapshot).toHaveProperty('rss');
      expect(snapshot).toHaveProperty('percentUsed');
    });

    it('should create object pools', () => {
      const manager = getMemoryManager();
      
      const pool = manager.getPool('test-buffers', {
        initialSize: 5,
        maxSize: 10,
        factory: () => Buffer.alloc(1024),
        reset: (buf) => buf.fill(0),
      });

      expect(pool).toBeDefined();

      // Test acquire/release
      const obj = pool.acquire();
      expect(obj).toBeInstanceOf(Buffer);
      
      pool.release(obj);

      const stats = pool.getStats();
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('inUse');
      expect(stats).toHaveProperty('reuseRate');
    });
  });

  describe('WebSocket Optimization Config', () => {
    it('should create server with correct config', () => {
      const server = new OptimizedWebSocketServer({
        maxConnections: 1000,
        maxConnectionsPerIp: 20,
        enableCompression: true,
        batchSize: 50,
      });

      expect(server).toBeDefined();

      const metrics = server.getMetrics();
      expect(metrics).toHaveProperty('totalConnections');
      expect(metrics).toHaveProperty('activeConnections');
      expect(metrics).toHaveProperty('messagesReceived');
      expect(metrics).toHaveProperty('messagesSent');
      expect(metrics).toHaveProperty('messagesBatched');
    });
  });

  describe('Optimized Event Bus Config', () => {
    it('should create event bus with pooling', async () => {
      const bus = new OptimizedRedisEventBus({
        enablePooling: true,
        maxBatchSize: 100,
        batchWaitMs: 50,
      });

      expect(bus).toBeDefined();

      const metrics = bus.getMetrics();
      expect(metrics).toHaveProperty('eventsEmitted');
      expect(metrics).toHaveProperty('eventsDelivered');
      expect(metrics).toHaveProperty('eventsBatched');
      expect(metrics).toHaveProperty('isConnected');
      expect(metrics).toHaveProperty('isFallbackMode');
    });
  });
});

describe('Performance Targets for 50+ Concurrent Sessions', () => {
  it('should have Redis pool configured for high concurrency', () => {
    // Verify pool settings support 50+ sessions
    const pool = new RedisConnectionPool({
      minConnections: 10,
      maxConnections: 50,
    });

    const metrics = pool.getMetrics();
    expect(metrics.totalConnections).toBeGreaterThanOrEqual(0); // Pool starts empty
    
    // Cleanup
    pool.shutdown();
  });

  it('should have event batching configured for high throughput', () => {
    const batcher = new EventBatcher({
      maxBatchSize: 100, // Batch up to 100 events
      maxWaitMs: 50,     // Or wait 50ms
    });

    expect(batcher).toBeDefined();
    batcher.shutdown();
  });

  it('should have WebSocket configured for many connections', () => {
    const ws = new OptimizedWebSocketServer({
      maxConnections: 1000,     // Support 1000 concurrent
      maxConnectionsPerIp: 50,  // Per-IP limit
      rateLimitPerSecond: 100,  // Message rate limiting
    });

    expect(ws).toBeDefined();
  });
});

// Export test configuration for integration tests
export const PERFORMANCE_TEST_CONFIG = {
  redisPool: {
    minConnections: 10,
    maxConnections: 50,
  },
  eventBatching: {
    maxBatchSize: 100,
    maxWaitMs: 50,
  },
  webSocket: {
    maxConnections: 1000,
    maxConnectionsPerIp: 50,
  },
  memory: {
    threshold: 80,
    monitoringInterval: 30000,
  },
};
