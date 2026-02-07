/**
 * Memory Manager Tests
 *
 * Comprehensive tests for MemoryManager and ObjectPool
 */

import {
  MemoryManager,
  ObjectPool,
  getMemoryManager,
  resetMemoryManager,
  createBufferPool,
  monitorMemoryUsage,
} from '../../src/utils/memory-manager';

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('MemoryManager', () => {
  let manager: MemoryManager;

  beforeEach(() => {
    resetMemoryManager();
    manager = new MemoryManager({
      enableMonitoring: false,
      enableAutoCleanup: false,
    });
  });

  afterEach(() => {
    manager.shutdown();
    resetMemoryManager();
  });

  describe('constructor', () => {
    it('should create with default config', () => {
      const mm = new MemoryManager();
      expect(mm).toBeDefined();
      mm.shutdown();
    });

    it('should create with custom config', () => {
      const mm = new MemoryManager({
        memoryThreshold: 90,
        memoryLimitMB: 2048,
      });
      expect(mm).toBeDefined();
      mm.shutdown();
    });

    it('should start monitoring when enabled', () => {
      const mm = new MemoryManager({
        enableMonitoring: true,
        monitoringIntervalMs: 1000,
      });
      expect(mm).toBeDefined();
      mm.shutdown();
    });

    it('should start auto cleanup when enabled', () => {
      const mm = new MemoryManager({
        enableAutoCleanup: true,
        cleanupIntervalMs: 1000,
      });
      expect(mm).toBeDefined();
      mm.shutdown();
    });
  });

  describe('snapshot', () => {
    it('should take memory snapshot', () => {
      const snapshot = manager.snapshot();

      expect(snapshot).toHaveProperty('timestamp');
      expect(snapshot).toHaveProperty('heapUsed');
      expect(snapshot).toHaveProperty('heapTotal');
      expect(snapshot).toHaveProperty('external');
      expect(snapshot).toHaveProperty('rss');
      expect(snapshot).toHaveProperty('arrayBuffers');
      expect(snapshot).toHaveProperty('percentUsed');
    });

    it('should have valid numeric values', () => {
      const snapshot = manager.snapshot();

      expect(typeof snapshot.timestamp).toBe('number');
      expect(typeof snapshot.heapUsed).toBe('number');
      expect(typeof snapshot.percentUsed).toBe('number');
      expect(snapshot.heapUsed).toBeGreaterThanOrEqual(0);
      expect(snapshot.percentUsed).toBeGreaterThanOrEqual(0);
      expect(snapshot.percentUsed).toBeLessThanOrEqual(100);
    });

    it('should store snapshots in history', () => {
      manager.snapshot();
      manager.snapshot();
      manager.snapshot();

      const history = manager.getHistory();
      expect(history.length).toBe(3);
    });

    it('should limit history size', () => {
      // Take more than 100 snapshots
      for (let i = 0; i < 110; i++) {
        manager.snapshot();
      }

      const history = manager.getHistory();
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getHistory', () => {
    it('should return empty array initially', () => {
      const history = manager.getHistory();
      expect(history).toEqual([]);
    });

    it('should return copy of history', () => {
      manager.snapshot();
      const history1 = manager.getHistory();
      const history2 = manager.getHistory();
      expect(history1).not.toBe(history2);
      expect(history1).toEqual(history2);
    });
  });

  describe('getCurrentUsage', () => {
    it('should return current memory snapshot', () => {
      const usage = manager.getCurrentUsage();
      expect(usage).toHaveProperty('heapUsed');
      expect(usage).toHaveProperty('percentUsed');
    });
  });

  describe('cleanup handlers', () => {
    it('should register cleanup handler', () => {
      const handler = jest.fn();
      manager.onCleanup(handler);
      manager.runCleanup();
      expect(handler).toHaveBeenCalled();
    });

    it('should unregister cleanup handler', () => {
      const handler = jest.fn();
      manager.onCleanup(handler);
      manager.offCleanup(handler);
      manager.runCleanup();
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle multiple cleanup handlers', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      manager.onCleanup(handler1);
      manager.onCleanup(handler2);
      manager.runCleanup();
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });

    it('should continue if handler throws', () => {
      const errorHandler = jest.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = jest.fn();
      manager.onCleanup(errorHandler);
      manager.onCleanup(successHandler);
      manager.runCleanup();
      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
    });
  });

  describe('object pools', () => {
    it('should create object pool', () => {
      const pool = manager.getPool('test', {
        initialSize: 5,
        maxSize: 10,
        factory: () => ({ id: Math.random() }),
      });

      expect(pool).toBeDefined();
      const stats = pool.getStats();
      expect(stats.available).toBe(5);
    });

    it('should return existing pool', () => {
      const pool1 = manager.getPool('shared', {
        initialSize: 2,
        maxSize: 5,
        factory: () => ({}),
      });
      const pool2 = manager.getPool('shared', {
        initialSize: 10,
        maxSize: 50,
        factory: () => ({}),
      });

      expect(pool1).toBe(pool2);
      const stats = pool1.getStats();
      expect(stats.available).toBe(2); // Original config
    });

    it('should get pool stats', () => {
      manager.getPool('pool1', {
        initialSize: 3,
        maxSize: 10,
        factory: () => ({}),
      });
      manager.getPool('pool2', {
        initialSize: 5,
        maxSize: 20,
        factory: () => ({}),
      });

      const stats = manager.getPoolStats();
      expect(stats).toHaveProperty('pool1');
      expect(stats).toHaveProperty('pool2');
      expect(stats.pool1.available).toBe(3);
      expect(stats.pool2.available).toBe(5);
    });
  });

  describe('forceGC', () => {
    it('should not throw when gc not available', () => {
      expect(() => manager.forceGC()).not.toThrow();
    });
  });

  describe('detectLeaks', () => {
    it('should return empty array with no history', () => {
      const leaks = manager.detectLeaks();
      expect(leaks).toEqual([]);
    });

    it('should return empty array with few snapshots', () => {
      manager.snapshot();
      manager.snapshot();
      manager.snapshot();
      const leaks = manager.detectLeaks();
      expect(leaks).toEqual([]);
    });

    it('should detect heap growth', () => {
      // Create fake snapshots with growth
      const baseTime = Date.now();
      for (let i = 0; i < 5; i++) {
        const snapshot = {
          timestamp: baseTime + i * 60000, // 1 minute apart
          heapUsed: 100 + i * 60, // Growing 60MB per minute (>50 = high)
          heapTotal: 500,
          external: 10,
          rss: 200 + i * 50,
          arrayBuffers: 0,
          percentUsed: 30 + i * 10,
        };
        (manager as any).snapshots.push(snapshot);
      }

      const leaks = manager.detectLeaks();
      expect(leaks.length).toBeGreaterThan(0);
      const heapLeak = leaks.find((l) => l.type === 'heap');
      expect(heapLeak).toBeDefined();
      expect(heapLeak?.severity).toBe('high');
    });
  });

  describe('shutdown', () => {
    it('should clean up timers', () => {
      const mm = new MemoryManager({
        enableMonitoring: true,
        enableAutoCleanup: true,
      });
      mm.shutdown();
      expect(mm).toBeDefined();
    });

    it('should clear pools', () => {
      manager.getPool('test', {
        initialSize: 5,
        maxSize: 10,
        factory: () => ({}),
      });
      manager.shutdown();
      // After shutdown, new pool should be created fresh
      const newManager = new MemoryManager({
        enableMonitoring: false,
        enableAutoCleanup: false,
      });
      const pool = newManager.getPool('test', {
        initialSize: 3,
        maxSize: 5,
        factory: () => ({}),
      });
      expect(pool.getStats().available).toBe(3);
      newManager.shutdown();
    });
  });

  describe('event emission', () => {
    it('should emit warning on high memory', () => {
      const mm = new MemoryManager({
        enableMonitoring: false,
        memoryThreshold: 1, // Very low threshold
      });

      const warningHandler = jest.fn();
      mm.on('warning', warningHandler);

      mm.snapshot(); // Should trigger warning

      expect(warningHandler).toHaveBeenCalled();
      mm.shutdown();
    });
  });
});

describe('ObjectPool', () => {
  describe('constructor', () => {
    it('should create pool with initial size', () => {
      const pool = new ObjectPool({
        initialSize: 5,
        maxSize: 10,
        factory: () => ({ id: Math.random() }),
      });

      const stats = pool.getStats();
      expect(stats.available).toBe(5);
      expect(stats.created).toBe(5);
    });

    it('should handle small initial size', () => {
      const pool = new ObjectPool({
        initialSize: 1,
        maxSize: 10,
        factory: () => ({}),
      });

      const stats = pool.getStats();
      expect(stats.available).toBe(1);
      expect(stats.created).toBe(1);
    });
  });

  describe('acquire', () => {
    it('should acquire from available', () => {
      const pool = new ObjectPool({
        initialSize: 3,
        maxSize: 5,
        factory: () => ({ value: Math.random() }),
      });

      const obj = pool.acquire();
      expect(obj).toBeDefined();

      const stats = pool.getStats();
      expect(stats.available).toBe(2);
      expect(stats.inUse).toBe(1);
    });

    it('should create new when pool exhausted', () => {
      const pool = new ObjectPool({
        initialSize: 1,
        maxSize: 3,
        factory: () => ({ id: Math.random() }),
      });

      pool.acquire();
      pool.acquire(); // Create new

      const stats = pool.getStats();
      expect(stats.created).toBe(2);
    });

    it('should throw when max size reached', () => {
      const pool = new ObjectPool({
        initialSize: 1,
        maxSize: 2,
        factory: () => ({}),
      });

      pool.acquire();
      pool.acquire();

      expect(() => pool.acquire()).toThrow('Object pool exhausted');
    });

    it('should validate objects before reuse', () => {
      let counter = 0;
      const pool = new ObjectPool({
        initialSize: 2,
        maxSize: 5,
        factory: () => ({ id: ++counter, valid: true }),
        validate: (obj) => obj.valid,
      });

      const obj1 = pool.acquire();
      obj1.valid = false; // Mark as invalid
      pool.release(obj1);

      const obj2 = pool.acquire();
      expect(obj2.valid).toBe(true); // Should get new object
    });

    it('should track reuse stats', () => {
      const pool = new ObjectPool({
        initialSize: 2,
        maxSize: 5,
        factory: () => ({}),
      });

      // Acquire from initial pool counts as reuse
      const obj = pool.acquire();
      pool.release(obj);
      // Second acquire from available also counts as reuse
      pool.acquire();

      const stats = pool.getStats();
      // 2 created (initial pool), 2 reused (both acquires)
      expect(stats.reused).toBe(2);
      expect(stats.reuseRate).toBeGreaterThan(0);
    });
  });

  describe('release', () => {
    it('should return object to pool', () => {
      const pool = new ObjectPool({
        initialSize: 2,
        maxSize: 5,
        factory: () => ({}),
      });

      const obj = pool.acquire();
      pool.release(obj);

      const stats = pool.getStats();
      expect(stats.available).toBe(2);
      expect(stats.inUse).toBe(0);
    });

    it('should reset object before returning', () => {
      const resetFn = jest.fn();
      const pool = new ObjectPool({
        initialSize: 2,
        maxSize: 5,
        factory: () => ({ data: 'initial' }),
        reset: resetFn,
      });

      const obj = pool.acquire();
      pool.release(obj);

      expect(resetFn).toHaveBeenCalledWith(obj);
    });

    it('should ignore objects not in use', () => {
      const pool = new ObjectPool({
        initialSize: 2,
        maxSize: 5,
        factory: () => ({}),
      });

      const externalObj = {};
      pool.release(externalObj); // Should not throw

      const stats = pool.getStats();
      expect(stats.available).toBe(2);
    });

    it('should handle double release', () => {
      const pool = new ObjectPool({
        initialSize: 2,
        maxSize: 5,
        factory: () => ({}),
      });

      const obj = pool.acquire();
      pool.release(obj);
      pool.release(obj); // Double release

      const stats = pool.getStats();
      expect(stats.inUse).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const pool = new ObjectPool({
        initialSize: 5,
        maxSize: 10,
        factory: () => ({}),
      });

      const stats = pool.getStats();
      expect(stats).toHaveProperty('available');
      expect(stats).toHaveProperty('inUse');
      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('created');
      expect(stats).toHaveProperty('reused');
      expect(stats).toHaveProperty('destroyed');
      expect(stats).toHaveProperty('reuseRate');
    });

    it('should calculate reuse rate correctly', () => {
      const pool = new ObjectPool({
        initialSize: 1,
        maxSize: 5,
        factory: () => ({}),
      });

      const obj = pool.acquire(); // From initial pool, counts as reuse
      pool.release(obj);
      pool.acquire(); // From available, counts as reuse

      const stats = pool.getStats();
      // 1 created (initial pool), 2 reused (both acquires from available)
      // reuseRate = reused / (reused + created) = 2 / (2 + 1) ≈ 0.67
      expect(stats.reuseRate).toBeCloseTo(0.67, 2);
    });

    it('should handle high reuse rate', () => {
      const pool = new ObjectPool({
        initialSize: 5,
        maxSize: 10,
        factory: () => ({}),
      });

      // Acquire and release all items multiple times
      const objs = [];
      for (let i = 0; i < 5; i++) {
        objs.push(pool.acquire());
      }
      for (const obj of objs) {
        pool.release(obj);
      }
      // Acquire again - high reuse
      for (let i = 0; i < 5; i++) {
        pool.acquire();
      }

      const stats = pool.getStats();
      // 5 created initially, then 5 more reuses
      expect(stats.reuseRate).toBeGreaterThan(0);
    });
  });

  describe('clear', () => {
    it('should clear all objects', () => {
      const pool = new ObjectPool({
        initialSize: 5,
        maxSize: 10,
        factory: () => ({}),
      });

      pool.acquire();
      pool.acquire();
      pool.clear();

      const stats = pool.getStats();
      expect(stats.available).toBe(0);
      expect(stats.inUse).toBe(0);
    });
  });
});

describe('Singleton functions', () => {
  beforeEach(() => {
    resetMemoryManager();
  });

  afterEach(() => {
    resetMemoryManager();
  });

  describe('getMemoryManager', () => {
    it('should create singleton instance', () => {
      const mm1 = getMemoryManager();
      const mm2 = getMemoryManager();
      expect(mm1).toBe(mm2);
    });

    it('should use config on first creation', () => {
      const mm = getMemoryManager({ memoryThreshold: 95 });
      expect(mm).toBeDefined();
    });
  });

  describe('resetMemoryManager', () => {
    it('should reset singleton', () => {
      const mm1 = getMemoryManager();
      resetMemoryManager();
      const mm2 = getMemoryManager();
      expect(mm1).not.toBe(mm2);
    });

    it('should not throw if no instance', () => {
      resetMemoryManager();
      expect(() => resetMemoryManager()).not.toThrow();
    });
  });
});

describe('Utility functions', () => {
  beforeEach(() => {
    resetMemoryManager();
  });

  afterEach(() => {
    resetMemoryManager();
  });

  describe('createBufferPool', () => {
    it('should create buffer pool', () => {
      const pool = createBufferPool(1024, 5);
      expect(pool).toBeDefined();

      const buf = pool.acquire();
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(1024);
    });

    it('should reset buffer on release', () => {
      const pool = createBufferPool(10, 2);
      const buf = pool.acquire();
      buf.fill(1);
      pool.release(buf);

      const buf2 = pool.acquire();
      // Buffer should be zeroed
      expect(buf2.every((b) => b === 0)).toBe(true);
    });
  });

  describe('monitorMemoryUsage', () => {
    it('should execute function and log', () => {
      const fn = jest.fn();
      expect(() => monitorMemoryUsage(fn, 'test')).not.toThrow();
      expect(fn).toHaveBeenCalled();
    });

    it('should handle function that allocates memory', () => {
      const fn = () => {
        const arr = new Array(1000000).fill('x');
        return arr;
      };
      expect(() => monitorMemoryUsage(fn, 'allocation-test')).not.toThrow();
    });
  });
});
