/**
 * Transparent Cluster Proxy Tests
 */

import { TransparentClusterProxy } from '../transparent-proxy';
import { ClusterRegistry } from '../cluster-registry';
import { MultiClusterLoadBalancer } from '../multi-cluster-balancer';
import { LocalRuntime, SpawnConfig, Agent } from '../types';

// Mock local runtime
const mockLocalRuntime: LocalRuntime = {
  spawn: jest.fn(),
  kill: jest.fn(),
  exec: jest.fn(),
  list: jest.fn(),
  getCapacity: jest.fn(),
};

describe('TransparentClusterProxy', () => {
  let registry: ClusterRegistry;
  let balancer: MultiClusterLoadBalancer;
  let proxy: TransparentClusterProxy;

  beforeEach(() => {
    registry = new ClusterRegistry();
    balancer = new MultiClusterLoadBalancer(registry, mockLocalRuntime);
    proxy = new TransparentClusterProxy(registry, balancer, mockLocalRuntime);

    jest.clearAllMocks();
  });

  afterEach(() => {
    proxy.dispose();
    balancer.dispose();
    registry.dispose();
  });

  describe('agent spawning', () => {
    it('should spawn agent through balancer', async () => {
      const mockAgent: Agent = {
        id: 'agent-1',
        clusterId: null,
        status: 'running',
        model: 'claude',
        startedAt: Date.now(),
        labels: {},
      };

      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      (mockLocalRuntime.spawn as jest.Mock).mockResolvedValue(mockAgent);

      const config: SpawnConfig = {
        model: 'claude',
        labels: { task: 'test' },
        timeout: 300,
      };

      const agent = await proxy.spawn(config);

      expect(agent.id).toBe('agent-1');
    });

    it('should emit agent:spawned event', async () => {
      const mockAgent: Agent = {
        id: 'agent-1',
        clusterId: null,
        status: 'running',
        model: 'claude',
        startedAt: Date.now(),
        labels: {},
      };

      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      (mockLocalRuntime.spawn as jest.Mock).mockResolvedValue(mockAgent);

      const eventPromise = new Promise<void>((resolve) => {
        proxy.once('agent:spawned', ({ agentId }) => {
          expect(agentId).toBe('agent-1');
          resolve();
        });
      });

      await proxy.spawn({
        model: 'claude',
        labels: {},
        timeout: 300,
      });

      await eventPromise;
    });
  });

  describe('agent execution', () => {
    beforeEach(() => {
      // Mock local capacity and spawn
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

      (mockLocalRuntime.exec as jest.Mock).mockResolvedValue({
        output: 'Command executed',
        exitCode: 0,
      });
    });

    it('should execute command on local agent', async () => {
      // Spawn an agent first
      await proxy.spawn({
        model: 'claude',
        labels: {},
        timeout: 300,
      });

      const result = await proxy.exec('local-agent', 'test command');

      expect(mockLocalRuntime.exec).toHaveBeenCalledWith('local-agent', 'test command');
      expect(result.output).toBe('Command executed');
      expect(result.exitCode).toBe(0);
    });

    it('should throw when agent not found', async () => {
      await expect(proxy.exec('non-existent', 'test')).rejects.toThrow('non-existent not found');
    });
  });

  describe('agent listing', () => {
    beforeEach(() => {
      (mockLocalRuntime.list as jest.Mock).mockResolvedValue([
        {
          id: 'local-agent-1',
          status: 'running',
          model: 'claude',
          startedAt: Date.now(),
          labels: { task: 'coding' },
        },
        {
          id: 'local-agent-2',
          status: 'running',
          model: 'gpt-4',
          startedAt: Date.now(),
          labels: { task: 'analysis' },
        },
      ]);
    });

    it('should list all agents', async () => {
      const agents = await proxy.list();

      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('local-agent-1');
      expect(agents[1].id).toBe('local-agent-2');
    });

    it('should filter agents by status', async () => {
      const agents = await proxy.list({ status: 'running' });

      expect(agents).toHaveLength(2);
      expect(agents.every(a => a.status === 'running')).toBe(true);
    });

    it('should filter agents by labels', async () => {
      const agents = await proxy.list({ labels: { task: 'coding' } });

      expect(agents).toHaveLength(1);
      expect(agents[0].id).toBe('local-agent-1');
    });

    it('should include cluster info when showCluster is true', async () => {
      const agents = await proxy.list({ showCluster: true });

      expect(agents[0].isLocal).toBe(true);
      expect(agents[0].clusterName).toBe('local');
    });
  });

  describe('agent killing', () => {
    beforeEach(() => {
      (mockLocalRuntime.getCapacity as jest.Mock).mockResolvedValue({
        max: 10,
        available: 5,
        load: 0.5,
      });

      (mockLocalRuntime.spawn as jest.Mock).mockResolvedValue({
        id: 'agent-to-kill',
        status: 'running',
        model: 'claude',
        startedAt: Date.now(),
        labels: {},
      });

      (mockLocalRuntime.kill as jest.Mock).mockResolvedValue(undefined);
    });

    it('should kill local agent', async () => {
      // Spawn agent first
      await proxy.spawn({
        model: 'claude',
        labels: {},
        timeout: 300,
      });

      await proxy.kill('agent-to-kill');

      expect(mockLocalRuntime.kill).toHaveBeenCalledWith('agent-to-kill');
    });

    it('should emit agent:killed event', async () => {
      const eventPromise = new Promise<void>((resolve) => {
        proxy.once('agent:killed', ({ agentId }) => {
          expect(agentId).toBe('agent-to-kill');
          resolve();
        });
      });

      // Spawn and kill agent
      await proxy.spawn({ model: 'claude', labels: {}, timeout: 300 });
      await proxy.kill('agent-to-kill');
      
      await eventPromise;
    });
  });

  describe('statistics', () => {
    it('should return zero stats initially', () => {
      const stats = proxy.getStats();

      expect(stats.trackedLocalAgents).toBe(0);
      expect(stats.trackedRemoteAgents).toBe(0);
      expect(stats.totalTracked).toBe(0);
      expect(stats.registeredClusters).toBe(0);
    });
  });
});
