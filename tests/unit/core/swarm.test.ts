/**
 * Swarm Manager Unit Tests
 * 
 * Tests for swarm creation, scaling, destruction, and lifecycle management.
 */

import { SwarmManager, SwarmConfig, SwarmState, SwarmStrategy } from '../../../src/core/swarm';
import { AgentLifecycle } from '../../../src/core/lifecycle';
import { MessageBus } from '../../../src/bus/index';
import { AgentStorage } from '../../../src/storage/memory';
import { SwarmRepository } from '../../../src/storage';
import { SwarmNotFoundError, ApplicationError } from '../../../src/errors';

// Mock dependencies
jest.mock('../../../src/core/lifecycle');
jest.mock('../../../src/bus/index');
jest.mock('../../../src/storage/memory');
jest.mock('../../../src/storage');

describe('SwarmManager', () => {
  let swarmManager: SwarmManager;
  let mockAgentLifecycle: jest.Mocked<AgentLifecycle>;
  let mockMessageBus: jest.Mocked<MessageBus>;
  let mockStorage: jest.Mocked<AgentStorage>;
  let mockSwarmRepository: jest.Mocked<SwarmRepository>;

  const createMockSwarmConfig = (): SwarmConfig => ({
    name: 'test-swarm',
    task: 'Test task',
    initialAgents: 2,
    maxAgents: 5,
    strategy: 'parallel' as SwarmStrategy,
    model: 'kimi-k2.5',
    budget: {
      amount: 10,
      currency: 'USD',
      warningThreshold: 0.75,
      criticalThreshold: 0.9,
    },
    safety: {
      fileSandbox: true,
      maxExecutionTime: 60000,
    },
  });

  beforeEach(() => {
    mockAgentLifecycle = new AgentLifecycle(
      {} as AgentStorage,
      {} as MessageBus,
      {} as any
    ) as jest.Mocked<AgentLifecycle>;
    
    mockMessageBus = new MessageBus() as jest.Mocked<MessageBus>;
    mockStorage = new AgentStorage() as jest.Mocked<AgentStorage>;
    mockSwarmRepository = new SwarmRepository() as jest.Mocked<SwarmRepository>;

    // Setup mock methods
    mockAgentLifecycle.spawn = jest.fn().mockResolvedValue({
      id: `agent-${Date.now()}`,
      label: 'Test Agent',
      status: 'pending',
      model: 'kimi-k2.5',
      task: 'Test task',
      spawnedAt: new Date(),
      maxRetries: 3,
      retryCount: 0,
      context: { inputContext: [], outputContext: [], sharedContext: [], contextSize: 0, contextWindow: 100000, contextUsage: 0 },
      childIds: [],
      reasoning: { traces: [], decisions: [], confidence: 1.0 },
      metadata: {},
      runtime: 0,
    });

    mockMessageBus.publish = jest.fn().mockResolvedValue(undefined);
    mockStorage.create = jest.fn();
    mockStorage.get = jest.fn();
    mockSwarmRepository.createSwarm = jest.fn().mockResolvedValue(undefined);
    mockSwarmRepository.updateSwarm = jest.fn().mockResolvedValue(undefined);
    mockSwarmRepository.getSwarm = jest.fn().mockResolvedValue(null);

    swarmManager = new SwarmManager(
      mockAgentLifecycle,
      mockMessageBus,
      mockStorage,
      mockSwarmRepository
    );
  });

  afterEach(() => {
    swarmManager.stop();
    jest.clearAllMocks();
  });

  describe('start/stop', () => {
    it('should start the swarm manager', () => {
      const emitSpy = jest.spyOn(swarmManager, 'emit');
      swarmManager.start();
      expect(emitSpy).toHaveBeenCalledWith('manager.started');
    });

    it('should stop the swarm manager', () => {
      const emitSpy = jest.spyOn(swarmManager, 'emit');
      swarmManager.stop();
      expect(emitSpy).toHaveBeenCalledWith('manager.stopped');
    });
  });

  describe('create', () => {
    it('should create a new swarm with valid config', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      
      const swarm = await swarmManager.create(config);
      
      expect(swarm).toBeDefined();
      expect(swarm.name).toBe(config.name);
      expect(swarm.status).toBe('creating');
      expect(swarm.config).toEqual(config);
      expect(swarm.agents).toHaveLength(0);
      expect(swarm.budget.allocated).toBe(config.budget!.amount);
      expect(swarm.budget.remaining).toBe(config.budget!.amount);
      expect(swarm.budget.consumed).toBe(0);
    });

    it('should create swarms with unique IDs', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      
      const swarm1 = await swarmManager.create(config);
      const swarm2 = await swarmManager.create(config);
      
      expect(swarm1.id).not.toBe(swarm2.id);
    });

    it('should persist swarm to repository', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      
      await swarmManager.create(config);
      
      expect(mockSwarmRepository.createSwarm).toHaveBeenCalled();
    });

    it('should emit swarm.created event', async () => {
      swarmManager.start();
      const emitSpy = jest.spyOn(swarmManager, 'emit');
      const config = createMockSwarmConfig();
      
      const swarm = await swarmManager.create(config);
      
      expect(emitSpy).toHaveBeenCalledWith('swarm.created', swarm);
    });
  });

  describe('getSwarm', () => {
    it('should return swarm by ID', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const created = await swarmManager.create(config);
      
      const retrieved = swarmManager.getSwarm(created.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(created.id);
    });

    it('should return null for non-existent swarm', () => {
      const swarm = swarmManager.getSwarm('non-existent-id');
      expect(swarm).toBeNull();
    });
  });

  describe('list', () => {
    it('should return all swarms', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      
      await swarmManager.create(config);
      await swarmManager.create({ ...config, name: 'swarm-2' });
      
      const swarms = swarmManager.list();
      
      expect(swarms).toHaveLength(2);
    });

    it('should return empty array when no swarms exist', () => {
      const swarms = swarmManager.list();
      expect(swarms).toEqual([]);
    });
  });

  describe('scale', () => {
    it('should throw error when scaling non-existent swarm', async () => {
      await expect(swarmManager.scale('non-existent', 2)).rejects.toThrow();
    });
  });

  describe('destroy', () => {
    it('should destroy a swarm', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);
      
      await swarmManager.destroy(swarm.id);
      
      expect(swarmManager.getSwarm(swarm.id)).toBeNull();
    });

    it('should emit swarm.destroyed event', async () => {
      swarmManager.start();
      const emitSpy = jest.spyOn(swarmManager, 'emit');
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);
      
      await swarmManager.destroy(swarm.id);
      
      expect(emitSpy).toHaveBeenCalledWith('swarm.destroyed', expect.objectContaining({ id: swarm.id }));
    });

    it('should throw error when destroying non-existent swarm', async () => {
      await expect(swarmManager.destroy('non-existent')).rejects.toThrow();
    });
  });

  describe('pauseSwarm', () => {
    it('should pause an active swarm', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);
      
      await swarmManager.pauseSwarm(swarm.id);
      
      const updated = swarmManager.getSwarm(swarm.id);
      expect(updated!.status).toBe('paused');
    });
  });

  describe('resumeSwarm', () => {
    it('should resume a paused swarm', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);
      await swarmManager.pauseSwarm(swarm.id);
      
      await swarmManager.resumeSwarm(swarm.id);
      
      const updated = swarmManager.getSwarm(swarm.id);
      expect(updated!.status).toBe('active');
    });
  });

  describe('getSwarmStatus', () => {
    it('should return swarm status info', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);
      
      const status = swarmManager.getSwarmStatus(swarm.id);
      
      expect(status).toBeDefined();
      expect(status!.id).toBe(swarm.id);
      expect(status!.name).toBe(swarm.name);
    });
  });
});
