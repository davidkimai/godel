/**
 * Reliability Integration Tests
 *
 * Tests for the combined circuit breaker and retry integration layer.
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import {
  withCircuitBreaker,
  withRetryLogic,
  withResilience,
  getGlobalCircuitBreakerRegistry,
  resetGlobalCircuitBreakerRegistry,
  ResiliencePatterns,
  createResilientClient,
  getCircuitBreakerHealth,
  hasOpenCircuitBreakers,
} from '../../../src/core/reliability/integration';

describe('Core Reliability: Integration', () => {
  beforeEach(() => {
    resetGlobalCircuitBreakerRegistry();
  });

  describe('withCircuitBreaker', () => {
    it('should execute operation successfully', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withCircuitBreaker('test-cb', operation);

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalled();
    });

    it('should use fallback when circuit is open', async () => {
      const registry = getGlobalCircuitBreakerRegistry();
      const breaker = registry.getOrCreate({
        name: 'test-fallback',
        failureThreshold: 1,
      });

      // Open the circuit
      breaker.forceOpen();

      const operation = jest.fn().mockResolvedValue('success');
      const fallback = jest.fn().mockReturnValue('fallback-value');

      const result = await withCircuitBreaker('test-fallback', operation, {}, fallback);

      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should track circuit breaker health', async () => {
      await withCircuitBreaker('health-test', async () => 'success');

      const health = getCircuitBreakerHealth();
      expect(health.some(h => h.name === 'health-test')).toBe(true);
    });
  });

  describe('withRetryLogic', () => {
    it('should succeed on first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('success');

      const result = await withRetryLogic(operation, { maxRetries: 3 });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should retry and eventually succeed', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT'))
        .mockRejectedValueOnce(new Error('ECONNRESET'))
        .mockResolvedValue('success');

      const result = await withRetryLogic(operation, {
        maxRetries: 3,
        initialDelayMs: 10,
        useJitter: false,
      }, 'retry-test');

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should fail after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED: persistent'));

      await expect(
        withRetryLogic(operation, { maxRetries: 2 }, 'fail-test')
      ).rejects.toThrow('persistent');

      expect(operation).toHaveBeenCalledTimes(3);
    });
  });

  describe('withResilience', () => {
    it('should execute with circuit breaker and retry', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('ETIMEDOUT: transient'))
        .mockResolvedValue('success');

      const result = await withResilience(operation, {
        circuitBreakerName: 'resilience-test',
        retryOptions: { maxRetries: 2, initialDelayMs: 10 },
        enableRetry: true,
        enableCircuitBreaker: true,
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should skip retry when disabled', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED: fail'));

      await expect(
        withResilience(operation, {
          circuitBreakerName: 'no-retry-test',
          enableRetry: false,
          enableCircuitBreaker: false,
        })
      ).rejects.toThrow('fail');

      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should use provided fallback', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('ECONNREFUSED: fail'));
      const fallback = jest.fn().mockReturnValue('fallback');

      // Open circuit first to trigger fallback
      const registry = getGlobalCircuitBreakerRegistry();
      const breaker = registry.getOrCreate({ name: 'fallback-test', failureThreshold: 1 });
      breaker.forceOpen();

      const result = await withResilience(operation, {
        circuitBreakerName: 'fallback-test',
        fallback: fallback as () => string,
      });

      expect(result).toBe('fallback');
    });
  });

  describe('ResiliencePatterns', () => {
    it('should provide LLM call pattern', () => {
      const pattern = ResiliencePatterns.llmCall();
      expect(pattern.retryOptions?.maxRetries).toBe(3);
      expect(pattern.circuitBreakerConfig?.failureThreshold).toBe(5);
    });

    it('should provide database call pattern', () => {
      const pattern = ResiliencePatterns.databaseCall();
      expect(pattern.retryOptions?.maxRetries).toBe(2);
      expect(pattern.circuitBreakerConfig?.failureThreshold).toBe(10);
    });

    it('should provide external API call pattern', () => {
      const pattern = ResiliencePatterns.externalApiCall();
      expect(pattern.retryOptions?.maxRetries).toBe(5);
      expect(pattern.circuitBreakerConfig?.failureThreshold).toBe(5);
    });

    it('should provide queue operation pattern', () => {
      const pattern = ResiliencePatterns.queueOperation();
      expect(pattern.retryOptions?.maxRetries).toBe(3);
      expect(pattern.circuitBreakerConfig?.failureThreshold).toBe(3);
    });

    it('should provide critical operation pattern', () => {
      const pattern = ResiliencePatterns.critical();
      expect(pattern.retryOptions?.maxRetries).toBe(5);
      expect(pattern.circuitBreakerConfig?.failureThreshold).toBe(3);
      expect(pattern.circuitBreakerConfig?.autoRecovery).toBe(true);
    });
  });

  describe('createResilientClient', () => {
    it('should wrap all methods with resilience', async () => {
      const client = {
        get: jest.fn().mockResolvedValue('data'),
        post: jest.fn().mockRejectedValue(new Error('fail')),
      };

      const resilientClient = createResilientClient('api', client);

      const result = await resilientClient.get('path');
      expect(result).toBe('data');

      // Should retry the failing method
      await expect(resilientClient.post('path')).rejects.toThrow('fail');
    });

    it('should apply default options', async () => {
      const client = {
        fetch: jest.fn().mockResolvedValue('data'),
      };

      const resilientClient = createResilientClient('api', client, {
        retryOptions: { maxRetries: 5 },
      });

      await resilientClient.fetch();
      expect(client.fetch).toHaveBeenCalled();
    });
  });

  describe('Health Monitoring', () => {
    it('should report circuit breaker health', async () => {
      await withCircuitBreaker('health-1', async () => 'success');
      await withCircuitBreaker('health-2', async () => 'success');

      const health = getCircuitBreakerHealth();
      expect(health).toHaveLength(2);
      expect(health.map(h => h.name)).toContain('health-1');
      expect(health.map(h => h.name)).toContain('health-2');
    });

    it('should detect open circuit breakers', () => {
      const registry = getGlobalCircuitBreakerRegistry();
      const breaker = registry.getOrCreate({ name: 'open-check' });

      expect(hasOpenCircuitBreakers()).toBe(false);

      breaker.forceOpen();

      expect(hasOpenCircuitBreakers()).toBe(true);
    });
  });
});
