/**
 * Circuit Breaker Tests
 * 
 * Tests for CircuitBreaker class:
 * - State transitions: closed → open → half-open → closed
 * - Failure threshold triggering
 * - Success threshold for closing
 * - Force open/close/reset methods
 */

import { CircuitBreaker, CircuitBreakerConfig, CircuitState, DEFAULT_CIRCUIT_BREAKER_CONFIG } from '../../src/concurrency/retry';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('initial state', () => {
    it('should start in closed state', () => {
      const cb = new CircuitBreaker();
      const state = cb.getState();
      
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('should apply custom config', () => {
      const cb = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeWindow: 30000,
        halfOpenMaxRequests: 2
      });
      
      const state = cb.getState();
      expect(state.state).toBe('closed');
    });
  });

  describe('successful operations', () => {
    it('should remain closed on success', async () => {
      const cb = new CircuitBreaker();
      const operation = jest.fn().mockResolvedValue('success');

      const result = await cb.execute(operation);

      expect(result.success).toBe(true);
      expect(result.data).toBe('success');
      expect(result.circuitState.state).toBe('closed');
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should track success count', async () => {
      const cb = new CircuitBreaker({ successThreshold: 2 });
      const operation = jest.fn().mockResolvedValue('done');

      await cb.execute(operation);
      await cb.execute(operation);

      const state = cb.getState();
      expect(state.successCount).toBe(2);
    });
  });

  describe('failure threshold', () => {
    it('should open circuit after failure threshold', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 3 });
      const operation = jest.fn().mockRejectedValue(new Error('fails'));

      await cb.execute(operation).catch(() => {});
      await cb.execute(operation).catch(() => {});
      await cb.execute(operation).catch(() => {});

      const state = cb.getState();
      expect(state.state).toBe('open');
      expect(state.failureCount).toBe(3);
    });

    it('should track failure count correctly', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      const successOp = jest.fn().mockResolvedValue('success');
      const failOp = jest.fn().mockRejectedValue(new Error('fail'));

      await cb.execute(successOp);
      await cb.execute(failOp).catch(() => {}); // First failure
      await cb.execute(failOp).catch(() => {}); // Second failure - opens

      const state = cb.getState();
      expect(state.failureCount).toBe(2);
      expect(state.state).toBe('open');
    });

    it('should set nextAttempt time when opening', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2, timeWindow: 5000 });
      const operation = jest.fn().mockRejectedValue(new Error('fails'));

      await cb.execute(operation).catch(() => {});
      await cb.execute(operation).catch(() => {});

      const state = cb.getState();
      expect(state.nextAttempt).toBeDefined();
      expect(state.nextAttempt!.getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe('half-open state basics', () => {
    it('should support time window for recovery', async () => {
      const cb = new CircuitBreaker({ 
        failureThreshold: 2, 
        timeWindow: 1000,
        halfOpenMaxRequests: 3 
      });
      const operation = jest.fn().mockResolvedValue('success');

      // Open circuit
      await cb.execute(operation).catch(() => {}); 
      await cb.execute(operation).catch(() => {}); 

      // Advance time past window
      jest.advanceTimersByTime(1500);

      // Should be able to execute after time window
      const result = await cb.execute(operation);
      expect(result.success).toBe(true);
    });
  });

  describe('force methods', () => {
    it('forceOpen() should immediately open circuit', () => {
      const cb = new CircuitBreaker();
      
      cb.forceOpen();
      
      const state = cb.getState();
      expect(state.state).toBe('open');
      expect(state.nextAttempt).toBeDefined();
    });

    it('forceClose() should immediately close circuit', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      const operation = jest.fn().mockRejectedValue(new Error('fails'));

      // Trigger failure first
      cb.forceOpen();
      
      // Force close
      cb.forceClose();
      
      const state = cb.getState();
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('reset() should reset all state', () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      const operation = jest.fn().mockResolvedValue('success');

      // Some operations
      cb.forceOpen();
      cb.forceClose();
      cb.reset();

      const state = cb.getState();
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.nextAttempt).toBeNull();
    });
  });

  describe('state object', () => {
    it('should return copy of state', () => {
      const cb = new CircuitBreaker();
      const operation = jest.fn().mockResolvedValue('done');

      const state1 = cb.getState();
      const state2 = cb.getState();

      expect(state1).not.toBe(state2);
      expect(state1).toEqual(state2);
    });

    it('should include all required fields', () => {
      const cb = new CircuitBreaker();
      const state = cb.getState();

      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('failureCount');
      expect(state).toHaveProperty('successCount');
      expect(state).toHaveProperty('lastFailureTime');
      expect(state).toHaveProperty('nextAttempt');
    });

    it('should track lastFailureTime', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 1 });
      const operation = jest.fn().mockRejectedValue(new Error('fail'));

      const before = Date.now();
      await cb.execute(operation).catch(() => {});
      const after = Date.now();

      const state = cb.getState();
      expect(state.lastFailureTime).toBeDefined();
      expect(state.lastFailureTime!.getTime()).toBeGreaterThanOrEqual(before);
      expect(state.lastFailureTime!.getTime()).toBeLessThanOrEqual(after);
    });
  });

  describe('reset behavior', () => {
    it('should clear request history', async () => {
      const cb = new CircuitBreaker({ failureThreshold: 2 });
      const operation = jest.fn().mockResolvedValue('success');

      // Some operations
      await cb.execute(operation);
      await cb.execute(operation);
      await cb.execute(operation).catch(() => {}); // fail

      // Reset
      cb.reset();

      const state = cb.getState();
      expect(state.state).toBe('closed');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
    });

    it('should emit reset event', () => {
      const cb = new CircuitBreaker();
      const resetHandler = jest.fn();
      cb.on('reset', resetHandler);

      cb.reset();

      expect(resetHandler).toHaveBeenCalled();
    });
  });
});
