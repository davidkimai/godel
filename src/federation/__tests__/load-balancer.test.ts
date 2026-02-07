/**
 * Multi-Cluster Load Balancer Tests
 */

import { MultiClusterLoadBalancer, DEFAULT_LB_CONFIG } from '../load-balancer';
import { ClusterRegistry } from '../cluster-registry';

describe('MultiClusterLoadBalancer', () => {
  let registry: ClusterRegistry;
  let loadBalancer: MultiClusterLoadBalancer;

  beforeEach(async () => {
    registry = new ClusterRegistry();
    await registry.initialize();

    loadBalancer = new MultiClusterLoadBalancer(registry, DEFAULT_LB_CONFIG);
    await loadBalancer.initialize();
  });

  afterEach(async () => {
    await loadBalancer.dispose();
    await registry.dispose();
  });

  describe('Routing', () => {
    beforeEach(async () => {
      // Register test clusters
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

      const c3 = await registry.registerCluster({
        endpoint: 'http://cluster3:8080',
        region: 'eu-west-1',
        zone: 'a',
        maxAgents: 100,
      });

      // Set different loads
      registry.updateLoad(c1.id, { currentAgents: 80, utilizationPercent: 80 });
      registry.updateLoad(c2.id, { currentAgents: 40, utilizationPercent: 40 });
      registry.updateLoad(c3.id, { currentAgents: 60, utilizationPercent: 60 });

      // Mark all healthy
      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 60);
      await registry.updateHealth(c3.id, 'healthy', 70);
    });

    it('should route using least-loaded strategy', async () => {
      const result = await loadBalancer.route({}, 'least-loaded');

      expect(result.success).toBe(true);
      expect(result.cluster).toBeDefined();
      expect(result.strategy).toBe('least-loaded');
      expect(result.cluster!.load.utilizationPercent).toBe(40); // cluster2
    });

    it('should route using round-robin strategy', async () => {
      const result1 = await loadBalancer.route({}, 'round-robin');
      const result2 = await loadBalancer.route({}, 'round-robin');

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      expect(result1.cluster!.id).not.toBe(result2.cluster!.id);
    });

    it('should route using regional strategy', async () => {
      const result = await loadBalancer.route(
        { preferredRegion: 'eu-west-1' },
        'regional'
      );

      expect(result.success).toBe(true);
      expect(result.cluster!.region).toBe('eu-west-1');
    });

    it('should fallback when regional cluster not available', async () => {
      const result = await loadBalancer.route(
        { preferredRegion: 'ap-south-1' }, // Not registered
        'regional'
      );

      expect(result.success).toBe(true);
      // Should fallback to least loaded
      expect(result.cluster!.load.utilizationPercent).toBe(40);
    });

    it('should provide alternatives', async () => {
      const result = await loadBalancer.route({}, 'least-loaded');

      expect(result.alternatives).toBeDefined();
      expect(result.alternatives.length).toBeGreaterThan(0);
      expect(result.alternatives.length).toBeLessThanOrEqual(
        DEFAULT_LB_CONFIG.maxAlternatives
      );
    });

    it('should fail when no healthy clusters', async () => {
      // Mark all unhealthy
      for (const cluster of registry.getAllClusters()) {
        await registry.updateHealth(cluster.id, 'unhealthy', 5000);
      }

      const result = await loadBalancer.route({});

      expect(result.success).toBe(false);
      expect(result.error).toContain('No healthy clusters');
    });
  });

  describe('Session Affinity', () => {
    beforeEach(async () => {
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 100,
      });

      registry.updateLoad(c1.id, { currentAgents: 50 });
      await registry.updateHealth(c1.id, 'healthy', 50);
    });

    it('should maintain session affinity', async () => {
      const sessionId = 'session-123';

      const result1 = await loadBalancer.route({ sessionId });
      expect(result1.success).toBe(true);

      const result2 = await loadBalancer.route({ sessionId });
      expect(result2.success).toBe(true);

      // Should route to same cluster
      expect(result1.cluster!.id).toBe(result2.cluster!.id);
      expect(result2.strategy).toBe('session-affinity');
    });

    it('should clear session affinity', async () => {
      const sessionId = 'session-123';

      await loadBalancer.route({ sessionId });
      loadBalancer.clearSessionAffinity(sessionId);

      const affinity = loadBalancer.getSessionAffinity(sessionId);
      expect(affinity).toBeUndefined();
    });
  });

  describe('Circuit Breaker', () => {
    beforeEach(async () => {
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 100,
      });

      registry.updateLoad(c1.id, { currentAgents: 50 });
      await registry.updateHealth(c1.id, 'healthy', 50);
    });

    it('should open circuit breaker after failures', () => {
      const cluster = registry.getAllClusters()[0];

      // Record multiple failures
      for (let i = 0; i < DEFAULT_LB_CONFIG.circuitBreakerThreshold; i++) {
        loadBalancer.recordFailure(cluster.id);
      }

      const cb = loadBalancer.getCircuitBreakerState(cluster.id) as { isOpen: boolean };
      expect(cb.isOpen).toBe(true);
    });

    it('should close circuit breaker on success', () => {
      const cluster = registry.getAllClusters()[0];

      // Open circuit
      for (let i = 0; i < DEFAULT_LB_CONFIG.circuitBreakerThreshold; i++) {
        loadBalancer.recordFailure(cluster.id);
      }

      // Record success
      loadBalancer.recordSuccess(cluster.id);

      const cb = loadBalancer.getCircuitBreakerState(cluster.id) as { isOpen: boolean };
      expect(cb.isOpen).toBe(false);
    });

    it('should route to alternatives when circuit open', async () => {
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

      registry.updateLoad(c1.id, { currentAgents: 50 });
      registry.updateLoad(c2.id, { currentAgents: 50 });
      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 50);

      // Open circuit for c1
      for (let i = 0; i < DEFAULT_LB_CONFIG.circuitBreakerThreshold; i++) {
        loadBalancer.recordFailure(c1.id);
      }

      // Should route to c2
      let routedToC2 = false;
      for (let i = 0; i < 10; i++) {
        const result = await loadBalancer.route({}, 'least-loaded');
        if (result.cluster!.id === c2.id) {
          routedToC2 = true;
          break;
        }
      }

      expect(routedToC2).toBe(true);
    });
  });

  describe('Capability Routing', () => {
    beforeEach(async () => {
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 100,
        capabilities: { gpu: true },
      });

      const c2 = await registry.registerCluster({
        endpoint: 'http://cluster2:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 100,
      });

      registry.updateLoad(c1.id, { currentAgents: 50 });
      registry.updateLoad(c2.id, { currentAgents: 50 });
      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 50);
    });

    it('should route by capability', async () => {
      const result = await loadBalancer.route(
        { requiredCapabilities: ['gpu'] },
        'capability-match'
      );

      expect(result.success).toBe(true);
      expect(result.cluster!.capabilities.gpu).toBe(true);
    });
  });

  describe('Load Rebalancing', () => {
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

      // Highly unbalanced
      registry.updateLoad(c1.id, { currentAgents: 90, utilizationPercent: 90 });
      registry.updateLoad(c2.id, { currentAgents: 20, utilizationPercent: 20 });

      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 50);
    });

    it('should generate rebalance plan', async () => {
      const plan = await loadBalancer.generateRebalancePlan();

      expect(plan.moves.length).toBeGreaterThan(0);
      expect(plan.estimatedImpact.maxUtilizationBefore).toBe(90);
      expect(plan.estimatedImpact.maxUtilizationAfter).toBeLessThan(90);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 100,
      });

      registry.updateLoad(c1.id, { currentAgents: 50 });
      await registry.updateHealth(c1.id, 'healthy', 50);
    });

    it('should track routing stats', async () => {
      await loadBalancer.route({});
      await loadBalancer.route({});
      await loadBalancer.route({});

      const stats = loadBalancer.getStats();

      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRoutes).toBe(3);
    });

    it('should track strategy distribution', async () => {
      await loadBalancer.route({}, 'least-loaded');
      await loadBalancer.route({}, 'round-robin');
      await loadBalancer.route({}, 'least-loaded');

      const stats = loadBalancer.getStats();

      expect(stats.strategyDistribution['least-loaded']).toBe(2);
      expect(stats.strategyDistribution['round-robin']).toBe(1);
    });
  });
});
