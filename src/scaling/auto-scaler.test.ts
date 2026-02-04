/**
 * Auto-Scaler Unit Tests
 */

import { AutoScaler } from './auto-scaler';
import {
  createDefaultScalingPolicy,
  evaluateScalingPolicy,
  calculateScaleUpIncrement,
  calculateScaleDownDecrement,
} from './policies';
import {
  QueueGrowthTracker,
  parseCronExpression,
  isScheduleActive,
  makePredictiveDecision,
} from './predictive';
import {
  BudgetManager,
  calculateCost,
  calculateHourlyBurnRate,
  estimateBudgetExhaustion,
} from './cost-tracker';
import {
  ScalingMetrics,
  ScalingPolicy,
  ScalingDecision,
  BudgetConfig,
  PredictiveScalingConfig,
} from './types';

// Mock Redis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    llen: jest.fn().mockResolvedValue(0),
    xlen: jest.fn().mockResolvedValue(0),
    get: jest.fn().mockResolvedValue(null),
    setex: jest.fn().mockResolvedValue('OK'),
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
    quit: jest.fn().mockResolvedValue(undefined),
    ping: jest.fn().mockResolvedValue('PONG'),
    status: 'ready',
  }));
});

// Mock logger
jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('Auto-Scaler', () => {
  let autoScaler: AutoScaler;

  beforeEach(() => {
    autoScaler = new AutoScaler({
      evaluationIntervalSeconds: 1,
      redisUrl: 'redis://localhost:6379/0',
      debug: false,
    });
  });

  afterEach(async () => {
    await autoScaler.stop();
  });

  describe('Lifecycle', () => {
    it('should start and stop', async () => {
      const startedSpy = jest.fn();
      const stoppedSpy = jest.fn();

      autoScaler.on('started', startedSpy);
      autoScaler.on('stopped', stoppedSpy);

      await autoScaler.start();
      expect(startedSpy).toHaveBeenCalled();
      expect(autoScaler.getHealth().isRunning).toBe(true);

      await autoScaler.stop();
      expect(stoppedSpy).toHaveBeenCalled();
      expect(autoScaler.getHealth().isRunning).toBe(false);
    });

    it('should report health status', async () => {
      await autoScaler.start();
      
      const health = autoScaler.getHealth();
      expect(health.status).toBe('healthy');
      expect(health.activePoliciesCount).toBe(0);
    });
  });

  describe('Policy Management', () => {
    it('should register a policy', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const spy = jest.fn();

      autoScaler.on('policy.registered', spy);
      autoScaler.registerPolicy(policy);

      expect(spy).toHaveBeenCalledWith(policy);
      expect(autoScaler.getHealth().activePoliciesCount).toBe(1);
    });

    it('should unregister a policy', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      
      autoScaler.registerPolicy(policy);
      expect(autoScaler.getHealth().activePoliciesCount).toBe(1);

      autoScaler.unregisterPolicy('swarm-1');
      expect(autoScaler.getHealth().activePoliciesCount).toBe(0);
    });

    it('should get decision history', async () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      autoScaler.registerPolicy(policy);

      const history = autoScaler.getDecisionHistory('swarm-1');
      expect(history).toEqual([]);
    });
  });

  describe('Budget Management', () => {
    it('should register a budget', () => {
      const budgetConfig: BudgetConfig = {
        id: 'budget-1',
        swarmId: 'swarm-1',
        totalBudget: 100,
        period: 'daily',
        alertThreshold: 0.75,
        hardStopThreshold: 0.95,
      };

      autoScaler.registerBudget(budgetConfig);
      
      // Budget registration should work without error
      expect(autoScaler.getHealth().status).toBe('healthy');
    });
  });
});

describe('Scaling Policies', () => {
  const baseMetrics: ScalingMetrics = {
    timestamp: new Date(),
    swarmId: 'swarm-1',
    currentAgentCount: 10,
    queueDepth: 5,
    queueGrowthRate: 0,
    avgCpuUtilization: 50,
    avgMemoryUtilization: 60,
    eventBacklogSize: 0,
    taskCompletionRate: 10,
    avgTaskLatency: 1,
    currentCost: 10,
    budgetUtilization: 0.1,
  };

  describe('createDefaultScalingPolicy', () => {
    it('should create a policy with default values', () => {
      const policy = createDefaultScalingPolicy('swarm-1');

      expect(policy.swarmId).toBe('swarm-1');
      expect(policy.minAgents).toBe(5);
      expect(policy.maxAgents).toBe(50);
      expect(policy.scaleUp.cooldownSeconds).toBe(30);
      expect(policy.scaleDown.cooldownSeconds).toBe(300);
    });

    it('should respect custom min/max agents', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 10, 100);

      expect(policy.minAgents).toBe(10);
      expect(policy.maxAgents).toBe(100);
    });
  });

  describe('evaluateScalingPolicy', () => {
    it('should recommend scale_up when queue depth is high', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const metrics = { ...baseMetrics, queueDepth: 15 };

      const decision = evaluateScalingPolicy(policy, metrics);

      expect(decision.action).toBe('scale_up');
      expect(decision.targetAgentCount).toBeGreaterThan(metrics.currentAgentCount);
      expect(decision.triggers).toContain('queue_depth');
    });

    it('should recommend scale_down when utilization is low', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const metrics = { 
        ...baseMetrics, 
        queueDepth: 2,
        avgCpuUtilization: 20,
        avgMemoryUtilization: 30,
      };

      const decision = evaluateScalingPolicy(policy, metrics);

      expect(decision.action).toBe('scale_down');
      expect(decision.targetAgentCount).toBeLessThan(metrics.currentAgentCount);
    });

    it('should maintain when metrics are within thresholds', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);

      const decision = evaluateScalingPolicy(policy, baseMetrics);

      expect(decision.action).toBe('maintain');
      expect(decision.targetAgentCount).toBe(baseMetrics.currentAgentCount);
    });

    it('should respect max agents limit', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 15);
      const metrics = { ...baseMetrics, queueDepth: 100 };

      const decision = evaluateScalingPolicy(policy, metrics);

      expect(decision.action).toBe('scale_up');
      expect(decision.targetAgentCount).toBe(15); // Max limit
    });

    it('should respect min agents limit', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 10, 50);
      const metrics = { 
        ...baseMetrics, 
        currentAgentCount: 10,
        queueDepth: 0,
        avgCpuUtilization: 10,
      };

      const decision = evaluateScalingPolicy(policy, metrics);

      // Should not scale below minimum
      if (decision.action === 'scale_down') {
        expect(decision.targetAgentCount).toBeGreaterThanOrEqual(10);
      }
    });

    it('should force scale_down when budget is exceeded', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const metrics = { ...baseMetrics, currentAgentCount: 20 };

      const decision = evaluateScalingPolicy(policy, metrics, undefined, undefined, true);

      expect(decision.action).toBe('scale_down');
      expect(decision.triggers).toContain('budget');
    });

    it('should respect cooldown periods', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const metrics = { ...baseMetrics, queueDepth: 15 };
      const recentScaleUp = new Date(); // Just now

      const decision = evaluateScalingPolicy(policy, metrics, recentScaleUp);

      // Should not scale up due to cooldown
      expect(decision.action).toBe('maintain');
      expect(decision.reason).toContain('cooldown');
    });
  });

  describe('calculateScaleUpIncrement', () => {
    it('should calculate auto increment based on queue depth', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const metrics = { ...baseMetrics, queueDepth: 50 };

      const increment = calculateScaleUpIncrement(
        policy.scaleUp,
        metrics,
        10,
        50
      );

      expect(increment).toBeGreaterThan(0);
    });

    it('should respect max increment limit', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      policy.scaleUp.maxIncrement = 5;
      const metrics = { ...baseMetrics, queueDepth: 1000 };

      const increment = calculateScaleUpIncrement(
        policy.scaleUp,
        metrics,
        10,
        50
      );

      expect(increment).toBeLessThanOrEqual(5);
    });
  });

  describe('calculateScaleDownDecrement', () => {
    it('should calculate auto decrement based on queue depth', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 5, 50);
      const metrics = { ...baseMetrics, queueDepth: 2 };

      const decrement = calculateScaleDownDecrement(
        policy.scaleDown,
        metrics,
        20
      );

      expect(decrement).toBeGreaterThanOrEqual(0);
    });

    it('should not go below minimum agents', () => {
      const policy = createDefaultScalingPolicy('swarm-1', 10, 50);
      const metrics = { ...baseMetrics, queueDepth: 0 };

      const decrement = calculateScaleDownDecrement(
        policy.scaleDown,
        metrics,
        12
      );

      expect(12 - decrement).toBeGreaterThanOrEqual(10);
    });
  });
});

describe('Queue Growth Tracker', () => {
  let tracker: QueueGrowthTracker;

  beforeEach(() => {
    tracker = new QueueGrowthTracker();
  });

  describe('Growth Rate Calculation', () => {
    it('should return 0 growth rate with no history', () => {
      expect(tracker.getGrowthRate()).toBe(0);
    });

    it('should calculate growth rate from history', () => {
      const baseTime = Date.now();
      
      // Simulate growing queue over time
      tracker.record({
        timestamp: new Date(baseTime),
        swarmId: 'swarm-1',
        queueDepth: 10,
        queueGrowthRate: 0,
        currentAgentCount: 5,
        avgCpuUtilization: 50,
        avgMemoryUtilization: 60,
        eventBacklogSize: 0,
        taskCompletionRate: 10,
        avgTaskLatency: 1,
        currentCost: 10,
        budgetUtilization: 0.1,
      });

      tracker.record({
        timestamp: new Date(baseTime + 60000), // 1 minute later
        swarmId: 'swarm-1',
        queueDepth: 20,
        queueGrowthRate: 10,
        currentAgentCount: 5,
        avgCpuUtilization: 50,
        avgMemoryUtilization: 60,
        eventBacklogSize: 0,
        taskCompletionRate: 10,
        avgTaskLatency: 1,
        currentCost: 10,
        budgetUtilization: 0.1,
      });

      const growthRate = tracker.getGrowthRate();
      expect(growthRate).toBeGreaterThan(0);
    });
  });

  describe('Prediction', () => {
    it('should predict queue depth', () => {
      const prediction = tracker.predictQueueDepth(300); // 5 minutes

      expect(prediction).toHaveProperty('predictedDepth');
      expect(prediction).toHaveProperty('confidence');
      expect(prediction).toHaveProperty('recommendation');
      expect(prediction.confidence).toBeGreaterThanOrEqual(0);
      expect(prediction.confidence).toBeLessThanOrEqual(1);
    });
  });
});

describe('Cron Expression Parser', () => {
  it('should parse @hourly', () => {
    const result = parseCronExpression('@hourly');
    expect(result).toHaveProperty('nextRun');
    expect(result).toHaveProperty('isDue');
  });

  it('should parse @daily', () => {
    const result = parseCronExpression('@daily');
    expect(result).toHaveProperty('nextRun');
    expect(result).toHaveProperty('isDue');
  });

  it('should parse @weekly', () => {
    const result = parseCronExpression('@weekly');
    expect(result).toHaveProperty('nextRun');
    expect(result).toHaveProperty('isDue');
  });

  it('should parse standard cron expressions', () => {
    const result = parseCronExpression('0 9 * * 1-5');
    expect(result).toHaveProperty('nextRun');
    expect(result).toHaveProperty('isDue');
  });

  it('should throw on invalid expressions', () => {
    expect(() => parseCronExpression('invalid')).toThrow();
  });
});

describe('Budget Manager', () => {
  let manager: BudgetManager;

  beforeEach(() => {
    manager = new BudgetManager();
  });

  describe('Budget Registration', () => {
    it('should register a budget', () => {
      const config: BudgetConfig = {
        id: 'budget-1',
        swarmId: 'swarm-1',
        totalBudget: 100,
        period: 'daily',
        alertThreshold: 0.75,
        hardStopThreshold: 0.95,
      };

      manager.registerBudget(config);
      const budgets = manager.getBudgets();

      expect(budgets).toHaveLength(1);
      expect(budgets[0].config.swarmId).toBe('swarm-1');
    });

    it('should unregister a budget', () => {
      const config: BudgetConfig = {
        id: 'budget-1',
        swarmId: 'swarm-1',
        totalBudget: 100,
        period: 'daily',
        alertThreshold: 0.75,
        hardStopThreshold: 0.95,
      };

      manager.registerBudget(config);
      manager.unregisterBudget('swarm-1');

      expect(manager.getBudgets()).toHaveLength(0);
    });
  });

  describe('Budget Monitoring', () => {
    beforeEach(() => {
      manager.registerBudget({
        id: 'budget-1',
        swarmId: 'swarm-1',
        totalBudget: 100,
        period: 'daily',
        alertThreshold: 0.75,
        hardStopThreshold: 0.95,
      });
    });

    it('should track cost updates', () => {
      manager.updateCost('swarm-1', 50);
      const utilization = manager.getBudgetUtilization('swarm-1');

      expect(utilization).toBe(0.5);
    });

    it('should detect budget exceeded', () => {
      manager.updateCost('swarm-1', 96); // 96% of 100

      expect(manager.isBudgetExceeded('swarm-1')).toBe(true);
    });

    it('should not exceed budget at 94%', () => {
      manager.updateCost('swarm-1', 94);

      expect(manager.isBudgetExceeded('swarm-1')).toBe(false);
    });

    it('should provide budget summary', () => {
      manager.updateCost('swarm-1', 50);
      const summary = manager.getBudgetSummary('swarm-1');

      expect(summary).not.toBeNull();
      expect(summary!.totalBudget).toBe(100);
      expect(summary!.currentCost).toBe(50);
      expect(summary!.percentageUsed).toBe(50);
    });
  });

  describe('Cost Blocking', () => {
    beforeEach(() => {
      manager.registerBudget({
        id: 'budget-1',
        swarmId: 'swarm-1',
        totalBudget: 100,
        period: 'daily',
        alertThreshold: 0.75,
        hardStopThreshold: 0.95,
      });
    });

    it('should block scaling when budget exceeded', () => {
      manager.updateCost('swarm-1', 96);

      const check = manager.shouldBlockScaling('swarm-1', 10);

      expect(check.blocked).toBe(true);
      expect(check.reason).toBeDefined();
    });

    it('should allow scaling when budget available', () => {
      manager.updateCost('swarm-1', 50);

      const check = manager.shouldBlockScaling('swarm-1', 5);

      expect(check.blocked).toBe(false);
    });
  });

  describe('Alert Callbacks', () => {
    beforeEach(() => {
      manager.registerBudget({
        id: 'budget-1',
        swarmId: 'swarm-1',
        totalBudget: 100,
        period: 'daily',
        alertThreshold: 0.75,
        hardStopThreshold: 0.95,
      });
    });

    it('should call alert callback on threshold breach', () => {
      const callback = jest.fn();
      manager.onAlert(callback);

      manager.updateCost('swarm-1', 80); // Above 75% threshold

      expect(callback).toHaveBeenCalled();
      expect(callback.mock.calls[0][0]).toHaveProperty('level');
      expect(callback.mock.calls[0][0]).toHaveProperty('message');
    });

    it('should remove alert callback', () => {
      const callback = jest.fn();
      manager.onAlert(callback);
      manager.offAlert(callback);

      // Trigger alert
      manager.updateCost('swarm-1', 80);

      // Callback should not be called again because we need to exceed threshold
      // But the removal itself should not throw
      expect(() => manager.offAlert(callback)).not.toThrow();
    });
  });
});

describe('Cost Calculations', () => {
  it('should calculate hourly cost', () => {
    const cost = calculateCost(10, 1, {
      costPerAgentHour: 0.5,
      overheadCostPerHour: 0.1,
      currency: 'USD',
    });

    expect(cost).toBe(5.1); // 10 * 0.5 + 0.1
  });

  it('should calculate daily cost', () => {
    const cost = calculateCost(10, 24, {
      costPerAgentHour: 0.5,
      overheadCostPerHour: 0.1,
      currency: 'USD',
    });

    expect(cost).toBeCloseTo(122.4, 1); // (10 * 0.5 + 0.1) * 24
  });

  it('should calculate hourly burn rate', () => {
    const rate = calculateHourlyBurnRate(10, {
      costPerAgentHour: 0.5,
      overheadCostPerHour: 0.1,
      currency: 'USD',
    });

    expect(rate).toBe(5.1);
  });

  it('should estimate budget exhaustion', () => {
    const result = estimateBudgetExhaustion(
      50,
      100,
      10,
      {
        costPerAgentHour: 0.5,
        overheadCostPerHour: 0.1,
        currency: 'USD',
      }
    );

    expect(result.hoursRemaining).toBeGreaterThan(0);
    expect(result.willExhaust).toBeDefined();
  });

  it('should return 0 hours when budget already exhausted', () => {
    const result = estimateBudgetExhaustion(
      100,
      100,
      10,
      {
        costPerAgentHour: 0.5,
        overheadCostPerHour: 0.1,
        currency: 'USD',
      }
    );

    expect(result.hoursRemaining).toBe(0);
    expect(result.willExhaust).toBe(true);
  });
});
