/**
 * Resilience: Circuit Breaker Tests
 * 
 * Tests for circuit breaker pattern implementation.
 * Ensures the system can prevent cascade failures and recover gracefully.
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerError } from '../../src/recovery/circuit-breaker';

describe('Resilience: Circuit Breaker', () => {
  let circuit: CircuitBreaker;
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    // Create a circuit breaker with test-friendly timeouts
    circuit = new CircuitBreaker({
      name: 'test-service',
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeoutMs: 100, // Short timeout for testing
      monitoringWindowMs: 60000,
      halfOpenMaxCalls: 2,
      autoRecovery: true,
    });

    registry = new CircuitBreakerRegistry();
  });

  afterEach(() => {
    circuit.removeAllListeners();
    registry.clear();
    jest.clearAllMocks();
  });

  /**
   * Helper for successful operations
   */
  const successfulOperation = async (): Promise<string> => {
    return 'success';
  };

  /**
   * Helper for failing operations
   */
  const failingOperation = async (): Promise<string> => {
    throw new Error('Operation failed');
  };

  /**
   * Helper to open the circuit
   */
  const openCircuit = async (breaker: CircuitBreaker): Promise<void> => {
    for (let i = 0; i < 3; i++) {
      try {
        await breaker.execute(failingOperation);
      } catch {
        // Expected to fail
      }
    }
  };

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(circuit.getState()).toBe('closed');
      expect(circuit.isClosed()).toBe(true);
      expect(circuit.isOpen()).toBe(false);
      expect(circuit.isHalfOpen()).toBe(false);
    });

    it('should have correct configuration', () => {
      const config = circuit.getConfig();
      expect(config.name).toBe('test-service');
      expect(config.failureThreshold).toBe(3);
      expect(config.successThreshold).toBe(2);
      expect(config.autoRecovery).toBe(true);
    });
  });

  describe('Circuit Opening', () => {
    it('should open circuit after consecutive failures', async () => {
      // Fail 3 times
      for (let i = 0; i < 3; i++) {
        await expect(circuit.execute(failingOperation)).rejects.toThrow();
      }

      // Circuit should be open
      expect(circuit.getState()).toBe('open');
      expect(circuit.isOpen()).toBe(true);
    });

    it('should fail fast when circuit is open', async () => {
      // Open the circuit first
      await openCircuit(circuit);

      // Immediate call should fail fast with CircuitBreakerError
      await expect(circuit.execute(successfulOperation)).rejects.toThrow(CircuitBreakerError);
    });

    it('should not execute operation when circuit is open', async () => {
      const operation = jest.fn().mockResolvedValue('success') as jest.Mock<() => Promise<string>>;
      
      // Open the circuit
      await openCircuit(circuit);
      
      // Reset mock to track if it's called
      operation.mockClear();
      
      // Call should fail fast without executing
      await expect(circuit.execute(operation)).rejects.toThrow(CircuitBreakerError);
      expect(operation).not.toHaveBeenCalled();
    });

    it('should track rejected calls when open', async () => {
      await openCircuit(circuit);
      
      // Try a few more calls
      for (let i = 0; i < 3; i++) {
        try {
          await circuit.execute(successfulOperation);
        } catch {
          // Expected
        }
      }
      
      const stats = circuit.getStats();
      expect(stats.rejectedCalls).toBe(3);
    });

    it('should emit opened event when circuit opens', async () => {
      const openedListener = jest.fn();
      circuit.on('opened', openedListener);
      
      await openCircuit(circuit);
      
      expect(openedListener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
        failures: 3,
      }));
    });

    it('should emit state.changed event when opening', async () => {
      const stateChangeListener = jest.fn();
      circuit.on('state.changed', stateChangeListener);
      
      await openCircuit(circuit);
      
      expect(stateChangeListener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
        previousState: 'closed',
        newState: 'open',
        reason: 'failure_threshold_exceeded',
      }));
    });
  });

  describe('Circuit Closing', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      // Open the circuit
      await openCircuit(circuit);
      expect(circuit.getState()).toBe('open');
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Try a call to trigger transition to half-open
      try {
        await circuit.execute(successfulOperation);
      } catch {
        // May or may not throw depending on timing
      }
      
      // Circuit should be half-open
      expect(circuit.getState()).toBe('half-open');
    });

    it('should close circuit after success threshold in half-open', async () => {
      // Open the circuit
      await openCircuit(circuit);
      
      // Wait for reset timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Execute successful operations to close circuit
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      
      // Circuit should be closed
      expect(circuit.getState()).toBe('closed');
    });

    it('should emit closed event when circuit closes', async () => {
      const closedListener = jest.fn();
      circuit.on('closed', closedListener);
      
      // Open then close
      await openCircuit(circuit);
      await new Promise(resolve => setTimeout(resolve, 150));
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      
      expect(closedListener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
        consecutiveSuccesses: expect.any(Number),
      }));
    });

    it('should reset failure count after successful close', async () => {
      // Open the circuit
      await openCircuit(circuit);
      
      // Wait and recover
      await new Promise(resolve => setTimeout(resolve, 150));
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      
      const stats = circuit.getStats();
      expect(stats.consecutiveFailures).toBe(0);
      expect(circuit.getState()).toBe('closed');
    });
  });

  describe('Half-Open State', () => {
    it('should transition to HALF_OPEN after timeout', async () => {
      await openCircuit(circuit);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Trigger transition with any call
      try {
        await circuit.execute(() => Promise.resolve('test'));
      } catch {
        // Ignore
      }
      
      expect(circuit.isHalfOpen()).toBe(true);
    });

    it('should limit concurrent calls in half-open', async () => {
      await openCircuit(circuit);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // First call should be allowed
      const promise1 = circuit.execute(successfulOperation);
      
      // Second call should be allowed (halfOpenMaxCalls = 2)
      const promise2 = circuit.execute(successfulOperation);
      
      // Both should succeed
      await expect(promise1).resolves.toBe('success');
      await expect(promise2).resolves.toBe('success');
    });

    it('should reopen circuit on failure in half-open', async () => {
      await openCircuit(circuit);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Get to half-open
      try {
        await circuit.execute(successfulOperation);
      } catch {
        // Ignore
      }
      
      // Fail should reopen
      try {
        await circuit.execute(failingOperation);
      } catch {
        // Expected
      }
      
      expect(circuit.isOpen()).toBe(true);
    });

    it('should emit half-open event', async () => {
      const halfOpenListener = jest.fn();
      circuit.on('half-open', halfOpenListener);
      
      await openCircuit(circuit);
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // Trigger half-open
      try {
        await circuit.execute(successfulOperation);
      } catch {
        // Ignore
      }
      
      expect(halfOpenListener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
      }));
    });
  });

  describe('Fallback Mechanism', () => {
    it('should use fallback when circuit is open', async () => {
      await openCircuit(circuit);
      
      const fallback = jest.fn().mockReturnValue('fallback-value');
      const result = await circuit.execute(successfulOperation, fallback);
      
      expect(result).toBe('fallback-value');
      expect(fallback).toHaveBeenCalled();
    });

    it('should use fallback on operation failure', async () => {
      const fallback = jest.fn().mockReturnValue('fallback-value');
      
      const result = await circuit.execute(failingOperation, fallback);
      
      expect(result).toBe('fallback-value');
    });

    it('should emit fallback.used event', async () => {
      const fallbackListener = jest.fn();
      circuit.on('fallback.used', fallbackListener);
      
      const fallback = jest.fn().mockReturnValue('fallback');
      await circuit.execute(failingOperation, fallback);
      
      expect(fallbackListener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
        fallbackResult: 'fallback',
      }));
    });

    it('should throw if fallback also fails', async () => {
      await openCircuit(circuit);
      
      const badFallback = jest.fn().mockImplementation(() => {
        throw new Error('Fallback failed');
      });
      
      await expect(
        circuit.execute(successfulOperation, badFallback)
      ).rejects.toThrow('Circuit open for test-service and fallback failed');
    });
  });

  describe('Manual Control', () => {
    it('should allow manual open', () => {
      circuit.forceOpen();
      
      expect(circuit.getState()).toBe('open');
    });

    it('should allow manual close', async () => {
      await openCircuit(circuit);
      expect(circuit.getState()).toBe('open');
      
      circuit.forceClose();
      
      expect(circuit.getState()).toBe('closed');
    });

    it('should reset all stats', async () => {
      await openCircuit(circuit);
      
      circuit.reset();
      
      const stats = circuit.getStats();
      expect(stats.failures).toBe(0);
      expect(stats.successes).toBe(0);
      expect(stats.totalCalls).toBe(0);
      expect(circuit.getState()).toBe('closed');
    });

    it('should emit reset event', () => {
      const resetListener = jest.fn();
      circuit.on('reset', resetListener);
      
      circuit.reset();
      
      expect(resetListener).toHaveBeenCalledWith(expect.objectContaining({
        service: 'test-service',
      }));
    });
  });

  describe('Circuit Breaker Registry', () => {
    it('should get or create circuit breakers', () => {
      const cb1 = registry.getOrCreate({ name: 'service-1' });
      const cb2 = registry.getOrCreate({ name: 'service-1' });
      
      expect(cb1).toBe(cb2);
    });

    it('should track multiple breakers', () => {
      registry.getOrCreate({ name: 'service-1' });
      registry.getOrCreate({ name: 'service-2' });
      registry.getOrCreate({ name: 'service-3' });
      
      expect(registry.getAll()).toHaveLength(3);
    });

    it('should get breakers by state', async () => {
      const cb1 = registry.getOrCreate({ name: 'service-1' });
      const cb2 = registry.getOrCreate({ name: 'service-2' });
      
      // Open cb1
      for (let i = 0; i < 5; i++) {
        try {
          await cb1.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // Ignore
        }
      }
      
      const openBreakers = registry.getByState('open');
      const closedBreakers = registry.getByState('closed');
      
      expect(openBreakers).toHaveLength(1);
      expect(closedBreakers).toHaveLength(1);
    });

    it('should support bulk operations', async () => {
      registry.getOrCreate({ name: 'service-1' });
      registry.getOrCreate({ name: 'service-2' });
      
      registry.forceOpenAll();
      
      const stats = registry.getAllStats();
      expect(stats.every(s => s.state === 'open')).toBe(true);
    });

    it('should forward events from registered breakers', () => {
      const listener = jest.fn();
      registry.on('state.changed', listener);
      
      const cb = registry.getOrCreate({ name: 'service-1' });
      cb.forceOpen();
      
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Metrics and Statistics', () => {
    it('should track total calls', async () => {
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      
      const stats = circuit.getStats();
      expect(stats.totalCalls).toBe(2);
    });

    it('should track consecutive failures', async () => {
      for (let i = 0; i < 3; i++) {
        try {
          await circuit.execute(failingOperation);
        } catch {
          // Ignore
        }
      }
      
      const stats = circuit.getStats();
      expect(stats.consecutiveFailures).toBe(3);
    });

    it('should track consecutive successes', async () => {
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      
      const stats = circuit.getStats();
      expect(stats.consecutiveSuccesses).toBe(3);
    });

    it('should calculate failure rate', async () => {
      // 2 successes, 1 failure
      await circuit.execute(successfulOperation);
      await circuit.execute(successfulOperation);
      try {
        await circuit.execute(failingOperation);
      } catch {
        // Ignore
      }
      
      const metrics = circuit.getMetrics();
      expect(metrics.failureRate).toBeGreaterThan(0);
      expect(metrics.serviceName).toBe('test-service');
    });

    it('should track last failure time', async () => {
      try {
        await circuit.execute(failingOperation);
      } catch {
        // Ignore
      }
      
      const stats = circuit.getStats();
      expect(stats.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should track opened count', async () => {
      await openCircuit(circuit);
      circuit.forceClose();
      await openCircuit(circuit);
      
      const stats = circuit.getStats();
      expect(stats.openedCount).toBe(2);
    });
  });

  describe('Error Handling', () => {
    it('should create CircuitBreakerError with state', () => {
      const error = new CircuitBreakerError('Test error', 'open');
      
      expect(error.message).toBe('Test error');
      expect(error.state).toBe('open');
      expect(error.name).toBe('CircuitBreakerError');
    });

    it('should include original error in CircuitBreakerError', () => {
      const original = new Error('Original error');
      const error = new CircuitBreakerError('Test', 'open', original);
      
      expect(error.originalError).toBe(original);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid state transitions', async () => {
      // Rapid open/close cycles
      for (let i = 0; i < 5; i++) {
        circuit.forceOpen();
        circuit.forceClose();
      }
      
      expect(circuit.getState()).toBe('closed');
    });

    it('should handle operations that throw non-Error objects', async () => {
      const throwingOperation = async () => {
        throw 'string error'; // Not an Error object
      };
      
      await expect(circuit.execute(throwingOperation)).rejects.toBe('string error');
    });

    it('should handle very short timeouts', async () => {
      const fastCircuit = new CircuitBreaker({
        name: 'fast-service',
        resetTimeoutMs: 1,
        failureThreshold: 1,
      });
      
      try {
        await fastCircuit.execute(failingOperation);
      } catch {
        // Ignore
      }
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Should be able to try again
      const result = await fastCircuit.execute(successfulOperation);
      expect(result).toBe('success');
    });

    it('should handle configuration updates', () => {
      circuit.updateConfig({ failureThreshold: 10 });
      
      const config = circuit.getConfig();
      expect(config.failureThreshold).toBe(10);
    });
  });

  describe('Synchronous Execution', () => {
    it('should execute synchronous functions', () => {
      const syncFn = jest.fn().mockReturnValue('sync-result');
      
      const result = circuit.executeSync(syncFn);
      
      expect(result).toBe('sync-result');
    });

    it('should handle sync function failures', () => {
      const syncFn = jest.fn().mockImplementation(() => {
        throw new Error('sync-error');
      });
      
      expect(() => circuit.executeSync(syncFn)).toThrow('sync-error');
    });

    it('should use fallback for sync when circuit is open', () => {
      circuit.forceOpen();
      
      const fallback = jest.fn().mockReturnValue('sync-fallback');
      const result = circuit.executeSync(() => 'value', fallback);
      
      expect(result).toBe('sync-fallback');
    });
  });
});
