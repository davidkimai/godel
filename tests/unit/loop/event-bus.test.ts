/**
 * Event Bus Unit Tests
 */

import { EventBus, getGlobalEventBus, resetGlobalEventBus } from '../../../src/loop/event-bus';
import type { GodelEvent } from '../../../src/loop/events/types';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  afterEach(() => {
    bus.dispose();
  });

  describe('publish', () => {
    it('should publish an event', async () => {
      const handler = jest.fn();
      bus.subscribe('test:event', handler);

      const event = await bus.publish('test:event', { data: 'value' });

      expect(event.type).toBe('test:event');
      expect(event.payload).toEqual({ data: 'value' });
      expect(event.id).toBeDefined();
      expect(event.timestamp).toBeDefined();
    });

    it('should generate correlation ID if not provided', async () => {
      const event = await bus.publish('test:event', {});
      expect(event.metadata.correlationId).toBeDefined();
    });

    it('should use provided correlation ID', async () => {
      const event = await bus.publish('test:event', {}, { correlationId: 'custom-id' });
      expect(event.metadata.correlationId).toBe('custom-id');
    });

    it('should use provided source', async () => {
      const event = await bus.publish('test:event', {}, { source: 'agent-1' });
      expect(event.source).toBe('agent-1');
    });

    it('should update stats on publish', async () => {
      await bus.publish('test:event', {});
      await bus.publish('test:event', {});
      await bus.publish('other:event', {});

      const stats = bus.getStats();
      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType['test:event']).toBe(2);
      expect(stats.eventsByType['other:event']).toBe(1);
    });
  });

  describe('subscribe', () => {
    it('should receive events matching pattern', async () => {
      const handler = jest.fn();
      bus.subscribe('test:event', handler);

      await bus.publish('test:event', { data: 'value' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'test:event',
        payload: { data: 'value' }
      }));
    });

    it('should support wildcards', async () => {
      const handler = jest.fn();
      bus.subscribe('agent:*', handler);

      await bus.publish('agent:started', {});
      await bus.publish('agent:stopped', {});
      await bus.publish('task:completed', {});

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support regex patterns', async () => {
      const handler = jest.fn();
      bus.subscribe(/agent:.*/, handler);

      await bus.publish('agent:started', {});
      await bus.publish('agent:stopped', {});

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should support one-time subscriptions', async () => {
      const handler = jest.fn();
      bus.subscribe('test:event', handler, { once: true });

      await bus.publish('test:event', {});
      await bus.publish('test:event', {});

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should support filter functions', async () => {
      const handler = jest.fn();
      bus.subscribe('test:event', handler, {
        filter: (e: GodelEvent) => (e.payload as { priority: number }).priority > 5
      });

      await bus.publish('test:event', { priority: 3 });
      await bus.publish('test:event', { priority: 8 });

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('should stop receiving events after unsubscribe', async () => {
      const handler = jest.fn();
      const subId = bus.subscribe('test:event', handler);

      await bus.publish('test:event', {});
      bus.unsubscribe(subId);
      await bus.publish('test:event', {});

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return false for unknown subscription', () => {
      const result = bus.unsubscribe('unknown-id');
      expect(result).toBe(false);
    });
  });

  describe('subscribeTyped', () => {
    it('should support typed event handlers', async () => {
      const handler = jest.fn();
      bus.subscribeTyped('task:completed', handler);

      await bus.publish('task:completed', {
        taskId: '123',
        agentId: 'agent-1',
        result: 'success',
        duration: 5000
      });

      expect(handler).toHaveBeenCalledWith(expect.objectContaining({
        type: 'task:completed',
        payload: {
          taskId: '123',
          agentId: 'agent-1',
          result: 'success',
          duration: 5000
        }
      }));
    });
  });

  describe('waitFor', () => {
    it('should resolve when event is received', async () => {
      setTimeout(() => bus.publish('test:event', { data: 'value' }), 10);

      const event = await bus.waitFor('test:event');

      expect(event.payload).toEqual({ data: 'value' });
    });

    it('should reject on timeout', async () => {
      await expect(bus.waitFor('test:event', 50)).rejects.toThrow('Timeout');
    });

    it('should support filter', async () => {
      setTimeout(() => bus.publish('test:event', { id: '1' }), 10);
      setTimeout(() => bus.publish('test:event', { id: '2' }), 20);

      const event = await bus.waitFor('test:event', 100, e => (e.payload as { id: string }).id === '2');

      expect((event.payload as { id: string }).id).toBe('2');
    });
  });

  describe('queryHistory', () => {
    it('should return all events', async () => {
      await bus.publish('test:event', { data: '1' });
      await bus.publish('test:event', { data: '2' });

      const events = bus.queryHistory();

      expect(events).toHaveLength(2);
    });

    it('should filter by type', async () => {
      await bus.publish('test:event', {});
      await bus.publish('other:event', {});

      const events = bus.queryHistory({ type: 'test:event' });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('test:event');
    });

    it('should filter by source', async () => {
      await bus.publish('test:event', {}, { source: 'agent-1' });
      await bus.publish('test:event', {}, { source: 'agent-2' });

      const events = bus.queryHistory({ source: 'agent-1' });

      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('agent-1');
    });

    it('should filter by time range', async () => {
      const now = Date.now();
      await bus.publish('test:event', {}, { source: 'past' });
      
      await new Promise(r => setTimeout(r, 50));
      const since = Date.now();
      await new Promise(r => setTimeout(r, 50));
      
      await bus.publish('test:event', {}, { source: 'future' });

      const events = bus.queryHistory({ since });
      expect(events).toHaveLength(1);
      expect(events[0].source).toBe('future');
    });

    it('should support limit', async () => {
      for (let i = 0; i < 10; i++) {
        await bus.publish('test:event', { i });
      }

      const events = bus.queryHistory({ limit: 3 });
      expect(events).toHaveLength(3);
    });

    it('should filter by correlationId', async () => {
      await bus.publish('test:event', {}, { correlationId: 'corr-1' });
      await bus.publish('test:event', {}, { correlationId: 'corr-2' });

      const events = bus.queryHistory({ correlationId: 'corr-1' });
      expect(events).toHaveLength(1);
    });
  });

  describe('getCorrelationChain', () => {
    it('should return events with same correlation ID', async () => {
      const correlationId = 'test-chain';
      await bus.publish('event:1', {}, { correlationId });
      await bus.publish('event:2', {}, { correlationId });
      await bus.publish('event:3', {}, { correlationId: 'other' });

      const chain = bus.getCorrelationChain(correlationId);
      expect(chain).toHaveLength(2);
    });

    it('should return events sorted by timestamp', async () => {
      const correlationId = 'test-chain';
      await bus.publish('event:1', { order: 1 }, { correlationId });
      await new Promise(r => setTimeout(r, 10));
      await bus.publish('event:2', { order: 2 }, { correlationId });

      const chain = bus.getCorrelationChain(correlationId);
      expect((chain[0].payload as { order: number }).order).toBe(1);
      expect((chain[1].payload as { order: number }).order).toBe(2);
    });
  });

  describe('middleware', () => {
    it('should call beforePublish middleware', async () => {
      const beforePublish = jest.fn().mockReturnValue(true);
      bus.use({ beforePublish });

      await bus.publish('test:event', {});

      expect(beforePublish).toHaveBeenCalledWith(expect.objectContaining({
        type: 'test:event'
      }));
    });

    it('should cancel event if middleware returns false', async () => {
      const handler = jest.fn();
      bus.subscribe('test:event', handler);
      bus.use({ beforePublish: () => false });

      await bus.publish('test:event', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('should call afterPublish middleware', async () => {
      const afterPublish = jest.fn();
      bus.use({ afterPublish });

      await bus.publish('test:event', {});

      expect(afterPublish).toHaveBeenCalled();
    });

    it('should support multiple middlewares', async () => {
      const order: string[] = [];
      bus.use({
        beforePublish: () => { order.push('before1'); return true; },
        afterPublish: () => { order.push('after1'); }
      });
      bus.use({
        beforePublish: () => { order.push('before2'); return true; },
        afterPublish: () => { order.push('after2'); }
      });

      await bus.publish('test:event', {});

      expect(order).toEqual(['before1', 'before2', 'after1', 'after2']);
    });

    it('should remove middleware', async () => {
      const middleware = { beforePublish: jest.fn().mockReturnValue(true) };
      bus.use(middleware);
      bus.unuse(middleware);

      await bus.publish('test:event', {});

      expect(middleware.beforePublish).not.toHaveBeenCalled();
    });
  });

  describe('history management', () => {
    it('should respect max history size', async () => {
      const smallBus = new EventBus({ maxHistorySize: 3 });
      
      for (let i = 0; i < 5; i++) {
        await smallBus.publish('test:event', { i });
      }

      const events = smallBus.queryHistory();
      expect(events).toHaveLength(3);
      expect((events[0].payload as { i: number }).i).toBe(2);
      expect((events[2].payload as { i: number }).i).toBe(4);

      smallBus.dispose();
    });

    it('should clear history', async () => {
      await bus.publish('test:event', {});
      bus.clearHistory();

      expect(bus.queryHistory()).toHaveLength(0);
    });
  });

  describe('error handling', () => {
    it('should emit handler:error on handler exception', async () => {
      const errors: unknown[] = [];
      bus.addListener('handler:error', (err) => errors.push(err));
      
      bus.subscribe('test:event', () => {
        throw new Error('Handler error');
      });

      await bus.publish('test:event', {});

      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toMatchObject({
        error: expect.any(Error)
      });
    });

    it('should track handler errors in stats', async () => {
      bus.subscribe('test:event', () => {
        throw new Error('Handler error');
      });

      await bus.publish('test:event', {});

      expect(bus.getStats().handlerErrors).toBe(1);
    });

    it('should continue processing other handlers after error', async () => {
      const handler1 = jest.fn(() => { throw new Error('Error'); });
      const handler2 = jest.fn();

      bus.subscribe('test:event', handler1);
      bus.subscribe('test:event', handler2);

      await bus.publish('test:event', {});

      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('subscribeOnce', () => {
    it('should subscribe only once', async () => {
      const handler = jest.fn();
      bus.subscribeOnce('test:event', handler);

      await bus.publish('test:event', {});
      await bus.publish('test:event', {});

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('global instance', () => {
    it('should return same instance', () => {
      const bus1 = getGlobalEventBus();
      const bus2 = getGlobalEventBus();
      expect(bus1).toBe(bus2);
    });

    it('should reset instance', () => {
      const bus1 = getGlobalEventBus();
      resetGlobalEventBus();
      const bus2 = getGlobalEventBus();
      expect(bus1).not.toBe(bus2);
    });
  });
});
