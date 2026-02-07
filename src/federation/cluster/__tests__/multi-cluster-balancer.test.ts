/**
 * Multi-Cluster Load Balancer Tests
 */

import { MultiClusterLoadBalancer, DEFAULT_LOAD_BALANCER_CONFIG } from '../multi-cluster-balancer';
import { ClusterRegistry } from '../cluster-registry';
import { LocalRuntime, SpawnConfig } from '../types';

// Mock local runtime
const mockLocalRuntime: LocalRuntime = {
  spawn: jest.fn(),
  kill: jest.fn(),
  exec: jest.fn(),
  list: jest.fn(),
  getCapacity: jest.fn(),
};

describe('MultiClusterLoadBalancer', () => {
  let registry: ClusterRegistry;
  let balancer: MultiClusterLoadBalancer;

  beforeEach(() => {
    registry = new ClusterRegistry();
    balancer = new MultiClusterLoadBalancer(registry, mockLocalRuntime, {
      localCapacityThreshold: 0.8,
      preferLocal: true,
      enableMigration: true,
      migrationCooldownMs: 60000,
    });

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    balancer.dispose();
    registry.dispose();
  });

  describe('agent spawning', () => {
    beforeEach(() => {
      // Register a remote cluster
      registry.register({
        id: 'remote-cluster',
        name: 'Remote Cluster',
        endpoint: 'remote.example.com:443',
        region: 'us-east-1',
        status: 'active',
        capabilities: {
          maxAgents: 100,
          availableAgents: 80,
          activeAgents: 20,
          gpuEnabled: false,
          gpuTypes: [],
          costPerHour: 1.0,
          latency: 50,
          flags: {},
        },
        metadata: {
          version: '1.0.0',
          provider: 'aws',
          environment: 'production',
          tags: [],
        },
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
      });
    });

    it('should spawn locally when capacity available', async () => {
      // Mock local capacity as available
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      (mockLocalRuntime.spawn as jest.Mock).mockResolvedValue({
        id: 'agent-1',
        status: 'running',
        model: 'claude',
        startedAt: Date.now(),
        labels: {},
      });

      const config: SpawnConfig = {
        model: 'claude',
        labels: { task: 'test' },
        timeout: 300,
      };

      const agent = await balancer.spawnAgent(config);

      expect(mockLocalRuntime.spawn).toHaveBeenCalledWith(config);
      expect(agent.id).toBe('agent-1');
    });

    it('should select GPU cluster for GPU workloads', async () => {
      // Register GPU cluster
      registry.register({
        id: 'gpu-cluster',
        name: 'GPU Cluster',
        endpoint: 'gpu.example.com:443',
        region: 'us-east-1',
        status: 'active',
        capabilities: {
          maxAgents: 50,
          availableAgents: 40,
          activeAgents: 10,
          gpuEnabled: true,
          gpuTypes: ['nvidia-a100'],
          costPerHour: 3.0,
          latency: 60,
          flags: {},
        },
        metadata: {
          version: '1.0.0',
          provider: 'aws',
          environment: 'production',
          tags: [],
        },
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
      });

      // Mock local runtime to indicate full
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 0,
        load: 1.0,
      });

      const selection = await balancer.selectCluster({
        model: 'gpt-4',
        labels: {},
        timeout: 300,
        requiresGpu: true,
        gpuType: 'nvidia-a100',
      });

      expect(selection.isLocal).toBe(false);
      expect(selection.cluster!.capabilities.gpuEnabled).toBe(true);
    });
  });

  describe('cluster selection', () => {
    beforeEach(() => {
      registry.register({
        id: 'low-latency',
        name: 'Low Latency',
        endpoint: 'near.example.com:443',
        region: 'us-east-1',
        status: 'active',
        capabilities: {
          maxAgents: 10,
          availableAgents: 5,
          activeAgents: 5,
          gpuEnabled: false,
          gpuTypes: [],
          costPerHour: 2.0,
          latency: 20,
          flags: {},
        },
        metadata: {
          version: '1.0.0',
          provider: 'aws',
          environment: 'production',
          tags: [],
        },
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
      });

      registry.register({
        id: 'low-cost',
        name: 'Low Cost',
        endpoint: 'cheap.example.com:443',
        region: 'us-west-2',
        status: 'active',
        capabilities: {
          maxAgents: 10,
          availableAgents: 5,
          activeAgents: 5,
          gpuEnabled: false,
          gpuTypes: [],
          costPerHour: 0.5,
          latency: 80,
          flags: {},
        },
        metadata: {
          version: '1.0.0',
          provider: 'aws',
          environment: 'production',
          tags: [],
        },
        lastHeartbeat: Date.now(),
        registeredAt: Date.now(),
      });
    });

    it('should select local when capacity available', async () => {
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      const selection = await balancer.selectCluster({
        model: 'claude',
        labels: {},
        timeout: 300,
      });

      expect(selection.isLocal).toBe(true);
    });

    it('should offload to remote when local is busy', async () => {
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 0,
        load: 1.0,
      });

      const selection = await balancer.selectCluster({
        model: 'claude',
        labels: {},
        timeout: 300,
      });

      expect(selection.isLocal).toBe(false);
      expect(selection.cluster).toBeDefined();
    });
  });

  describe('statistics', () => {
    it('should return zero stats initially', () => {
      const stats = balancer.getStats();

      expect(stats.totalAgents).toBe(0);
      expect(stats.localAgents).toBe(0);
      expect(stats.remoteAgents).toBe(0);
      expect(stats.migrationsTotal).toBe(0);
    });

    it('should track agent locations', async () => {
      // Mock local spawn
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      (mockLocalRuntime.spawn as jest.Mock).mockResolvedValue({
        id: 'local-agent',
        status: 'running',
        model: 'claude',
        startedAt: Date.now(),
        labels: {},
      });

      (mockLocalRuntime.list as jest.Mock).mockResolvedValue([
        {
          id: 'local-agent',
          status: 'running',
          model: 'claude',
          startedAt: Date.now(),
          labels: {},
        },
      ]);

      // Spawn a local agent
      await balancer.spawnAgent({
        model: 'claude',
        labels: {},
        timeout: 300,
      });

      const stats = balancer.getStats();
      expect(stats.totalAgents).toBe(1);
    });
  });

  describe('events', () => {
    it('should emit agent:spawned event', (done) => {
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      (mockLocalRuntime.spawn as jest.Mock).mockResolvedValue({
        id: 'agent-1',
        status: 'running',
        model: 'claude',
        startedAt: Date.now(),
        labels: {},
      });

      balancer.on('agent:spawned', ({ agentId }) => {
        expect(agentId).toBe('agent-1');
        done();
      });

      balancer.spawnAgent({
        model: 'claude',
        labels: {},
        timeout: 300,
      });
    });
  });
});
