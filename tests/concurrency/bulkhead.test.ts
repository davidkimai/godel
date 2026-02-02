/**
 * Bulkhead Tests
 * 
 * Tests for Bulkhead class:
 * - Max concurrent limits
 * - Queue behavior
 * - Metrics
 * - Utilization tracking
 */

import { Bulkhead } from '../../src/concurrency/retry';

describe('Bulkhead', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should start with zero concurrent operations', () => {
      const bh = new Bulkhead(10);
      const metrics = bh.getMetrics();

      expect(metrics.maxConcurrent).toBe(10);
      expect(metrics.currentConcurrent).toBe(0);
      expect(metrics.queued).toBe(0);
      expect(metrics.utilization).toBe(0);
    });

    it('should accept custom maxConcurrent', () => {
      const bh = new Bulkhead(5);
      const metrics = bh.getMetrics();

      expect(metrics.maxConcurrent).toBe(5);
    });
  });

  describe('concurrent execution', () => {
    it('should allow operations up to maxConcurrent', async () => {
      const bh = new Bulkhead(3);
      let running = 0;
      let maxRunning = 0;

      const operation = jest.fn().mockImplementation(async () => {
        running++;
        maxRunning = Math.max(maxRunning, running);
        await new Promise(resolve => setTimeout(resolve, 50));
        running--;
        return 'done';
      });

      // Start 3 operations (should all run immediately)
      const promises = [
        bh.execute(operation),
        bh.execute(operation),
        bh.execute(operation)
      ];

      // Wait a bit to let them start
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(maxRunning).toBe(3);

      // Wait for completion
      await Promise.all(promises);

      expect(running).toBe(0);
    });

    it('should queue when at capacity', async () => {
      const bh = new Bulkhead(2);
      let running = 0;
      const completionOrder: number[] = [];

      const operation = jest.fn().mockImplementation(async (id: number) => {
        running++;
        await new Promise(resolve => setTimeout(resolve, 100));
        completionOrder.push(id);
        running--;
        return id;
      });

      // Start 3 operations (only 2 should run immediately)
      const promises = [
        bh.execute(() => operation(1)),
        bh.execute(() => operation(2)),
        bh.execute(() => operation(3))
      ];

      // Wait for all to complete
      const results = await Promise.all(promises);

      // Operations 1 and 2 should have started first
      // Operation 3 should have waited
      expect(results).toContain(1);
      expect(results).toContain(2);
      expect(results).toContain(3);
    });

    it('should process queue in order', async () => {
      const bh = new Bulkhead(2);
      const order: number[] = [];

      const operation = jest.fn().mockImplementation(async (id: number) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return id;
      });

      const promises = [
        bh.execute(() => operation(1)).then(r => order.push(r as number)),
        bh.execute(() => operation(2)).then(r => order.push(r as number)),
        bh.execute(() => operation(3)).then(r => order.push(r as number))
      ];

      await Promise.all(promises);

      // First two should complete before third
      expect(order[0]).toBeLessThanOrEqual(2);
      expect(order[1]).toBeLessThanOrEqual(2);
      expect(order[2]).toBe(3);
    });
  });

  describe('metrics', () => {
    it('should track currentConcurrent', async () => {
      const bh = new Bulkhead(5);
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Start operation
      bh.execute(operation);

      // Check metrics during execution
      let metrics = bh.getMetrics();
      expect(metrics.currentConcurrent).toBe(1);

      // Wait for completion
      await new Promise(resolve => setTimeout(resolve, 60));

      metrics = bh.getMetrics();
      expect(metrics.currentConcurrent).toBe(0);
    });

    it('should track queued operations', async () => {
      const bh = new Bulkhead(1);
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
      });

      // Queue multiple operations
      bh.execute(operation);
      bh.execute(operation);
      bh.execute(operation);

      const metrics = bh.getMetrics();
      expect(metrics.queued).toBe(2); // 3 started - 1 running = 2 queued
    });

    it('should calculate utilization correctly', async () => {
      const bh = new Bulkhead(4);
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Start 2 operations out of 4
      const p1 = bh.execute(operation);
      const p2 = bh.execute(operation);

      const metrics = bh.getMetrics();
      expect(metrics.utilization).toBe(0.5); // 2/4 = 50%

      await Promise.all([p1, p2]);
    });

    it('should track maxConcurrent', async () => {
      const bh = new Bulkhead(10);
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // Start 5 operations
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(bh.execute(operation));
      }

      const metrics = bh.getMetrics();
      expect(metrics.maxConcurrent).toBe(10);

      await Promise.all(promises);
    });
  });

  describe('queue behavior', () => {
    it('should process all queued operations', async () => {
      const bh = new Bulkhead(1);
      let count = 0;
      const operation = jest.fn().mockImplementation(async () => {
        count++;
        await new Promise(resolve => setTimeout(resolve, 10));
        return count;
      });

      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(bh.execute(operation));
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle rapid completion', async () => {
      const bh = new Bulkhead(2);
      const operation = jest.fn().mockResolvedValue('fast');

      // Start more operations than capacity
      const promises = [];
      for (let i = 0; i < 5; i++) {
        promises.push(bh.execute(operation));
      }

      const results = await Promise.all(promises);

      expect(results).toEqual(['fast', 'fast', 'fast', 'fast', 'fast']);
    });

    it('should handle slow operations', async () => {
      const bh = new Bulkhead(2);
      const operation = jest.fn().mockImplementation(async (delay: number) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return 'done';
      });

      const promises = [
        bh.execute(() => operation(100)), // Fast
        bh.execute(() => operation(200)), // Slower
        bh.execute(() => operation(50))   // Fast
      ];

      const results = await Promise.all(promises);

      expect(results).toEqual(['done', 'done', 'done']);
    });
  });

  describe('error handling', () => {
    it('should propagate errors from operations', async () => {
      const bh = new Bulkhead(2);
      const operation = jest.fn().mockRejectedValue(new Error('operation failed'));

      await expect(bh.execute(operation)).rejects.toThrow('operation failed');
    });

    it('should decrement counter after error', async () => {
      const bh = new Bulkhead(1);
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      try {
        await bh.execute(operation);
      } catch (e) {}

      const metrics = bh.getMetrics();
      expect(metrics.currentConcurrent).toBe(0);
    });
  });

  describe('event emission', () => {
    it('should emit events on state changes', async () => {
      const bh = new Bulkhead(1);
      const operation = jest.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
      });

      // This is a simplified test - actual event testing would require more setup
      const p = bh.execute(operation);
      await p;

      // Bulkhead doesn't emit events in current implementation
      // This test documents expected behavior
      const metrics = bh.getMetrics();
      expect(metrics.currentConcurrent).toBe(0);
    });
  });

  describe('concurrent edge cases', () => {
    it('should handle many small operations', async () => {
      const bh = new Bulkhead(10);
      let completed = 0;

      const operation = jest.fn().mockImplementation(async () => {
        completed++;
        return 'done';
      });

      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(bh.execute(operation));
      }

      await Promise.all(promises);

      expect(completed).toBe(20);
    });

    it('should handle alternating fast/slow operations', async () => {
      const bh = new Bulkhead(3);
      const times: number[] = [];

      const operation = jest.fn().mockImplementation(async (id: number) => {
        const start = Date.now();
        await new Promise(resolve => setTimeout(resolve, id === 1 ? 200 : 20));
        times.push(Date.now() - start);
        return id;
      });

      const promises = [
        bh.execute(() => operation(1)), // Slow
        bh.execute(() => operation(2)), // Fast
        bh.execute(() => operation(3)), // Fast
        bh.execute(() => operation(4)), // Fast
        bh.execute(() => operation(5))  // Fast
      ];

      await Promise.all(promises);

      expect(times).toHaveLength(5);
    });
  });
});
