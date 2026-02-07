/**
 * Correlation Context Tests
 *
 * Tests for AsyncLocalStorage-based correlation context propagation.
 */

import { describe, it, expect } from '@jest/globals';
import {
  generateCorrelationId,
  generateSpanId,
  generateTraceId,
  createCorrelationContext,
  getCorrelationContext,
  getCorrelationId,
  getTraceId,
  runWithContext,
  runWithNewContext,
  runWithChildContext,
  CorrelationContextManager,
  contextFromHeaders,
  contextToHeaders,
} from '../../../src/core/reliability/correlation-context';

describe('Core Reliability: Correlation Context', () => {
  describe('ID Generation', () => {
    it('should generate unique correlation IDs', () => {
      const id1 = generateCorrelationId();
      const id2 = generateCorrelationId();

      expect(id1).toMatch(/^corr-[a-f0-9]+$/);
      expect(id2).toMatch(/^corr-[a-f0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should generate unique span IDs', () => {
      const id1 = generateSpanId();
      const id2 = generateSpanId();

      expect(id1).toMatch(/^span-[a-f0-9]+$/);
      expect(id2).toMatch(/^span-[a-f0-9]+$/);
      expect(id1).not.toBe(id2);
    });

    it('should generate unique trace IDs', () => {
      const id1 = generateTraceId();
      const id2 = generateTraceId();

      expect(id1).toMatch(/^trace-[a-f0-9]+$/);
      expect(id2).toMatch(/^trace-[a-f0-9]+$/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('createCorrelationContext', () => {
    it('should create context with auto-generated IDs', () => {
      const context = createCorrelationContext();

      expect(context.correlationId).toMatch(/^corr-/);
      expect(context.traceId).toMatch(/^trace-/);
      expect(context.spanId).toMatch(/^span-/);
      expect(context.timestamp).toBeInstanceOf(Date);
    });

    it('should allow overriding values', () => {
      const context = createCorrelationContext({
        correlationId: 'custom-corr-id',
        userId: 'user-123',
      });

      expect(context.correlationId).toBe('custom-corr-id');
      expect(context.userId).toBe('user-123');
    });
  });

  describe('runWithContext', () => {
    it('should set context for async operation', async () => {
      const context = createCorrelationContext({ correlationId: 'test-123' });

      await runWithContext(context, async () => {
        expect(getCorrelationContext()?.correlationId).toBe('test-123');
      });
    });

    it('should isolate contexts between concurrent operations', async () => {
      const context1 = createCorrelationContext({ correlationId: 'first' });
      const context2 = createCorrelationContext({ correlationId: 'second' });

      const [result1, result2] = await Promise.all([
        runWithContext(context1, async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return getCorrelationContext()?.correlationId;
        }),
        runWithContext(context2, async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          return getCorrelationContext()?.correlationId;
        }),
      ]);

      expect(result1).toBe('first');
      expect(result2).toBe('second');
    });
  });

  describe('runWithNewContext', () => {
    it('should create and run with new context', async () => {
      const result = await runWithNewContext(async () => {
        const ctx = getCorrelationContext();
        return ctx?.correlationId;
      });

      expect(result).toMatch(/^corr-/);
    });

    it('should apply overrides to new context', async () => {
      const result = await runWithNewContext(async () => {
        return getCorrelationContext();
      }, { userId: 'user-456' });

      expect(result?.userId).toBe('user-456');
    });
  });

  describe('runWithChildContext', () => {
    it('should create child context with parent reference', async () => {
      const parentContext = createCorrelationContext({ correlationId: 'parent-id' });

      await runWithContext(parentContext, async () => {
        await runWithChildContext(async () => {
          const childContext = getCorrelationContext();
          expect(childContext?.parentCorrelationId).toBe('parent-id');
          expect(childContext?.correlationId).not.toBe('parent-id');
        });
      });
    });

    it('should inherit traceId from parent', async () => {
      const parentContext = createCorrelationContext({ traceId: 'trace-abc' });

      await runWithContext(parentContext, async () => {
        await runWithChildContext(async () => {
          const childContext = getCorrelationContext();
          expect(childContext?.traceId).toBe('trace-abc');
        });
      });
    });
  });

  describe('getCorrelationId / getTraceId helpers', () => {
    it('should return correlation ID from current context', async () => {
      const context = createCorrelationContext({ correlationId: 'corr-abc' });

      await runWithContext(context, async () => {
        expect(getCorrelationId()).toBe('corr-abc');
      });
    });

    it('should return trace ID from current context', async () => {
      const context = createCorrelationContext({ traceId: 'trace-xyz' });

      await runWithContext(context, async () => {
        expect(getTraceId()).toBe('trace-xyz');
      });
    });

    it('should return undefined when no context', () => {
      expect(getCorrelationId()).toBeUndefined();
      expect(getTraceId()).toBeUndefined();
    });
  });

  describe('CorrelationContextManager', () => {
    let manager: CorrelationContextManager;

    beforeEach(() => {
      manager = new CorrelationContextManager();
    });

    it('should manage context lifecycle', async () => {
      const context = createCorrelationContext({ correlationId: 'managed-123' });

      await manager.run(context, async () => {
        expect(manager.getContext()?.correlationId).toBe('managed-123');
      });
    });

    it('should create new context', async () => {
      const result = await manager.runNew(async () => {
        return getCorrelationId();
      });

      expect(result).toMatch(/^corr-/);
    });

    it('should create child context', async () => {
      const parent = createCorrelationContext({ correlationId: 'parent' });

      await manager.run(parent, async () => {
        const childId = await manager.runChild(async () => {
          return getCorrelationContext()?.correlationId;
        });

        expect(childId).not.toBe('parent');
        expect(getCorrelationId()).toBe('parent'); // Parent context restored
      });
    });
  });

  describe('contextFromHeaders', () => {
    it('should extract correlation ID from headers', () => {
      const context = contextFromHeaders({
        'x-correlation-id': 'header-corr',
        'x-trace-id': 'header-trace',
      });

      expect(context.correlationId).toBe('header-corr');
      expect(context.traceId).toBe('header-trace');
    });

    it('should handle case-insensitive headers', () => {
      const context = contextFromHeaders({
        'X-Correlation-ID': 'mixed-case',
        'X-Trace-ID': 'trace-mixed',
      });

      expect(context.correlationId).toBe('mixed-case');
      expect(context.traceId).toBe('trace-mixed');
    });

    it('should generate IDs when not in headers', () => {
      const context = contextFromHeaders({});

      expect(context.correlationId).toMatch(/^corr-/);
      expect(context.traceId).toMatch(/^trace-/);
    });
  });

  describe('contextToHeaders', () => {
    it('should convert context to headers', () => {
      const context = createCorrelationContext({
        correlationId: 'corr-123',
        traceId: 'trace-456',
        spanId: 'span-789',
        requestId: 'req-abc',
        sessionId: 'sess-def',
        parentCorrelationId: 'parent-xyz',
      });

      const headers = contextToHeaders(context);

      expect(headers['x-correlation-id']).toBe('corr-123');
      expect(headers['x-trace-id']).toBe('trace-456');
      expect(headers['x-span-id']).toBe('span-789');
      expect(headers['x-request-id']).toBe('req-abc');
      expect(headers['x-session-id']).toBe('sess-def');
      expect(headers['x-parent-correlation-id']).toBe('parent-xyz');
    });

    it('should omit optional headers when not present', () => {
      const context = createCorrelationContext({
        correlationId: 'corr-123',
      });

      const headers = contextToHeaders(context);

      expect(headers['x-correlation-id']).toBe('corr-123');
      expect(headers['x-request-id']).toBeUndefined();
      expect(headers['x-session-id']).toBeUndefined();
    });
  });
});
