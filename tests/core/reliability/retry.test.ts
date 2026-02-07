/**
 * Retry Utility Tests
 *
 * Tests for exponential backoff retry mechanism.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  RetryManager,
  withRetry,
  createRetryable,
  calculateBackoffDelay,
  RetryPolicies,
} from '../../../src/core/reliability/retry';

describe('Core Reliability: Retry', () => {
  describe('calculateBackoffDelay', () => {
    it('should calculate exponential delay', () => {
      const options = {
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        useJitter: false,
        jitterFactor: 0.1,
      };

      expect(calculateBackoffDelay(0, options)).toBe(1000);
      expect(calculateBackoffDelay(1, options)).toBe(2000);
      expect(calculateBackoffDelay(2, options)).toBe(4000);
      expect(calculateBackoffDelay(3, options)).toBe(8000);
    });

    it('should cap delay at maxDelayMs', () => {
      const options = {
        initialDelayMs: 10000,
        maxDelayMs: 15000,
        backoffMultiplier: 2,
        useJitter: false,
        jitterFactor: 0.1,
      };

      expect(calculateBackoffDelay(0, options)).toBe(10000);
      expect(calculateBackoffDelay(1, options)).toBe(15000); // capped
      expect(calculateBackoffDelay(2, options)).toBe(15000); // capped
    });

    it('should add jitter when enabled', () => {
      const options = {
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
        useJitter: true,
        jitterFactor: 0.1,
      };

      const delays: number[] = [];
      for (let i = 0; i < 100; i++) {
        delays.push(calculateBackoffDelay(0, options));
      }

      // All delays should be within jitter range
      const baseDelay = 1000;
      const jitterRange = baseDelay * 0.1;

      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(baseDelay - jitterRange);
        expect(delay).toBeLessThanOrEqual(baseDelay + jitterRange);
      });
    });
  });

  describe('RetryManager', () => {
    let manager: RetryManager;

    beforeEach(() => {
      manager = new RetryManager({
        maxRetries: 3,
        initialDelayMs: 10,
        useJitter: false,
      });
    });

    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await manager.execute(operation, 'test-op');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT: Connection timed out'))
        .mockRejectedValueOnce(new Error('ECONNRESET: Connection reset'))
        .mockResolvedValue('success');

      const result = await manager.execute(operation, 'test-op');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries exceeded', async () => {
      const error = new Error('ETIMEDOUT: Persistent connection failure');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(manager.execute(operation, 'test-op')).rejects.toThrow('Persistent connection failure');
      expect(operation).toHaveBeenCalledTimes(4); // initial + 3 retries
    });

    it('should not retry non-retryable errors', async () => {
      const managerWithFilter = new RetryManager({
        maxRetries: 3,
        retryableErrorFilter: (err) => err.message.includes('transient'),
      });

      const error = new Error('Fatal error');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(managerWithFilter.execute(operation, 'test-op')).rejects.toThrow('Fatal error');
      expect(operation).toHaveBeenCalledTimes(1); // no retries
    });

    it('should call onRetry callback', async () => {
      const onRetry = jest.fn();
      const managerWithCallback = new RetryManager({
        maxRetries: 2,
        initialDelayMs: 10,
        useJitter: false,
        onRetry,
      });

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT: transient error'))
        .mockResolvedValue('success');

      await managerWithCallback.execute(operation, 'test-op');

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Number),
        expect.objectContaining({ message: 'ETIMEDOUT: transient error' })
      );
    });

    it('should call onFailed callback on final failure', async () => {
      const onFailed = jest.fn();
      const managerWithCallback = new RetryManager({
        maxRetries: 1,
        onFailed,
      });

      const error = new Error('ECONNREFUSED: connection refused');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(managerWithCallback.execute(operation, 'test-op')).rejects.toThrow();

      expect(onFailed).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'ECONNREFUSED: connection refused' }),
        2
      );
    });

    it('should emit success event', async () => {
      const successListener = jest.fn();
      manager.on('success', successListener);

      const operation = jest.fn().mockResolvedValue('success');
      await manager.execute(operation, 'test-op');

      expect(successListener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-op',
        attempt: 0,
      }));
    });

    it('should emit retry event', async () => {
      const retryListener = jest.fn();
      manager.on('retry', retryListener);

      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT: connection timed out'))
        .mockResolvedValue('success');

      await manager.execute(operation, 'test-op');

      expect(retryListener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-op',
        attempt: 1,
        delay: expect.any(Number),
      }));
    });

    it('should emit failed event', async () => {
      const failedListener = jest.fn();
      manager.on('failed', failedListener);

      const error = new Error('ECONNREFUSED: connection refused');
      const operation = jest.fn().mockRejectedValue(error);

      await expect(manager.execute(operation, 'test-op')).rejects.toThrow();

      expect(failedListener).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-op',
        attempts: 4,
      }));
    });

    it('should track stats', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT: connection timeout'))
        .mockResolvedValue('success');

      await manager.execute(operation, 'test-op');

      const stats = manager.getStats('test-op');
      expect(stats).toMatchObject({
        attempts: 2,
        success: true,
      });
      expect(stats?.totalDelayMs).toBeGreaterThan(0);
    });
  });

  describe('withRetry helper', () => {
    it('should wrap operation with retry', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const result = await withRetry(operation, {
        maxRetries: 2,
        initialDelayMs: 10,
        useJitter: false,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRetryable', () => {
    it('should create a retryable function', async () => {
      const fn = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockResolvedValue('success');

      const retryableFn = createRetryable(fn, {
        maxRetries: 2,
        initialDelayMs: 10,
        useJitter: false,
      });

      const result = await retryableFn('arg1', 'arg2');

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
    });
  });

  describe('RetryPolicies', () => {
    it('should provide aggressive policy', () => {
      const policy = RetryPolicies.aggressive();
      expect(policy.maxRetries).toBe(5);
      expect(policy.initialDelayMs).toBe(100);
    });

    it('should provide conservative policy', () => {
      const policy = RetryPolicies.conservative();
      expect(policy.maxRetries).toBe(2);
      expect(policy.initialDelayMs).toBe(2000);
    });

    it('should provide linear policy', () => {
      const policy = RetryPolicies.linear();
      expect(policy.backoffMultiplier).toBe(1);
      expect(policy.useJitter).toBe(false);
    });

    it('should provide fast policy', () => {
      const policy = RetryPolicies.fast();
      expect(policy.maxRetries).toBe(3);
      expect(policy.maxDelayMs).toBe(1000);
    });

    it('should provide none policy', () => {
      const policy = RetryPolicies.none();
      expect(policy.maxRetries).toBe(0);
    });
  });
});
