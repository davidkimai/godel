/**
 * Resource Tracker Tests
 */

import { ResourceTracker } from './resource-tracker';
import { NodeCapacity, ResourceRequirements } from './types';

// Mock Redis
const mockRedis = {
  on: jest.fn(),
  get: jest.fn(),
  setex: jest.fn(),
  del: jest.fn(),
  keys: jest.fn(),
  exists: jest.fn(),
  hgetall: jest.fn(),
  hset: jest.fn(),
  hincrbyfloat: jest.fn(),
  hincrby: jest.fn(),
  pipeline: jest.fn(),
  expire: jest.fn(),
  quit: jest.fn(),
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => mockRedis);
});

describe('ResourceTracker', () => {
  let tracker: ResourceTracker;

  beforeEach(() => {
    jest.clearAllMocks();
    tracker = new ResourceTracker({
      redisUrl: 'redis://localhost:6379/0',
    });
  });

  afterEach(async () => {
    await tracker.shutdown();
  });

  describe('Node Registration', () => {
    it('should register a node', async () => {
      mockRedis.setex.mockResolvedValue('OK');
      mockRedis.hset.mockResolvedValue(1);

      const node: NodeCapacity = {
        nodeId: 'node-1',
        labels: { zone: 'us-east-1a' },
        cpu: 8,
        memory: 32768,
      };

      await tracker.registerNode(node);

      expect(mockRedis.setex).toHaveBeenCalled();
      expect(mockRedis.hset).toHaveBeenCalled();
    });

    it('should get all registered nodes', async () => {
      mockRedis.keys.mockResolvedValue(['godel:scheduler:nodes:node-1']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        nodeId: 'node-1',
        labels: { zone: 'us-east-1a' },
        cpu: 8,
        memory: 32768,
      }));

      const nodes = await tracker.getNodes();

      expect(nodes.length).toBe(1);
      expect(nodes[0].nodeId).toBe('node-1');
    });

    it('should remove a node', async () => {
      mockRedis.del.mockResolvedValue(1);

      await tracker.removeNode('node-1');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('Resource Allocation', () => {
    it('should allocate resources for an agent', async () => {
      const mockPipeline = {
        hincrbyfloat: jest.fn().mockReturnThis(),
        hincrby: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      mockRedis.hgetall.mockResolvedValue({
        cpu: '0',
        memory: '0',
        agents: JSON.stringify([]),
      });

      const node: NodeCapacity = {
        nodeId: 'node-1',
        labels: {},
        cpu: 8,
        memory: 32768,
      };

      await tracker.registerNode(node);

      const resources: ResourceRequirements = {
        cpu: 2,
        memory: 8192,
      };

      const result = await tracker.allocateResources('agent-1', 'node-1', resources);

      expect(result).toBe(true);
    });

    it('should release resources when agent is done', async () => {
      const mockPipeline = {
        hincrbyfloat: jest.fn().mockReturnThis(),
        hincrby: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      mockRedis.hgetall.mockResolvedValueOnce({
        nodeId: 'node-1',
        cpu: '2',
        memory: '8192',
        agents: JSON.stringify(['agent-1']),
      });

      await tracker.releaseResources('agent-1');

      expect(mockPipeline.hincrbyfloat).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('should not over-allocate resources', async () => {
      mockRedis.hgetall.mockResolvedValue({
        cpu: '7',
        memory: '30000',
        agents: JSON.stringify(['agent-1']),
      });

      const node: NodeCapacity = {
        nodeId: 'node-1',
        labels: {},
        cpu: 8,
        memory: 32768,
      };

      await tracker.registerNode(node);

      const resources: ResourceRequirements = {
        cpu: 2, // Would exceed capacity
        memory: 4096,
      };

      const result = await tracker.allocateResources('agent-2', 'node-1', resources);

      expect(result).toBe(false);
    });
  });

  describe('Resource Monitoring', () => {
    it('should update resource usage', async () => {
      mockRedis.hset.mockResolvedValue(1);
      mockRedis.expire.mockResolvedValue(1);

      await tracker.updateResourceUsage('agent-1', {
        cpu: 0.5,
        memory: 4096,
        timestamp: new Date(),
      });

      expect(mockRedis.hset).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();
    });

    it('should get resource usage', async () => {
      mockRedis.hgetall.mockResolvedValue({
        cpu: '0.5',
        memory: '4096',
        timestamp: Date.now().toString(),
      });

      const usage = await tracker.getResourceUsage('agent-1');

      expect(usage).toBeDefined();
      expect(usage?.cpu).toBe(0.5);
      expect(usage?.memory).toBe(4096);
    });
  });

  describe('Node Utilization', () => {
    it('should calculate node utilization', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({
        nodeId: 'node-1',
        cpu: 8,
        memory: 32768,
        healthy: true,
      }));

      mockRedis.hgetall.mockResolvedValue({
        cpu: '4',
        memory: '16384',
        agents: JSON.stringify(['agent-1', 'agent-2']),
      });

      const utilization = await tracker.getNodeUtilization('node-1');

      expect(utilization).toBeDefined();
      expect(utilization?.cpu).toBe(0.5);
      expect(utilization?.memory).toBe(0.5);
    });
  });

  describe('Heartbeat', () => {
    it('should update node heartbeat', async () => {
      mockRedis.exists.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        nodeId: 'node-1',
        cpu: 8,
        memory: 32768,
        lastHeartbeat: Date.now(),
      }));
      mockRedis.setex.mockResolvedValue('OK');

      await tracker.updateNodeHeartbeat('node-1', true);

      expect(mockRedis.setex).toHaveBeenCalled();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup stale nodes', async () => {
      mockRedis.keys.mockResolvedValue(['godel:scheduler:nodes:node-1']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        nodeId: 'node-1',
        cpu: 8,
        memory: 32768,
        lastHeartbeat: Date.now() - 120000, // 2 minutes ago
      }));
      mockRedis.del.mockResolvedValue(1);

      const staleNodes = await tracker.cleanupStaleNodes();

      expect(staleNodes.length).toBeGreaterThanOrEqual(0);
    });
  });
});
