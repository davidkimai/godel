/**
 * Scheduler Tests
 * 
 * Comprehensive test suite for the scheduling system.
 */

import { Scheduler } from './scheduler';
import { ResourceTracker } from './resource-tracker';
import { AffinityEngine } from './affinity-engine';
import { PreemptionSystem } from './preemption-system';
import {
  SchedulingRequest,
  PriorityClass,
  NodeCapacity,
  AgentAffinity,
} from './types';
import { createAgent, Agent } from '../models/agent';

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    get: jest.fn(),
    setex: jest.fn(),
    del: jest.fn(),
    keys: jest.fn().mockResolvedValue([]),
    hgetall: jest.fn().mockResolvedValue({}),
    hset: jest.fn(),
    hincrbyfloat: jest.fn(),
    hincrby: jest.fn(),
    pipeline: jest.fn().mockReturnValue({
      hincrbyfloat: jest.fn().mockReturnThis(),
      hincrby: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
    expire: jest.fn(),
    quit: jest.fn(),
  }));
});

describe('Scheduler', () => {
  let scheduler: Scheduler;
  let resourceTracker: ResourceTracker;

  beforeEach(async () => {
    resourceTracker = new ResourceTracker({
      redisUrl: 'redis://localhost:6379/0',
    });

    scheduler = new Scheduler({
      resourceTracker,
      policy: {
        binPackingStrategy: 'bestFit',
        enablePreemption: true,
        defaultPriorityClass: PriorityClass.NORMAL,
      },
    });

    await scheduler.initialize();
  });

  afterEach(async () => {
    await scheduler.shutdown();
    jest.clearAllMocks();
  });

  describe('Node Management', () => {
    it('should register a node', async () => {
      const nodeCapacity: NodeCapacity = {
        nodeId: 'node-1',
        labels: { zone: 'us-east-1a' },
        cpu: 8,
        memory: 32768,
      };

      const registerSpy = jest.spyOn(resourceTracker, 'registerNode');
      await scheduler.registerNode(nodeCapacity);

      expect(registerSpy).toHaveBeenCalledWith(nodeCapacity);
    });

    it('should unregister a node', async () => {
      const removeSpy = jest.spyOn(resourceTracker, 'removeNode');
      await scheduler.unregisterNode('node-1');

      expect(removeSpy).toHaveBeenCalledWith('node-1');
    });
  });

  describe('Resource-Aware Scheduling', () => {
    beforeEach(async () => {
      // Register test nodes
      await scheduler.registerNode({
        nodeId: 'node-1',
        labels: { zone: 'us-east-1a', type: 'compute' },
        cpu: 4,
        memory: 16384,
      });

      await scheduler.registerNode({
        nodeId: 'node-2',
        labels: { zone: 'us-east-1b', type: 'compute' },
        cpu: 8,
        memory: 32768,
      });
    });

    it('should schedule agent on node with available resources', async () => {
      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      const request: SchedulingRequest = {
        agent,
        resources: { cpu: 1, memory: 4096 },
      };

      // Mock hasAvailableResources to return true
      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(true);
      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      const result = await scheduler.schedule(request);

      expect(result.success).toBe(true);
      expect(result.nodeId).toBeDefined();
      expect(result.agentId).toBe(agent.id);
    });

    it('should fail scheduling when no nodes have resources', async () => {
      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      const request: SchedulingRequest = {
        agent,
        resources: { cpu: 100, memory: 1000000 }, // Too much
      };

      // Mock hasAvailableResources to return false
      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(false);

      const result = await scheduler.schedule(request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Insufficient resources');
    });

    it('should respect resource limits per node', async () => {
      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      // Request exactly at limit
      const request: SchedulingRequest = {
        agent,
        resources: { cpu: 4, memory: 16384 },
      };

      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(true);
      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      const result = await scheduler.schedule(request);

      expect(result.success).toBe(true);
    });
  });

  describe('Affinity Rules', () => {
    beforeEach(async () => {
      await scheduler.registerNode({
        nodeId: 'node-1',
        labels: { zone: 'us-east-1a', type: 'compute' },
        cpu: 8,
        memory: 32768,
      });

      await scheduler.registerNode({
        nodeId: 'node-2',
        labels: { zone: 'us-east-1b', type: 'gpu' },
        cpu: 8,
        memory: 32768,
      });
    });

    it('should respect hard node affinity constraints', async () => {
      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      // Add labels to agent metadata
      agent.metadata.labels = { app: 'test' };

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'hard',
          nodeSelector: {
            matchLabels: { zone: 'us-east-1a' },
          },
        }],
      };

      const request: SchedulingRequest = {
        agent,
        resources: { cpu: 1, memory: 4096 },
        affinity,
      };

      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(true);
      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      const result = await scheduler.schedule(request);

      expect(result.success).toBe(true);
    });

    it('should prefer nodes matching soft affinity', async () => {
      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      agent.metadata.labels = { app: 'test' };

      const affinity: AgentAffinity = {
        nodeAffinity: [{
          type: 'affinity',
          weight: 'soft',
          weightValue: 50,
          nodeSelector: {
            matchLabels: { type: 'gpu' },
          },
        }],
      };

      const request: SchedulingRequest = {
        agent,
        resources: { cpu: 1, memory: 4096 },
        affinity,
      };

      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(true);
      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      const result = await scheduler.schedule(request);

      expect(result.success).toBe(true);
      expect(result.affinityScore).toBeGreaterThan(0);
    });
  });

  describe('Preemption', () => {
    beforeEach(async () => {
      await scheduler.registerNode({
        nodeId: 'node-1',
        labels: {},
        cpu: 4,
        memory: 16384,
      });
    });

    it('should preempt lower priority agents when needed', async () => {
      const lowPriorityAgent = createAgent({
        model: 'test-model',
        task: 'low priority task',
      });

      const highPriorityAgent = createAgent({
        model: 'test-model',
        task: 'high priority task',
      });

      // First schedule low priority agent
      jest.spyOn(resourceTracker, 'hasAvailableResources')
        .mockResolvedValueOnce(true)  // First call succeeds
        .mockResolvedValueOnce(false) // Second call fails (no resources)
        .mockResolvedValueOnce(true); // Third call succeeds (after preemption)

      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      await scheduler.schedule({
        agent: lowPriorityAgent,
        resources: { cpu: 3, memory: 12000 },
        priority: {
          priorityClass: PriorityClass.LOW,
          preemptionPolicy: 'PreemptLowerPriority',
        },
      });

      // Now try to schedule high priority agent
      const result = await scheduler.schedule({
        agent: highPriorityAgent,
        resources: { cpu: 3, memory: 12000 },
        priority: {
          priorityClass: PriorityClass.HIGH,
          preemptionPolicy: 'PreemptLowerPriority',
        },
      });

      expect(result.success).toBe(true);
    });

    it('should not preempt agents with Never preemption policy', async () => {
      const protectedAgent = createAgent({
        model: 'test-model',
        task: 'protected task',
      });

      const preemptorAgent = createAgent({
        model: 'test-model',
        task: 'preemptor task',
      });

      jest.spyOn(resourceTracker, 'hasAvailableResources')
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      await scheduler.schedule({
        agent: protectedAgent,
        resources: { cpu: 3, memory: 12000 },
        priority: {
          priorityClass: PriorityClass.LOW,
          preemptionPolicy: 'Never',
        },
      });

      const result = await scheduler.schedule({
        agent: preemptorAgent,
        resources: { cpu: 3, memory: 12000 },
        priority: {
          priorityClass: PriorityClass.HIGH,
          preemptionPolicy: 'PreemptLowerPriority',
        },
      });

      // Should fail because protected agent cannot be preempted
      expect(result.success).toBe(false);
    });
  });

  describe('Metrics', () => {
    it('should track scheduling metrics', async () => {
      await scheduler.registerNode({
        nodeId: 'node-1',
        labels: {},
        cpu: 8,
        memory: 32768,
      });

      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(true);
      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      await scheduler.schedule({
        agent,
        resources: { cpu: 1, memory: 4096 },
      });

      const metrics = scheduler.getMetrics();

      expect(metrics.schedulingAttempts).toBe(1);
      expect(metrics.schedulingSuccesses).toBe(1);
      expect(metrics.averageLatencyMs).toBeGreaterThanOrEqual(0);
    });

    it('should reset metrics', () => {
      scheduler.resetMetrics();

      const metrics = scheduler.getMetrics();

      expect(metrics.schedulingAttempts).toBe(0);
      expect(metrics.schedulingSuccesses).toBe(0);
    });
  });

  describe('Scheduling History', () => {
    it('should store scheduling history', async () => {
      await scheduler.registerNode({
        nodeId: 'node-1',
        labels: {},
        cpu: 8,
        memory: 32768,
      });

      const agent = createAgent({
        model: 'test-model',
        task: 'test task',
      });

      jest.spyOn(resourceTracker, 'hasAvailableResources').mockResolvedValue(true);
      jest.spyOn(resourceTracker, 'allocateResources').mockResolvedValue(true);

      await scheduler.schedule({
        agent,
        resources: { cpu: 1, memory: 4096 },
      });

      const history = scheduler.getHistory();

      expect(history.length).toBe(1);
      expect(history[0].agentId).toBe(agent.id);
    });

    it('should clear history', () => {
      scheduler.clearHistory();

      const history = scheduler.getHistory();

      expect(history.length).toBe(0);
    });
  });
});
