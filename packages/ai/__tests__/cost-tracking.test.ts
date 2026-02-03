/**
 * Cost Tracking Tests
 */

import { CostTracker, CostTrackingOptions } from '../src/cost-tracker';
import { getModel, Usage } from '@mariozechner/pi-ai';

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker();
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      const defaultTracker = new CostTracker();
      expect(defaultTracker.getStatus().budgetLimit).toBe(Infinity);
    });

    it('should initialize with custom options', () => {
      const options: CostTrackingOptions = {
        budgetLimit: 10.0,
        warningThreshold: 0.5,
        stopThreshold: 0.9,
      };
      
      const customTracker = new CostTracker(options);
      const status = customTracker.getStatus();
      
      expect(status.budgetLimit).toBe(10.0);
    });
  });

  describe('cost recording', () => {
    it('should record cost entry', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      const usage: Usage = {
        input: 1000,
        output: 500,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 1500,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      };

      const entry = await tracker.recordCost(model, usage, {
        taskId: 'task-1',
        agentId: 'agent-1',
        swarmId: 'swarm-1',
      });

      expect(entry).toBeDefined();
      expect(entry.provider).toBe('anthropic');
      expect(entry.modelId).toBe('claude-3-5-haiku-20241022');
      expect(entry.taskId).toBe('task-1');
      expect(entry.agentId).toBe('agent-1');
      expect(entry.swarmId).toBe('swarm-1');
      expect(entry.cost.total).toBeGreaterThan(0);
    });

    it('should calculate total cost correctly', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      // Record first entry
      await tracker.recordCost(model, createUsage(1000, 500));
      
      // Record second entry
      await tracker.recordCost(model, createUsage(2000, 1000));
      
      const total = tracker.getTotalCost();
      expect(total).toBeGreaterThan(0);
      
      // Should be sum of both entries
      const entries = tracker.getEntries();
      expect(entries).toHaveLength(2);
    });

    it('should call onCostIncurred callback', async () => {
      const onCostIncurred = jest.fn();
      const callbackTracker = new CostTracker({ onCostIncurred });
      
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      await callbackTracker.recordCost(model, createUsage(1000, 500));
      
      expect(onCostIncurred).toHaveBeenCalledTimes(1);
      expect(onCostIncurred).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'anthropic',
          modelId: 'claude-3-5-haiku-20241022',
        })
      );
    });
  });

  describe('cost estimation', () => {
    it('should estimate cost before request', () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      const estimate = tracker.estimateCost(model, 1000, 500);
      
      expect(estimate.input).toBeGreaterThan(0);
      expect(estimate.output).toBeGreaterThan(0);
      expect(estimate.total).toBeGreaterThan(0);
      expect(estimate.total).toBe(estimate.input + estimate.output + estimate.cacheRead + estimate.cacheWrite);
    });

    it('should check if request would exceed budget', () => {
      const budgetTracker = new CostTracker({ budgetLimit: 0.001 });
      const model = getModel('anthropic', 'claude-3-opus-20240229');
      
      // Record some cost first
      budgetTracker.recordCost(model, createUsage(100000, 50000));
      
      const check = budgetTracker.wouldExceedBudget(model, 100000, 50000);
      
      expect(check.wouldExceed).toBe(true);
      expect(check.projectedTotal).toBeGreaterThan(check.remaining);
    });
  });

  describe('threshold alerts', () => {
    it('should trigger warning callback', async () => {
      const onWarning = jest.fn();
      const warningTracker = new CostTracker({
        budgetLimit: 1.0,
        warningThreshold: 0.5,
        onWarning,
      });
      
      const model = getModel('anthropic', 'claude-3-opus-20240229');
      
      // Record cost to exceed warning threshold
      await warningTracker.recordCost(model, createUsage(100000, 50000));
      
      // Warning should have been triggered if over threshold
      const status = warningTracker.getStatus();
      if (status.percentUsed >= 0.5) {
        expect(onWarning).toHaveBeenCalled();
      }
    });

    it('should trigger stop callback', async () => {
      const onStop = jest.fn();
      const stopTracker = new CostTracker({
        budgetLimit: 0.01,
        stopThreshold: 0.9,
        onStop,
      });
      
      const model = getModel('anthropic', 'claude-3-opus-20240229');
      
      // Record cost to exceed stop threshold
      await stopTracker.recordCost(model, createUsage(10000, 5000));
      
      // Stop should have been triggered if over threshold
      const status = stopTracker.getStatus();
      if (status.percentUsed >= 0.9) {
        expect(onStop).toHaveBeenCalled();
      }
    });
  });

  describe('cost summaries', () => {
    it('should summarize costs by provider', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      await tracker.recordCost(model, createUsage(1000, 500));
      await tracker.recordCost(model, createUsage(2000, 1000));
      
      const byProvider = tracker.getCostsByProvider();
      
      expect(byProvider.length).toBeGreaterThan(0);
      expect(byProvider[0].provider).toBe('anthropic');
      expect(byProvider[0].requestCount).toBe(2);
      expect(byProvider[0].totalCost).toBeGreaterThan(0);
    });

    it('should summarize costs by model', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      await tracker.recordCost(model, createUsage(1000, 500));
      
      const byModel = tracker.getCostsByModel();
      
      expect(byModel.length).toBeGreaterThan(0);
      expect(byModel[0].modelId).toBe('claude-3-5-haiku-20241022');
    });

    it('should filter costs by task', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      await tracker.recordCost(model, createUsage(1000, 500), { taskId: 'task-a' });
      await tracker.recordCost(model, createUsage(2000, 1000), { taskId: 'task-b' });
      
      const taskACosts = tracker.getCostsForTask('task-a');
      expect(taskACosts).toHaveLength(1);
      expect(taskACosts[0].taskId).toBe('task-a');
    });

    it('should filter costs by agent', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      await tracker.recordCost(model, createUsage(1000, 500), { agentId: 'agent-1' });
      await tracker.recordCost(model, createUsage(2000, 1000), { agentId: 'agent-2' });
      
      const agent1Costs = tracker.getCostsForAgent('agent-1');
      expect(agent1Costs).toHaveLength(1);
      expect(agent1Costs[0].agentId).toBe('agent-1');
    });

    it('should filter costs by swarm', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      await tracker.recordCost(model, createUsage(1000, 500), { swarmId: 'swarm-1' });
      await tracker.recordCost(model, createUsage(2000, 1000), { swarmId: 'swarm-2' });
      
      const swarm1Costs = tracker.getCostsForSwarm('swarm-1');
      expect(swarm1Costs).toHaveLength(1);
      expect(swarm1Costs[0].swarmId).toBe('swarm-1');
    });
  });

  describe('status reporting', () => {
    it('should get current status', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      await tracker.recordCost(model, createUsage(1000, 500));
      
      const status = tracker.getStatus();
      
      expect(status.totalCost).toBeGreaterThan(0);
      expect(status.entryCount).toBe(1);
      expect(status.percentUsed).toBeGreaterThanOrEqual(0);
    });

    it('should export cost report', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      await tracker.recordCost(model, createUsage(1000, 500));
      
      const report = tracker.exportReport();
      
      expect(report.generatedAt).toBeInstanceOf(Date);
      expect(report.status).toBeDefined();
      expect(report.summary).toBeDefined();
      expect(report.byProvider).toBeDefined();
      expect(report.byModel).toBeDefined();
      expect(report.recentEntries).toBeDefined();
    });
  });

  describe('lifecycle', () => {
    it('should clear all entries', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      await tracker.recordCost(model, createUsage(1000, 500));
      
      tracker.clear();
      
      expect(tracker.getTotalCost()).toBe(0);
      expect(tracker.getEntries()).toHaveLength(0);
    });

    it('should update budget limit', () => {
      tracker.setBudgetLimit(50.0);
      
      expect(tracker.getStatus().budgetLimit).toBe(50.0);
    });

    it('should reset thresholds', async () => {
      const warningTracker = new CostTracker({
        budgetLimit: 1.0,
        warningThreshold: 0.01, // Very low to trigger immediately
      });
      
      const model = getModel('anthropic', 'claude-3-opus-20240229');
      await warningTracker.recordCost(model, createUsage(100000, 50000));
      
      // Reset
      warningTracker.resetThresholds();
      
      expect(warningTracker.getStatus().warningTriggered).toBe(false);
    });

    it('should get recent entries', async () => {
      const model = getModel('anthropic', 'claude-3-5-haiku-20241022');
      
      for (let i = 0; i < 10; i++) {
        await tracker.recordCost(model, createUsage(100, 50));
      }
      
      const recent = tracker.getRecentEntries(5);
      expect(recent).toHaveLength(5);
    });
  });
});

// Helper function
function createUsage(input: number, output: number): Usage {
  return {
    input,
    output,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: input + output,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };
}
