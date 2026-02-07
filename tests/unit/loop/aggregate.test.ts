/**
 * Event Sourced Aggregate Tests
 */

import {
  AgentAggregate,
  InMemorySnapshotStore,
  type AgentCapabilities,
  type GodelEvent,
} from '../../../src/loop';

describe('AgentAggregate', () => {
  let aggregate: AgentAggregate;
  const capabilities: AgentCapabilities = {
    skills: ['typescript', 'testing'],
    languages: ['typescript', 'javascript'],
    specialties: ['backend'],
    costPerHour: 50,
    avgSpeed: 0.8,
    reliability: 0.9,
  };

  beforeEach(() => {
    aggregate = new AgentAggregate('agent-1', capabilities);
  });

  describe('Lifecycle', () => {
    it('should be created with initial state', () => {
      expect(aggregate.getId()).toBe('agent-1');
      expect(aggregate.getState()).toBe('created');
      expect(aggregate.getVersion()).toBe(0);
    });

    it('should initialize', () => {
      aggregate.initialize();
      expect(aggregate.getState()).toBe('initializing');
      expect(aggregate.hasUncommittedChanges()).toBe(true);
    });

    it('should not initialize twice', () => {
      aggregate.initialize();
      expect(() => aggregate.initialize()).toThrow('already initialized');
    });

    it('should mark ready', () => {
      aggregate.initialize();
      aggregate.markReady();
      expect(aggregate.getState()).toBe('idle');
    });

    it('should stop', () => {
      aggregate.initialize();
      aggregate.markReady();
      aggregate.stop('maintenance');
      expect(aggregate.getState()).toBe('stopping');
    });
  });

  describe('Task Management', () => {
    beforeEach(() => {
      aggregate.initialize();
      aggregate.markReady();
    });

    it('should assign task', () => {
      aggregate.assignTask({
        taskId: 'task-1',
        title: 'Build API',
        priority: 'high',
      });

      expect(aggregate.getState()).toBe('busy');
      expect(aggregate.getCurrentTask()?.taskId).toBe('task-1');
    });

    it('should not assign when busy', () => {
      aggregate.assignTask({ taskId: 'task-1' });

      expect(() =>
        aggregate.assignTask({ taskId: 'task-2' })
      ).toThrow('not available');
    });

    it('should start task', () => {
      aggregate.assignTask({ taskId: 'task-1' });
      aggregate.startTask();

      expect(aggregate.getCurrentTask()?.startedAt).toBeDefined();
    });

    it('should complete task', () => {
      aggregate.assignTask({ taskId: 'task-1' });
      aggregate.completeTask({ success: true }, 60000);

      expect(aggregate.getState()).toBe('idle');
      expect(aggregate.getCurrentTask()).toBeUndefined();

      const stats = aggregate.getStats();
      expect(stats.totalTasks).toBe(1);
      expect(stats.successRate).toBe(1);
    });

    it('should fail task', () => {
      aggregate.assignTask({ taskId: 'task-1' });
      aggregate.failTask('Connection timeout');

      expect(aggregate.getState()).toBe('error');

      const stats = aggregate.getStats();
      expect(stats.totalTasks).toBe(1);
      expect(stats.failedTasks).toBe(1);
      expect(stats.successRate).toBe(0);
    });
  });

  describe('Pause/Resume', () => {
    beforeEach(() => {
      aggregate.initialize();
      aggregate.markReady();
    });

    it('should pause from idle', () => {
      aggregate.pause('maintenance');
      expect(aggregate.getState()).toBe('paused');
    });

    it('should resume to previous state', () => {
      aggregate.pause('maintenance');
      aggregate.resume();
      expect(aggregate.getState()).toBe('idle');
    });

    it('should not resume when not paused', () => {
      expect(() => aggregate.resume()).toThrow('not paused');
    });

    it('should not pause when stopped', () => {
      aggregate.stop();
      expect(() => aggregate.pause()).toThrow('Cannot pause stopped');
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      aggregate.initialize();
      aggregate.markReady();
    });

    it('should record errors', () => {
      aggregate.recordError('Network error');
      expect(aggregate.isHealthy()).toBe(true);

      aggregate.recordError('Timeout');
      expect(aggregate.isHealthy()).toBe(true);

      aggregate.recordError('Connection refused');
      expect(aggregate.isHealthy()).toBe(false);
      expect(aggregate.getState()).toBe('error');
    });

    it('should reset error count on success', () => {
      aggregate.recordError('Error 1');
      aggregate.recordError('Error 2');

      aggregate.assignTask({ taskId: 'task-1' });
      aggregate.completeTask({}, 1000);

      expect(aggregate.isHealthy()).toBe(true);
    });
  });

  describe('Event Sourcing', () => {
    it('should emit events on state changes', () => {
      aggregate.initialize();

      const events = aggregate.getUncommittedEvents();
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('agent.initialized');
      expect(events[0].source).toBe('agent-1');
    });

    it('should track version on events', () => {
      aggregate.initialize();
      aggregate.markReady();

      const events = aggregate.getUncommittedEvents();
      expect(events[0].metadata.version).toBe(1);
      expect(events[1].metadata.version).toBe(2);
      expect(aggregate.getVersion()).toBe(2);
    });

    it('should apply events from history', () => {
      const history: GodelEvent[] = [
        {
          id: 'evt-1',
          type: 'agent.initialized',
          source: 'agent-1',
          timestamp: Date.now(),
          payload: { agentId: 'agent-1' },
          metadata: { version: 1, priority: 'normal' },
        },
        {
          id: 'evt-2',
          type: 'agent.ready',
          source: 'agent-1',
          timestamp: Date.now(),
          payload: { agentId: 'agent-1' },
          metadata: { version: 2, priority: 'normal' },
        },
      ];

      aggregate.loadFromHistory(history);

      expect(aggregate.getState()).toBe('idle');
      expect(aggregate.getVersion()).toBe(2);
      expect(aggregate.hasUncommittedChanges()).toBe(false);
    });

    it('should mark committed', () => {
      aggregate.initialize();
      aggregate.markReady();

      expect(aggregate.hasUncommittedChanges()).toBe(true);

      aggregate.markCommitted();

      expect(aggregate.hasUncommittedChanges()).toBe(false);
      expect(aggregate.getUncommittedEvents()).toHaveLength(0);
      expect(aggregate.getInitialVersion()).toBe(2);
    });
  });

  describe('Snapshots', () => {
    it('should create snapshot', () => {
      aggregate.initialize();
      aggregate.markReady();
      aggregate.assignTask({ taskId: 'task-1' });
      aggregate.completeTask({}, 5000);

      const snapshot = aggregate.createSnapshot();

      expect(snapshot.id).toBe('agent-1');
      expect(snapshot.type).toBe('agent');
      expect(snapshot.version).toBe(4);
      expect(snapshot.state.state).toBe('idle');
      expect(snapshot.state.taskCount).toBe(1);
    });

    it('should restore from snapshot', () => {
      const snapshot = {
        id: 'agent-1',
        type: 'agent',
        version: 5,
        timestamp: Date.now(),
        state: {
          state: 'busy',
          capabilities: {
            skills: ['typescript'],
            languages: ['typescript'],
            specialties: ['backend'],
            costPerHour: 50,
            avgSpeed: 0.9,
            reliability: 0.95,
          },
          currentTask: { taskId: 'task-1' },
          taskCount: 10,
          failedCount: 1,
          totalRuntime: 50000,
          consecutiveErrors: 0,
        },
        eventCount: 5,
      };

      aggregate.restoreFromSnapshot(snapshot);

      expect(aggregate.getState()).toBe('busy');
      expect(aggregate.getVersion()).toBe(5);
      expect(aggregate.getCurrentTask()?.taskId).toBe('task-1');
      expect(aggregate.getStats().totalTasks).toBe(10);
    });
  });

  describe('Validation', () => {
    it('should validate state', () => {
      expect(() => aggregate.validate()).not.toThrow();
    });

    it('should throw on invalid task counts', () => {
      // Create aggregate with invalid state via snapshot
      const snapshot = {
        id: 'agent-1',
        type: 'agent',
        version: 1,
        timestamp: Date.now(),
        state: {
          state: 'idle',
          capabilities: capabilities,
          taskCount: 5,
          failedCount: 10, // Invalid: more failures than tasks
        },
        eventCount: 1,
      };

      aggregate.restoreFromSnapshot(snapshot);

      expect(() => aggregate.validate()).toThrow(
        'Failed count cannot exceed total task count'
      );
    });
  });

  describe('Queries', () => {
    beforeEach(() => {
      aggregate.initialize();
      aggregate.markReady();
    });

    it('should check availability', () => {
      expect(aggregate.isAvailable()).toBe(true);

      aggregate.assignTask({ taskId: 'task-1' });
      expect(aggregate.isAvailable()).toBe(false);
    });

    it('should get stats', () => {
      aggregate.assignTask({ taskId: 'task-1' });
      aggregate.completeTask({}, 1000);

      aggregate.assignTask({ taskId: 'task-2' });
      aggregate.failTask('Error');

      const stats = aggregate.getStats();
      expect(stats.totalTasks).toBe(2);
      expect(stats.failedTasks).toBe(1);
      expect(stats.successRate).toBe(0.5);
      expect(stats.totalRuntime).toBe(1000);
      expect(stats.averageDuration).toBe(500);
    });

    it('should update capabilities', () => {
      aggregate.updateCapabilities({ costPerHour: 75 });

      expect(aggregate.getCapabilities().costPerHour).toBe(75);
      expect(aggregate.getCapabilities().skills).toEqual(capabilities.skills);
    });
  });
});

describe('InMemorySnapshotStore', () => {
  let store: InMemorySnapshotStore;

  beforeEach(() => {
    store = new InMemorySnapshotStore();
  });

  it('should save and retrieve snapshots', async () => {
    const snapshot = {
      id: 'agent-1',
      type: 'agent',
      version: 5,
      timestamp: Date.now(),
      state: { foo: 'bar' },
      eventCount: 5,
    };

    await store.save(snapshot);

    const retrieved = await store.get('agent-1');
    expect(retrieved).toEqual(snapshot);
  });

  it('should return null for missing snapshots', async () => {
    const retrieved = await store.get('nonexistent');
    expect(retrieved).toBeNull();
  });

  it('should delete snapshots', async () => {
    const snapshot = {
      id: 'agent-1',
      type: 'agent',
      version: 1,
      timestamp: Date.now(),
      state: {},
      eventCount: 1,
    };

    await store.save(snapshot);
    await store.delete('agent-1');

    const retrieved = await store.get('agent-1');
    expect(retrieved).toBeNull();
  });

  it('should clear all snapshots', async () => {
    await store.save({
      id: 'agent-1',
      type: 'agent',
      version: 1,
      timestamp: Date.now(),
      state: {},
      eventCount: 1,
    });

    await store.save({
      id: 'agent-2',
      type: 'agent',
      version: 1,
      timestamp: Date.now(),
      state: {},
      eventCount: 1,
    });

    store.clear();

    expect(await store.get('agent-1')).toBeNull();
    expect(await store.get('agent-2')).toBeNull();
  });
});
