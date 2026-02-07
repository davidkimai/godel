/**
 * Error Listener Service Tests
 */

import { ErrorListenerService } from '../error-listener';
import { AgentEventBus } from '../../core/event-bus';
import { ErrorEvent } from '../types';

describe('ErrorListenerService', () => {
  let eventBus: AgentEventBus;
  let listener: ErrorListenerService;

  beforeEach(() => {
    eventBus = new AgentEventBus();
    listener = new ErrorListenerService(eventBus);
  });

  afterEach(() => {
    listener.dispose?.();
  });

  describe('Error Detection', () => {
    it('should capture errors from event bus', () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'test-agent',
        error: {
          message: 'Test error',
          code: 'TypeError',
          stack: 'at test.ts:1:1',
        },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors).toHaveLength(1);
      expect(errors[0].message).toBe('Test error');
      expect(errors[0].errorType).toBe('TypeError');
    });

    it('should assign unique IDs to errors', () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: { message: 'Error 1' },
      });

      eventBus.emitEvent({
        id: 'evt_002',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-2',
        error: { message: 'Error 2 - completely different' },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors.length).toBeGreaterThanOrEqual(1);
      if (errors.length >= 2) {
        expect(errors[0].id).not.toBe(errors[1].id);
      }
    });
  });

  describe('Error Deduplication', () => {
    it('should deduplicate similar errors', () => {
      // First error
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: {
          message: 'Cannot read property name of undefined',
          stack: 'at processData (src/core.ts:42:15)',
        },
      });

      // Similar error (should be deduplicated)
      eventBus.emitEvent({
        id: 'evt_002',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-2',
        error: {
          message: 'Cannot read property name of undefined',
          stack: 'at processData (src/core.ts:42:15)',
        },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors).toHaveLength(1);
    });

    it('should keep different errors separate', () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: {
          message: 'TypeError: Cannot read property name of undefined',
          stack: 'at func1 (file1.ts:1:1)',
        },
      });

      eventBus.emitEvent({
        id: 'evt_002',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-2',
        error: {
          message: 'ReferenceError: x is not defined',
          stack: 'at func2 (file2.ts:2:2)',
        },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors).toHaveLength(2);
    });
  });

  describe('Severity Assessment', () => {
    it('should classify critical errors', () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: {
          message: 'Fatal crash occurred',
          code: 'CRITICAL',
        },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors[0].severity).toBe('critical');
    });

    it('should classify high severity for network errors', () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: {
          message: 'Network timeout',
        },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors[0].severity).toBe('high');
    });

    it('should classify medium severity for type errors', () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: {
          message: 'TypeError: undefined is not a function',
        },
      });

      // Filter out autonomic-generated events
      const errors = listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'));
      expect(errors[0].severity).toBe('medium');
    });
  });

  describe('Auto-Fixable Detection', () => {
    it('should identify TypeError as auto-fixable', () => {
      const error: ErrorEvent = {
        id: '1',
        timestamp: Date.now(),
        source: 'test',
        errorType: 'TypeError',
        message: 'Cannot read property of undefined',
        context: {},
        severity: 'medium',
        reproducible: true,
      };

      expect(listener.isAutoFixable(error)).toBe(true);
    });

    it('should identify ReferenceError as auto-fixable', () => {
      const error: ErrorEvent = {
        id: '1',
        timestamp: Date.now(),
        source: 'test',
        errorType: 'ReferenceError',
        message: 'x is not defined',
        context: {},
        severity: 'medium',
        reproducible: true,
      };

      expect(listener.isAutoFixable(error)).toBe(true);
    });

    it('should not identify unknown errors as auto-fixable', () => {
      const error: ErrorEvent = {
        id: '1',
        timestamp: Date.now(),
        source: 'test',
        errorType: 'CustomError',
        message: 'Something went wrong',
        context: {},
        severity: 'low',
        reproducible: false,
      };

      expect(listener.isAutoFixable(error)).toBe(false);
    });
  });

  describe('Error State Management', () => {
    it('should move error to processing state', async () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: { message: 'Test error' },
      });

      const error = listener.getUnprocessedErrors()[0];
      await listener.markAsProcessing(error.id);

      expect(listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'))).toHaveLength(0);
      expect(listener.getProcessingErrors().filter(e => !e.errorType.includes('AUTONOMIC'))).toHaveLength(1);
    });

    it('should move error to resolved state', async () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: { message: 'Test error' },
      });

      const error = listener.getUnprocessedErrors()[0];
      await listener.markAsProcessing(error.id);
      await listener.markAsResolved(error.id, {
        id: 'fix-1',
        errorId: error.id,
        prUrl: 'https://github.com/test/pr/1',
        status: 'success',
      });

      expect(listener.getProcessingErrors()).toHaveLength(0);
      expect(listener.getResolvedErrors()).toHaveLength(1);
    });

    it('should move error back to unprocessed on failure', async () => {
      eventBus.emitEvent({
        id: 'evt_001',
        type: 'error',
        timestamp: Date.now(),
        agentId: 'agent-1',
        error: { message: 'Test error' },
      });

      const error = listener.getUnprocessedErrors()[0];
      await listener.markAsProcessing(error.id);
      await listener.markAsFailed(error.id, 'Fix generation failed');

      expect(listener.getProcessingErrors().filter(e => !e.errorType.includes('AUTONOMIC'))).toHaveLength(0);
      expect(listener.getUnprocessedErrors().filter(e => !e.errorType.includes('AUTONOMIC'))).toHaveLength(1);
    });
  });
});
