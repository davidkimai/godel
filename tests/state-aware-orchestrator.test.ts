/**
 * State-Aware Orchestrator Tests
 * 
 * Tests for the state-aware orchestrator with persistence integration.
 */

import { StateAwareOrchestrator, createStateAwareOrchestrator } from '../src/core/state-aware-orchestrator';
import { StatePersistence } from '../src/core/state-persistence';
import { AgentLifecycle } from '../src/core/lifecycle';
import { MessageBus } from '../src/bus/index';
import { AgentStorage } from '../src/storage/memory';
import { SwarmConfig } from '../src/core/swarm-orchestrator';
import { resetGlobalStatePersistence } from '../src/core/state-persistence';
import { resetGlobalSQLiteStorage } from '../src/storage/sqlite';
import { resetGlobalSwarmOrchestrator } from '../src/core/swarm-orchestrator';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';

jest.setTimeout(20000);

// Mock dependencies
const createMockAgentLifecycle = () => ({
  spawn: jest.fn().mockResolvedValue({
    id: 'agent-001',
    model: 'kimi-k2.5',
    task: 'test',
    status: 'running',
    createdAt: new Date(),
    metadata: {},
  }),
  kill: jest.fn().mockResolvedValue(undefined),
  pause: jest.fn().mockResolvedValue(undefined),
  resume: jest.fn().mockResolvedValue(undefined),
  startAgent: jest.fn().mockResolvedValue(undefined),
  getState: jest.fn().mockReturnValue(null),
  getAllStates: jest.fn().mockReturnValue([]),
  on: jest.fn(),
  emit: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn(),
});

const createMockMessageBus = () => ({
  subscribe: jest.fn().mockReturnValue(() => {}),
  publish: jest.fn(),
  agentEvents: jest.fn().mockReturnValue('agent-events'),
  swarmBroadcast: jest.fn().mockReturnValue('swarm-broadcast'),
  on: jest.fn(),
});

const createMockStorage = () => ({
  create: jest.fn(),
  update: jest.fn(),
  get: jest.fn(),
  list: jest.fn().mockReturnValue([]),
  delete: jest.fn(),
});

describe('StateAwareOrchestrator', () => {
  let orchestrator: StateAwareOrchestrator;
  let persistence: StatePersistence;
  let testDbPath: string;
  let testDir: string;
  let mockAgentLifecycle: ReturnType<typeof createMockAgentLifecycle>;
  let mockMessageBus: ReturnType<typeof createMockMessageBus>;
  let mockStorage: ReturnType<typeof createMockStorage>;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dash-orchestrator-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, 'test.db');

    // Reset singletons
    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();
    resetGlobalSwarmOrchestrator();

    // Create mocks
    mockAgentLifecycle = createMockAgentLifecycle() as unknown as ReturnType<typeof createMockAgentLifecycle>;
    mockMessageBus = createMockMessageBus() as unknown as ReturnType<typeof createMockMessageBus>;
    mockStorage = createMockStorage() as unknown as ReturnType<typeof createMockStorage>;

    // Initialize DB
    const { getGlobalSQLiteStorage } = await import('../src/storage/sqlite');
    await getGlobalSQLiteStorage({ dbPath: testDbPath });

    // Create persistence
    persistence = new StatePersistence({
      maxRetries: 2,
      baseDelayMs: 5,
      maxDelayMs: 50,
    });

    // Create orchestrator
    orchestrator = await createStateAwareOrchestrator(
      mockAgentLifecycle as unknown as AgentLifecycle,
      mockMessageBus as unknown as MessageBus,
      mockStorage as unknown as AgentStorage,
      {
        enablePersistence: true,
        enableRecovery: true,
        featureFlags: {
          useDatabaseSwarms: true,
          useDatabaseAgents: true,
          useDatabaseSessions: true,
        },
      }
    );
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();
    resetGlobalSwarmOrchestrator();
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should have default configuration', () => {
      const config = orchestrator.getStateConfig();
      expect(config.enablePersistence).toBe(true);
      expect(config.enableRecovery).toBe(true);
      expect(config.enableOptimisticLocking).toBe(true);
      expect(config.enableAuditLog).toBe(true);
    });

    it('should allow feature flag overrides', async () => {
      const customOrchestrator = await createStateAwareOrchestrator(
        mockAgentLifecycle as unknown as AgentLifecycle,
        mockMessageBus as unknown as MessageBus,
        mockStorage as unknown as AgentStorage,
        {
          featureFlags: {
            useDatabaseSwarms: true,
            useDatabaseAgents: false,
            useDatabaseSessions: false,
          },
        }
      );

      const config = customOrchestrator.getStateConfig();
      expect(config.featureFlags.useDatabaseSwarms).toBe(true);
      expect(config.featureFlags.useDatabaseAgents).toBe(false);
    });
  });

  describe('Persistence Integration', () => {
    it('should persist swarm on creation', async () => {
      const config: SwarmConfig = {
        name: 'Test Swarm',
        task: 'test task',
        initialAgents: 1,
        maxAgents: 5,
        strategy: 'parallel',
      };

      const swarm = await orchestrator.create(config);

      // Verify swarm was persisted
      const persisted = await persistence.loadSwarm(swarm.id);
      expect(persisted).toBeDefined();
      expect(persisted?.name).toBe(config.name);
    });

    it('should update persisted status on destroy', async () => {
      const config: SwarmConfig = {
        name: 'Test Swarm',
        task: 'test task',
        initialAgents: 1,
        maxAgents: 5,
        strategy: 'parallel',
      };

      const swarm = await orchestrator.create(config);
      await orchestrator.destroy(swarm.id);

      const persisted = await persistence.loadSwarm(swarm.id);
      expect(persisted?.status).toBe('destroyed');
    });
  });

  describe('Recovery', () => {
    it('should perform recovery on start', async () => {
      // Create some state before starting
      await persistence.persistSwarm(
        {
          id: 'recovery-swarm-1',
          name: 'Active Swarm',
          status: 'active',
          config: { task: 'test' },
          agents: ['agent-1'],
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );

      const result = await orchestrator.start();

      expect(result.swarmsRecovered).toBeGreaterThanOrEqual(1);
      expect(orchestrator.isPersistenceInitialized()).toBe(true);
    });

    it('should populate recovery context', async () => {
      await persistence.persistSwarm(
        {
          id: 'recovery-swarm-2',
          name: 'Active Swarm 2',
          status: 'active',
          config: {},
          agents: ['agent-1'],
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );

      await orchestrator.start();

      const context = orchestrator.getRecoveryContext();
      expect(context.recoveredSwarms.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Statistics', () => {
    it('should return persistence statistics', async () => {
      await persistence.persistSwarm(
        {
          id: 'stats-swarm',
          name: 'Stats Test',
          status: 'active',
          config: {},
          agents: [],
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );

      const stats = await orchestrator.getPersistenceStats();

      expect(stats.activeSwarms).toBeGreaterThanOrEqual(1);
      expect(stats).toHaveProperty('activeAgents');
      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('recentAuditEntries');
    });
  });

  describe('Migration', () => {
    it('should migrate from in-memory state', async () => {
      // Note: This test uses the mock, so we're testing the migration interface
      const result = await orchestrator.migrateFromMemory();

      // With mocks, we expect 0 swarms and agents since we're not populating the parent class
      expect(result).toHaveProperty('swarms');
      expect(result).toHaveProperty('agents');
    });
  });
});

describe('createStateAwareOrchestrator', () => {
  it('should create orchestrator with dependencies', async () => {
    const testDir = join(tmpdir(), `dash-factory-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    const testDbPath = join(testDir, 'test.db');

    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();

    const { getGlobalSQLiteStorage } = await import('../src/storage/sqlite');
    await getGlobalSQLiteStorage({ dbPath: testDbPath });

    const mockAgentLifecycle = createMockAgentLifecycle();
    const mockMessageBus = createMockMessageBus();
    const mockStorage = createMockStorage();

    const orchestrator = await createStateAwareOrchestrator(
      mockAgentLifecycle as unknown as AgentLifecycle,
      mockMessageBus as unknown as MessageBus,
      mockStorage as unknown as AgentStorage
    );

    expect(orchestrator).toBeInstanceOf(StateAwareOrchestrator);

    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();
  });
});
