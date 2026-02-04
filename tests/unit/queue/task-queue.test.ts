/**
 * Task Queue Tests
 * 
 * Tests for the Redis-backed task queue system.
 * Uses ioredis mock for unit testing.
 */

import { TaskQueue } from '../../../src/queue/task-queue';
import type { EnqueueTaskOptions, RegisterAgentOptions } from '../../../src/queue/types';

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    setex: jest.fn().mockResolvedValue('OK'),
    get: jest.fn().mockResolvedValue(null),
    del: jest.fn().mockResolvedValue(1),
    zadd: jest.fn().mockResolvedValue(1),
    zrem: jest.fn().mockResolvedValue(1),
    zrange: jest.fn().mockResolvedValue([]),
    zrangebyscore: jest.fn().mockResolvedValue([]),
    zrevrange: jest.fn().mockResolvedValue([]),
    zcard: jest.fn().mockResolvedValue(0),
    lpush: jest.fn().mockResolvedValue(1),
    rpop: jest.fn().mockResolvedValue(null),
    llen: jest.fn().mockResolvedValue(0),
    lrem: jest.fn().mockResolvedValue(1),
    lrange: jest.fn().mockResolvedValue([]),
    sadd: jest.fn().mockResolvedValue(1),
    srem: jest.fn().mockResolvedValue(1),
    smembers: jest.fn().mockResolvedValue([]),
    hset: jest.fn().mockResolvedValue(1),
    hgetall: jest.fn().mockResolvedValue({}),
    hincrby: jest.fn().mockResolvedValue(1),
    pipeline: jest.fn().mockReturnValue({
      hincrby: jest.fn().mockReturnThis(),
      lpush: jest.fn().mockReturnThis(),
      ltrim: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
    xadd: jest.fn().mockResolvedValue('id'),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn(),
  }));
});

describe('TaskQueue', () => {
  let queue: TaskQueue;
  const mockRedisConfig = {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'test:queue',
  };

  beforeEach(() => {
    queue = new TaskQueue({
      redis: mockRedisConfig,
      maxRetries: 3,
      baseRetryDelayMs: 1000,
    });
  });

  afterEach(async () => {
    await queue.stop();
    jest.clearAllMocks();
  });

  describe('Lifecycle', () => {
    it('should start and stop without errors', async () => {
      await expect(queue.start()).resolves.not.toThrow();
      await expect(queue.stop()).resolves.not.toThrow();
    });

    it('should not start twice', async () => {
      await queue.start();
      await expect(queue.start()).resolves.not.toThrow(); // Should be idempotent
    });
  });

  describe('Task Enqueueing', () => {
    it('should enqueue a task with default priority', async () => {
      const task = await queue.enqueue({
        type: 'test-task',
        payload: { data: 'test' },
      });

      expect(task.id).toBeDefined();
      expect(task.type).toBe('test-task');
      expect(task.priority).toBe('medium');
      expect(task.status).toBe('pending');
    });

    it('should enqueue a task with specified priority', async () => {
      const task = await queue.enqueue({
        type: 'critical-task',
        payload: { data: 'test' },
        priority: 'critical',
      });

      expect(task.priority).toBe('critical');
    });

    it('should schedule a task for delayed execution', async () => {
      const futureDate = new Date(Date.now() + 60000);
      const task = await queue.enqueue({
        type: 'delayed-task',
        payload: { data: 'test' },
        scheduledFor: futureDate,
      });

      expect(task.status).toBe('scheduled');
      expect(task.scheduledFor).toEqual(futureDate);
    });

    it('should schedule a task with delayMs', async () => {
      const task = await queue.enqueue({
        type: 'delayed-task',
        payload: { data: 'test' },
        delayMs: 5000,
      });

      expect(task.status).toBe('scheduled');
    });

    it('should allow custom task ID', async () => {
      const customId = 'my-custom-task-id';
      const task = await queue.enqueue({
        id: customId,
        type: 'test-task',
        payload: {},
      });

      expect(task.id).toBe(customId);
    });
  });

  describe('Agent Registration', () => {
    it('should register an agent', async () => {
      const agent = await queue.registerAgent({
        id: 'agent-1',
        skills: ['typescript', 'testing'],
        capacity: 5,
      });

      expect(agent.id).toBe('agent-1');
      expect(agent.skills).toEqual(['typescript', 'testing']);
      expect(agent.capacity).toBe(5);
      expect(agent.currentLoad).toBe(0);
    });

    it('should use default capacity of 1', async () => {
      const agent = await queue.registerAgent({
        id: 'agent-1',
      });

      expect(agent.capacity).toBe(1);
    });

    it('should get all registered agents', async () => {
      // Mock Redis responses for agent retrieval
      const mockRedis = (queue as any).redis;
      mockRedis.smembers.mockResolvedValueOnce(['agent-1', 'agent-2']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify({
          id: 'agent-1',
          skills: [],
          capacity: 1,
          currentLoad: 0,
          status: 'idle',
          lastHeartbeat: new Date().toISOString(),
        }))
        .mockResolvedValueOnce(JSON.stringify({
          id: 'agent-2',
          skills: [],
          capacity: 1,
          currentLoad: 0,
          status: 'idle',
          lastHeartbeat: new Date().toISOString(),
        }));

      const agents = await queue.getAllAgents();

      expect(agents).toHaveLength(2);
      expect(agents[0].id).toBe('agent-1');
      expect(agents[1].id).toBe('agent-2');
    });

    it('should unregister an agent', async () => {
      const mockRedis = (queue as any).redis;
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: 'agent-1',
        skills: [],
        capacity: 1,
        currentLoad: 0,
        status: 'idle',
        lastHeartbeat: new Date().toISOString(),
      }));
      mockRedis.zrange.mockResolvedValueOnce([]);

      await expect(queue.unregisterAgent('agent-1')).resolves.not.toThrow();
    });
  });

  describe('Task Dequeue', () => {
    it('should throw error for non-existent agent', async () => {
      await expect(queue.dequeue('non-existent-agent')).rejects.toThrow('not found');
    });

    it('should return null when no tasks available', async () => {
      // Register agent
      const mockRedis = (queue as any).redis;
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: 'agent-1',
        skills: [],
        capacity: 5,
        currentLoad: 0,
        status: 'idle',
        lastHeartbeat: new Date().toISOString(),
      }));

      const task = await queue.dequeue('agent-1');
      expect(task).toBeNull();
    });
  });

  describe('Task Completion', () => {
    it('should throw error for non-existent task', async () => {
      await expect(queue.completeTask('non-existent-task')).rejects.toThrow('not found');
    });
  });

  describe('Task Cancellation', () => {
    it('should throw error for non-existent task', async () => {
      await expect(queue.cancelTask('non-existent-task')).rejects.toThrow('not found');
    });

    it('should throw error for completed task', async () => {
      const mockRedis = (queue as any).redis;
      mockRedis.get.mockResolvedValueOnce(JSON.stringify({
        id: 'task-1',
        type: 'test',
        payload: {},
        priority: 'medium',
        status: 'completed',
        retryCount: 0,
        maxRetries: 3,
        retryDelayMs: 1000,
        progress: 100,
        createdAt: new Date().toISOString(),
        metadata: {},
      }));

      await expect(queue.cancelTask('task-1')).rejects.toThrow('Cannot cancel');
    });
  });

  describe('Progress Tracking', () => {
    it('should throw error for non-existent task', async () => {
      await expect(queue.updateProgress('non-existent-task', 50)).rejects.toThrow('not found');
    });
  });

  describe('Event Handling', () => {
    it('should subscribe to events', () => {
      const handler = jest.fn();
      const subscriptionId = queue.onEvent(handler);

      expect(subscriptionId).toBeDefined();
      expect(typeof subscriptionId).toBe('string');
    });

    it('should unsubscribe from events', () => {
      const handler = jest.fn();
      const subscriptionId = queue.onEvent(handler);
      
      const result = queue.offEvent(subscriptionId);
      expect(result).toBe(true);
    });

    it('should return false when unsubscribing non-existent handler', () => {
      const result = queue.offEvent('non-existent-id');
      expect(result).toBe(false);
    });
  });
});
