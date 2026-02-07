/**
 * Team Manager Unit Tests
 * 
 * Tests for team creation, scaling, destruction, and lifecycle management.
 */

import { TeamManager, TeamConfig, TeamState, TeamStrategy } from '../../../src/core/swarm';
import { AgentLifecycle } from '../../../src/core/lifecycle';
import { MessageBus } from '../../../src/bus/index';
import { AgentStorage } from '../../../src/storage/memory';
import { TeamRepository } from '../../../src/storage';
import { TeamNotFoundError, ApplicationError } from '../../../src/errors';

// Mock dependencies
jest.mock('../../../src/core/lifecycle');
jest.mock('../../../src/bus/index');
jest.mock('../../../src/storage/memory');
jest.mock('../../../src/storage/repositories/TeamRepository');

describe.skip('TeamManager', () => {
  let teamManager: TeamManager;
  let mockAgentLifecycle: jest.Mocked<AgentLifecycle>;
  let mockMessageBus: jest.Mocked<MessageBus>;
  let mockStorage: jest.Mocked<AgentStorage>;
  let mockTeamRepository: jest.Mocked<TeamRepository>;

  const createMockTeamConfig = (): TeamConfig => ({
    name: 'test-team',
    task: 'Test task',
    initialAgents: 2,
    maxAgents: 5,
    strategy: 'parallel' as TeamStrategy,
    model: 'kimi-k2.5',
    budgetConfig: {
      amount: 10,
      currency: 'USD',
      warningThreshold: 0.75,
      criticalThreshold: 0.9,
    },
    safetyConfig: {
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
    mockTeamRepository = new TeamRepository({} as any) as jest.Mocked<TeamRepository>;

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
    mockTeamRepository.create = jest.fn().mockResolvedValue(undefined as any);
    mockTeamRepository.update = jest.fn().mockResolvedValue(undefined as any);
    mockTeamRepository.findById = jest.fn().mockResolvedValue(null as any);

    teamManager = new TeamManager({
      agentLifecycle: mockAgentLifecycle,
      messageBus: mockMessageBus,
      storage: mockStorage,
      teamRepository: mockTeamRepository,
    });
  });

  afterEach(() => {
    teamManager.stop();
    jest.clearAllMocks();
  });

  describe('start/stop', () => {
    it('should start the team manager', () => {
      const emitSpy = jest.spyOn(teamManager, 'emit');
      teamManager.start();
      expect(emitSpy).toHaveBeenCalledWith('manager.started');
    });

    it('should stop the team manager', () => {
      const emitSpy = jest.spyOn(teamManager, 'emit');
      teamManager.stop();
      expect(emitSpy).toHaveBeenCalledWith('manager.stopped');
    });
  });

  describe('create', () => {
    it('should create a new team with valid config', async () => {
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      expect(team).toBeDefined();
      expect(team.id).toBeDefined();
      expect(team.name).toBe(config.name);
      expect(team.state).toBe('creating');
    });

    it('should create teams with unique IDs', async () => {
      const config = createMockTeamConfig();
      const team1 = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);
      const team2 = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      expect(team1.id).not.toBe(team2.id);
    });

    it('should persist team to repository', async () => {
      const config = createMockTeamConfig();
      await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      expect(mockTeamRepository.create).toHaveBeenCalled();
    });

    it('should emit team.created event', async () => {
      const emitSpy = jest.spyOn(teamManager, 'emit');
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      expect(emitSpy).toHaveBeenCalledWith('team.created', expect.objectContaining({
        teamId: team.id,
        name: config.name,
      }));
    });
  });

  describe('getTeam', () => {
    it('should return team by ID', async () => {
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);
      const retrieved = await teamManager.getTeam(team.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(team.id);
    });

    it('should return undefined for non-existent team', async () => {
      const retrieved = await teamManager.getTeam('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listTeams', () => {
    it('should return all teams', async () => {
      const config = createMockTeamConfig();
      await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);
      await teamManager.createTeam('another-team', 'Another task', 1, 3, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      const teams = await teamManager.listTeams();

      expect(teams).toHaveLength(2);
    });

    it('should return empty array when no teams exist', async () => {
      const teams = await teamManager.listTeams();
      expect(teams).toEqual([]);
    });
  });

  describe('scale', () => {
    it('should throw error when scaling non-existent team', async () => {
      await expect(teamManager.scaleTeam('non-existent', 5)).rejects.toThrow(TeamNotFoundError);
    });
  });

  describe('destroy', () => {
    it('should destroy a team', async () => {
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      await teamManager.destroyTeam(team.id);

      const retrieved = await teamManager.getTeam(team.id);
      expect(retrieved?.state).toBe('destroyed');
    });

    it('should emit team.destroyed event', async () => {
      const emitSpy = jest.spyOn(teamManager, 'emit');
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      await teamManager.destroyTeam(team.id);

      expect(emitSpy).toHaveBeenCalledWith('team.destroyed', expect.objectContaining({
        teamId: team.id,
      }));
    });

    it('should throw error when destroying non-existent team', async () => {
      await expect(teamManager.destroyTeam('non-existent')).rejects.toThrow(TeamNotFoundError);
    });
  });

  describe('pauseTeam', () => {
    it('should pause an active team', async () => {
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      await teamManager.pauseTeam(team.id);

      const retrieved = await teamManager.getTeam(team.id);
      expect(retrieved?.state).toBe('paused');
    });
  });

  describe('resumeTeam', () => {
    it('should resume a paused team', async () => {
      const config = createMockTeamConfig();
      const team = await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      await teamManager.pauseTeam(team.id);
      await teamManager.resumeTeam(team.id);

      const retrieved = await teamManager.getTeam(team.id);
      expect(retrieved?.state).toBe('ready');
    });
  });

  describe('getStatus', () => {
    it('should return team status info', async () => {
      const config = createMockTeamConfig();
      await teamManager.createTeam(config.name, config.task, config.initialAgents, config.maxAgents, config.strategy, config.model, config.budgetConfig, config.safetyConfig);

      const status = teamManager.getStatus();

      expect(status).toBeDefined();
      expect(status.teamCount).toBe(1);
    });
  });
});
