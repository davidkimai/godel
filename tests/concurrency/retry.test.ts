/**
 * Retry Function Tests
 * 
 * Tests for the retry() function with exponential backoff:
 * - Successful first attempt
 * - Success after retries
 * - Max retries exhausted
 * - Non-retryable errors
 */

import { retry, RetryConfig, RetryResult, DEFAULT_RETRY_CONFIG } from '../../src/concurrency/retry';

describe('retry()', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('successful first attempt', () => {
    it('should return success on first try', async () => {
      const operation = jest.fn().mockResolvedValue('success');
      
      const result = await retry(operation);
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.attempts).toBe(1);
      expect(result.error).toBeUndefined();
    });

    it('should call operation exactly once', async () => {
      const operation = jest.fn().mockResolvedValue('done');
      
      await retry(operation);
      
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  describe('success after retries', () => {
    it('should retry and succeed on subsequent attempt', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          // Use ECONNRESET to make it retryable
          const error = new Error('temporary failure') as any;
          error.code = 'ECONNRESET';
          return Promise.reject(error);
        }
        return Promise.resolve('eventual success');
      });
      
      const result = await retry(operation, { 
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 1000,
        jitterFactor: 0,
        backoffMultiplier: 1,
        retryableErrors: ['ECONNRESET']
      });
      
      expect(result.success).toBe(true);
      expect(result.data).toBe('eventual success');
      expect(result.attempts).toBe(3);
    });

    it('should respect maxAttempts limit', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('always fails'));
      
      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.attempts).toBe(3);
      expect(result.finalAttempt).toBe(true);
    });
  });

  describe('exponential backoff', () => {
    it('should increase delay between retries', async () => {
      const delays: number[] = [];
      const operation = jest.fn().mockImplementation(() => {
        const delay = Date.now();
        delays.push(delay);
        if (delays.length < 3) {
          return Promise.reject(new Error('retry'));
        }
        return Promise.resolve('success');
      });

      const startTime = Date.now();
      const result = await retry(operation, {
        baseDelay: 100,
        maxDelay: 1000,
        jitterFactor: 0,
        backoffMultiplier: 2
      });
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(true);
      // Total time should be approximately: 100 + 200 = 300ms (with some tolerance)
      expect(totalTime).toBeGreaterThanOrEqual(250);
    });

    it('should not exceed maxDelay', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('fails'));

      const startTime = Date.now();
      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 1000,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 10
      });
      const totalTime = Date.now() - startTime;

      expect(result.success).toBe(false);
      // Should not exceed 3 * maxDelay = 300ms
      expect(totalTime).toBeLessThan(400);
    });
  });

  describe('retryable errors', () => {
    it('should retry on 5xx status codes', async () => {
      const error = { status: 503, message: 'Service Unavailable' };
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(error);
        }
        return Promise.resolve('success');
      });

      const result = await retry(operation, {
        retryableStatuses: [500, 502, 503, 504],
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should not retry on 4xx status codes', async () => {
      const error = { status: 400, message: 'Bad Request' };
      const operation = jest.fn().mockRejectedValue(error);

      const result = await retry(operation, {
        retryableStatuses: [500, 502, 503, 504],
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });

    it('should retry on ECONNREFUSED', async () => {
      const error = { code: 'ECONNREFUSED', message: 'Connection refused' };
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(error);
        }
        return Promise.resolve('connected');
      });

      const result = await retry(operation, {
        retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'],
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });

    it('should retry on timeout errors', async () => {
      let attempts = 0;
      const error = new Error('Request timeout') as any;
      error.code = 'ETIMEDOUT';  // Make it retryable
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 2) {
          return Promise.reject(error);
        }
        return Promise.resolve('done');
      });

      const result = await retry(operation, {
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(true);
      expect(result.attempts).toBe(2);
    });
  });

  describe('non-retryable errors', () => {
    it('should not retry on 403 Forbidden', async () => {
      const error = { status: 403, message: 'Forbidden' };
      const operation = jest.fn().mockRejectedValue(error);

      const result = await retry(operation, {
        retryableStatuses: [429, 500, 502, 503, 504],
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
      expect(result.finalAttempt).toBe(true);
    });

    it('should not retry on validation errors', async () => {
      const error = { message: 'Invalid input format' };
      const operation = jest.fn().mockRejectedValue(error);

      const result = await retry(operation, {
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(false);
      expect(result.attempts).toBe(1);
    });
  });

  describe('timing', () => {
    it('should track total time', async () => {
      const operation = jest.fn().mockResolvedValue('quick success');

      const startTime = Date.now();
      const result = await retry(operation);
      const totalTime = Date.now() - startTime;

      expect(result.totalTime).toBeGreaterThanOrEqual(0);
      expect(result.totalTime).toBeLessThanOrEqual(totalTime + 10); // Small tolerance
    });

    it('should set finalAttempt on last try', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('always fails'));

      const result = await retry(operation, {
        maxAttempts: 3,
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.finalAttempt).toBe(true);
    });

    it('should not set finalAttempt on successful retry', async () => {
      let attempts = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('fails'));
        }
        return Promise.resolve('success');
      });

      const result = await retry(operation, {
        maxAttempts: 5,
        baseDelay: 10,
        maxDelay: 100,
        jitterFactor: 0,
        backoffMultiplier: 1
      });

      expect(result.success).toBe(true);
      expect(result.finalAttempt).toBe(false);
    });
  });
});
