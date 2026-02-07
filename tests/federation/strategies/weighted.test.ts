/**
 * Weighted Strategy Tests
 * 
 * Tests for WeightedStrategy and PriorityWeightedStrategy
 */

import { 
  WeightedStrategy,
  PriorityWeightedStrategy,
  DEFAULT_WEIGHTS,
  COST_OPTIMIZED_WEIGHTS,
  SPEED_OPTIMIZED_WEIGHTS,
  RELIABILITY_OPTIMIZED_WEIGHTS,
} from '../../../src/federation/strategies/weighted';
import type { Agent, SelectionContext } from '../../../src/federation/strategies/types';

describe('WeightedStrategy', () => {
  let strategy: WeightedStrategy;
  
  const createAgents = (): Agent[] => [
    { id: 'cheap-slow', capabilities: { costPerHour: 1 } },
    { id: 'expensive-fast', capabilities: { costPerHour: 9 } },
    { id: 'medium', capabilities: { costPerHour: 5 } },
  ];

  beforeEach(() => {
    strategy = new WeightedStrategy();
  });

  describe('constructor', () => {
    it('should use default weights when none provided', () => {
      expect(strategy.getWeights()).toEqual(DEFAULT_WEIGHTS);
    });

    it('should accept custom weights', () => {
      const custom = new WeightedStrategy({ cost: 0.8, speed: 0.1, reliability: 0.1 });
      expect(custom.getWeights()).toEqual({ cost: 0.8, speed: 0.1, reliability: 0.1 });
    });

    it('should normalize weights to sum to 1', () => {
      const custom = new WeightedStrategy({ cost: 2, speed: 2, reliability: 2 });
      const weights = custom.getWeights();
      const sum = weights.cost + weights.speed + weights.reliability;
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should handle partial weight configuration', () => {
      const custom = new WeightedStrategy({ cost: 0.8 });
      const weights = custom.getWeights();
      // Cost should be the dominant factor (normalized with defaults)
      expect(weights.cost).toBeGreaterThan(weights.speed);
      expect(weights.cost).toBeGreaterThan(weights.reliability);
      // All should be defined and sum to 1
      expect(weights.speed).toBeDefined();
      expect(weights.reliability).toBeDefined();
      const sum = weights.cost + weights.speed + weights.reliability;
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should return the only agent when one available', () => {
      const agents = [{ id: 'solo', capabilities: {} }];
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('solo');
    });

    it('should select cheaper agent when cost-weighted', () => {
      strategy = new WeightedStrategy(COST_OPTIMIZED_WEIGHTS);
      const agents = createAgents();
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('cheap-slow');
    });

    it('should select agent with better stats when reliability-weighted', () => {
      strategy = new WeightedStrategy(RELIABILITY_OPTIMIZED_WEIGHTS);
      const agents = createAgents();
      
      // Give one agent perfect reliability
      strategy.updateStats('medium', {
        duration: 100,
        success: true,
        cost: 0.01,
      });
      strategy.updateStats('medium', {
        duration: 100,
        success: true,
        cost: 0.01,
      });
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('medium');
    });

    it('should adjust weights for high complexity tasks', () => {
      strategy = new WeightedStrategy({ cost: 0.5, speed: 0.4, reliability: 0.1 });
      const agents = createAgents();
      
      // Give medium agent good reliability
      strategy.updateStats('medium', {
        duration: 100,
        success: true,
        cost: 0.01,
      });
      
      const context: SelectionContext = { taskComplexity: 'high' };
      const selected = strategy.selectAgent(agents, context);
      
      // Should prefer reliable agent for complex tasks
      expect(selected.id).toBe('medium');
    });

    it('should adjust weights for low complexity tasks', () => {
      strategy = new WeightedStrategy({ cost: 0.2, speed: 0.3, reliability: 0.5 });
      const agents = createAgents();
      
      const context: SelectionContext = { taskComplexity: 'low' };
      const selected = strategy.selectAgent(agents, context);
      
      // Should prefer cheap agent for simple tasks
      expect(selected.id).toBe('cheap-slow');
    });
  });

  describe('updateStats', () => {
    it('should track execution count', () => {
      strategy.updateStats('agent-1', {
        duration: 100,
        success: true,
        cost: 0.01,
      });
      
      const stats = strategy.getAgentStats('agent-1');
      expect(stats?.totalExecutions).toBe(1);
    });

    it('should track successful executions', () => {
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-1', { duration: 100, success: false, cost: 0.01 });
      
      const stats = strategy.getAgentStats('agent-1');
      expect(stats?.successfulExecutions).toBe(1);
      expect(stats?.totalExecutions).toBe(2);
    });

    it('should calculate success rate', () => {
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-1', { duration: 100, success: false, cost: 0.01 });
      
      const stats = strategy.getAgentStats('agent-1');
      expect(stats?.successRate).toBe(2 / 3);
    });

    it('should calculate rolling average speed', () => {
      // First execution: 1 second = 1 task/sec
      strategy.updateStats('agent-1', { duration: 1000, success: true, cost: 0.01 });
      
      // Second execution: 0.5 seconds = 2 tasks/sec
      strategy.updateStats('agent-1', { duration: 500, success: true, cost: 0.01 });
      
      const stats = strategy.getAgentStats('agent-1');
      // Average: (1 + 2) / 2 = 1.5
      expect(stats?.avgSpeed).toBe(1.5);
    });

    it('should handle zero duration', () => {
      strategy.updateStats('agent-1', { duration: 0, success: true, cost: 0.01 });
      
      const stats = strategy.getAgentStats('agent-1');
      expect(stats?.avgSpeed).toBe(0);
    });
  });

  describe('setWeights', () => {
    it('should update weights', () => {
      strategy.setWeights({ cost: 0.9 });
      // Cost should be dominant after update (normalized)
      const weights = strategy.getWeights();
      expect(weights.cost).toBeGreaterThan(weights.speed);
      expect(weights.cost).toBeGreaterThan(weights.reliability);
    });

    it('should normalize updated weights', () => {
      strategy.setWeights({ cost: 2, speed: 2 });
      
      const weights = strategy.getWeights();
      const sum = weights.cost + weights.speed + weights.reliability;
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('getAllStats', () => {
    it('should return all agent stats', () => {
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-2', { duration: 200, success: true, cost: 0.01 });
      
      const allStats = strategy.getAllStats();
      expect(allStats.size).toBe(2);
      expect(allStats.has('agent-1')).toBe(true);
      expect(allStats.has('agent-2')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should clear all stats', () => {
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.selectAgent([{ id: 'agent-1', capabilities: {} }]);
      
      strategy.reset();
      
      expect(strategy.getAgentStats('agent-1')).toBeUndefined();
      expect(strategy.getStats().totalSelections).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return complete stats', () => {
      const agents = createAgents();
      
      strategy.selectAgent(agents);
      strategy.updateStats('cheap-slow', { duration: 100, success: true, cost: 0.01 });
      
      const stats = strategy.getStats();
      
      expect(stats.name).toBe('weighted');
      expect(stats.weights).toEqual(strategy.getWeights());
      expect(stats.totalSelections).toBe(1);
      expect(stats.agentStats).toHaveProperty('cheap-slow');
    });
  });

  describe('preset weights', () => {
    it('should have balanced defaults', () => {
      const sum = DEFAULT_WEIGHTS.cost + DEFAULT_WEIGHTS.speed + DEFAULT_WEIGHTS.reliability;
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should have cost-optimized weights', () => {
      expect(COST_OPTIMIZED_WEIGHTS.cost).toBeGreaterThan(COST_OPTIMIZED_WEIGHTS.speed);
      expect(COST_OPTIMIZED_WEIGHTS.cost).toBeGreaterThan(COST_OPTIMIZED_WEIGHTS.reliability);
    });

    it('should have speed-optimized weights', () => {
      expect(SPEED_OPTIMIZED_WEIGHTS.speed).toBeGreaterThan(SPEED_OPTIMIZED_WEIGHTS.cost);
      expect(SPEED_OPTIMIZED_WEIGHTS.speed).toBeGreaterThan(SPEED_OPTIMIZED_WEIGHTS.reliability);
    });

    it('should have reliability-optimized weights', () => {
      expect(RELIABILITY_OPTIMIZED_WEIGHTS.reliability).toBeGreaterThan(RELIABILITY_OPTIMIZED_WEIGHTS.cost);
      expect(RELIABILITY_OPTIMIZED_WEIGHTS.reliability).toBeGreaterThan(RELIABILITY_OPTIMIZED_WEIGHTS.speed);
    });
  });
});

describe('PriorityWeightedStrategy', () => {
  let strategy: PriorityWeightedStrategy;

  beforeEach(() => {
    strategy = new PriorityWeightedStrategy();
  });

  const createAgents = (): Agent[] => [
    { id: 'agent-1', capabilities: { costPerHour: 5 } },
    { id: 'agent-2', capabilities: { costPerHour: 5 } },
  ];

  describe('selectAgent', () => {
    it('should use parent behavior without priority', () => {
      const agents = createAgents();
      const selected = strategy.selectAgent(agents);
      
      // Should select one of the agents
      expect(['agent-1', 'agent-2']).toContain(selected.id);
    });

    it('should prioritize reliability for high priority tasks', () => {
      const agents = createAgents();
      
      // Give agent-1 better reliability
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-2', { duration: 100, success: false, cost: 0.01 });
      
      const context: SelectionContext = { priority: 9 };
      const selected = strategy.selectAgent(agents, context);
      
      // Should prefer reliable agent for high priority
      expect(selected.id).toBe('agent-1');
    });

    it('should use normal weights for low priority tasks', () => {
      const agents = createAgents();
      
      // Give agent-1 better reliability but higher cost
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      strategy.updateStats('agent-2', { duration: 100, success: false, cost: 0.01 });
      
      const context: SelectionContext = { priority: 3 };
      
      // Should not force reliability weighting
      // (actual selection depends on base weights)
      expect(() => strategy.selectAgent(agents, context)).not.toThrow();
    });
  });
});
