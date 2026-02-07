/**
 * State Machine Unit Tests
 *
 * Comprehensive test suite for the agent state machine implementation.
 */

import {
  AgentStateMachine,
  PersistentStateMachine,
  StatefulAgentRegistry,
  InMemoryStateStorage,
  InvalidTransitionError,
  GuardConditionError,
  StatePersistenceError,
  ALLOWED_TRANSITIONS,
  AGENT_STATES,
  TERMINAL_STATES,
  canAcceptWork,
  canPause,
  hasPendingWork,
  canGracefullyStop,
  canRecover,
  notifyWorkComplete,
  handleWorkError,
  AgentState,
  AgentContext,
  SavedState,
  StateEntry,
  TaskWithCheckpointInfo,
} from '../state-machine';
import { Task } from '../../models/task';

// ============================================================================
// Helper Functions
// ============================================================================

function createMockTask(overrides: Partial<TaskWithCheckpointInfo> = {}): TaskWithCheckpointInfo {
  return {
    id: 'task-1',
    prompt: 'Test task',
    checkpointable: true,
    canSaveProgress: true,
    ...overrides,
  } as TaskWithCheckpointInfo;
}

function createMockContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    agentId: 'agent-1',
    load: 0,
    hasErrors: false,
    errorCount: 0,
    pendingTasks: [],
    ...overrides,
  } as AgentContext;
}

// ============================================================================
// AgentStateMachine Tests
// ============================================================================

describe('AgentStateMachine', () => {
  let sm: AgentStateMachine;

  beforeEach(() => {
    sm = new AgentStateMachine('agent-1');
  });

  afterEach(() => {
    sm.removeAllListeners();
  });

  describe('Initialization', () => {
    it('should start in created state', () => {
      expect(sm.state).toBe('created');
    });

    it('should have empty history', () => {
      expect(sm.history).toEqual([]);
    });

    it('should accept initial context', () => {
      const customSm = new AgentStateMachine('agent-2', ALLOWED_TRANSITIONS, {
        load: 0.5,
        hasErrors: true,
      });

      const context = customSm.getContext();
      expect(context.load).toBe(0.5);
      expect(context.hasErrors).toBe(true);
    });
  });

  describe('State Transitions', () => {
    it('should transition from created to initializing', async () => {
      const result = await sm.transition('initializing');
      expect(result).toBe(true);
      expect(sm.state).toBe('initializing');
    });

    it('should transition through full lifecycle', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');
      await sm.transition('busy');
      await sm.transition('idle');
      await sm.transition('stopping');
      await sm.transition('stopped');

      expect(sm.state).toBe('stopped');
      expect(sm.history).toHaveLength(6);
    });

    it('should throw InvalidTransitionError for invalid transitions', async () => {
      await expect(sm.transition('idle')).rejects.toThrow(InvalidTransitionError);
      await expect(sm.transition('busy')).rejects.toThrow(InvalidTransitionError);
    });

    it('should not allow transitions from terminal state', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');
      await sm.transition('stopping');
      await sm.transition('stopped');

      await expect(sm.transition('idle')).rejects.toThrow(InvalidTransitionError);
    });
  });

  describe('History Tracking', () => {
    it('should record state transitions in history', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');

      expect(sm.history).toHaveLength(2);
      expect(sm.history[0]).toMatchObject({
        from: 'created',
        to: 'initializing',
      });
      expect(sm.history[1]).toMatchObject({
        from: 'initializing',
        to: 'idle',
      });
    });

    it('should track transition timestamps', async () => {
      const before = Date.now();
      await sm.transition('initializing');
      const after = Date.now();

      expect(sm.history[0].timestamp).toBeGreaterThanOrEqual(before);
      expect(sm.history[0].timestamp).toBeLessThanOrEqual(after);
    });

    it('should track duration in previous state', async () => {
      await sm.transition('initializing');
      await new Promise(resolve => setTimeout(resolve, 50));
      await sm.transition('idle');

      expect(sm.history[1].duration).toBeGreaterThanOrEqual(50);
    });

    it('should include transition reason when provided', async () => {
      await sm.transition('initializing', 'test_reason');
      expect(sm.history[0].reason).toBe('test_reason');
    });
  });

  describe('Guard Functions', () => {
    it('should deny transition if guard returns false', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');

      // Set high load to fail canAcceptWork guard
      sm.updateContext({ load: 1, hasErrors: false });

      const result = await sm.transition('busy');
      expect(result).toBe(false);
      expect(sm.state).toBe('idle');
    });

    it('should allow transition if guard returns true', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');

      // Set low load to pass canAcceptWork guard
      sm.updateContext({ load: 0, hasErrors: false });

      const result = await sm.transition('busy');
      expect(result).toBe(true);
      expect(sm.state).toBe('busy');
    });

    it('should emit transition:denied when guard fails', async () => {
      const deniedHandler = jest.fn();
      sm.on('transition:denied', deniedHandler);

      await sm.transition('initializing');
      await sm.transition('idle');
      sm.updateContext({ load: 1 });
      await sm.transition('busy');

      expect(deniedHandler).toHaveBeenCalledWith({
        from: 'idle',
        to: 'busy',
        agentId: 'agent-1',
      });
    });

    it('should support async guards', async () => {
      const customTransitions = [{
        from: 'created' as AgentState,
        to: 'initializing' as AgentState,
        guard: async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return true;
        },
      }];

      const customSm = new AgentStateMachine('agent-async', customTransitions);
      const result = await customSm.transition('initializing');

      expect(result).toBe(true);
      expect(customSm.state).toBe('initializing');
    });
  });

  describe('Actions', () => {
    it('should execute action during transition', async () => {
      const actionSpy = jest.fn();
      const customTransitions = [{
        from: 'created' as AgentState,
        to: 'initializing' as AgentState,
        action: actionSpy,
      }];

      const customSm = new AgentStateMachine('agent-action', customTransitions);
      await customSm.transition('initializing');

      expect(actionSpy).toHaveBeenCalled();
    });

    it('should pass context to actions', async () => {
      let receivedContext: AgentContext | undefined;
      const customTransitions = [{
        from: 'created' as AgentState,
        to: 'initializing' as AgentState,
        action: (ctx: AgentContext) => {
          receivedContext = ctx;
        },
      }];

      const customSm = new AgentStateMachine('agent-ctx', customTransitions);
      await customSm.transition('initializing');

      expect(receivedContext?.agentId).toBe('agent-ctx');
    });

    it('should emit transition:error when action fails', async () => {
      const customTransitions = [{
        from: 'created' as AgentState,
        to: 'initializing' as AgentState,
        action: () => {
          throw new Error('Action failed');
        },
      }];

      const customSm = new AgentStateMachine('agent-err', customTransitions);
      const errorHandler = jest.fn();
      customSm.on('transition:error', errorHandler);

      await expect(customSm.transition('initializing')).rejects.toThrow('Action failed');
      expect(errorHandler).toHaveBeenCalled();
    });
  });

  describe('Events', () => {
    it('should emit transition:before event', async () => {
      const beforeHandler = jest.fn();
      sm.on('transition:before', beforeHandler);

      await sm.transition('initializing');

      expect(beforeHandler).toHaveBeenCalledWith({
        from: 'created',
        to: 'initializing',
        agentId: 'agent-1',
      });
    });

    it('should emit transition:after event', async () => {
      const afterHandler = jest.fn();
      sm.on('transition:after', afterHandler);

      await sm.transition('initializing');

      expect(afterHandler).toHaveBeenCalledWith({
        from: 'created',
        to: 'initializing',
        agentId: 'agent-1',
      });
    });

    it('should emit state-specific events', async () => {
      const idleHandler = jest.fn();
      sm.on('state:idle', idleHandler);

      await sm.transition('initializing');
      await sm.transition('idle');

      expect(idleHandler).toHaveBeenCalledWith({
        previous: 'initializing',
        agentId: 'agent-1',
      });
    });
  });

  describe('Query Methods', () => {
    beforeEach(async () => {
      await sm.transition('initializing');
      await sm.transition('idle');
    });

    it('should return allowed transitions', () => {
      const allowed = sm.getAllowedTransitions();
      expect(allowed).toContain('busy');
      expect(allowed).toContain('paused');
      expect(allowed).toContain('stopping');
    });

    it('should check if transition is possible', () => {
      expect(sm.canTransition('busy')).toBe(true);
      expect(sm.canTransition('idle')).toBe(false);
      expect(sm.canTransition('stopped')).toBe(false);
    });

    it('should return empty allowed transitions for terminal state', async () => {
      await sm.transition('stopping');
      await sm.transition('stopped');

      expect(sm.getAllowedTransitions()).toEqual([]);
      expect(sm.canTransition('idle')).toBe(false);
    });

    it('should report terminal state correctly', async () => {
      expect(sm.isTerminal()).toBe(false);

      await sm.transition('stopping');
      await sm.transition('stopped');

      expect(sm.isTerminal()).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track total transitions', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');
      await sm.transition('busy');

      const stats = sm.getStats();
      expect(stats.totalTransitions).toBe(3);
    });

    it('should calculate total runtime', async () => {
      await sm.transition('initializing');
      await new Promise(resolve => setTimeout(resolve, 50));
      await sm.transition('idle');

      const stats = sm.getStats();
      expect(stats.totalRuntime).toBeGreaterThanOrEqual(50);
    });

    it('should find most visited state', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');
      await sm.transition('busy');
      await sm.transition('idle');
      await sm.transition('busy');
      await sm.transition('idle');

      const stats = sm.getStats();
      expect(stats.mostVisitedState).toBe('idle');
      expect(stats.stateCounts['idle']).toBe(3);
    });

    it('should track time in current state', async () => {
      await sm.transition('initializing');
      await new Promise(resolve => setTimeout(resolve, 50));

      const time = sm.getTimeInCurrentState();
      expect(time).toBeGreaterThanOrEqual(50);
    });
  });

  describe('Context Management', () => {
    it('should set task context', () => {
      const task = createMockTask();
      sm.setTask(task);

      expect(sm.getContext().task).toEqual(task);
    });

    it('should set pending tasks', () => {
      const tasks = [createMockTask(), createMockTask()];
      sm.setPendingTasks(tasks);

      expect(sm.getContext().pendingTasks).toEqual(tasks);
    });

    it('should update context', () => {
      sm.updateContext({ load: 0.5, hasErrors: true });

      const context = sm.getContext();
      expect(context.load).toBe(0.5);
      expect(context.hasErrors).toBe(true);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', async () => {
      await sm.transition('initializing');
      await sm.transition('idle');

      sm.reset();

      expect(sm.state).toBe('created');
      expect(sm.history).toEqual([]);
      expect(sm.getContext().load).toBe(0);
    });
  });
});

// ============================================================================
// Guard Function Tests
// ============================================================================

describe('Guard Functions', () => {
  describe('canAcceptWork', () => {
    it('should return true when load < 1 and no errors', () => {
      const context = createMockContext({ load: 0.5, hasErrors: false });
      expect(canAcceptWork(context)).toBe(true);
    });

    it('should return false when load >= 1', () => {
      const context = createMockContext({ load: 1, hasErrors: false });
      expect(canAcceptWork(context)).toBe(false);
    });

    it('should return false when has errors', () => {
      const context = createMockContext({ load: 0.5, hasErrors: true });
      expect(canAcceptWork(context)).toBe(false);
    });
  });

  describe('canPause', () => {
    it('should return true when task is checkpointable', () => {
      const context = createMockContext({
        task: createMockTask({ checkpointable: true }),
      });
      expect(canPause(context)).toBe(true);
    });

    it('should return false when task is not checkpointable', () => {
      const context = createMockContext({
        task: createMockTask({ checkpointable: false }),
      });
      expect(canPause(context)).toBe(false);
    });

    it('should return false when no task', () => {
      const context = createMockContext();
      expect(canPause(context)).toBe(false);
    });
  });

  describe('hasPendingWork', () => {
    it('should return true when pending tasks exist', () => {
      const context = createMockContext({
        pendingTasks: [createMockTask(), createMockTask()],
      });
      expect(hasPendingWork(context)).toBe(true);
    });

    it('should return false when no pending tasks', () => {
      const context = createMockContext({ pendingTasks: [] });
      expect(hasPendingWork(context)).toBe(false);
    });

    it('should return false when pendingTasks is undefined', () => {
      const context = createMockContext();
      expect(hasPendingWork(context)).toBe(false);
    });
  });

  describe('canGracefullyStop', () => {
    it('should return true when task can save progress', () => {
      const context = createMockContext({
        task: createMockTask({ canSaveProgress: true }),
      });
      expect(canGracefullyStop(context)).toBe(true);
    });

    it('should return false when task cannot save progress', () => {
      const context = createMockContext({
        task: createMockTask({ canSaveProgress: false }),
      });
      expect(canGracefullyStop(context)).toBe(false);
    });
  });

  describe('canRecover', () => {
    it('should return true when error count < 3', () => {
      const context = createMockContext({ errorCount: 2 });
      expect(canRecover(context)).toBe(true);
    });

    it('should return false when error count >= 3', () => {
      const context = createMockContext({ errorCount: 3 });
      expect(canRecover(context)).toBe(false);
    });
  });

  describe('notifyWorkComplete', () => {
    it('should call loadBalancer.recordSuccess', () => {
      const recordSuccess = jest.fn();
      const context = createMockContext({
        agentId: 'agent-1',
        loadBalancer: { recordSuccess, recordFailure: jest.fn(), getLoad: jest.fn() },
      });

      notifyWorkComplete(context);
      expect(recordSuccess).toHaveBeenCalledWith('agent-1');
    });
  });

  describe('handleWorkError', () => {
    it('should increment error count and store error', () => {
      const context = createMockContext({ errorCount: 0 });
      const error = new Error('Test error');

      handleWorkError(context, error);

      expect(context.errorCount).toBe(1);
      expect(context.lastError).toBe(error);
      expect(context.hasErrors).toBe(true);
    });

    it('should handle multiple errors', () => {
      const context = createMockContext({ errorCount: 2 });

      handleWorkError(context, new Error('Error 1'));
      expect(context.errorCount).toBe(3);

      handleWorkError(context, new Error('Error 2'));
      expect(context.errorCount).toBe(4);
    });
  });
});

// ============================================================================
// InMemoryStateStorage Tests
// ============================================================================

describe('InMemoryStateStorage', () => {
  let storage: InMemoryStateStorage;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
  });

  describe('Basic Operations', () => {
    it('should save and retrieve state', async () => {
      const savedState: SavedState = {
        state: 'idle',
        history: [{ from: 'created', to: 'idle', timestamp: Date.now(), duration: 0 }],
        lastUpdated: Date.now(),
      };

      await storage.save('agent-1', savedState);
      const retrieved = await storage.get('agent-1');

      expect(retrieved).toEqual(savedState);
    });

    it('should return null for non-existent agent', async () => {
      const result = await storage.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete saved state', async () => {
      const savedState: SavedState = {
        state: 'idle',
        history: [],
        lastUpdated: Date.now(),
      };

      await storage.save('agent-1', savedState);
      await storage.delete('agent-1');

      const result = await storage.get('agent-1');
      expect(result).toBeNull();
    });

    it('should list all agent IDs', async () => {
      await storage.save('agent-1', { state: 'idle', history: [], lastUpdated: 1 });
      await storage.save('agent-2', { state: 'busy', history: [], lastUpdated: 2 });

      const list = await storage.list();
      expect(list).toContain('agent-1');
      expect(list).toContain('agent-2');
    });
  });

  describe('Utility Methods', () => {
    it('should clear all states', async () => {
      await storage.save('agent-1', { state: 'idle', history: [], lastUpdated: 1 });
      await storage.save('agent-2', { state: 'busy', history: [], lastUpdated: 2 });

      storage.clear();

      expect(await storage.get('agent-1')).toBeNull();
      expect(await storage.get('agent-2')).toBeNull();
      expect(storage.size()).toBe(0);
    });

    it('should track size correctly', async () => {
      expect(storage.size()).toBe(0);

      await storage.save('agent-1', { state: 'idle', history: [], lastUpdated: 1 });
      expect(storage.size()).toBe(1);

      await storage.save('agent-2', { state: 'busy', history: [], lastUpdated: 2 });
      expect(storage.size()).toBe(2);

      await storage.delete('agent-1');
      expect(storage.size()).toBe(1);
    });
  });
});

// ============================================================================
// PersistentStateMachine Tests
// ============================================================================

describe('PersistentStateMachine', () => {
  let storage: InMemoryStateStorage;
  let sm: PersistentStateMachine;

  beforeEach(async () => {
    storage = new InMemoryStateStorage();
    sm = new PersistentStateMachine('agent-1', storage, ALLOWED_TRANSITIONS, {
      autoLoad: false,
      saveDebounceMs: 0,
    });
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(() => {
    sm.removeAllListeners();
  });

  describe('Persistence', () => {
    it('should persist state after transition', async () => {
      await sm.transition('initializing');
      await sm.saveNow();

      const saved = await storage.get('agent-1');
      expect(saved).not.toBeNull();
      expect(saved?.state).toBe('initializing');
    });

    it('should emit state:persisted event', async () => {
      const persistedHandler = jest.fn();
      sm.on('state:persisted', persistedHandler);

      await sm.transition('initializing');
      await sm.saveNow();

      expect(persistedHandler).toHaveBeenCalled();
      expect(persistedHandler.mock.calls[0][0].agentId).toBe('agent-1');
    });

    it('should load state on initialization', async () => {
      // Save state first
      await sm.transition('initializing');
      await sm.transition('idle');
      await sm.saveNow();

      // Create new instance with same storage
      const sm2 = new PersistentStateMachine('agent-1', storage, ALLOWED_TRANSITIONS, {
        autoLoad: true,
        saveDebounceMs: 0,
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(sm2.state).toBe('idle');
    });

    it('should emit state:loaded event', async () => {
      // Save state first
      await sm.transition('initializing');
      await sm.saveNow();

      const loadedHandler = jest.fn();

      // Create new instance
      const sm2 = new PersistentStateMachine('agent-1', storage, ALLOWED_TRANSITIONS, {
        autoLoad: true,
        saveDebounceMs: 0,
      });
      sm2.on('state:loaded', loadedHandler);

      await new Promise(resolve => setTimeout(resolve, 50));
      expect(loadedHandler).toHaveBeenCalled();
    });

    it('should delete persisted state', async () => {
      await sm.transition('initializing');
      await sm.saveNow();

      await sm.deletePersistedState();

      const saved = await storage.get('agent-1');
      expect(saved).toBeNull();
    });

    it('should not load terminal state', async () => {
      // Save stopped state
      await sm.transition('initializing');
      await sm.transition('idle');
      await sm.transition('stopping');
      await sm.transition('stopped');
      await sm.saveNow();

      // Create new instance
      const sm2 = new PersistentStateMachine('agent-1', storage, ALLOWED_TRANSITIONS, {
        autoLoad: true,
        saveDebounceMs: 0,
      });

      await new Promise(resolve => setTimeout(resolve, 50));
      // Should start fresh, not from stopped
      expect(sm2.state).toBe('created');
    });
  });

  describe('Auto-save Debouncing', () => {
    it('should debounce saves', async () => {
      const debounceStorage = new InMemoryStateStorage();
      const smDebounced = new PersistentStateMachine('agent-debounce', debounceStorage, ALLOWED_TRANSITIONS, {
        autoLoad: false,
        saveDebounceMs: 200,
      });

      await smDebounced.transition('initializing');

      // Should not have saved yet (debounce not triggered)
      expect(await debounceStorage.get('agent-debounce')).toBeNull();

      // Wait for debounce period to pass
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should have saved after debounce period
      expect(await debounceStorage.get('agent-debounce')).not.toBeNull();
    });

    it('should save immediately with saveNow()', async () => {
      await sm.transition('initializing');
      await sm.saveNow();

      const saved = await storage.get('agent-1');
      expect(saved?.state).toBe('initializing');
    });
  });
});

// ============================================================================
// StatefulAgentRegistry Tests
// ============================================================================

describe('StatefulAgentRegistry', () => {
  let storage: InMemoryStateStorage;
  let registry: StatefulAgentRegistry;

  beforeEach(() => {
    storage = new InMemoryStateStorage();
    registry = new StatefulAgentRegistry(storage);
  });

  afterEach(() => {
    registry.removeAllListeners();
  });

  describe('Registration', () => {
    it('should register agent with state machine', async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(agent.id).toBeDefined();
      expect(registry.getAgentState(agent.id)).toBe('idle');
    });

    it('should emit agent.idle when agent becomes idle', async () => {
      const idleHandler = jest.fn();
      registry.on('agent.idle', idleHandler);

      await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      expect(idleHandler).toHaveBeenCalled();
    });

    it('should update agent status in parent registry', async () => {
      const agent = await registry.register({
        id: 'test-agent',
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const registered = registry.get(agent.id);
      expect(registered?.status).toBe('idle');
    });
  });

  describe('Work Assignment', () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });
      agentId = agent.id;
    });

    it('should assign work and transition to busy', async () => {
      const task = createMockTask();
      const assigned = await registry.assignWork(agentId, task);

      expect(assigned).toBe(true);
      expect(registry.getAgentState(agentId)).toBe('busy');
    });

    it('should update load when assigning work', async () => {
      const task = createMockTask({ weight: 0.5 });
      await registry.assignWork(agentId, task);

      const agent = registry.get(agentId);
      expect(agent?.currentLoad).toBeGreaterThan(0);
    });

    it('should fail to assign work if already busy', async () => {
      // First assignment should succeed
      const firstAssigned = await registry.assignWork(agentId, createMockTask());
      expect(firstAssigned).toBe(true);
      expect(registry.getAgentState(agentId)).toBe('busy');

      // Second assignment should fail because guard returns false (load = 1)
      // We need to check that it returns false due to guard, not throw
      const secondAssigned = await registry.assignWork(agentId, createMockTask());
      expect(secondAssigned).toBe(false);
    });

    it('should complete work and return to idle', async () => {
      await registry.assignWork(agentId, createMockTask());
      await registry.completeWork(agentId, { success: true });

      expect(registry.getAgentState(agentId)).toBe('idle');
    });

    it('should handle work failure', async () => {
      await registry.assignWork(agentId, createMockTask());
      await registry.failWork(agentId, new Error('Task failed'));

      expect(registry.getAgentState(agentId)).toBe('error');
    });
  });

  describe('Pause and Resume', () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });
      agentId = agent.id;
    });

    it('should pause idle agent', async () => {
      const paused = await registry.pauseAgent(agentId);
      expect(paused).toBe(true);
      expect(registry.getAgentState(agentId)).toBe('paused');
    });

    it('should resume paused agent', async () => {
      await registry.pauseAgent(agentId);
      const resumed = await registry.resumeAgent(agentId);

      expect(resumed).toBe(true);
      expect(registry.getAgentState(agentId)).toBe('idle');
    });

    it('should not resume non-paused agent', async () => {
      const resumed = await registry.resumeAgent(agentId);
      expect(resumed).toBe(false);
    });
  });

  describe('Stop Agent', () => {
    let agentId: string;

    beforeEach(async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });
      agentId = agent.id;
    });

    it('should stop agent gracefully', async () => {
      await registry.stopAgent(agentId);

      expect(registry.getAgentState(agentId)).toBeUndefined();
      expect(registry.has(agentId)).toBe(false);
    });

    it('should force stop agent', async () => {
      await registry.assignWork(agentId, createMockTask());
      await registry.stopAgent(agentId, true);

      expect(registry.getAgentState(agentId)).toBeUndefined();
      expect(registry.has(agentId)).toBe(false);
    });

    it('should clean up persisted state', async () => {
      await registry.stopAgent(agentId);

      const saved = await storage.get(agentId);
      expect(saved).toBeNull();
    });
  });

  describe('Agent Recovery', () => {
    it('should recover agent from error state', async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      await registry.assignWork(agent.id, createMockTask());
      await registry.failWork(agent.id, new Error('Failure'));
      expect(registry.getAgentState(agent.id)).toBe('error');

      const recovered = await registry.recoverAgent(agent.id);
      expect(recovered).toBe(true);
      expect(registry.getAgentState(agent.id)).toBe('initializing');
    });

    it('should not recover non-error agent', async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const recovered = await registry.recoverAgent(agent.id);
      expect(recovered).toBe(false);
    });
  });

  describe('Query Methods', () => {
    it('should get agents in specific state', async () => {
      const agent1 = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const agent2 = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['python'],
          languages: ['python'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      await registry.assignWork(agent1.id, createMockTask());

      const busyAgents = registry.getAgentsInState('busy');
      expect(busyAgents).toContain(agent1.id);
      expect(busyAgents).not.toContain(agent2.id);
    });

    it('should get state history for agent', async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      const history = registry.getAgentStateHistory(agent.id);
      expect(history).toBeDefined();
      expect(history!.length).toBeGreaterThan(0);
    });

    it('should get state statistics for agent', async () => {
      const agent = await registry.register({
        runtime: 'pi',
        capabilities: {
          skills: ['typescript'],
          languages: ['typescript'],
          specialties: ['backend'],
          costPerHour: 2.5,
          avgSpeed: 10,
          reliability: 0.95,
        },
      });

      await registry.assignWork(agent.id, createMockTask());
      await registry.completeWork(agent.id, {});

      const stats = registry.getAgentStats(agent.id);
      expect(stats).toBeDefined();
      expect(stats!.totalTransitions).toBeGreaterThan(0);
    });
  });
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  it('should have all 8 states defined', () => {
    expect(AGENT_STATES).toHaveLength(8);
    expect(AGENT_STATES).toContain('created');
    expect(AGENT_STATES).toContain('initializing');
    expect(AGENT_STATES).toContain('idle');
    expect(AGENT_STATES).toContain('busy');
    expect(AGENT_STATES).toContain('paused');
    expect(AGENT_STATES).toContain('error');
    expect(AGENT_STATES).toContain('stopping');
    expect(AGENT_STATES).toContain('stopped');
  });

  it('should have correct terminal states', () => {
    expect(TERMINAL_STATES).toEqual(['stopped']);
  });

  it('should have valid ALLOWED_TRANSITIONS', () => {
    // Check key transitions exist
    const hasCreatedToInit = ALLOWED_TRANSITIONS.some(
      t => t.from === 'created' && t.to === 'initializing'
    );
    const hasIdleToBusy = ALLOWED_TRANSITIONS.some(
      t => t.from === 'idle' && t.to === 'busy'
    );
    const hasBusyToIdle = ALLOWED_TRANSITIONS.some(
      t => t.from === 'busy' && t.to === 'idle'
    );

    expect(hasCreatedToInit).toBe(true);
    expect(hasIdleToBusy).toBe(true);
    expect(hasBusyToIdle).toBe(true);
  });
});
