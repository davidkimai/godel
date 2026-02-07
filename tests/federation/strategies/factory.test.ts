/**
 * Strategy Factory Tests
 * 
 * Tests for StrategyFactory and StrategyRegistry
 */

import { 
  StrategyFactory,
  StrategyRegistry,
  STRATEGY_PRESETS,
  RandomStrategy,
} from '../../../src/federation/strategies';
import { 
  RoundRobinStrategy,
  WeightedRoundRobinStrategy,
} from '../../../src/federation/strategies/round-robin';
import { 
  LeastConnectionsStrategy,
  LeastLoadedStrategy,
} from '../../../src/federation/strategies/least-connections';
import { 
  WeightedStrategy,
  PriorityWeightedStrategy,
} from '../../../src/federation/strategies/weighted';
import { 
  ConsistentHashStrategy,
  RendezvousHashStrategy,
} from '../../../src/federation/strategies/consistent-hash';
import type { StrategyType } from '../../../src/federation/strategies/types';

describe('StrategyFactory', () => {
  describe('create', () => {
    it('should create round-robin strategy', () => {
      const strategy = StrategyFactory.create('round-robin');
      expect(strategy).toBeInstanceOf(RoundRobinStrategy);
      expect(strategy.name).toBe('round-robin');
    });

    it('should create least-connections strategy', () => {
      const strategy = StrategyFactory.create('least-connections');
      expect(strategy).toBeInstanceOf(LeastConnectionsStrategy);
      expect(strategy.name).toBe('least-connections');
    });

    it('should create least-loaded strategy', () => {
      const strategy = StrategyFactory.create('least-loaded');
      expect(strategy).toBeInstanceOf(LeastLoadedStrategy);
      expect(strategy.name).toBe('least-loaded');
    });

    it('should create weighted strategy', () => {
      const strategy = StrategyFactory.create('weighted');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
      expect(strategy.name).toBe('weighted');
    });

    it('should create weighted strategy with custom weights', () => {
      const weights = { cost: 0.8, speed: 0.1, reliability: 0.1 };
      const strategy = StrategyFactory.create('weighted', { weights });
      
      expect(strategy).toBeInstanceOf(WeightedStrategy);
      const weightedStrategy = strategy as WeightedStrategy;
      expect(weightedStrategy.getWeights()).toEqual(weights);
    });

    it('should create consistent-hash strategy', () => {
      const strategy = StrategyFactory.create('consistent-hash');
      expect(strategy).toBeInstanceOf(ConsistentHashStrategy);
      expect(strategy.name).toBe('consistent-hash');
    });

    it('should create consistent-hash strategy with custom virtual nodes', () => {
      const strategy = StrategyFactory.create('consistent-hash', { virtualNodes: 50 });
      const hashStrategy = strategy as ConsistentHashStrategy;
      expect(hashStrategy.getVirtualNodes()).toBe(50);
    });

    it('should create random strategy', () => {
      const strategy = StrategyFactory.create('random');
      expect(strategy).toBeInstanceOf(RandomStrategy);
      expect(strategy.name).toBe('random');
    });

    it('should throw error for unknown strategy', () => {
      expect(() => StrategyFactory.create('unknown' as StrategyType)).toThrow('Unknown strategy type');
    });
  });

  describe('fromPreset', () => {
    it('should create balanced preset', () => {
      const strategy = StrategyFactory.fromPreset('balanced');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });

    it('should create costOptimized preset', () => {
      const strategy = StrategyFactory.fromPreset('costOptimized');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
      const weighted = strategy as WeightedStrategy;
      expect(weighted.getWeights().cost).toBeGreaterThan(weighted.getWeights().speed);
    });

    it('should create speedOptimized preset', () => {
      const strategy = StrategyFactory.fromPreset('speedOptimized');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
      const weighted = strategy as WeightedStrategy;
      expect(weighted.getWeights().speed).toBeGreaterThan(weighted.getWeights().cost);
    });

    it('should create reliabilityOptimized preset', () => {
      const strategy = StrategyFactory.fromPreset('reliabilityOptimized');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
      const weighted = strategy as WeightedStrategy;
      expect(weighted.getWeights().reliability).toBeGreaterThan(weighted.getWeights().cost);
    });

    it('should create sessionAffinity preset', () => {
      const strategy = StrategyFactory.fromPreset('sessionAffinity');
      expect(strategy).toBeInstanceOf(ConsistentHashStrategy);
    });

    it('should create roundRobin preset', () => {
      const strategy = StrategyFactory.fromPreset('roundRobin');
      expect(strategy).toBeInstanceOf(RoundRobinStrategy);
    });

    it('should create leastConnections preset', () => {
      const strategy = StrategyFactory.fromPreset('leastConnections');
      expect(strategy).toBeInstanceOf(LeastConnectionsStrategy);
    });
  });

  describe('forUseCase', () => {
    it('should create strategy for session-affinity', () => {
      const strategy = StrategyFactory.forUseCase('session-affinity');
      expect(strategy).toBeInstanceOf(ConsistentHashStrategy);
    });

    it('should create strategy for sticky-session', () => {
      const strategy = StrategyFactory.forUseCase('sticky-session');
      expect(strategy).toBeInstanceOf(ConsistentHashStrategy);
    });

    it('should create strategy for caching', () => {
      const strategy = StrategyFactory.forUseCase('caching');
      expect(strategy).toBeInstanceOf(ConsistentHashStrategy);
    });

    it('should create strategy for cost-optimization', () => {
      const strategy = StrategyFactory.forUseCase('cost-optimization');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });

    it('should create strategy for speed', () => {
      const strategy = StrategyFactory.forUseCase('speed');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });

    it('should create strategy for latency', () => {
      const strategy = StrategyFactory.forUseCase('latency');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });

    it('should create strategy for reliability', () => {
      const strategy = StrategyFactory.forUseCase('reliability');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });

    it('should create strategy for fair distribution', () => {
      const strategy = StrategyFactory.forUseCase('fair');
      expect(strategy).toBeInstanceOf(RoundRobinStrategy);
    });

    it('should create strategy for load-aware', () => {
      const strategy = StrategyFactory.forUseCase('load-aware');
      expect(strategy).toBeInstanceOf(LeastConnectionsStrategy);
    });

    it('should create strategy for long-running tasks', () => {
      const strategy = StrategyFactory.forUseCase('long-running');
      expect(strategy).toBeInstanceOf(LeastConnectionsStrategy);
    });

    it('should default to weighted for unknown use case', () => {
      const strategy = StrategyFactory.forUseCase('unknown-use-case');
      expect(strategy).toBeInstanceOf(WeightedStrategy);
    });
  });

  describe('getAvailableStrategies', () => {
    it('should return all strategy types', () => {
      const strategies = StrategyFactory.getAvailableStrategies();
      
      expect(strategies).toContain('round-robin');
      expect(strategies).toContain('least-connections');
      expect(strategies).toContain('least-loaded');
      expect(strategies).toContain('weighted');
      expect(strategies).toContain('consistent-hash');
      expect(strategies).toContain('random');
      expect(strategies.length).toBe(6);
    });
  });

  describe('getAvailablePresets', () => {
    it('should return all preset names', () => {
      const presets = StrategyFactory.getAvailablePresets();
      
      expect(presets).toContain('balanced');
      expect(presets).toContain('costOptimized');
      expect(presets).toContain('speedOptimized');
      expect(presets).toContain('reliabilityOptimized');
      expect(presets).toContain('sessionAffinity');
      expect(presets).toContain('roundRobin');
      expect(presets).toContain('leastConnections');
    });
  });

  describe('validateConfig', () => {
    it('should validate valid config', () => {
      const result = StrategyFactory.validateConfig('round-robin', {});
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject unknown strategy', () => {
      const result = StrategyFactory.validateConfig('unknown' as StrategyType, {});
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('Unknown strategy');
    });

    it('should reject invalid weight values', () => {
      const result = StrategyFactory.validateConfig('weighted', {
        weights: { cost: -0.5, speed: 0.5, reliability: 0.5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Weight "cost" must be between 0 and 1');
    });

    it('should warn about non-normalized weights', () => {
      const result = StrategyFactory.validateConfig('weighted', {
        weights: { cost: 0.5, speed: 0.5, reliability: 0.5 },
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('sum to 1');
    });

    it('should reject invalid virtual nodes', () => {
      const result = StrategyFactory.validateConfig('consistent-hash', {
        virtualNodes: 0,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('at least 1');
    });

    it('should warn about too many virtual nodes', () => {
      const result = StrategyFactory.validateConfig('consistent-hash', {
        virtualNodes: 2000,
      });
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain('not exceed 1000');
    });
  });
});

describe('STRATEGY_PRESETS', () => {
  it('should have all required presets', () => {
    expect(STRATEGY_PRESETS.balanced).toBeDefined();
    expect(STRATEGY_PRESETS.costOptimized).toBeDefined();
    expect(STRATEGY_PRESETS.speedOptimized).toBeDefined();
    expect(STRATEGY_PRESETS.reliabilityOptimized).toBeDefined();
    expect(STRATEGY_PRESETS.sessionAffinity).toBeDefined();
    expect(STRATEGY_PRESETS.roundRobin).toBeDefined();
    expect(STRATEGY_PRESETS.leastConnections).toBeDefined();
  });

  it('should have valid type for each preset', () => {
    const validTypes = StrategyFactory.getAvailableStrategies();
    
    Object.values(STRATEGY_PRESETS).forEach(preset => {
      expect(validTypes).toContain(preset.type);
    });
  });
});

describe('StrategyRegistry', () => {
  let registry: StrategyRegistry;

  beforeEach(() => {
    registry = new StrategyRegistry();
  });

  describe('register', () => {
    it('should register a strategy', () => {
      const strategy = new RoundRobinStrategy();
      registry.register('my-strategy', strategy);
      
      expect(registry.has('my-strategy')).toBe(true);
    });
  });

  describe('get', () => {
    it('should retrieve registered strategy', () => {
      const strategy = new RoundRobinStrategy();
      registry.register('my-strategy', strategy);
      
      const retrieved = registry.get('my-strategy');
      expect(retrieved).toBe(strategy);
    });

    it('should return undefined for unregistered strategy', () => {
      expect(registry.get('unknown')).toBeUndefined();
    });
  });

  describe('has', () => {
    it('should return true for registered strategy', () => {
      registry.register('test', new RoundRobinStrategy());
      expect(registry.has('test')).toBe(true);
    });

    it('should return false for unregistered strategy', () => {
      expect(registry.has('unknown')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove registered strategy', () => {
      registry.register('test', new RoundRobinStrategy());
      expect(registry.has('test')).toBe(true);
      
      registry.unregister('test');
      expect(registry.has('test')).toBe(false);
    });

    it('should return false for unregistered strategy', () => {
      expect(registry.unregister('unknown')).toBe(false);
    });
  });

  describe('getNames', () => {
    it('should return all registered names', () => {
      registry.register('strategy-1', new RoundRobinStrategy());
      registry.register('strategy-2', new WeightedStrategy());
      
      const names = registry.getNames();
      expect(names).toContain('strategy-1');
      expect(names).toContain('strategy-2');
      expect(names.length).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all strategies', () => {
      registry.register('strategy-1', new RoundRobinStrategy());
      registry.register('strategy-2', new WeightedStrategy());
      
      registry.clear();
      
      expect(registry.getNames()).toHaveLength(0);
    });
  });
});

describe('RandomStrategy', () => {
  let strategy: RandomStrategy;

  beforeEach(() => {
    strategy = new RandomStrategy();
  });

  const createAgents = (count: number) => {
    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}`,
      capabilities: {},
    }));
  };

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should select an agent', () => {
      const agents = createAgents(3);
      const selected = strategy.selectAgent(agents);
      
      expect(agents.map(a => a.id)).toContain(selected.id);
    });

    it('should distribute randomly', () => {
      const agents = createAgents(2);
      const counts: Record<string, number> = {};
      
      // With only 2 agents and random selection,
      // over many trials both should be selected
      for (let i = 0; i < 100; i++) {
        const agent = strategy.selectAgent(agents);
        counts[agent.id] = (counts[agent.id] || 0) + 1;
      }
      
      // Both should have been selected at least once
      expect(counts['agent-1']).toBeGreaterThan(0);
      expect(counts['agent-2']).toBeGreaterThan(0);
    });
  });

  describe('updateStats', () => {
    it('should not throw when updating stats', () => {
      expect(() => {
        strategy.updateStats('agent-1', {
          duration: 100,
          success: true,
          cost: 0.01,
        });
      }).not.toThrow();
    });
  });

  describe('reset', () => {
    it('should clear all stats', () => {
      const agents = createAgents(2);
      strategy.selectAgent(agents);
      
      strategy.reset();
      
      expect(strategy.getStats().totalSelections).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const agents = createAgents(2);
      strategy.selectAgent(agents);
      strategy.selectAgent(agents);
      
      const stats = strategy.getStats();
      
      expect(stats.name).toBe('random');
      expect(stats.totalSelections).toBe(2);
    });
  });
});
