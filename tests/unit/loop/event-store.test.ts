/**
 * Event Store Unit Tests
 */

import { InMemoryEventStore, PostgresEventStore, CREATE_EVENTS_TABLE_SQL } from '../../../src/loop/event-store';
import type { GodelEvent } from '../../../src/loop/events/types';

describe('EventStore', () => {
  describe('InMemoryEventStore', () => {
    let store: InMemoryEventStore;

    beforeEach(() => {
      store = new InMemoryEventStore();
    });

    const createEvent = (overrides: Partial<GodelEvent> = {}): GodelEvent => ({
      id: `evt-${Date.now()}-${Math.random()}`,
      type: 'test:event',
      source: 'test',
      timestamp: Date.now(),
      payload: {},
      metadata: { version: 1, priority: 'normal' },
      ...overrides
    });

    describe('append', () => {
      it('should store an event', async () => {
        const event = createEvent();
        await store.append(event);

        expect(store.count).toBe(1);
      });

      it('should store multiple events', async () => {
        await store.append(createEvent());
        await store.append(createEvent());
        await store.append(createEvent());

        expect(store.count).toBe(3);
      });
    });

    describe('getStream', () => {
      it('should return events with matching correlationId', async () => {
        const correlationId = 'test-stream';
        await store.append(createEvent({ metadata: { correlationId, version: 1, priority: 'normal' } }));
        await store.append(createEvent({ metadata: { correlationId, version: 1, priority: 'normal' } }));
        await store.append(createEvent({ metadata: { correlationId: 'other', version: 1, priority: 'normal' } }));

        const events = await store.getStream(correlationId);

        expect(events).toHaveLength(2);
      });

      it('should return events sorted by timestamp', async () => {
        const correlationId = 'test-stream';
        const now = Date.now();
        
        await store.append(createEvent({ 
          timestamp: now + 100,
          metadata: { correlationId, version: 1, priority: 'normal' }
        }));
        await store.append(createEvent({ 
          timestamp: now,
          metadata: { correlationId, version: 1, priority: 'normal' }
        }));

        const events = await store.getStream(correlationId);

        expect(events[0].timestamp).toBe(now);
        expect(events[1].timestamp).toBe(now + 100);
      });
    });

    describe('getAll', () => {
      it('should return all events', async () => {
        await store.append(createEvent());
        await store.append(createEvent());

        const events = await store.getAll();

        expect(events).toHaveLength(2);
      });

      it('should support limit', async () => {
        for (let i = 0; i < 10; i++) {
          await store.append(createEvent());
        }

        const events = await store.getAll({ limit: 3 });

        expect(events).toHaveLength(3);
      });

      it('should support after timestamp', async () => {
        const now = Date.now();
        await store.append(createEvent({ timestamp: now }));
        await store.append(createEvent({ timestamp: now + 200 }));

        const events = await store.getAll({ after: now + 100 });

        expect(events).toHaveLength(1);
        expect(events[0].timestamp).toBe(now + 200);
      });

      it('should return events sorted by timestamp desc', async () => {
        const now = Date.now();
        await store.append(createEvent({ timestamp: now }));
        await store.append(createEvent({ timestamp: now + 100 }));

        const events = await store.getAll();

        expect(events[0].timestamp).toBe(now + 100);
        expect(events[1].timestamp).toBe(now);
      });
    });

    describe('getByType', () => {
      it('should return events matching type', async () => {
        await store.append(createEvent({ type: 'test:a' }));
        await store.append(createEvent({ type: 'test:b' }));
        await store.append(createEvent({ type: 'test:a' }));

        const events = await store.getByType('test:a');

        expect(events).toHaveLength(2);
      });

      it('should support since timestamp', async () => {
        const now = Date.now();
        await store.append(createEvent({ type: 'test:event', timestamp: now }));
        await store.append(createEvent({ type: 'test:event', timestamp: now + 200 }));

        const events = await store.getByType('test:event', { since: now + 100 });

        expect(events).toHaveLength(1);
      });

      it('should support limit', async () => {
        for (let i = 0; i < 5; i++) {
          await store.append(createEvent({ type: 'test:event' }));
        }

        const events = await store.getByType('test:event', { limit: 2 });

        expect(events).toHaveLength(2);
      });
    });

    describe('getBySource', () => {
      it('should return events matching source', async () => {
        await store.append(createEvent({ source: 'agent-1' }));
        await store.append(createEvent({ source: 'agent-2' }));
        await store.append(createEvent({ source: 'agent-1' }));

        const events = await store.getBySource('agent-1');

        expect(events).toHaveLength(2);
      });

      it('should support since timestamp', async () => {
        const now = Date.now();
        await store.append(createEvent({ source: 'agent', timestamp: now }));
        await store.append(createEvent({ source: 'agent', timestamp: now + 200 }));

        const events = await store.getBySource('agent', { since: now + 100 });

        expect(events).toHaveLength(1);
      });

      it('should support limit', async () => {
        for (let i = 0; i < 5; i++) {
          await store.append(createEvent({ source: 'agent' }));
        }

        const events = await store.getBySource('agent', { limit: 2 });

        expect(events).toHaveLength(2);
      });
    });

    describe('clear', () => {
      it('should remove all events', async () => {
        await store.append(createEvent());
        store.clear();

        expect(store.count).toBe(0);
      });
    });

    describe('close', () => {
      it('should close without error', async () => {
        await store.close();
      });
    });
  });

  describe('PostgresEventStore', () => {
    // Mock database for testing
    const createMockDb = () => {
      const data: unknown[] = [];
      let inTransaction = false;

      return {
        query: jest.fn(async (sql: string, params?: unknown[]) => {
          if (sql === 'BEGIN') {
            inTransaction = true;
            return { rows: [] };
          }
          if (sql === 'COMMIT') {
            inTransaction = false;
            return { rows: [] };
          }
          if (sql === 'ROLLBACK') {
            inTransaction = false;
            return { rows: [] };
          }

          if (sql.includes('INSERT INTO events')) {
            data.push({ ...params });
            return { rows: [] };
          }

          if (sql.includes('SELECT * FROM events')) {
            return { rows: [...data] };
          }

          return { rows: [] };
        }),
        getData: () => data
      };
    };

    it('should batch events', async () => {
      const mockDb = createMockDb();
      const store = new PostgresEventStore(mockDb as any, { batchSize: 2 });

      await store.append(createMockEvent('1'));
      await store.append(createMockEvent('2'));

      // Should have flushed automatically
      expect(mockDb.getData()).toHaveLength(2);

      await store.close();
    });

    it('should flush on close', async () => {
      const mockDb = createMockDb();
      const store = new PostgresEventStore(mockDb as any, { batchSize: 10 });

      await store.append(createMockEvent('1'));
      expect(mockDb.getData()).toHaveLength(0);

      await store.close();
      expect(mockDb.getData()).toHaveLength(1);
    });

    const createMockEvent = (id: string): GodelEvent => ({
      id,
      type: 'test:event',
      source: 'test',
      timestamp: Date.now(),
      payload: {},
      metadata: { version: 1, priority: 'normal' }
    });
  });

  describe('CREATE_EVENTS_TABLE_SQL', () => {
    it('should contain CREATE TABLE statement', () => {
      expect(CREATE_EVENTS_TABLE_SQL).toContain('CREATE TABLE IF NOT EXISTS events');
    });

    it('should contain indexes', () => {
      expect(CREATE_EVENTS_TABLE_SQL).toContain('idx_events_type');
      expect(CREATE_EVENTS_TABLE_SQL).toContain('idx_events_source');
      expect(CREATE_EVENTS_TABLE_SQL).toContain('idx_events_timestamp');
      expect(CREATE_EVENTS_TABLE_SQL).toContain('idx_events_correlation');
    });
  });
});
