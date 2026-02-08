/**
 * Agent Migration Tests
 */

import { AgentMigrator, DEFAULT_MIGRATION_CONFIG } from '../migration';
import { ClusterRegistry } from '../cluster-registry';

// Mock fetch globally
global.fetch = jest.fn();

describe('AgentMigrator', () => {
  let registry: ClusterRegistry;
  let migrator: AgentMigrator;

  beforeEach(async () => {
    registry = new ClusterRegistry({
      healthCheckIntervalMs: 60000,
    });
    await registry.initialize();

    migrator = new AgentMigrator(registry, {
      ...DEFAULT_MIGRATION_CONFIG,
      defaultTimeoutMs: 1000,
    });
    await migrator.initialize();

    (fetch as jest.Mock).mockReset();
  });

  afterEach(async () => {
    await migrator.dispose();
    await registry.dispose();
  });

  describe('Migration Planning', () => {
    it('should create a migration plan', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 10 });

      const plan = await migrator.planMigration('agent-1', source.id, target.id);

      expect(plan.migrationId).toBeDefined();
      expect(plan.agentId).toBe('agent-1');
      expect(plan.source.id).toBe(source.id);
      expect(plan.target.id).toBe(target.id);
      expect(plan.steps.length).toBeGreaterThan(0);
      expect(plan.riskLevel).toBeDefined();
    });

    it('should auto-select target cluster', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 10 });
      
      // Mark clusters as healthy for migration selection
      await registry.updateHealth(source.id, 'healthy', 100);
      await registry.updateHealth(target.id, 'healthy', 100);

      const plan = await migrator.planMigration('agent-1', source.id);

      expect(plan.target.id).toBe(target.id);
    });

    it('should throw if target has no capacity', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 50 }); // Full

      await expect(
        migrator.planMigration('agent-1', source.id, target.id)
      ).rejects.toThrow('no available capacity');
    });
  });

  describe('Migration Execution', () => {
    it('should successfully migrate an agent', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 10 });
      await registry.updateHealth(source.id, 'healthy', 50);
      await registry.updateHealth(target.id, 'healthy', 50);

      // Mock all fetch calls for migration steps
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ // export state
          ok: true,
          json: async () => ({
            agentId: 'agent-1',
            version: '1.0',
            timestamp: new Date().toISOString(),
          }),
        })
        .mockResolvedValueOnce({ ok: true }) // transfer state
        .mockResolvedValueOnce({ ok: true }) // start on target
        .mockResolvedValueOnce({ ok: true }) // verify
        .mockResolvedValueOnce({ ok: true }) // stop on source
        .mockResolvedValueOnce({ ok: true }); // cleanup

      const result = await migrator.migrateAgent('agent-1', source.id, target.id);

      expect(result.status).toBe('completed');
      expect(result.durationMs).toBeDefined();
      expect(result.durationMs).toBeLessThan(5000); // Should be sub-second
    });

    it('should handle migration failure', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 10 });
      await registry.updateHealth(source.id, 'healthy', 50);
      await registry.updateHealth(target.id, 'healthy', 50);

      // Mock failure during state transfer
      (fetch as jest.Mock)
        .mockResolvedValueOnce({ // export state
          ok: true,
          json: async () => ({
            agentId: 'agent-1',
            version: '1.0',
          }),
        })
        .mockRejectedValueOnce(new Error('Network error')); // transfer fails

      const result = await migrator.migrateAgent('agent-1', source.id, target.id);

      expect(result.status).toBe('rolled_back');
      expect(result.error).toBeDefined();
    });

    it('should respect concurrent migration limit', async () => {
      const migratorWithLimit = new AgentMigrator(registry, {
        ...DEFAULT_MIGRATION_CONFIG,
        maxConcurrentMigrations: 1,
      });
      await migratorWithLimit.initialize();

      // Start a migration
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 10 });

      // Mock to keep migration in progress
      (fetch as jest.Mock).mockImplementation(() => 
        new Promise(() => {}) // Never resolves
      );

      // Start first migration (won't complete)
      migratorWithLimit.migrateAgent('agent-1', source.id, target.id).catch(() => {});

      // Try second migration
      await expect(
        migratorWithLimit.migrateAgent('agent-2', source.id, target.id)
      ).rejects.toThrow('Max concurrent migrations');

      await migratorWithLimit.dispose();
    });
  });

  describe('Bulk Migration', () => {
    it('should migrate multiple agents', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 100,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 100,
      });

      registry.updateLoad(source.id, { currentAgents: 80 });
      registry.updateLoad(target.id, { currentAgents: 10 });
      await registry.updateHealth(source.id, 'healthy', 50);
      await registry.updateHealth(target.id, 'healthy', 50);

      // Mock successful migrations
      (fetch as jest.Mock)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            agentId: 'agent-1',
            version: '1.0',
          }),
        });

      const migrations = [
        { agentId: 'agent-1', sourceClusterId: source.id, targetClusterId: target.id },
        { agentId: 'agent-2', sourceClusterId: source.id, targetClusterId: target.id },
      ];

      const results = await migrator.migrateMultipleAgents(migrations);

      expect(results).toHaveLength(2);
    });
  });

  describe('Failover', () => {
    it('should failover a failed cluster', async () => {
      const failed = await registry.registerCluster({
        endpoint: 'http://failed:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 100,
      });

      registry.updateLoad(failed.id, { currentAgents: 30 });
      registry.updateLoad(target.id, { currentAgents: 10 });

      (fetch as jest.Mock).mockResolvedValue({ ok: true });

      const results = await migrator.failoverCluster(failed.id);

      expect(results.length).toBeGreaterThan(0);
      expect(failed.isAcceptingTraffic).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should track migration stats', async () => {
      const source = await registry.registerCluster({
        endpoint: 'http://source:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const target = await registry.registerCluster({
        endpoint: 'http://target:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(source.id, { currentAgents: 40 });
      registry.updateLoad(target.id, { currentAgents: 10 });
      await registry.updateHealth(source.id, 'healthy', 50);
      await registry.updateHealth(target.id, 'healthy', 50);

      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({
          agentId: 'agent-1',
          version: '1.0',
        }),
      });

      await migrator.migrateAgent('agent-1', source.id, target.id);

      const stats = migrator.getStats();

      expect(stats.totalMigrations).toBe(1);
      expect(stats.successfulMigrations).toBe(1);
      expect(stats.currentActiveMigrations).toBe(0);
    });
  });
});
