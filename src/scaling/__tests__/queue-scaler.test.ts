/**
 * Queue Scaler Tests
 */

import { QueueScaler, DEFAULT_QUEUE_SCALING_CONFIG } from '../queue-scaler';
import { TaskQueue } from '../../queue/task-queue';
import { ClusterRegistry } from '../../federation/cluster-registry';

// Mock TaskQueue
jest.mock('../../queue/task-queue');

describe('QueueScaler', () => {
  let mockTaskQueue: jest.Mocked<TaskQueue>;
  let scaler: QueueScaler;

  beforeEach(() => {
    mockTaskQueue = {
      getQueueDepth: jest.fn(),
      getMetrics: jest.fn(),
      onEvent: jest.fn(),
    } as unknown as jest.Mocked<TaskQueue>;

    mockTaskQueue.getQueueDepth.mockResolvedValue(0);
    mockTaskQueue.getMetrics.mockResolvedValue({
      tasksEnqueued: 0,
      tasksCompleted: 0,
      uptimeMinutes: 1,
      avgWaitTimeMs: 0,
    });
  });

  afterEach(async () => {
    if (scaler) {
      await scaler.dispose();
    }
  });

  describe('Initialization', () => {
    it('should initialize with default config', async () => {
      scaler = new QueueScaler(mockTaskQueue, 10);
      await scaler.initialize();

      expect(scaler.getCurrentConfig()).toEqual(
        expect.objectContaining({
          enabled: true,
          minAgents: 5,
          maxAgents: 100,
        })
      );
    });

    it('should accept custom config', async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        minAgents: 10,
        maxAgents: 200,
      });
      await scaler.initialize();

      expect(scaler.getCurrentConfig().minAgents).toBe(10);
      expect(scaler.getCurrentConfig().maxAgents).toBe(200);
    });
  });

  describe('Scaling Decisions', () => {
    beforeEach(async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        ...DEFAULT_QUEUE_SCALING_CONFIG,
        checkIntervalMs: 1000,
      });
      await scaler.initialize();
    });

    it('should scale up when queue depth exceeds threshold', async () => {
      mockTaskQueue.getQueueDepth.mockResolvedValue(250); // Above aggressive threshold

      const decision = scaler.evaluateScaling({
        depth: 250,
        processingRate: 5,
        enqueueRate: 10,
        growthRate: 20,
        avgWaitTimeMs: 5000,
        timestamp: new Date(),
      });

      expect(decision.direction).toBe('up');
      expect(decision.trigger).toBe('queue_depth');
      expect(decision.delta).toBeGreaterThan(0);
    });

    it('should scale up when queue is growing', async () => {
      mockTaskQueue.getQueueDepth.mockResolvedValue(60); // Above threshold

      const decision = scaler.evaluateScaling({
        depth: 60,
        processingRate: 5,
        enqueueRate: 20,
        growthRate: 15, // Growing faster than processing
        avgWaitTimeMs: 3000,
        timestamp: new Date(),
      });

      expect(decision.direction).toBe('up');
      expect(decision.trigger).toBe('growth_rate');
    });

    it('should scale down when queue is low', async () => {
      // Set up history of low queue depth
      for (let i = 0; i < 10; i++) {
        scaler['metrics'].push({
          depth: 5,
          processingRate: 10,
          enqueueRate: 5,
          growthRate: 0,
          avgWaitTimeMs: 100,
          timestamp: new Date(Date.now() - i * 30000),
        });
      }

      const decision = scaler.evaluateScaling({
        depth: 5,
        processingRate: 10,
        enqueueRate: 5,
        growthRate: 0,
        avgWaitTimeMs: 100,
        timestamp: new Date(),
      });

      expect(decision.direction).toBe('down');
      expect(decision.delta).toBeLessThan(0);
    });

    it('should maintain when queue is stable', async () => {
      const decision = scaler.evaluateScaling({
        depth: 25, // Between scale up and down thresholds
        processingRate: 10,
        enqueueRate: 10,
        growthRate: 0,
        avgWaitTimeMs: 500,
        timestamp: new Date(),
      });

      expect(decision.direction).toBe('maintain');
      expect(decision.delta).toBe(0);
    });

    it('should respect min agents limit', async () => {
      scaler = new QueueScaler(mockTaskQueue, 6, {
        ...DEFAULT_QUEUE_SCALING_CONFIG,
        minAgents: 5,
        scaleDownIncrement: 5,
      });
      await scaler.initialize();

      // Fill history with low queue
      for (let i = 0; i < 10; i++) {
        scaler['metrics'].push({
          depth: 3,
          processingRate: 10,
          enqueueRate: 5,
          growthRate: 0,
          avgWaitTimeMs: 100,
          timestamp: new Date(Date.now() - i * 30000),
        });
      }

      const decision = scaler.evaluateScaling({
        depth: 3,
        processingRate: 10,
        enqueueRate: 5,
        growthRate: 0,
        avgWaitTimeMs: 100,
        timestamp: new Date(),
      });

      expect(decision.targetAgentCount).toBeGreaterThanOrEqual(5);
    });

    it('should respect max agents limit', async () => {
      scaler = new QueueScaler(mockTaskQueue, 95, {
        ...DEFAULT_QUEUE_SCALING_CONFIG,
        maxAgents: 100,
        scaleUpAggressiveIncrement: 20,
      });
      await scaler.initialize();

      const decision = scaler.evaluateScaling({
        depth: 300, // Very high
        processingRate: 5,
        enqueueRate: 50,
        growthRate: 45,
        avgWaitTimeMs: 10000,
        timestamp: new Date(),
      });

      expect(decision.targetAgentCount).toBeLessThanOrEqual(100);
    });
  });

  describe('Predictive Scaling', () => {
    beforeEach(async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        ...DEFAULT_QUEUE_SCALING_CONFIG,
        enablePredictiveScaling: true,
        predictionWindowMs: 300000,
      });
      await scaler.initialize();

      // Set up metrics history with clear growth trend
      const now = Date.now();
      for (let i = 0; i < 10; i++) {
        scaler['metrics'].push({
          depth: 20 + i * 10, // Growing by 10 each check
          processingRate: 5,
          enqueueRate: 15,
          growthRate: 10,
          avgWaitTimeMs: 1000,
          timestamp: new Date(now - (10 - i) * 30000),
        });
      }
    });

    it('should predict queue growth', () => {
      const prediction = scaler.predictQueueGrowth();

      expect(prediction.predictedDepth).toBeGreaterThan(100);
      expect(prediction.confidence).toBeGreaterThan(0);
      expect(prediction.recommendation).toBe('scale_up');
    });

    it('should include prediction in scaling decision', () => {
      const decision = scaler.evaluateScaling({
        depth: 50,
        processingRate: 5,
        enqueueRate: 15,
        growthRate: 10,
        avgWaitTimeMs: 1000,
        timestamp: new Date(),
      });

      // Should recommend scaling up due to prediction
      expect(decision.direction).toBe('up');
    });
  });

  describe('Cooldown', () => {
    beforeEach(async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        ...DEFAULT_QUEUE_SCALING_CONFIG,
        cooldownMs: 60000,
      });
      await scaler.initialize();
    });

    it('should respect cooldown between scalings', () => {
      // Set last scaling action
      scaler['lastScalingAction'] = {
        actionId: 'test',
        decision: {} as any,
        status: 'completed',
        completedAt: new Date(Date.now() - 10000), // 10 seconds ago
      };

      const inCooldown = scaler['isInCooldown']();
      expect(inCooldown).toBe(true);
    });

    it('should allow scaling after cooldown', () => {
      // Set last scaling action
      scaler['lastScalingAction'] = {
        actionId: 'test',
        decision: {} as any,
        status: 'completed',
        completedAt: new Date(Date.now() - 120000), // 2 minutes ago
      };

      const inCooldown = scaler['isInCooldown']();
      expect(inCooldown).toBe(false);
    });
  });

  describe('Manual Scaling', () => {
    beforeEach(async () => {
      scaler = new QueueScaler(mockTaskQueue, 10);
      await scaler.initialize();
    });

    it('should scale to specific count', async () => {
      const action = await scaler.scaleTo(25);

      expect(action.decision.targetAgentCount).toBe(25);
      expect(action.decision.trigger).toBe('manual');
    });

    it('should clamp to min/max', async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        minAgents: 5,
        maxAgents: 50,
      });
      await scaler.initialize();

      const lowAction = await scaler.scaleTo(1);
      expect(lowAction.decision.targetAgentCount).toBe(5);

      const highAction = await scaler.scaleTo(100);
      expect(highAction.decision.targetAgentCount).toBe(50);
    });

    it('should scale up by increment', async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        scaleUpIncrement: 5,
      });
      await scaler.initialize();

      const action = await scaler.scaleUp();

      expect(action.decision.targetAgentCount).toBe(15);
      expect(action.decision.direction).toBe('up');
    });

    it('should scale down by decrement', async () => {
      scaler = new QueueScaler(mockTaskQueue, 10, {
        scaleDownIncrement: 3,
        minAgents: 5,
      });
      await scaler.initialize();

      const action = await scaler.scaleDown();

      expect(action.decision.targetAgentCount).toBe(7);
      expect(action.decision.direction).toBe('down');
    });
  });

  describe('Multi-Cluster Scaling', () => {
    let registry: ClusterRegistry;

    beforeEach(async () => {
      registry = new ClusterRegistry();
      await registry.initialize();

      // Register clusters
      const c1 = await registry.registerCluster({
        endpoint: 'http://cluster1:8080',
        region: 'us-east-1',
        zone: 'a',
        maxAgents: 50,
      });

      const c2 = await registry.registerCluster({
        endpoint: 'http://cluster2:8080',
        region: 'us-east-1',
        zone: 'b',
        maxAgents: 50,
      });

      registry.updateLoad(c1.id, { currentAgents: 20 });
      registry.updateLoad(c2.id, { currentAgents: 10 });
      await registry.updateHealth(c1.id, 'healthy', 50);
      await registry.updateHealth(c2.id, 'healthy', 50);

      scaler = new QueueScaler(
        mockTaskQueue,
        30,
        {
          ...DEFAULT_QUEUE_SCALING_CONFIG,
          multiClusterScaling: true,
        },
        registry
      );
      await scaler.initialize();
    });

    afterEach(async () => {
      await registry.dispose();
    });

    it('should generate multi-cluster plan for scale up', () => {
      const decision: any = {
        targetAgentCount: 50,
        currentAgentCount: 30,
        delta: 20,
      };

      const plan = scaler['generateMultiClusterPlan'](decision);

      expect(plan.globalTargetAgents).toBe(50);
      expect(plan.clusterAllocations.length).toBeGreaterThan(0);
      
      // Should distribute to clusters with available capacity
      const totalDelta = plan.clusterAllocations.reduce((sum, a) => sum + a.delta, 0);
      expect(totalDelta).toBeLessThanOrEqual(20);
    });

    it('should generate multi-cluster plan for scale down', () => {
      const decision: any = {
        targetAgentCount: 20,
        currentAgentCount: 30,
        delta: -10,
      };

      const plan = scaler['generateMultiClusterPlan'](decision);

      expect(plan.globalTargetAgents).toBe(20);
      
      const totalDelta = plan.clusterAllocations.reduce((sum, a) => sum + a.delta, 0);
      expect(totalDelta).toBeLessThanOrEqual(0);
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      scaler = new QueueScaler(mockTaskQueue, 10);
      await scaler.initialize();
    });

    it('should track stats', async () => {
      // Simulate some decisions
      scaler.evaluateScaling({
        depth: 100,
        processingRate: 5,
        enqueueRate: 20,
        growthRate: 15,
        avgWaitTimeMs: 3000,
        timestamp: new Date(),
      });

      scaler['stats'].scaleUpActions = 2;
      scaler['stats'].scaleDownActions = 1;

      const stats = scaler.getStats();

      expect(stats.scaleUpActions).toBe(2);
      expect(stats.scaleDownActions).toBe(1);
      expect(stats.totalDecisions).toBeGreaterThan(0);
    });

    it('should update current metrics', async () => {
      mockTaskQueue.getQueueDepth.mockResolvedValue(42);

      // Trigger metrics collection
      await scaler['collectMetrics']();

      expect(scaler.getStats().currentQueueDepth).toBe(42);
    });
  });
});
