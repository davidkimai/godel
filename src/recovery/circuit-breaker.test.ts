/**
 * Circuit Breaker Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerError } from './circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 1000,
      monitoringWindowMs: 60000,
      halfOpenMaxCalls: 2,
    });
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      expect(breaker.getState()).toBe('closed');
      expect(breaker.isClosed()).toBe(true);
      expect(breaker.isOpen()).toBe(false);
      expect(breaker.isHalfOpen()).toBe(false);
    });

    it('should have correct name', () => {
      expect(breaker.getName()).toBe('test-service');
    });
  });

  describe('successful execution', () => {
    it('should execute function successfully', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      const result = await breaker.execute(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalled();
    });

    it('should track successful calls', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      await breaker.execute(fn);
      await breaker.execute(fn);
      
      const stats = breaker.getStats();
      expect(stats.successes).toBe(2);
      expect(stats.totalCalls).toBe(2);
    });

    it('should emit success event', async () => {
      const listener = jest.fn();
      breaker.on('success', listener);
      
      await breaker.execute(() => Promise.resolve('ok'));
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
      }));
    });
  });

  describe('failure handling', () => {
    it('should throw on function failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      
      await expect(breaker.execute(fn)).rejects.toThrow('failure');
    });

    it('should track failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      
      try {
        await breaker.execute(fn);
      } catch {}
      
      const stats = breaker.getStats();
      expect(stats.failures).toBe(1);
      expect(stats.consecutiveFailures).toBe(1);
    });

    it('should open circuit after threshold failures', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      
      // Generate 3 failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }
      
      expect(breaker.getState()).toBe('open');
      expect(breaker.isOpen()).toBe(true);
    });

    it('should emit failure event', async () => {
      const listener = jest.fn();
      breaker.on('failure', listener);
      
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
      }));
    });

    it('should emit state change event when opening', async () => {
      const listener = jest.fn();
      breaker.on('state.changed', listener);
      
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
        previousState: 'closed',
        newState: 'open',
      }));
    });
  });

  describe('open circuit behavior', () => {
    beforeEach(async () => {
      // Open the circuit
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(fn);
        } catch {}
      }
    });

    it('should reject calls when open', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      
      await expect(breaker.execute(fn)).rejects.toThrow(CircuitBreakerError);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should track rejected calls', async () => {
      try {
        await breaker.execute(() => Promise.resolve('success'));
      } catch {}
      
      const stats = breaker.getStats();
      expect(stats.rejectedCalls).toBe(1);
    });
  });

  describe('fallback function', () => {
    it('should use fallback when circuit is open', async () => {
      // Open the circuit
      const failFn = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failFn);
        } catch {}
      }

      const fallback = jest.fn().mockReturnValue('fallback-value');
      const result = await breaker.execute(() => Promise.resolve('success'), fallback);
      
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should use fallback on function failure', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      const fallback = jest.fn().mockReturnValue('fallback-value');
      
      const result = await breaker.execute(fn, fallback);
      
      expect(result).toBe('fallback-value');
    });

    it('should emit fallback.used event', async () => {
      const listener = jest.fn();
      breaker.on('fallback.used', listener);
      
      const fn = jest.fn().mockRejectedValue(new Error('failure'));
      const fallback = jest.fn().mockReturnValue('fallback');
      
      await breaker.execute(fn, fallback);
      
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
        fallbackResult: 'fallback',
      }));
    });
  });

  describe('half-open state', () => {
    beforeEach(async () => {
      // Open the circuit
      const failFn = jest.fn().mockRejectedValue(new Error('failure'));
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(failFn);
        } catch {}
      }
    });

    it('should transition to half-open after timeout', async () => {
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Try a call to trigger transition
      try {
        await breaker.execute(() => Promise.resolve('test'));
      } catch {}
      
      expect(breaker.isHalfOpen()).toBe(true);
    });

    it('should close circuit after success threshold in half-open', async () => {
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Two successful calls should close the circuit
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.resolve('ok'));
      
      expect(breaker.isClosed()).toBe(true);
    });

    it('should reopen circuit on failure in half-open', async () => {
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Get to half-open
      try {
        await breaker.execute(() => Promise.resolve('ok'));
      } catch {}
      
      expect(breaker.isHalfOpen()).toBe(true);
      
      // Failure should reopen
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      
      expect(breaker.isOpen()).toBe(true);
    });
  });

  describe('manual control', () => {
    it('should allow manual open', () => {
      breaker.forceOpen();
      
      expect(breaker.isOpen()).toBe(true);
    });

    it('should allow manual close', async () => {
      // Open first
      breaker.forceOpen();
      expect(breaker.isOpen()).toBe(true);
      
      // Then close
      breaker.forceClose();
      expect(breaker.isClosed()).toBe(true);
    });

    it('should allow reset', async () => {
      // Add some state
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}
      
      breaker.reset();
      
      const stats = breaker.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.totalCalls).toBe(0);
      expect(breaker.isClosed()).toBe(true);
    });
  });

  describe('synchronous execution', () => {
    it('should execute sync function', () => {
      const fn = jest.fn().mockReturnValue('sync-result');
      
      const result = breaker.executeSync(fn);
      
      expect(result).toBe('sync-result');
    });

    it('should handle sync function failure', () => {
      const fn = jest.fn().mockImplementation(() => {
        throw new Error('sync-error');
      });
      
      expect(() => breaker.executeSync(fn)).toThrow('sync-error');
    });

    it('should use fallback for sync function', () => {
      breaker.forceOpen();
      
      const fallback = jest.fn().mockReturnValue('fallback');
      const result = breaker.executeSync(() => 'ok', fallback);
      
      expect(result).toBe('fallback');
    });
  });

  describe('metrics', () => {
    it('should calculate failure rate', async () => {
      // 2 successes, 1 failure
      await breaker.execute(() => Promise.resolve('ok'));
      await breaker.execute(() => Promise.resolve('ok'));
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      const metrics = breaker.getMetrics();
      expect(metrics.failureRate).toBeCloseTo(1/3, 1);
      expect(metrics.serviceName).toBe('test-service');
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry();
  });

  describe('registration', () => {
    it('should create and register a breaker', () => {
      const breaker = registry.getOrCreate({ name: 'service-1' });
      
      expect(breaker.getName()).toBe('service-1');
      expect(registry.get('service-1')).toBe(breaker);
    });

    it('should return existing breaker', () => {
      const breaker1 = registry.getOrCreate({ name: 'service-1' });
      const breaker2 = registry.getOrCreate({ name: 'service-1' });
      
      expect(breaker1).toBe(breaker2);
    });

    it('should manually register a breaker', () => {
      const breaker = new CircuitBreaker({ name: 'service-2' });
      registry.register(breaker);
      
      expect(registry.get('service-2')).toBe(breaker);
    });

    it('should remove a breaker', () => {
      registry.getOrCreate({ name: 'service-1' });
      
      const removed = registry.remove('service-1');
      
      expect(removed).toBe(true);
      expect(registry.get('service-1')).toBeUndefined();
    });
  });

  describe('queries', () => {
    beforeEach(() => {
      registry.getOrCreate({ name: 'service-1' });
      registry.getOrCreate({ name: 'service-2' });
      registry.getOrCreate({ name: 'service-3' });
    });

    it('should get all breakers', () => {
      const all = registry.getAll();
      
      expect(all).toHaveLength(3);
    });

    it('should get all names', () => {
      const names = registry.getNames();
      
      expect(names).toContain('service-1');
      expect(names).toContain('service-2');
      expect(names).toContain('service-3');
    });

    it('should get breakers by state', async () => {
      const breaker = registry.get('service-1')!;
      
      // Open the circuit
      const failFn = () => Promise.reject(new Error('fail'));
      for (let i = 0; i < 5; i++) {
        try {
          await breaker.execute(failFn);
        } catch {}
      }

      const openBreakers = registry.getByState('open');
      const closedBreakers = registry.getByState('closed');
      
      expect(openBreakers).toHaveLength(1);
      expect(closedBreakers).toHaveLength(2);
    });

    it('should get all stats', () => {
      const stats = registry.getAllStats();
      
      expect(stats).toHaveLength(3);
    });
  });

  describe('bulk operations', () => {
    beforeEach(() => {
      registry.getOrCreate({ name: 'service-1' });
      registry.getOrCreate({ name: 'service-2' });
    });

    it('should reset all breakers', async () => {
      // Add failures to one
      const breaker = registry.get('service-1')!;
      try {
        await breaker.execute(() => Promise.reject(new Error('fail')));
      } catch {}

      registry.resetAll();

      const stats = registry.getAllStats();
      expect(stats.every(s => s.failures === 0)).toBe(true);
    });

    it('should force open all circuits', () => {
      registry.forceOpenAll();

      const stats = registry.getAllStats();
      expect(stats.every(s => s.state === 'open')).toBe(true);
    });

    it('should force close all circuits', async () => {
      registry.forceOpenAll();
      registry.forceCloseAll();

      const stats = registry.getAllStats();
      expect(stats.every(s => s.state === 'closed')).toBe(true);
    });

    it('should clear all breakers', () => {
      registry.clear();

      expect(registry.getAll()).toHaveLength(0);
    });
  });

  describe('event forwarding', () => {
    it('should forward breaker events', () => {
      const listener = jest.fn();
      registry.on('state.changed', listener);

      const breaker = registry.getOrCreate({ name: 'service-1' });
      breaker.forceOpen();

      expect(listener).toHaveBeenCalled();
    });
  });
});

describe('CircuitBreakerError', () => {
  it('should create error with state', () => {
    const error = new CircuitBreakerError('test message', 'open');
    
    expect(error.message).toBe('test message');
    expect(error.state).toBe('open');
    expect(error.name).toBe('CircuitBreakerError');
  });

  it('should include original error', () => {
    const original = new Error('original');
    const error = new CircuitBreakerError('test', 'open', original);
    
    expect(error.originalError).toBe(original);
  });

  it('should include fallback error', () => {
    const original = new Error('original');
    const fallback = new Error('fallback');
    const error = new CircuitBreakerError('test', 'open', original, fallback);
    
    expect(error.fallbackError).toBe(fallback);
  });
});
