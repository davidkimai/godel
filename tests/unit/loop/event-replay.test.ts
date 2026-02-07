/**
 * Event Replay Engine Tests
 */

import {
  EventReplayEngine,
  InMemoryEventStore,
  ReplayBuilder,
  type GodelEvent,
  type ProjectionHandler,
  type ReplayOptions,
} from '../../../src/loop/event-replay';

describe('EventReplayEngine', () => {
  let eventStore: InMemoryEventStore;
  let handlers: Map<string, ProjectionHandler>;
  let replayEngine: EventReplayEngine;

  beforeEach(() => {
    eventStore = new InMemoryEventStore();
    handlers = new Map();
    replayEngine = new EventReplayEngine(eventStore, handlers);
  });

  function createEvent(
    type: string,
    source: string,
    timestamp: number,
    payload: Record<string, unknown> = {},
    correlationId?: string
  ): GodelEvent {
    return {
      id: `evt_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      source,
      timestamp,
      payload,
      metadata: {
        version: 1,
        priority: 'normal',
        correlationId,
      },
    };
  }

  describe('Sequential Replay', () => {
    it('should replay events in order', async () => {
      const processed: string[] = [];

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async (event: GodelEvent) => {
          processed.push(event.id);
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'source1', 1000, {}, 'corr-1'),
        createEvent('test.event', 'source1', 2000, {}, 'corr-1'),
        createEvent('test.event', 'source2', 1500, {}, 'corr-2'),
      ];

      eventStore.addEvents(events);

      const result = await replayEngine.replay({ parallel: false });

      expect(result.processed).toBe(3);
      expect(result.failed).toBe(0);
      expect(processed).toHaveLength(3);
    });

    it('should filter events', async () => {
      const processed: GodelEvent[] = [];

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async (event: GodelEvent) => {
          processed.push(event);
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'source1', 1000),
        createEvent('other.event', 'source1', 2000),
        createEvent('test.event', 'source2', 3000),
      ];

      eventStore.addEvents(events);

      const result = await replayEngine.replay({
        filter: e => e.type === 'test.event',
      });

      expect(result.processed).toBe(2);
      expect(result.skipped).toBe(1);
      expect(processed.every(e => e.type === 'test.event')).toBe(true);
    });

    it('should report progress', async () => {
      const progressCalls: Array<[number, number]> = [];

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async () => {
          // Simulate some work
          await new Promise(r => setTimeout(r, 1));
        },
      };

      handlers.set('test', handler);

      const events = Array.from({ length: 250 }, (_, i) =>
        createEvent('test.event', 'source1', 1000 + i)
      );

      eventStore.addEvents(events);

      const result = await replayEngine.replay({
        onProgress: (p, t) => progressCalls.push([p, t]),
      });

      expect(result.processed).toBe(250);
      expect(progressCalls.length).toBeGreaterThan(0);
      expect(progressCalls[progressCalls.length - 1]).toEqual([250, 250]);
    });

    it('should handle handler errors with stopOnError', async () => {
      const handler: ProjectionHandler = {
        name: 'FailingHandler',
        handle: async (event: GodelEvent) => {
          if (event.payload.shouldFail) {
            throw new Error('Handler error');
          }
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'source1', 1000, { shouldFail: false }),
        createEvent('test.event', 'source1', 2000, { shouldFail: true }),
        createEvent('test.event', 'source1', 3000, { shouldFail: false }),
      ];

      eventStore.addEvents(events);

      await expect(
        replayEngine.replay({ stopOnError: true })
      ).rejects.toThrow('Handler error');
    });

    it('should continue on error without stopOnError', async () => {
      const handler: ProjectionHandler = {
        name: 'FailingHandler',
        handle: async (event: GodelEvent) => {
          if (event.payload.shouldFail) {
            throw new Error('Handler error');
          }
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'source1', 1000, { shouldFail: false }),
        createEvent('test.event', 'source1', 2000, { shouldFail: true }),
        createEvent('test.event', 'source1', 3000, { shouldFail: false }),
      ];

      eventStore.addEvents(events);

      const result = await replayEngine.replay({
        stopOnError: false,
        maxFailureRate: 0.5, // Allow up to 50% failures
      });

      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
    });

    it('should abort when failure rate exceeds threshold', async () => {
      const handler: ProjectionHandler = {
        name: 'FailingHandler',
        handle: async () => {
          throw new Error('Always fails');
        },
      };

      handlers.set('test', handler);

      const events = Array.from({ length: 10 }, (_, i) =>
        createEvent('test.event', 'source1', 1000 + i)
      );

      eventStore.addEvents(events);

      await expect(
        replayEngine.replay({ maxFailureRate: 0.05 }) // 5% threshold
      ).rejects.toThrow('Too many failures');
    });
  });

  describe('Parallel Replay', () => {
    it('should replay events grouped by correlation ID', async () => {
      const processedByCorr: Record<string, string[]> = {};

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async (event: GodelEvent) => {
          const corrId = event.metadata.correlationId || 'none';
          if (!processedByCorr[corrId]) {
            processedByCorr[corrId] = [];
          }
          processedByCorr[corrId].push(event.id);
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'source1', 1000, {}, 'corr-1'),
        createEvent('test.event', 'source1', 2000, {}, 'corr-1'),
        createEvent('test.event', 'source2', 1500, {}, 'corr-2'),
        createEvent('test.event', 'source2', 2500, {}, 'corr-2'),
      ];

      eventStore.addEvents(events);

      const result = await replayEngine.replay({
        parallel: true,
        maxParallelWorkers: 2,
      });

      expect(result.processed).toBe(4);
      expect(Object.keys(processedByCorr)).toContain('corr-1');
      expect(Object.keys(processedByCorr)).toContain('corr-2');
    });

    it('should limit concurrent workers', async () => {
      let concurrent = 0;
      let maxConcurrent = 0;

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async () => {
          concurrent++;
          maxConcurrent = Math.max(maxConcurrent, concurrent);
          await new Promise(r => setTimeout(r, 50));
          concurrent--;
        },
      };

      handlers.set('test', handler);

      // Create events with different correlation IDs
      const events = Array.from({ length: 6 }, (_, i) =>
        createEvent('test.event', `source${i}`, 1000 + i, {}, `corr-${i % 3}`)
      );

      eventStore.addEvents(events);

      await replayEngine.replay({
        parallel: true,
        maxParallelWorkers: 2,
      });

      // Should not exceed max workers
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  describe('Time-based Queries', () => {
    it('should replay events within time range', async () => {
      const processed: GodelEvent[] = [];

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async (event: GodelEvent) => {
          processed.push(event);
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'source1', 1000),
        createEvent('test.event', 'source1', 2000),
        createEvent('test.event', 'source1', 3000),
        createEvent('test.event', 'source1', 4000),
      ];

      eventStore.addEvents(events);

      const result = await replayEngine.replay({
        from: 1500,
        to: 3500,
      });

      expect(result.processed).toBe(2);
      expect(processed[0].timestamp).toBe(2000);
      expect(processed[1].timestamp).toBe(3000);
    });
  });

  describe('Stream Replay', () => {
    it('should replay events for a specific stream', async () => {
      const processed: GodelEvent[] = [];

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async (event: GodelEvent) => {
          processed.push(event);
        },
      };

      handlers.set('test', handler);

      const events = [
        createEvent('test.event', 'stream-1', 1000, {}, 'stream-1'),
        createEvent('test.event', 'stream-2', 2000, {}, 'stream-2'),
        createEvent('test.event', 'stream-1', 3000, {}, 'stream-1'),
      ];

      eventStore.addEvents(events);

      const result = await replayEngine.replayStream('stream-1');

      expect(result.processed).toBe(2);
      expect(processed.every(e => e.source === 'stream-1')).toBe(true);
    });
  });

  describe('Abort', () => {
    it('should abort replay in progress', async () => {
      const processed: GodelEvent[] = [];

      const handler: ProjectionHandler = {
        name: 'SlowHandler',
        handle: async (event: GodelEvent) => {
          processed.push(event);
          await new Promise(r => setTimeout(r, 100));
        },
      };

      handlers.set('test', handler);

      const events = Array.from({ length: 10 }, (_, i) =>
        createEvent('test.event', 'source1', 1000 + i)
      );

      eventStore.addEvents(events);

      const replayPromise = replayEngine.replay({});

      // Abort after a short delay
      setTimeout(() => replayEngine.abort(), 50);

      await expect(replayPromise).rejects.toThrow('Replay aborted');
      expect(processed.length).toBeLessThan(10);
    });
  });

  describe('Events', () => {
    it('should emit replay events', async () => {
      const events: string[] = [];

      replayEngine.on('replay:started', () => events.push('started'));
      replayEngine.on('replay:completed', () => events.push('completed'));
      replayEngine.on('replay:event:processed', () => events.push('event'));

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async () => {},
      };

      handlers.set('test', handler);

      eventStore.addEvents([createEvent('test.event', 'source1', 1000)]);

      await replayEngine.replay({});

      expect(events).toContain('started');
      expect(events).toContain('completed');
      expect(events).toContain('event');
    });
  });

  describe('ReplayBuilder', () => {
    it('should build and execute replay with fluent API', async () => {
      const processed: GodelEvent[] = [];

      const handler: ProjectionHandler = {
        name: 'TestHandler',
        handle: async (event: GodelEvent) => {
          processed.push(event);
        },
      };

      const events = [
        createEvent('test.event', 'source1', 1000),
        createEvent('test.event', 'source1', 2000),
        createEvent('other.event', 'source1', 3000),
      ];

      eventStore.addEvents(events);

      const result = await ReplayBuilder.create(eventStore)
        .withHandler('test', handler)
        .from(1500)
        .filter(e => e.type === 'test.event')
        .sequential()
        .replay();

      expect(result.processed).toBe(1);
      expect(processed[0].timestamp).toBe(2000);
    });
  });
});

describe('InMemoryEventStore', () => {
  let store: InMemoryEventStore;

  beforeEach(() => {
    store = new InMemoryEventStore();
  });

  function createEvent(
    type: string,
    source: string,
    timestamp: number,
    correlationId?: string
  ) {
    return {
      id: `evt_${timestamp}`,
      type,
      source,
      timestamp,
      payload: {},
      metadata: {
        version: 1,
        priority: 'normal' as const,
        correlationId,
      },
    };
  }

  it('should store and retrieve events', async () => {
    const event = createEvent('test', 'source1', 1000);
    store.addEvent(event);

    const events = await store.getAll({});
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(event.id);
  });

  it('should filter by time range', async () => {
    store.addEvents([
      createEvent('test', 'source1', 1000),
      createEvent('test', 'source1', 2000),
      createEvent('test', 'source1', 3000),
    ]);

    const events = await store.getAll({ after: 1500, before: 2500 });
    expect(events).toHaveLength(1);
    expect(events[0].timestamp).toBe(2000);
  });

  it('should filter by type', async () => {
    store.addEvents([
      createEvent('type-a', 'source1', 1000),
      createEvent('type-b', 'source1', 2000),
      createEvent('type-a', 'source1', 3000),
    ]);

    const events = await store.getAll({ types: ['type-a'] });
    expect(events).toHaveLength(2);
  });

  it('should get events by stream', async () => {
    store.addEvents([
      createEvent('test', 'stream-1', 1000, 'stream-1'),
      createEvent('test', 'stream-2', 2000, 'stream-2'),
      createEvent('test', 'stream-1', 3000, 'stream-1'),
    ]);

    const events = await store.getStream('stream-1');
    expect(events).toHaveLength(2);
  });

  it('should get events by correlation ID', async () => {
    store.addEvents([
      createEvent('test', 'source1', 1000, 'corr-1'),
      createEvent('test', 'source2', 2000, 'corr-2'),
      createEvent('test', 'source3', 3000, 'corr-1'),
    ]);

    const events = await store.getByCorrelationId('corr-1');
    expect(events).toHaveLength(2);
  });

  it('should sort events by timestamp', async () => {
    store.addEvents([
      createEvent('test', 'source1', 3000),
      createEvent('test', 'source1', 1000),
      createEvent('test', 'source1', 2000),
    ]);

    const events = await store.getAll({});
    expect(events[0].timestamp).toBe(1000);
    expect(events[1].timestamp).toBe(2000);
    expect(events[2].timestamp).toBe(3000);
  });
});
