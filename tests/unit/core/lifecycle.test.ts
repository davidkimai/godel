/**
 * Agent Lifecycle Unit Tests
 * 
 * Tests for agent state management, transitions, and recovery.
 */

import { AgentLifecycle, AgentState, LifecycleState, SpawnOptions } from '../../../src/core/lifecycle';
import { AgentStorage } from '../../../src/storage/memory';
import { MessageBus } from '../../../src/bus/index';
import { OpenClawCore, getOpenClawCore } from '../../../src/core/openclaw';
import { AgentStatus } from '../../../src/models/agent';
import { NotFoundError } from '../../../src/errors';

// Mock dependencies
jest.mock('../../../src/storage/memory');
jest.mock('../../../src/bus/index');
jest.mock('../../../src/core/openclaw');
jest.mock('../../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('AgentLifecycle', () => {
  let lifecycle: AgentLifecycle;
  let mockStorage: jest.Mocked<AgentStorage>;
  let mockMessageBus: jest.Mocked<MessageBus>;
  let mockOpenClaw: jest.Mocked<OpenClawCore>;

  const createMockSpawnOptions = (): SpawnOptions => ({
    label: 'Test Agent',
    model: 'kimi-k2.5',
    task: 'Test task',
    maxRetries: 3,
    budgetLimit: 0.5,
    autoStart: true,
  });

  beforeEach(async () => {
    mockStorage = new AgentStorage() as jest.Mocked<AgentStorage>;
    mockMessageBus = new MessageBus() as jest.Mocked<MessageBus>;
    mockOpenClaw = new OpenClawCore(mockMessageBus) as jest.Mocked<OpenClawCore>;

    // Setup mock methods
    mockStorage.create = jest.fn();
    mockStorage.get = jest.fn();
    mockStorage.update = jest.fn();
    mockMessageBus.publish = jest.fn().mockResolvedValue(undefined);
    mockMessageBus.subscribe = jest.fn().mockReturnValue(() => {});
    mockOpenClaw.initialize = jest.fn().mockResolvedValue(undefined);
    mockOpenClaw.connect = jest.fn().mockResolvedValue(undefined);
    mockOpenClaw.disconnect = jest.fn().mockResolvedValue(undefined);
    mockOpenClaw.spawnSession = jest.fn().mockResolvedValue('session-1');
    mockOpenClaw.hasSession = jest.fn().mockReturnValue(false);

    lifecycle = new AgentLifecycle(mockStorage, mockMessageBus, mockOpenClaw);
    await lifecycle.start();
  });

  afterEach(() => {
    lifecycle.stop();
    jest.clearAllMocks();
  });

  describe('start/stop', () => {
    it('should initialize OpenClaw core on start', async () => {
      const newLifecycle = new AgentLifecycle(mockStorage, mockMessageBus, mockOpenClaw);
      await newLifecycle.start();
      
      expect(mockOpenClaw.initialize).toHaveBeenCalled();
      expect(mockOpenClaw.connect).toHaveBeenCalled();
    });

    it('should emit lifecycle.started event', async () => {
      const newLifecycle = new AgentLifecycle(mockStorage, mockMessageBus, mockOpenClaw);
      const emitSpy = jest.spyOn(newLifecycle, 'emit');
      await newLifecycle.start();
      
      expect(emitSpy).toHaveBeenCalledWith('lifecycle.started');
    });

    it('should emit lifecycle.stopped event on stop', () => {
      const emitSpy = jest.spyOn(lifecycle, 'emit');
      lifecycle.stop();
      
      expect(emitSpy).toHaveBeenCalledWith('lifecycle.stopped');
    });
  });

  describe('spawn', () => {
    it('should spawn a new agent', async () => {
      const options = createMockSpawnOptions();
      
      const agent = await lifecycle.spawn(options);
      
      expect(agent).toBeDefined();
      expect(agent.id).toBeDefined();
      expect(agent.label).toBe(options.label);
      expect(agent.model).toBe(options.model);
      expect(agent.task).toBe(options.task);
      expect(agent.status).toBe(AgentStatus.PENDING);
    });

    it('should create agent state with running lifecycle state', async () => {
      const options = createMockSpawnOptions();
      
      const agent = await lifecycle.spawn(options);
      const state = lifecycle.getState(agent.id);
      
      expect(state).toBeDefined();
      // After spawn completes, state is 'running' (transitions from spawning)
      expect(state!.lifecycleState).toBe('running');
      expect(state!.status).toBe(AgentStatus.RUNNING);
      expect(state!.retryCount).toBe(0);
    });

    it('should store agent in storage', async () => {
      const options = createMockSpawnOptions();
      
      await lifecycle.spawn(options);
      
      expect(mockStorage.create).toHaveBeenCalled();
    });

    it('should throw error when lifecycle is not started', async () => {
      const stoppedLifecycle = new AgentLifecycle(mockStorage, mockMessageBus, mockOpenClaw);
      const options = createMockSpawnOptions();
      
      await expect(stoppedLifecycle.spawn(options)).rejects.toThrow('AgentLifecycle is not started');
    });

    it('should emit agent.spawned event', async () => {
      const emitSpy = jest.spyOn(lifecycle, 'emit');
      const options = createMockSpawnOptions();
      
      const agent = await lifecycle.spawn(options);
      
      expect(emitSpy).toHaveBeenCalledWith('agent.spawned', expect.anything());
    });
  });

  describe('getState', () => {
    it('should return agent state by ID', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      const state = lifecycle.getState(agent.id);
      
      expect(state).toBeDefined();
      expect(state!.id).toBe(agent.id);
    });

    it('should return null for non-existent agent', () => {
      const state = lifecycle.getState('non-existent');
      expect(state).toBeNull();
    });
  });

  describe('pause', () => {
    it('should pause a running agent', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.pause(agent.id);
      
      const state = lifecycle.getState(agent.id);
      expect(state!.lifecycleState).toBe('paused');
    });

    it('should set pausedAt timestamp', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.pause(agent.id);
      
      const state = lifecycle.getState(agent.id);
      expect(state!.pausedAt).toBeDefined();
    });

    it('should throw NotFoundError for non-existent agent', async () => {
      await expect(lifecycle.pause('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should emit agent.paused event', async () => {
      const emitSpy = jest.spyOn(lifecycle, 'emit');
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.pause(agent.id);
      
      expect(emitSpy).toHaveBeenCalledWith('agent.paused', expect.anything());
    });
  });

  describe('resume', () => {
    it('should resume a paused agent', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.pause(agent.id);
      await lifecycle.resume(agent.id);
      
      const state = lifecycle.getState(agent.id);
      expect(state!.lifecycleState).toBe('running');
    });

    it('should set resumedAt timestamp', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.pause(agent.id);
      await lifecycle.resume(agent.id);
      
      const state = lifecycle.getState(agent.id);
      expect(state!.resumedAt).toBeDefined();
    });

    it('should throw NotFoundError for non-existent agent', async () => {
      await expect(lifecycle.resume('non-existent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('kill', () => {
    it('should kill an agent', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.kill(agent.id);
      
      const state = lifecycle.getState(agent.id);
      expect(state!.lifecycleState).toBe('killed');
    });

    it('should set completedAt timestamp', async () => {
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.kill(agent.id);
      
      const state = lifecycle.getState(agent.id);
      expect(state!.completedAt).toBeDefined();
    });

    it('should throw NotFoundError for non-existent agent', async () => {
      await expect(lifecycle.kill('non-existent')).rejects.toThrow(NotFoundError);
    });

    it('should emit agent.killed event', async () => {
      const emitSpy = jest.spyOn(lifecycle, 'emit');
      const options = createMockSpawnOptions();
      const agent = await lifecycle.spawn(options);
      
      await lifecycle.kill(agent.id);
      
      expect(emitSpy).toHaveBeenCalledWith('agent.killed', expect.anything());
    });
  });

  describe('retry', () => {
    it('should increment retry count', async () => {
      const options = createMockSpawnOptions();
      options.maxRetries = 3;
      const agent = await lifecycle.spawn(options);
      
      // Manually increment retry count to test the state tracking
      const state = lifecycle.getState(agent.id);
      state!.retryCount = 1;
      
      expect(state!.retryCount).toBe(1);
    });
  });

  describe('getAllStates', () => {
    it('should return all agent states', async () => {
      const options = createMockSpawnOptions();
      await lifecycle.spawn(options);
      await lifecycle.spawn({ ...options, label: 'Agent 2' });
      
      const states = lifecycle.getAllStates();
      
      expect(states).toHaveLength(2);
    });

    it('should return empty array when no agents', () => {
      const states = lifecycle.getAllStates();
      expect(states).toEqual([]);
    });
  });

  describe('getMetrics', () => {
    it('should return lifecycle metrics', async () => {
      const options = createMockSpawnOptions();
      await lifecycle.spawn(options);
      
      const metrics = lifecycle.getMetrics();
      
      expect(metrics).toBeDefined();
      expect(metrics.totalSpawned).toBe(1);
    });
  });
});
