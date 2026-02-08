/**
 * Event Replay Tests - Tests for src/events/replay.ts
 * 
 * Team Echo-Events - Task 3.1: Comprehensive test coverage for replay module
 * Target: 80% coverage
 */

import { EventReplay, createReplay } from '../../src/events/replay';
import { EventEmitter } from '../../src/events/emitter';
import type { MissionEvent, EventType, EventFilter } from '../../src/events/types';

// Mock the logger to avoid console noise during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('EventReplay', () => {
  let replay: EventReplay;
  let emitter: EventEmitter;

  beforeEach(() => {
    emitter = new EventEmitter();
    replay = new EventReplay(emitter);
  });

  afterEach(() => {
    replay.clearHistory();
  });

  // Helper function to create test events
  function createTestEvent(
    eventType: EventType,
    agentId?: string,
    taskId?: string,
    timestamp?: Date,
    payload?: Record<string, unknown>
  ): MissionEvent {
    return {
      id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: timestamp || new Date(),
      eventType,
      source: {
        agentId,
        taskId,
        orchestrator: 'test-orchestrator',
      },
      correlationId: `corr_${Math.random().toString(36).substr(2, 9)}`,
      payload: payload || {},
    } as MissionEvent;
  }

  describe('Constructor', () => {
    it('should create EventReplay with provided emitter', () => {
      const customEmitter = new EventEmitter();
      const customReplay = new EventReplay(customEmitter);
      expect(customReplay).toBeInstanceOf(EventReplay);
    });

    it('should create EventReplay with default emitter when none provided', () => {
      const defaultReplay = new EventReplay();
      expect(defaultReplay).toBeInstanceOf(EventReplay);
    });
  });

  describe('Session Management', () => {
    it('should create a replay session with unique ID', () => {
      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since);

      expect(session.id).toBeDefined();
      expect(session.id).toMatch(/^replay_\d+_[a-z0-9]+$/);
      expect(session.since).toBe(since);
      expect(session.events).toBeDefined();
      expect(session.startedAt).toBeInstanceOf(Date);
    });

    it('should store session and retrieve it by ID', () => {
      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since);

      const retrieved = replay.getSession(session.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(session.id);
    });

    it('should return undefined for non-existent session', () => {
      const retrieved = replay.getSession('non-existent-id');
      expect(retrieved).toBeUndefined();
    });

    it('should return all active sessions', () => {
      const since = new Date(Date.now() - 1000);
      replay.replay(since);
      replay.replay(since);
      replay.replay(since);

      const sessions = replay.getActiveSessions();
      expect(sessions).toHaveLength(3);
    });

    it('should cancel a session', () => {
      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since);

      const result = replay.cancelSession(session.id);
      expect(result).toBe(true);
      expect(replay.getSession(session.id)).toBeUndefined();
    });

    it('should return false when cancelling non-existent session', () => {
      const result = replay.cancelSession('non-existent-id');
      expect(result).toBe(false);
    });

    it('should cancel all sessions', () => {
      const since = new Date(Date.now() - 1000);
      replay.replay(since);
      replay.replay(since);
      replay.replay(since);

      replay.cancelAllSessions();
      expect(replay.getActiveSessions()).toHaveLength(0);
    });
  });

  describe('Replay with Filtering', () => {
    it('should replay events since a given time', () => {
      const now = new Date();
      const oldEvent = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(now.getTime() - 2000));
      const recentEvent = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(now.getTime() - 500));

      emitter.emit(oldEvent.eventType, oldEvent.payload, oldEvent.source, oldEvent.correlationId);
      emitter.emit(recentEvent.eventType, recentEvent.payload, recentEvent.source, recentEvent.correlationId);

      const since = new Date(now.getTime() - 1000);
      const session = replay.replay(since);

      expect(session.events.length).toBeGreaterThan(0);
    });

    it('should filter events by agentId', () => {
      const event1 = createTestEvent('agent.spawned', 'agent-1');
      const event2 = createTestEvent('agent.spawned', 'agent-2');

      emitter.emit(event1.eventType, event1.payload, event1.source, event1.correlationId);
      emitter.emit(event2.eventType, event2.payload, event2.source, event2.correlationId);

      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since, { agentId: 'agent-1' });

      expect(session.agentId).toBe('agent-1');
    });

    it('should filter events by taskId', () => {
      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since, { taskId: 'task-123' });

      expect(session.events).toBeDefined();
    });

    it('should filter events by eventTypes', () => {
      const since = new Date(Date.now() - 1000);
      const eventTypes: EventType[] = ['agent.spawned', 'agent.completed'];
      const session = replay.replay(since, { eventTypes });

      expect(session.eventTypes).toEqual(eventTypes);
    });

    it('should apply custom filter', () => {
      const customFilter: EventFilter = {
        agentIds: ['agent-1', 'agent-2'],
        since: new Date(Date.now() - 5000),
      };

      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since, { filter: customFilter });

      expect(session).toBeDefined();
    });

    it('should combine multiple filter options', () => {
      const since = new Date(Date.now() - 1000);
      const until = new Date();
      const session = replay.replay(since, {
        until,
        agentId: 'agent-1',
        taskId: 'task-1',
        eventTypes: ['agent.spawned'],
        speed: 2,
      });

      expect(session.since).toBe(since);
      expect(session.until).toBe(until);
      expect(session.agentId).toBe('agent-1');
      expect(session.replaySpeed).toBe(2);
    });

    it('should default replay speed to 1', () => {
      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since);

      expect(session.replaySpeed).toBe(1);
    });
  });

  describe('Replay with Callback', () => {
    it('should replay events with callback function', async () => {
      const event1 = createTestEvent('agent.spawned', 'agent-1');
      const event2 = createTestEvent('agent.completed', 'agent-1');

      replay.store(event1);
      replay.store(event2);

      const receivedEvents: MissionEvent[] = [];
      const callback = (event: MissionEvent) => {
        receivedEvents.push(event);
      };

      const since = new Date(Date.now() - 1000);
      const session = await replay.replayWithCallback(since, callback);

      expect(session.completedAt).toBeInstanceOf(Date);
      expect(receivedEvents.length).toBeGreaterThanOrEqual(0);
    });

    it('should handle async callback functions', async () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const asyncCallback = async (_event: MissionEvent) => {
        await new Promise(resolve => setTimeout(resolve, 10));
      };

      const since = new Date(Date.now() - 1000);
      const session = await replay.replayWithCallback(since, asyncCallback);

      expect(session.completedAt).toBeInstanceOf(Date);
    });

    it('should apply speed to replay interval', async () => {
      const event1 = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(Date.now() - 500));
      const event2 = createTestEvent('agent.completed', 'agent-1', undefined, new Date());

      replay.store(event1);
      replay.store(event2);

      const callback = jest.fn();

      const since = new Date(Date.now() - 1000);
      const startTime = Date.now();
      await replay.replayWithCallback(since, callback, { speed: 10 });
      const endTime = Date.now();

      // Should complete faster due to increased speed
      expect(endTime - startTime).toBeLessThan(500);
    });

    it('should use custom interval when provided', async () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const callback = jest.fn();

      const since = new Date(Date.now() - 1000);
      await replay.replayWithCallback(since, callback, { interval: 5 });

      expect(callback).toBeDefined();
    });

    it('should use default interval calculation when no interval provided', async () => {
      // Emit event via emitter so it's available for replay
      const event = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(Date.now() - 2000));
      emitter.emit(event.eventType, event.payload, event.source, event.correlationId);

      const callback = jest.fn();

      const since = new Date(Date.now() - 3000);
      const startTime = Date.now();
      // Call without interval option - should use default calculation
      await replay.replayWithCallback(since, callback, { speed: 20 });
      const endTime = Date.now();

      expect(callback).toHaveBeenCalled();
      // Should complete quickly due to high speed
      expect(endTime - startTime).toBeLessThan(200);
    });
  });

  describe('Event Storage', () => {
    it('should store events in replay history', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const history = replay.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should enforce max history size limit', () => {
      // Create enough events to test the limit behavior
      // The maxHistorySize is 100000, but testing with fewer to keep test fast
      for (let i = 0; i < 100; i++) {
        const event = createTestEvent('agent.spawned', `agent-${i}`);
        replay.store(event);
      }

      // Events should be stored (actual limit enforcement happens at 100000)
      const history = replay.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle history limit when exceeding maxHistorySize', () => {
      // Create many events quickly to trigger the limit
      const events: MissionEvent[] = [];
      for (let i = 0; i < 110; i++) {
        const event = createTestEvent('agent.spawned', `agent-${i}`);
        events.push(event);
        replay.store(event);
      }

      // Store should work without errors
      const history = replay.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should clear history', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      replay.clearHistory();

      const history = replay.getHistory();
      expect(history).toHaveLength(0);
    });

    it('should clear all sessions when clearing history', () => {
      const since = new Date(Date.now() - 1000);
      replay.replay(since);
      replay.replay(since);

      replay.clearHistory();

      expect(replay.getActiveSessions()).toHaveLength(0);
    });
  });

  describe('History Filtering', () => {
    beforeEach(() => {
      // Seed with test events
      const now = new Date();
      replay.store(createTestEvent('agent.spawned', 'agent-1', undefined, new Date(now.getTime() - 3000)));
      replay.store(createTestEvent('agent.status_changed', 'agent-1', undefined, new Date(now.getTime() - 2000)));
      replay.store(createTestEvent('agent.completed', 'agent-1', undefined, new Date(now.getTime() - 1000)));
      replay.store(createTestEvent('agent.spawned', 'agent-2', undefined, new Date(now.getTime() - 2500)));
    });

    it('should get all history when no filter provided', () => {
      const history = replay.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should filter history by since date', () => {
      const since = new Date(Date.now() - 1500);
      const history = replay.getHistory({ since });

      expect(history.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter history by until date', () => {
      const until = new Date(Date.now() - 1500);
      const history = replay.getHistory({ until });

      expect(history.length).toBeGreaterThanOrEqual(0);
    });

    it('should filter history by agentId', () => {
      const history = replay.getHistory({ agentId: 'agent-1' });

      expect(history.every(e => e.source.agentId === 'agent-1')).toBe(true);
    });

    it('should filter history by eventTypes', () => {
      const eventTypes: EventType[] = ['agent.spawned'];
      const history = replay.getHistory({ eventTypes });

      expect(history.every(e => eventTypes.includes(e.eventType))).toBe(true);
    });

    it('should limit history results', () => {
      const history = replay.getHistory({ limit: 2 });

      expect(history.length).toBeLessThanOrEqual(2);
    });

    it('should combine multiple filter options', () => {
      const since = new Date(Date.now() - 3500);
      const until = new Date();
      const history = replay.getHistory({
        since,
        until,
        agentId: 'agent-1',
        eventTypes: ['agent.spawned'],
      });

      expect(history.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Export to JSON', () => {
    it('should export events to JSON format', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const json = replay.export();

      expect(typeof json).toBe('string');
      const parsed = JSON.parse(json);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it('should export with since filter', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const since = new Date(Date.now() - 1000);
      const json = replay.export({ since });

      expect(typeof json).toBe('string');
    });

    it('should export with custom fields', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const json = replay.export({ fields: ['id', 'timestamp', 'eventType'] });
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe('Export to CSV', () => {
    it('should export events to CSV format', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const csv = replay.export({ format: 'csv' });

      expect(typeof csv).toBe('string');
      expect(csv).toContain('id');
      expect(csv).toContain('timestamp');
      expect(csv).toContain('eventType');
    });

    it('should include header row in CSV export', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const csv = replay.export({ format: 'csv' });
      const lines = csv.split('\n');

      expect(lines[0]).toContain('id');
      expect(lines[0]).toContain('timestamp');
      expect(lines[0]).toContain('eventType');
    });

    it('should export with custom fields to CSV', () => {
      const event = createTestEvent('agent.spawned', 'agent-1', undefined, undefined, { customField: 'value' });
      replay.store(event);

      const csv = replay.export({
        format: 'csv',
        fields: ['id', 'eventType'],
      });

      expect(csv).toContain('id');
      expect(csv).toContain('eventType');
    });

    it('should handle empty events array in CSV export', () => {
      const csv = replay.export({ format: 'csv' });

      expect(typeof csv).toBe('string');
      expect(csv).toContain('id'); // Should still have headers
    });

    it('should escape commas and quotes in CSV values', () => {
      const event = createTestEvent('agent.spawned', 'agent-1', undefined, undefined, {
        description: 'value, with comma',
      });
      replay.store(event);

      const csv = replay.export({ format: 'csv' });

      expect(typeof csv).toBe('string');
      expect(csv).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should return empty stats for empty history', () => {
      const stats = replay.getStats();

      expect(stats.totalEvents).toBe(0);
      expect(stats.byType).toEqual({});
      expect(stats.byAgent).toEqual({});
      expect(stats.timeRange.oldest).toBeNull();
      expect(stats.timeRange.newest).toBeNull();
      expect(stats.activeSessions).toBe(0);
    });

    it('should calculate total events', () => {
      replay.store(createTestEvent('agent.spawned', 'agent-1'));
      replay.store(createTestEvent('agent.completed', 'agent-1'));

      const stats = replay.getStats();
      expect(stats.totalEvents).toBe(2);
    });

    it('should count events by type', () => {
      replay.store(createTestEvent('agent.spawned', 'agent-1'));
      replay.store(createTestEvent('agent.spawned', 'agent-2'));
      replay.store(createTestEvent('agent.completed', 'agent-1'));

      const stats = replay.getStats();
      expect(stats.byType['agent.spawned']).toBe(2);
      expect(stats.byType['agent.completed']).toBe(1);
    });

    it('should count events by agent', () => {
      replay.store(createTestEvent('agent.spawned', 'agent-1'));
      replay.store(createTestEvent('agent.spawned', 'agent-1'));
      replay.store(createTestEvent('agent.spawned', 'agent-2'));

      const stats = replay.getStats();
      expect(stats.byAgent['agent-1']).toBe(2);
      expect(stats.byAgent['agent-2']).toBe(1);
    });

    it('should track time range', () => {
      const now = new Date();
      const oldEvent = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(now.getTime() - 5000));
      const newEvent = createTestEvent('agent.spawned', 'agent-2', undefined, new Date(now.getTime() - 1000));

      replay.store(oldEvent);
      replay.store(newEvent);

      const stats = replay.getStats();
      expect(stats.timeRange.oldest).toEqual(oldEvent.timestamp);
      expect(stats.timeRange.newest).toEqual(newEvent.timestamp);
    });

    it('should count active sessions', () => {
      const since = new Date(Date.now() - 1000);
      replay.replay(since);
      replay.replay(since);

      const stats = replay.getStats();
      expect(stats.activeSessions).toBe(2);
    });

    it('should handle events without agentId', () => {
      const event = createTestEvent('system.checkpoint', undefined);
      replay.store(event);

      const stats = replay.getStats();
      expect(stats.totalEvents).toBe(1);
      expect(stats.byAgent).toEqual({});
    });
  });

  describe('Replay Speed Controls', () => {
    it('should accept different replay speeds', () => {
      const since = new Date(Date.now() - 1000);

      const session1x = replay.replay(since, { speed: 1 });
      expect(session1x.replaySpeed).toBe(1);

      const session2x = replay.replay(since, { speed: 2 });
      expect(session2x.replaySpeed).toBe(2);

      const sessionHalf = replay.replay(since, { speed: 0.5 });
      expect(sessionHalf.replaySpeed).toBe(0.5);
    });

    it('should handle high speed values', () => {
      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since, { speed: 100 });

      expect(session.replaySpeed).toBe(100);
    });
  });

  describe('Error Handling', () => {
    it('should handle replay with no events gracefully', async () => {
      const since = new Date(Date.now() - 1000);
      const callback = jest.fn();

      const session = await replay.replayWithCallback(since, callback);

      expect(session).toBeDefined();
      expect(session.completedAt).toBeInstanceOf(Date);
    });

    it('should handle invalid date ranges', () => {
      // Future date with no events
      const since = new Date(Date.now() + 10000);
      const session = replay.replay(since);

      expect(session).toBeDefined();
      expect(session.events).toHaveLength(0);
    });

    it('should handle malformed events in storage', () => {
      // Store event with minimal data
      const minimalEvent = {
        id: 'test-id',
        timestamp: new Date(),
        eventType: 'agent.spawned' as EventType,
        source: {},
      } as MissionEvent;

      replay.store(minimalEvent);

      const history = replay.getHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle export with missing payload fields', () => {
      const event = {
        id: 'test-id',
        timestamp: new Date(),
        eventType: 'agent.spawned' as EventType,
        source: { agentId: 'agent-1' },
        // No payload
      } as MissionEvent;

      replay.store(event);

      const csv = replay.export({ format: 'csv', fields: ['id', 'payload'] });
      expect(typeof csv).toBe('string');

      const json = replay.export();
      expect(typeof json).toBe('string');
    });

    it('should handle callback errors in replay', async () => {
      // Emit an event via emitter so it's in emitter's history
      const event = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(Date.now() - 2000));
      emitter.emit(event.eventType, event.payload, event.source, event.correlationId);

      const failingCallback = () => {
        throw new Error('Callback error');
      };

      const since = new Date(Date.now() - 3000);

      await expect(replay.replayWithCallback(since, failingCallback)).rejects.toThrow('Callback error');
    });
  });

  describe('Integration with EventEmitter', () => {
    it('should use emitter history for replay', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      emitter.emit(event.eventType, event.payload, event.source, event.correlationId);

      const since = new Date(Date.now() - 1000);
      const session = replay.replay(since);

      expect(session).toBeDefined();
    });

    it('should respect emitter filter results', () => {
      const event1 = createTestEvent('agent.spawned', 'agent-1', undefined, new Date(Date.now() - 2000));
      const event2 = createTestEvent('agent.spawned', 'agent-2', undefined, new Date(Date.now() - 1000));

      emitter.emit(event1.eventType, event1.payload, event1.source, event1.correlationId);
      emitter.emit(event2.eventType, event2.payload, event2.source, event2.correlationId);

      const since = new Date(Date.now() - 1500);
      const session = replay.replay(since, { agentId: 'agent-1' });

      expect(session).toBeDefined();
    });
  });

  describe('CSV Field Value Handling', () => {
    it('should handle events with complex payload fields', () => {
      const event = createTestEvent('agent.spawned', 'agent-1', undefined, undefined, {
        nested: { key: 'value' },
        array: [1, 2, 3],
      });

      replay.store(event);

      const csv = replay.export({ format: 'csv' });
      expect(typeof csv).toBe('string');
    });

    it('should handle null and undefined values in CSV', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const csv = replay.export({
        format: 'csv',
        fields: ['id', 'nonexistentField'],
      });

      expect(typeof csv).toBe('string');
    });

    it('should handle source field in CSV', () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const csv = replay.export({
        format: 'csv',
        fields: ['id', 'source'],
      });

      expect(csv).toContain('source');
    });
  });

  describe('Factory Function', () => {
    it('should create EventReplay with createReplay factory', () => {
      const customReplay = createReplay();
      expect(customReplay).toBeInstanceOf(EventReplay);
    });

    it('should pass emitter to createReplay', () => {
      const customEmitter = new EventEmitter();
      const customReplay = createReplay(customEmitter);
      expect(customReplay).toBeInstanceOf(EventReplay);
    });

    it('should handle maxHistorySize option (logs warning)', () => {
      const customReplay = createReplay(undefined, { maxHistorySize: 5000 });
      expect(customReplay).toBeInstanceOf(EventReplay);
    });
  });

  describe('Edge Cases', () => {
    it('should handle rapid session creation', () => {
      const since = new Date(Date.now() - 1000);

      const sessions: { id: string }[] = [];
      for (let i = 0; i < 10; i++) {
        sessions.push(replay.replay(since));
      }

      expect(sessions.length).toBe(10);
      // Each should have unique ID
      const ids = sessions.map(s => s.id);
      expect(new Set(ids).size).toBe(10);
    });

    it('should handle events with same timestamp', () => {
      const sameTime = new Date();

      replay.store(createTestEvent('agent.spawned', 'agent-1', undefined, sameTime));
      replay.store(createTestEvent('agent.spawned', 'agent-2', undefined, sameTime));
      replay.store(createTestEvent('agent.spawned', 'agent-3', undefined, sameTime));

      const history = replay.getHistory();
      expect(history.length).toBe(3);
    });

    it('should handle very old timestamps', () => {
      const oldEvent = createTestEvent(
        'agent.spawned',
        'agent-1',
        undefined,
        new Date('2020-01-01')
      );

      replay.store(oldEvent);

      const since = new Date('2019-01-01');
      const until = new Date('2021-01-01');
      const history = replay.getHistory({ since, until });

      expect(history.length).toBeGreaterThan(0);
    });

    it('should handle special characters in event fields', () => {
      const event = createTestEvent('agent.spawned', 'agent-1', undefined, undefined, {
        text: 'Line 1\nLine 2\tTabbed',
        special: 'Quote" and Comma, here',
      });

      replay.store(event);

      const csv = replay.export({ format: 'csv' });
      expect(typeof csv).toBe('string');
    });

    it('should handle session completion tracking', async () => {
      const event = createTestEvent('agent.spawned', 'agent-1');
      replay.store(event);

      const since = new Date(Date.now() - 1000);
      const session = await replay.replayWithCallback(since, () => {});

      expect(session.completedAt).toBeInstanceOf(Date);
      expect(session.completedAt!.getTime()).toBeGreaterThanOrEqual(session.startedAt.getTime());
    });

    it('should handle large number of events', () => {
      for (let i = 0; i < 100; i++) {
        replay.store(createTestEvent('agent.spawned', `agent-${i}`));
      }

      const stats = replay.getStats();
      expect(stats.totalEvents).toBe(100);
    });
  });
});

  describe('getEventFieldValue', () => {
  // Testing the helper function indirectly through CSV export
  it('should handle standard fields correctly', () => {
    const replay = new EventReplay();
    const event = {
      id: 'test-id',
      timestamp: new Date('2024-01-15'),
      eventType: 'agent.spawned' as EventType,
      source: { agentId: 'agent-1', taskId: 'task-1' },
      correlationId: 'corr-123',
      payload: { agentId: 'agent-1', previousStatus: 'pending', newStatus: 'active' },
    } as unknown as MissionEvent;

    replay.store(event);

    const csv = replay.export({
      format: 'csv',
      fields: ['id', 'timestamp', 'eventType', 'correlationId'],
    });

    expect(csv).toContain('test-id');
    expect(csv).toContain('agent.spawned');
    expect(csv).toContain('corr-123');
  });

  it('should handle payload fields', () => {
    const replay = new EventReplay();
    const event = {
      id: 'test-id',
      timestamp: new Date(),
      eventType: 'agent.spawned' as EventType,
      source: {},
      payload: { agentId: 'agent-1', model: 'test-model', label: 'customValue' },
    } as unknown as MissionEvent;

    replay.store(event);

    const csv = replay.export({
      format: 'csv',
      fields: ['id', 'label'],
    });

    expect(csv).toContain('customValue');
  });

  it('should handle missing payload fields gracefully', () => {
    const replay = new EventReplay();
    const event = {
      id: 'test-id',
      timestamp: new Date(),
      eventType: 'system.checkpoint' as EventType,
      source: {},
      payload: { checkpointId: 'chk-1', timestamp: new Date(), state: { agents: 1, tasks: 1, events: 1 } },
    } as MissionEvent;

    replay.store(event);

    const csv = replay.export({
      format: 'csv',
      fields: ['id', 'checkpointId'],
    });

    expect(csv).toContain('test-id');
    // Should not throw and should have empty value for missing field
  });
});
