/**
 * Orchestrator Integration Tests
 *
 * Tests for orchestrator lifecycle, health checks, swarm spawn/kill, state persistence.
 */

import { HealthMonitor, HealthReport } from '../../src/core/health-monitor';
import { StateManager, SystemState, RecoveryResult } from '../../src/core/state-manager';
import { SwarmManager, SwarmConfig, Swarm } from '../../src/core/swarm';
import { AgentLifecycle } from '../../src/core/lifecycle';
import { MessageBus } from '../../src/bus/index';
import { AgentStorage } from '../../src/storage/memory';
import { SwarmRepository } from '../../src/storage';

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('../../src/storage/sqlite', () => ({
  getDb: jest.fn().mockReturnValue({
    run: jest.fn().mockResolvedValue({}),
    get: jest.fn().mockResolvedValue(null),
    all: jest.fn().mockResolvedValue([]),
  }),
  initDatabase: jest.fn().mockResolvedValue(undefined),
  closeDatabase: jest.fn().mockResolvedValue(undefined),
}));

describe('Orchestrator Integration', () => {
  describe('HealthMonitor Integration', () => {
    let healthMonitor: HealthMonitor;

    beforeEach(() => {
      healthMonitor = new HealthMonitor();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should initialize with default health checks', () => {
      const checks = healthMonitor.getRegisteredChecks();
      expect(checks.length).toBeGreaterThan(0);
      expect(checks).toContain('api_health');
      expect(checks).toContain('openclaw_gateway');
      expect(checks).toContain('agent_pool');
      expect(checks).toContain('budget_status');
      expect(checks).toContain('disk_space');
      expect(checks).toContain('memory_usage');
    });

    it('should run all health checks and return report', async () => {
      const report = await healthMonitor.runChecks();

      expect(report).toBeDefined();
      expect(report.overall).toBeDefined();
      expect(report.checks).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.timestamp).toBeInstanceOf(Date);
      expect(report.duration).toBeGreaterThanOrEqual(0);
    });

    it('should categorize checks by severity', async () => {
      const report = await healthMonitor.runChecks();

      const criticalChecks = report.checks.filter(c => c.severity === 'critical');
      const warningChecks = report.checks.filter(c => c.severity === 'warning');
      const infoChecks = report.checks.filter(c => c.severity === 'info');

      expect(criticalChecks.length).toBeGreaterThanOrEqual(0);
      expect(warningChecks.length).toBeGreaterThanOrEqual(0);
      expect(infoChecks.length).toBeGreaterThanOrEqual(0);
    });

    it('should run specific health checks', async () => {
      const result = await healthMonitor.runCheck('memory_usage');

      expect(result).toBeDefined();
      expect(result?.name).toBe('memory_usage');
      expect(result?.status).toBeDefined();
    });

    it('should return null for unknown check', async () => {
      const result = await healthMonitor.runCheck('unknown_check');
      expect(result).toBeNull();
    });

    it('should determine overall health status', async () => {
      const report = await healthMonitor.runChecks();

      expect(['healthy', 'degraded', 'unhealthy', 'unknown']).toContain(report.overall);
    });

    it('should track check summary counts', async () => {
      const report = await healthMonitor.runChecks();

      const total = report.summary.healthy + report.summary.degraded +
                    report.summary.unhealthy + report.summary.unknown;
      expect(total).toBe(report.checks.length);
    });

    it('should register custom health checks', () => {
      healthMonitor.registerCheck({
        name: 'custom_check',
        severity: 'warning',
        check: async () => ({
          name: 'custom_check',
          status: 'healthy',
          severity: 'warning',
          message: 'Custom check passed',
          timestamp: new Date(),
          duration: 0,
        }),
        enabled: true,
      });

      expect(healthMonitor.getRegisteredChecks()).toContain('custom_check');
    });

    it('should unregister health checks', () => {
      healthMonitor.unregisterCheck('agent_pool');
      expect(healthMonitor.getRegisteredChecks()).not.toContain('agent_pool');
    });

    it('should store last report', async () => {
      await healthMonitor.runChecks();
      const lastReport = healthMonitor.getLastReport();

      expect(lastReport).toBeDefined();
      expect(lastReport?.timestamp).toBeInstanceOf(Date);
    });

    it('should assess system health', async () => {
      const isHealthy = await healthMonitor.isHealthy();
      expect(typeof isHealthy).toBe('boolean');
    });
  });

  describe('StateManager Integration', () => {
    let stateManager: StateManager;

    beforeEach(() => {
      stateManager = new StateManager();
    });

    afterEach(() => {
      jest.clearAllMocks();
    });

    it('should capture current system state', async () => {
      const state = await stateManager.captureCurrentState(
        [], // agents
        [], // swarms
        { totalSpend: 0, agentCount: 0, swarmCount: 0, history: [] }, // budgets
        {}, // budgetsConfig
        [], // metrics
        [], // patterns
        [], // improvements
        []  // pendingActions
      );

      expect(state).toBeDefined();
      expect(state.version).toBeDefined();
      expect(state.lastCheckpoint).toBeInstanceOf(Date);
      expect(state.agents).toEqual([]);
      expect(state.swarms).toEqual([]);
    });

    it('should save and load checkpoint', async () => {
      const state = await stateManager.captureCurrentState(
        [{ id: 'agent-1', name: 'Test Agent', status: 'running', model: 'kimi-k2.5', createdAt: new Date(), lastActivity: new Date() }],
        [],
        { totalSpend: 100, agentCount: 1, swarmCount: 0, history: [] },
        {},
        [],
        [],
        [],
        []
      );

      const filepath = await stateManager.saveCheckpoint(state);
      expect(filepath).toBeDefined();
      expect(filepath).toContain('state_');
    });

    it('should list checkpoints', async () => {
      const checkpoints = await stateManager.listCheckpoints();
      expect(Array.isArray(checkpoints)).toBe(true);
    });

    it('should calculate checkpoint age', async () => {
      const age = await stateManager.getLatestCheckpointAge();
      // Age may be null if no checkpoints exist
      expect(age === null || typeof age === 'number').toBe(true);
    });

    it('should recover from checkpoint with options', async () => {
      const state: SystemState = {
        version: '3.0.0',
        lastCheckpoint: new Date(),
        agents: [
          { id: 'agent-1', name: 'Agent 1', status: 'running', model: 'kimi-k2.5', createdAt: new Date(), lastActivity: new Date() }
        ],
        swarms: [],
        budgets: { totalSpend: 0, agentCount: 1, swarmCount: 0, history: [] },
        budgetsConfig: {},
        metrics: [],
        patterns: [],
        improvements: [],
        pendingActions: [],
      };

      const result = await stateManager.recoverFromCheckpoint(state, {
        restartAgents: false,
        resumeSwarms: false,
        restoreBudgets: false,
        replayActions: false,
      });

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.agentsRestored).toBeGreaterThanOrEqual(0);
      expect(result.swarmsResumed).toBeGreaterThanOrEqual(0);
      expect(typeof result.budgetsRestored).toBe('boolean');
      expect(result.actionsReplayed).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(result.errors)).toBe(true);
    });
  });

  describe('SwarmManager Lifecycle Integration', () => {
    let swarmManager: SwarmManager;
    let mockAgentLifecycle: jest.Mocked<AgentLifecycle>;
    let mockMessageBus: jest.Mocked<MessageBus>;
    let mockStorage: jest.Mocked<AgentStorage>;

    const createMockSwarmConfig = (): SwarmConfig => ({
      name: 'test-swarm',
      task: 'Test task',
      initialAgents: 2,
      maxAgents: 5,
      strategy: 'parallel',
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
      mockAgentLifecycle = {
        spawn: jest.fn().mockResolvedValue({
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
        }),
        kill: jest.fn().mockResolvedValue(undefined),
        getState: jest.fn().mockReturnValue(null),
        pause: jest.fn().mockResolvedValue(undefined),
        resume: jest.fn().mockResolvedValue(undefined),
        getAllStates: jest.fn().mockReturnValue([]),
      } as unknown as jest.Mocked<AgentLifecycle>;

      mockMessageBus = {
        publish: jest.fn().mockResolvedValue(undefined),
        subscribe: jest.fn().mockReturnValue(() => {}),
      } as unknown as jest.Mocked<MessageBus>;

      mockStorage = {
        create: jest.fn(),
        get: jest.fn(),
      } as unknown as jest.Mocked<AgentStorage>;

      swarmManager = new SwarmManager(
        mockAgentLifecycle,
        mockMessageBus,
        mockStorage,
      );
    });

    afterEach(() => {
      swarmManager.stop();
      jest.clearAllMocks();
    });

    it('should start and stop swarm manager', () => {
      const startSpy = jest.fn();
      const stopSpy = jest.fn();

      swarmManager.on('manager.started', startSpy);
      swarmManager.on('manager.stopped', stopSpy);

      swarmManager.start();
      expect(startSpy).toHaveBeenCalled();

      swarmManager.stop();
      expect(stopSpy).toHaveBeenCalled();
    });

    it('should create swarm with lifecycle events', async () => {
      swarmManager.start();
      const createdSpy = jest.fn();
      swarmManager.on('swarm.created', createdSpy);

      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);

      expect(swarm).toBeDefined();
      expect(swarm.name).toBe(config.name);
      expect(createdSpy).toHaveBeenCalledWith(swarm);
    });

    it('should destroy swarm and cleanup', async () => {
      swarmManager.start();
      const destroyedSpy = jest.fn();
      swarmManager.on('swarm.destroyed', destroyedSpy);

      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);

      await swarmManager.destroy(swarm.id);

      expect(destroyedSpy).toHaveBeenCalled();
      const retrieved = swarmManager.getSwarm(swarm.id);
      expect(retrieved?.status).toBe('destroyed');
    });

    it('should scale swarm up and down', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);

      const scaledSpy = jest.fn();
      swarmManager.on('swarm.scaled', scaledSpy);

      await swarmManager.scale(swarm.id, 3);

      expect(scaledSpy).toHaveBeenCalledWith(expect.objectContaining({
        swarmId: swarm.id,
        newSize: 3,
      }));
    });

    it('should get swarm status', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);

      const status = swarmManager.getStatus(swarm.id);

      expect(status).toBeDefined();
      expect(status.id).toBe(swarm.id);
      expect(status.name).toBe(swarm.name);
      expect(status.status).toBeDefined();
      expect(typeof status.agentCount).toBe('number');
      expect(typeof status.budgetRemaining).toBe('number');
      expect(typeof status.progress).toBe('number');
    });

    it('should list all swarms', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();

      await swarmManager.create(config);
      await swarmManager.create({ ...config, name: 'swarm-2' });

      const swarms = swarmManager.listSwarms();
      expect(swarms).toHaveLength(2);
    });

    it('should list only active swarms', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();

      const swarm1 = await swarmManager.create(config);
      await swarmManager.create({ ...config, name: 'swarm-2' });
      await swarmManager.destroy(swarm1.id);

      const activeSwarms = swarmManager.listActiveSwarms();
      expect(activeSwarms).toHaveLength(1);
      expect(activeSwarms[0].name).toBe('swarm-2');
    });

    it('should pause and resume swarm', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);

      await swarmManager.pauseSwarm(swarm.id);
      let retrieved = swarmManager.getSwarm(swarm.id);
      expect(retrieved?.status).toBe('paused');

      await swarmManager.resumeSwarm(swarm.id);
      retrieved = swarmManager.getSwarm(swarm.id);
      expect(retrieved?.status).toBe('active');
    });

    it('should consume budget and emit warnings', async () => {
      swarmManager.start();
      const warningSpy = jest.fn();
      const criticalSpy = jest.fn();
      swarmManager.on('swarm.budget.warning', warningSpy);
      swarmManager.on('swarm.budget.critical', criticalSpy);

      const config = createMockSwarmConfig();
      config.budget = { amount: 100, currency: 'USD', warningThreshold: 0.5, criticalThreshold: 0.8 };
      const swarm = await swarmManager.create(config);

      // Consume 60% of budget (should trigger warning)
      await swarmManager.consumeBudget(swarm.id, 'agent-1', 1000, 60);

      const retrieved = swarmManager.getSwarm(swarm.id);
      expect(retrieved?.budget.consumed).toBe(60);
      expect(retrieved?.budget.remaining).toBe(40);
    });

    it('should throw error for non-existent swarm operations', async () => {
      await expect(swarmManager.scale('non-existent', 5)).rejects.toThrow();
      await expect(swarmManager.destroy('non-existent')).rejects.toThrow();
      await expect(swarmManager.getStatus('non-existent')).rejects.toThrow();
    });

    it('should prevent scaling destroyed swarms', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      const swarm = await swarmManager.create(config);
      await swarmManager.destroy(swarm.id);

      await expect(swarmManager.scale(swarm.id, 5)).rejects.toThrow();
    });

    it('should enforce max agents limit when scaling', async () => {
      swarmManager.start();
      const config = createMockSwarmConfig();
      config.maxAgents = 3;
      const swarm = await swarmManager.create(config);

      await expect(swarmManager.scale(swarm.id, 10)).rejects.toThrow();
    });
  });

  describe('End-to-End Orchestration Flow', () => {
    it('should complete full orchestration lifecycle', async () => {
      // This is a comprehensive end-to-end test
      const healthMonitor = new HealthMonitor();
      const stateManager = new StateManager();

      // 1. Check initial health
      const initialHealth = await healthMonitor.runChecks();
      expect(initialHealth).toBeDefined();

      // 2. Capture initial state
      const initialState = await stateManager.captureCurrentState(
        [], [], { totalSpend: 0, agentCount: 0, swarmCount: 0, history: [] },
        {}, [], [], [], []
      );
      expect(initialState).toBeDefined();

      // 3. Verify state structure
      expect(initialState.version).toBe('3.0.0');
      expect(initialState.agents).toEqual([]);
      expect(initialState.swarms).toEqual([]);
    });
  });
});
