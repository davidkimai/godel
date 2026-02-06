/**
 * State Persistence Tests
 * 
 * Tests for state persistence, optimistic locking, recovery, and audit logging.
 */

import { 
  StatePersistence, 
  PersistedSwarmState, 
  PersistedAgentState,
} from '../src/core/state-persistence';
import { resetGlobalStatePersistence } from '../src/core/state-persistence';
import { resetGlobalSQLiteStorage } from '../src/storage/sqlite';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, existsSync } from 'fs';

jest.setTimeout(20000);

describe('StatePersistence', () => {
  let persistence: StatePersistence;
  let testDbPath: string;
  let testDir: string;

  beforeEach(async () => {
    // Create temp test directory
    testDir = join(tmpdir(), `dash-state-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, 'test.db');

    // Reset singletons
    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();

    // Create new persistence instance with test DB
    persistence = new StatePersistence(
      {
        maxRetries: 3,
        baseDelayMs: 10,
        maxDelayMs: 100,
      },
      { dbPath: testDbPath }
    );

    // Initialize DB
    const { getGlobalSQLiteStorage } = await import('../src/storage/sqlite');
    await getGlobalSQLiteStorage({ dbPath: testDbPath });
  });

  afterEach(() => {
    // Cleanup
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();
  });

  describe('Swarm Persistence', () => {
    const mockSwarm: PersistedSwarmState = {
      id: 'swarm-test-001',
      name: 'Test Swarm',
      status: 'active',
      config: { task: 'test task', strategy: 'parallel' },
      agents: ['agent-001', 'agent-002'],
      createdAt: new Date().toISOString(),
      budgetAllocated: 100,
      budgetConsumed: 10,
      budgetRemaining: 90,
      metrics: { totalAgents: 2, completedAgents: 0, failedAgents: 0 },
      version: 1,
    };

    it('should persist a new swarm', async () => {
      await persistence.persistSwarm(mockSwarm, 'test');

      const loaded = await persistence.loadSwarm(mockSwarm.id);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(mockSwarm.id);
      expect(loaded?.name).toBe(mockSwarm.name);
      expect(loaded?.status).toBe(mockSwarm.status);
    });

    it('should update an existing swarm', async () => {
      await persistence.persistSwarm(mockSwarm, 'test');

      const updated = { ...mockSwarm, name: 'Updated Swarm', status: 'paused' as const };
      await persistence.persistSwarm(updated, 'test');

      const loaded = await persistence.loadSwarm(mockSwarm.id);
      expect(loaded?.name).toBe('Updated Swarm');
      expect(loaded?.status).toBe('paused');
    });

    it('should increment version on each update', async () => {
      await persistence.persistSwarm(mockSwarm, 'test');
      
      let version = await persistence.getVersion('swarm', mockSwarm.id);
      expect(version).toBe(1);

      await persistence.persistSwarm({ ...mockSwarm, name: 'Update 1' }, 'test');
      version = await persistence.getVersion('swarm', mockSwarm.id);
      expect(version).toBe(2);

      await persistence.persistSwarm({ ...mockSwarm, name: 'Update 2' }, 'test');
      version = await persistence.getVersion('swarm', mockSwarm.id);
      expect(version).toBe(3);
    });

    it('should load active swarms only', async () => {
      await persistence.persistSwarm(mockSwarm, 'test');
      await persistence.persistSwarm(
        { ...mockSwarm, id: 'swarm-002', status: 'completed' },
        'test'
      );
      await persistence.persistSwarm(
        { ...mockSwarm, id: 'swarm-003', status: 'destroyed' },
        'test'
      );

      const active = await persistence.loadActiveSwarms();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe(mockSwarm.id);
    });

    it('should update swarm status with optimistic locking', async () => {
      await persistence.persistSwarm(mockSwarm, 'test');

      await persistence.updateSwarmStatus(mockSwarm.id, 'paused', 'test', 1);

      const loaded = await persistence.loadSwarm(mockSwarm.id);
      expect(loaded?.status).toBe('paused');
    });
  });

  describe('Agent Persistence', () => {
    const mockAgent: PersistedAgentState = {
      id: 'agent-test-001',
      status: 'running',
      lifecycleState: 'running',
      swarmId: 'swarm-001',
      model: 'kimi-k2.5',
      task: 'test task',
      retryCount: 0,
      maxRetries: 3,
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      runtime: 1000,
      metadata: { key: 'value' },
      version: 1,
    };

    it('should persist a new agent', async () => {
      await persistence.persistAgent(mockAgent, 'test');

      const loaded = await persistence.loadAgent(mockAgent.id);
      expect(loaded).toBeDefined();
      expect(loaded?.id).toBe(mockAgent.id);
      expect(loaded?.status).toBe(mockAgent.status);
      expect(loaded?.model).toBe(mockAgent.model);
    });

    it('should update an existing agent', async () => {
      await persistence.persistAgent(mockAgent, 'test');

      const updated = { 
        ...mockAgent, 
        status: 'completed' as const, 
        lifecycleState: 'completed',
        runtime: 5000 
      };
      await persistence.persistAgent(updated, 'test');

      const loaded = await persistence.loadAgent(mockAgent.id);
      expect(loaded?.status).toBe('completed');
      expect(loaded?.runtime).toBe(5000);
    });

    it('should load agents by swarm', async () => {
      await persistence.persistAgent(mockAgent, 'test');
      await persistence.persistAgent(
        { ...mockAgent, id: 'agent-002', swarmId: 'swarm-001' },
        'test'
      );
      await persistence.persistAgent(
        { ...mockAgent, id: 'agent-003', swarmId: 'swarm-002' },
        'test'
      );

      const agents = await persistence.loadAgentsBySwarm('swarm-001');
      expect(agents.length).toBe(2);
    });

    it('should load active agents only', async () => {
      await persistence.persistAgent(mockAgent, 'test');
      await persistence.persistAgent(
        { ...mockAgent, id: 'agent-002', status: 'completed' as const, lifecycleState: 'completed' },
        'test'
      );

      const active = await persistence.loadActiveAgents();
      expect(active.length).toBe(1);
      expect(active[0].id).toBe(mockAgent.id);
    });
  });

  describe('Audit Logging', () => {
    it('should log state changes', async () => {
      const swarm: PersistedSwarmState = {
        id: 'audit-test-swarm',
        name: 'Audit Test',
        status: 'active',
        config: {},
        agents: [],
        createdAt: new Date().toISOString(),
        version: 1,
      };

      await persistence.persistSwarm(swarm, 'user-123');

      const logs = await persistence.getAuditLog(swarm.id);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].entityType).toBe('swarm');
      expect(logs[0].entityId).toBe(swarm.id);
      expect(logs[0].action).toBe('create');
      expect(logs[0].triggeredBy).toBe('user-123');
    });

    it('should support filtering by entity ID', async () => {
      const swarm1: PersistedSwarmState = {
        id: 'audit-test-1',
        name: 'Test 1',
        status: 'active',
        config: {},
        agents: [],
        createdAt: new Date().toISOString(),
        version: 1,
      };
      const swarm2: PersistedSwarmState = {
        id: 'audit-test-2',
        name: 'Test 2',
        status: 'active',
        config: {},
        agents: [],
        createdAt: new Date().toISOString(),
        version: 1,
      };

      await persistence.persistSwarm(swarm1, 'test');
      await persistence.persistSwarm(swarm2, 'test');

      const logs = await persistence.getAuditLog(swarm1.id);
      expect(logs.every(l => l.entityId === swarm1.id)).toBe(true);
    });
  });

  describe('Recovery', () => {
    it('should recover all active swarms and agents', async () => {
      // Create some state
      await persistence.persistSwarm(
        {
          id: 'recovery-swarm-1',
          name: 'Active Swarm',
          status: 'active',
          config: {},
          agents: ['agent-1'],
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );
      await persistence.persistSwarm(
        {
          id: 'recovery-swarm-2',
          name: 'Completed Swarm',
          status: 'completed',
          config: {},
          agents: [],
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );
      await persistence.persistAgent(
        {
          id: 'recovery-agent-1',
          status: 'running',
          lifecycleState: 'running',
          model: 'test',
          task: 'test',
          retryCount: 0,
          maxRetries: 3,
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );

      const result = await persistence.recoverAll();

      // Recovery only restores active/in-flight entities.
      expect(result.swarmsRecovered).toBe(1);
      expect(result.agentsRecovered).toBe(1);
      expect(result.errors).toHaveLength(0);
    });

    it('should emit recovery events', async () => {
      const events: string[] = [];

      persistence.on('recovery.swarm', () => events.push('swarm'));
      persistence.on('recovery.agent', () => events.push('agent'));
      persistence.on('recovery.complete', () => events.push('complete'));

      await persistence.persistSwarm(
        {
          id: 'event-swarm',
          name: 'Event Test',
          status: 'active',
          config: {},
          agents: [],
          createdAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );

      await persistence.recoverAll();

      expect(events).toContain('swarm');
      expect(events).toContain('complete');
    });
  });

  describe('Checkpoints', () => {
    it('should create and retrieve checkpoints', async () => {
      const data = { key: 'value', nested: { prop: 123 } };

      await persistence.createCheckpoint('swarm', 'test-swarm', data, 'test-checkpoint');

      const checkpoint = await persistence.getLatestCheckpoint('test-swarm');
      expect(checkpoint).toBeDefined();
      expect(checkpoint?.data).toEqual(data);
    });

    it('should return the latest checkpoint', async () => {
      await persistence.createCheckpoint('swarm', 'latest-test', { v: 1 }, 'first');
      await new Promise(r => setTimeout(r, 50));
      await persistence.createCheckpoint('swarm', 'latest-test', { v: 2 }, 'second');

      const checkpoint = await persistence.getLatestCheckpoint('latest-test');
      expect(checkpoint?.data).toEqual({ v: 2 });
    });
  });

  describe('Migration', () => {
    it('should migrate from in-memory state', async () => {
      const result = await persistence.migrateFromMemory({
        swarms: [
          {
            id: 'mig-swarm-1',
            name: 'Migration Test',
            status: 'active',
            config: { test: true },
            agents: ['agent-1'],
            createdAt: new Date(),
            budget: { allocated: 100, consumed: 0, remaining: 100 },
            metrics: {},
          },
        ],
        agentStates: [
          {
            id: 'mig-agent-1',
            status: 'running',
            lifecycleState: 'running',
            agent: {
              model: 'kimi-k2.5',
              task: 'migration test',
              metadata: {},
            },
            retryCount: 0,
            maxRetries: 3,
            createdAt: new Date(),
          },
        ],
      });

      expect(result.swarms).toBe(1);
      expect(result.agents).toBe(1);

      const loadedSwarm = await persistence.loadSwarm('mig-swarm-1');
      expect(loadedSwarm).toBeDefined();

      const loadedAgent = await persistence.loadAgent('mig-agent-1');
      expect(loadedAgent).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup old completed states', async () => {
      const oldDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

      await persistence.persistSwarm(
        {
          id: 'old-swarm',
          name: 'Old Swarm',
          status: 'completed',
          config: {},
          agents: [],
          createdAt: oldDate,
          completedAt: oldDate,
          version: 1,
        },
        'test'
      );

      await persistence.persistAgent(
        {
          id: 'old-agent',
          status: 'completed',
          lifecycleState: 'completed',
          model: 'test',
          task: 'test',
          retryCount: 0,
          maxRetries: 3,
          createdAt: oldDate,
          completedAt: oldDate,
          version: 1,
        },
        'test'
      );

      const result = await persistence.cleanup(24);

      expect(result.swarmsDeleted).toBe(1);
      expect(result.agentsDeleted).toBe(1);

      const loadedSwarm = await persistence.loadSwarm('old-swarm');
      expect(loadedSwarm).toBeUndefined();
    });

    it('should not cleanup recent states', async () => {
      await persistence.persistSwarm(
        {
          id: 'recent-swarm',
          name: 'Recent Swarm',
          status: 'completed',
          config: {},
          agents: [],
          createdAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          version: 1,
        },
        'test'
      );

      const result = await persistence.cleanup(24);

      expect(result.swarmsDeleted).toBe(0);

      const loadedSwarm = await persistence.loadSwarm('recent-swarm');
      expect(loadedSwarm).toBeDefined();
    });
  });
});

describe('OptimisticLocking', () => {
  let persistence: StatePersistence;
  let testDbPath: string;
  let testDir: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `dash-lock-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
    testDbPath = join(testDir, 'test.db');

    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();

    persistence = new StatePersistence(
      {
        maxRetries: 2,
        baseDelayMs: 5,
        maxDelayMs: 50,
      },
      { dbPath: testDbPath }
    );

    const { getGlobalSQLiteStorage } = await import('../src/storage/sqlite');
    await getGlobalSQLiteStorage({ dbPath: testDbPath });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    resetGlobalStatePersistence();
    resetGlobalSQLiteStorage();
  });

  it('should detect version conflicts', async () => {
    const swarm: PersistedSwarmState = {
      id: 'lock-test-swarm',
      name: 'Lock Test',
      status: 'active',
      config: {},
      agents: [],
      createdAt: new Date().toISOString(),
      version: 1,
    };

    await persistence.persistSwarm(swarm, 'test');

    // Simulate concurrent update by directly incrementing version
    await persistence.incrementVersion('swarm', swarm.id, 'other-process');

    // This should fail due to version mismatch
    await expect(
      persistence.updateSwarmStatus(swarm.id, 'paused', 'test', 1)
    ).rejects.toThrow();
  });

  it('should succeed with correct version', async () => {
    const swarm: PersistedSwarmState = {
      id: 'lock-test-swarm-2',
      name: 'Lock Test 2',
      status: 'active',
      config: {},
      agents: [],
      createdAt: new Date().toISOString(),
      version: 1,
    };

    await persistence.persistSwarm(swarm, 'test');
    const version = await persistence.getVersion('swarm', swarm.id);

    await expect(
      persistence.updateSwarmStatus(swarm.id, 'paused', 'test', version!)
    ).resolves.not.toThrow();
  });
});
