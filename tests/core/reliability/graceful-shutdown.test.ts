/**
 * Graceful Shutdown Tests
 *
 * Tests for graceful application shutdown handling.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import {
  GracefulShutdown,
  resetGlobalShutdown,
} from '../../../src/core/reliability/graceful-shutdown';

describe('Core Reliability: Graceful Shutdown', () => {
  let shutdown: GracefulShutdown;
  let mockExit: jest.SpiedFunction<typeof process.exit>;

  beforeEach(() => {
    resetGlobalShutdown();
    shutdown = new GracefulShutdown({
      timeoutMs: 5000,
      forceExit: false, // Disable force exit for testing
      signals: [], // Don't register signal handlers in tests
    });
    mockExit = jest.spyOn(process, 'exit').mockImplementation(() => undefined as never);
  });

  afterEach(() => {
    mockExit.mockRestore();
    shutdown.removeAllListeners();
  });

  describe('Handler Registration', () => {
    it('should register a handler', () => {
      const handler = {
        name: 'test-handler',
        handler: jest.fn(),
      };

      shutdown.register(handler);

      expect(shutdown.getHandlerNames()).toContain('test-handler');
    });

    it('should unregister a handler', () => {
      shutdown.register({
        name: 'test-handler',
        handler: jest.fn(),
      });

      const result = shutdown.unregister('test-handler');

      expect(result).toBe(true);
      expect(shutdown.getHandlerNames()).not.toContain('test-handler');
    });

    it('should throw when registering during shutdown', async () => {
      shutdown.register({
        name: 'test-handler',
        handler: jest.fn(),
      });

      // Start shutdown but don't await
      shutdown.shutdown('SIGTERM');

      expect(() => {
        shutdown.register({
          name: 'another-handler',
          handler: jest.fn(),
        });
      }).toThrow('Cannot register handler during shutdown');
    });
  });

  describe('Convenience Methods', () => {
    it('should register database handler', () => {
      const closeFn = jest.fn();
      shutdown.registerDatabase('postgres', closeFn);

      expect(shutdown.getHandlerNames()).toContain('db:postgres');
    });

    it('should register HTTP server handler', () => {
      const mockServer = { close: jest.fn((cb) => cb && cb()) };
      shutdown.registerHttpServer('api', mockServer as unknown as { close: (cb?: () => void) => void });

      expect(shutdown.getHandlerNames()).toContain('http:api');
    });

    it('should register consumer handler', () => {
      const stopFn = jest.fn();
      shutdown.registerConsumer('queue-worker', stopFn);

      expect(shutdown.getHandlerNames()).toContain('consumer:queue-worker');
    });

    it('should register cache handler', () => {
      const quitFn = jest.fn();
      shutdown.registerCache('redis', quitFn);

      expect(shutdown.getHandlerNames()).toContain('cache:redis');
    });

    it('should register circuit breaker handler', () => {
      const shutdownFn = jest.fn();
      shutdown.registerCircuitBreaker('api-breaker', shutdownFn);

      expect(shutdown.getHandlerNames()).toContain('circuit-breaker:api-breaker');
    });
  });

  describe('Shutdown Execution', () => {
    it('should execute handlers in priority order', async () => {
      const order: string[] = [];

      shutdown.register({
        name: 'second',
        handler: () => { order.push('second'); },
        priority: 20,
      });

      shutdown.register({
        name: 'first',
        handler: () => { order.push('first'); },
        priority: 10,
      });

      shutdown.register({
        name: 'third',
        handler: () => { order.push('third'); },
        priority: 30,
      });

      await shutdown.shutdown('SIGTERM');

      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('should execute async handlers', async () => {
      let completed = false;

      shutdown.register({
        name: 'async-handler',
        handler: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          completed = true;
        },
      });

      await shutdown.shutdown('SIGTERM');

      expect(completed).toBe(true);
    });

    it('should continue if a handler fails', async () => {
      const handlers: string[] = [];

      shutdown.register({
        name: 'failing',
        handler: () => {
          handlers.push('failing');
          throw new Error('Handler failed');
        },
      });

      shutdown.register({
        name: 'after-fail',
        handler: () => {
          handlers.push('after-fail');
        },
      });

      await shutdown.shutdown('SIGTERM');

      expect(handlers).toEqual(['failing', 'after-fail']);
      expect(shutdown.getState().handlersFailed).toHaveLength(1);
    });

    it('should timeout slow handlers', async () => {
      shutdown.register({
        name: 'slow-handler',
        handler: async () => {
          await new Promise(() => {}); // Never resolves
        },
        timeout: 50,
      });

      await shutdown.shutdown('SIGTERM');

      expect(shutdown.getState().handlersFailed).toHaveLength(1);
      expect(shutdown.getState().handlersFailed[0].name).toBe('slow-handler');
    });

    it('should emit events during shutdown', async () => {
      const startListener = jest.fn();
      const handlerStartListener = jest.fn();
      const completeListener = jest.fn();

      shutdown.on('shutdown:start', startListener);
      shutdown.on('handler:start', handlerStartListener);
      shutdown.on('shutdown:complete', completeListener);

      shutdown.register({
        name: 'test',
        handler: jest.fn(),
      });

      await shutdown.shutdown('SIGTERM');

      expect(startListener).toHaveBeenCalledWith(expect.objectContaining({ signal: 'SIGTERM' }));
      expect(handlerStartListener).toHaveBeenCalledWith({ name: 'test' });
      expect(completeListener).toHaveBeenCalled();
    });

    it('should exit with success code on clean shutdown', async () => {
      shutdown.register({
        name: 'test',
        handler: jest.fn(),
      });

      await shutdown.shutdown('SIGTERM');

      expect(mockExit).toHaveBeenCalledWith(0);
    });

    it('should exit with success code even if handlers fail', async () => {
      // Graceful shutdown continues even if individual handlers fail
      const shutdownWithFailure = new GracefulShutdown({
        timeoutMs: 1000,
        forceExit: false,
        signals: [],
        failureExitCode: 2,
      });

      shutdownWithFailure.register({
        name: 'failing',
        handler: () => {
          throw new Error('Handler error');
        },
      });

      await shutdownWithFailure.shutdown('SIGTERM');

      // Should still exit with success code since shutdown completed
      expect(mockExit).toHaveBeenCalledWith(0);
    });
  });

  describe('State Management', () => {
    it('should track shutdown state', async () => {
      expect(shutdown.isShuttingDown()).toBe(false);

      shutdown.register({
        name: 'test',
        handler: jest.fn(),
      });

      const shutdownPromise = shutdown.shutdown('SIGTERM');

      expect(shutdown.isShuttingDown()).toBe(true);
      expect(shutdown.getState().signal).toBe('SIGTERM');

      await shutdownPromise;

      expect(shutdown.getState().handlersExecuted).toContain('test');
    });

    it('should prevent duplicate shutdown', async () => {
      shutdown.register({
        name: 'test',
        handler: jest.fn(),
      });

      const promise1 = shutdown.shutdown('SIGTERM');
      const promise2 = shutdown.shutdown('SIGTERM');

      await Promise.all([promise1, promise2]);

      // Should only exit once
      expect(mockExit).toHaveBeenCalledTimes(1);
    });

    it('should track executed and failed handlers', async () => {
      shutdown.register({
        name: 'success',
        handler: jest.fn(),
      });

      shutdown.register({
        name: 'failure',
        handler: () => {
          throw new Error('Failed');
        },
      });

      await shutdown.shutdown('SIGTERM');

      const state = shutdown.getState();
      expect(state.handlersExecuted).toContain('success');
      expect(state.handlersFailed).toHaveLength(1);
      expect(state.handlersFailed[0].name).toBe('failure');
    });
  });

  describe('Reset', () => {
    it('should reset state', async () => {
      shutdown.register({
        name: 'test',
        handler: jest.fn(),
      });

      await shutdown.shutdown('SIGTERM');

      shutdown.reset();

      expect(shutdown.isShuttingDown()).toBe(false);
      expect(shutdown.getState().handlersExecuted).toHaveLength(0);
      expect(shutdown.getState().handlersFailed).toHaveLength(0);
    });
  });
});
