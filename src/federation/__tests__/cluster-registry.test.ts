/**
 * Cluster Registry Tests
 */

import { ClusterRegistry, DEFAULT_REGISTRY_CONFIG } from '../cluster-registry';

describe('ClusterRegistry', () => {
  let registry: ClusterRegistry;

  beforeEach(async () => {
    registry = new ClusterRegistry({
      ...DEFAULT_REGISTRY_CONFIG,
      healthCheckIntervalMs: 1000,
    });
    await registry.initialize();
  });

  afterEach(async () => {
    await registry.dispose();
  });

  describe('Registration', () => {
    it('should register a new cluster', async () => {
      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
        capabilities: { gpu: true },
      });

      expect(cluster.id).toBeDefined();
      expect(cluster.endpoint).toBe('http://localhost:8080');
      expect(cluster.region).toBe('us-east-1');
      expect(cluster.maxAgents).toBe(50);
      expect(cluster.health.status).toBe('unknown');
    });

    it('should throw on duplicate endpoint', async () => {
      await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      await expect(
        registry.registerCluster({
          endpoint: 'http://localhost:8080',
          region: 'us-east-2',
          zone: 'b',
          maxAgents: 30,
        })
      ).rejects.toThrow('already registered');
    });

    it('should unregister a cluster', async () => {
      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      await registry.unregisterCluster(cluster.id, 'test cleanup');

      expect(registry.getCluster(cluster.id)).toBeUndefined();
    });
  });

  describe('Queries', () => {
    beforeEach(async () => {
      await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
        capabilities: { gpu: true },
      });

      await registry.registerCluster({
        endpoint: 'http://cluster2:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 30,
      });

      await registry.registerCluster({
        endpoint: 'http://cluster3:8080',
        region: 'eu-west-1',
        zone: 'a',
        maxAgents: 40,
        capabilities: { gpu: true, vision: true },
      });
    });

    it('should get all clusters', () => {
      const clusters = registry.getAllClusters();
      expect(clusters).toHaveLength(3);
    });

    it('should get clusters by region', () => {
      const usClusters = registry.getClustersByRegion('us-east-1');
      expect(usClusters).toHaveLength(2);

      const euClusters = registry.getClustersByRegion('eu-west-1');
      expect(euClusters).toHaveLength(1);
    });

    it('should get clusters by capability', () => {
      const gpuClusters = registry.getClustersByCapability('gpu');
      expect(gpuClusters).toHaveLength(2);

      const visionClusters = registry.getClustersByCapability('vision');
      expect(visionClusters).toHaveLength(1);
    });
  });

  describe('Health Monitoring', () => {
    it('should update cluster health', async () => {
      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      await registry.updateHealth(cluster.id, 'healthy', 50);

      const updated = registry.getCluster(cluster.id)!;
      expect(updated.health.status).toBe('healthy');
      expect(updated.health.latencyMs).toBe(50);
    });

    it('should emit health change events', async () => {
      const healthChangedListener = jest.fn();
      registry.on('cluster:health_changed', healthChangedListener);

      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      await registry.updateHealth(cluster.id, 'healthy', 50);

      expect(healthChangedListener).toHaveBeenCalled();
    });

    it('should track unhealthy status', async () => {
      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      await registry.updateHealth(cluster.id, 'unhealthy', 5000, 'Connection timeout');

      const updated = registry.getCluster(cluster.id)!;
      expect(updated.health.status).toBe('unhealthy');
      expect(updated.health.message).toBe('Connection timeout');
      expect(updated.isAcceptingTraffic).toBe(false);
    });
  });

  describe('Load Reporting', () => {
    it('should update cluster load', async () => {
      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      registry.updateLoad(cluster.id, {
        currentAgents: 25,
        queueDepth: 100,
      });

      const updated = registry.getCluster(cluster.id)!;
      expect(updated.currentAgents).toBe(25);
      expect(updated.availableSlots).toBe(25);
      expect(updated.load.queueDepth).toBe(100);
      expect(updated.load.utilizationPercent).toBe(50);
    });

    it('should update cluster metrics', async () => {
      const cluster = await registry.registerCluster({
        endpoint: 'http://localhost:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      registry.updateMetrics(cluster.id, {
        cpuPercent: 75,
        memoryPercent: 60,
        tasksPerSecond: 10.5,
      });

      const updated = registry.getCluster(cluster.id)!;
      expect(updated.metrics.cpuPercent).toBe(75);
      expect(updated.metrics.memoryPercent).toBe(60);
      expect(updated.metrics.tasksPerSecond).toBe(10.5);
    });
  });

  describe('Federation Status', () => {
    beforeEach(async () => {
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const c2 = await registry.registerCluster({
        endpoint: 'http://cluster2:8080',
        region: 'eu-west-1',
        zone: 'a',
        maxAgents: 30,
      });

      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 60);
    });

    it('should return federation status', () => {
      const status = registry.getFederationStatus();

      expect(status.totalClusters).toBe(2);
      expect(status.healthyClusters).toBe(2);
      expect(status.totalCapacity).toBe(80);
      expect(status.regions).toHaveLength(2);
    });
  });

  describe('Load Balancing Selection', () => {
    beforeEach(async () => {
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 100,
      });

      const c2 = await registry.registerCluster({
        endpoint: 'http://cluster2:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 100,
      });

      // c1 is more loaded
      registry.updateLoad(c1.id, { currentAgents: 80 });
      registry.updateLoad(c2.id, { currentAgents: 40 });

      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 50);
    });

    it('should select least loaded cluster for migration', () => {
      const c1 = registry.getAllClusters()[0];
      const target = registry.selectClusterForMigration(c1.id);

      expect(target).toBeDefined();
      expect(target!.id).not.toBe(c1.id);
    });

    it('should select round-robin', () => {
      const c1 = registry.selectClusterRoundRobin();
      const c2 = registry.selectClusterRoundRobin();

      // With 2 clusters, should alternate
      expect(c1).toBeDefined();
      expect(c2).toBeDefined();
    });
  });
});
