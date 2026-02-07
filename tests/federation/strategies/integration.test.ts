/**
 * Strategy Integration Tests
 * 
 * End-to-end tests demonstrating all strategies working together
 * and verification of the acceptance criteria.
 */

import {
  StrategyFactory,
  RoundRobinStrategy,
  LeastConnectionsStrategy,
  WeightedStrategy,
  ConsistentHashStrategy,
} from '../../../src/federation/strategies';
import type { Agent, SelectionContext } from '../../../src/federation/strategies/types';

describe('Load Balancing Strategies - Integration Tests', () => {
  const createTestAgents = (): Agent[] => [
    { 
      id: 'agent-a', 
      capabilities: { 
        costPerHour: 2,
        maxConnections: 10,
        tags: ['gpu', 'fast'],
      } 
    },
    { 
      id: 'agent-b', 
      capabilities: { 
        costPerHour: 3,
        maxConnections: 5,
        tags: ['cpu', 'reliable'],
      } 
    },
    { 
      id: 'agent-c', 
      capabilities: { 
        costPerHour: 5,
        maxConnections: 15,
        tags: ['gpu', 'reliable'],
      } 
    },
  ];

  describe('Acceptance Criteria Verification', () => {
    it('AC1: Round-robin strategy implemented', () => {
      const strategy = new RoundRobinStrategy();
      const agents = createTestAgents();
      
      // Should cycle through agents
      const selections = [
        strategy.selectAgent(agents),
        strategy.selectAgent(agents),
        strategy.selectAgent(agents),
        strategy.selectAgent(agents),
      ];
      
      expect(selections[0].id).toBe('agent-a');
      expect(selections[1].id).toBe('agent-b');
      expect(selections[2].id).toBe('agent-c');
      expect(selections[3].id).toBe('agent-a'); // Cycle back
    });

    it('AC2: Least-connections strategy implemented', () => {
      const strategy = new LeastConnectionsStrategy();
      const agents = createTestAgents();
      
      // Pre-set connection counts
      strategy['connectionCounts'].set('agent-a', 8);
      strategy['connectionCounts'].set('agent-b', 2);
      strategy['connectionCounts'].set('agent-c', 5);
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-b'); // Fewest connections
    });

    it('AC3: Weighted strategy implemented', () => {
      const strategy = new WeightedStrategy({
        cost: 0.5,
        speed: 0.3,
        reliability: 0.2,
      });
      const agents = createTestAgents();
      
      // Should select based on weighted score
      const selected = strategy.selectAgent(agents);
      expect(['agent-a', 'agent-b', 'agent-c']).toContain(selected.id);
      
      // Should support weight updates
      strategy.setWeights({ cost: 0.8, speed: 0.1, reliability: 0.1 });
      expect(strategy.getWeights().cost).toBe(0.8);
    });

    it('AC4: Consistent hashing strategy implemented', () => {
      const strategy = new ConsistentHashStrategy(150);
      const agents = createTestAgents();
      const context: SelectionContext = { taskId: 'task-123' };
      
      // Should provide sticky sessions
      const selection1 = strategy.selectAgent(agents, context);
      const selection2 = strategy.selectAgent(agents, context);
      const selection3 = strategy.selectAgent(agents, context);
      
      expect(selection1.id).toBe(selection2.id);
      expect(selection2.id).toBe(selection3.id);
    });

    it('AC5: Strategy factory for easy selection', () => {
      const strategies = [
        StrategyFactory.create('round-robin'),
        StrategyFactory.create('least-connections'),
        StrategyFactory.create('weighted'),
        StrategyFactory.create('consistent-hash'),
      ];
      
      expect(strategies).toHaveLength(4);
      strategies.forEach(strategy => {
        expect(strategy.name).toBeDefined();
        expect(typeof strategy.selectAgent).toBe('function');
        expect(typeof strategy.updateStats).toBe('function');
      });
    });

    it('AC6: Stats tracking for adaptive strategies', () => {
      const strategy = new WeightedStrategy();
      
      // Simulate multiple executions
      for (let i = 0; i < 10; i++) {
        strategy.updateStats('agent-a', {
          duration: 100 + i * 10,
          success: i < 9, // 90% success rate
          cost: 0.01 * (i + 1),
        });
      }
      
      const stats = strategy.getAgentStats('agent-a');
      expect(stats).toBeDefined();
      expect(stats?.totalExecutions).toBe(10);
      expect(stats?.successfulExecutions).toBe(9);
      expect(stats?.successRate).toBe(0.9);
    });
  });

  describe('Strategy Comparison Test', () => {
    it('should demonstrate different selection patterns across strategies', () => {
      const agents = createTestAgents();
      const taskId = 'comparison-task';
      
      const strategies = [
        { name: 'Round Robin', strategy: new RoundRobinStrategy() },
        { name: 'Least Connections', strategy: new LeastConnectionsStrategy() },
        { name: 'Weighted (Cost)', strategy: new WeightedStrategy({ cost: 0.8, speed: 0.1, reliability: 0.1 }) },
        { name: 'Consistent Hash', strategy: new ConsistentHashStrategy(150) },
      ];
      
      console.log('\n--- Strategy Comparison ---');
      
      for (const { name, strategy } of strategies) {
        const context: SelectionContext = { taskId };
        const selected = strategy.selectAgent(agents, context);
        console.log(`${name}: Selected ${selected.id}`);
        
        expect(selected).toBeDefined();
        expect(agents.map(a => a.id)).toContain(selected.id);
      }
    });
  });

  describe('Performance Characteristics', () => {
    it('round-robin should have O(1) selection time', () => {
      const strategy = new RoundRobinStrategy();
      const agents = Array.from({ length: 1000 }, (_, i) => ({
        id: `agent-${i}`,
        capabilities: {},
      }));
      
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        strategy.selectAgent(agents);
      }
      const duration = Date.now() - start;
      
      // Should complete 10,000 selections quickly (under 100ms in most environments)
      expect(duration).toBeLessThan(1000);
    });

    it('consistent-hash should have O(log n) lookup time', () => {
      const strategy = new ConsistentHashStrategy(50);
      const agents = Array.from({ length: 100 }, (_, i) => ({
        id: `agent-${i}`,
        capabilities: {},
      }));
      
      // Pre-add agents
      strategy.addAgents(agents);
      
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        strategy.peekAgent(`task-${i}`);
      }
      const duration = Date.now() - start;
      
      // Should complete 10,000 lookups reasonably fast
      expect(duration).toBeLessThan(1000);
    });

    it('weighted should maintain rolling averages efficiently', () => {
      const strategy = new WeightedStrategy();
      const agents = createTestAgents();
      
      // First, make some selections
      for (let i = 0; i < 100; i++) {
        strategy.selectAgent(agents);
      }
      
      // Then update stats many times
      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        strategy.updateStats('agent-a', {
          duration: 100 + Math.random() * 50,
          success: Math.random() > 0.1,
          cost: 0.01,
        });
      }
      const duration = Date.now() - start;
      
      // Should handle 10,000 updates quickly
      expect(duration).toBeLessThan(500);
      
      // Stats should be accurate
      const stats = strategy.getAgentStats('agent-a');
      expect(stats?.totalExecutions).toBe(10000);
    });
  });

  describe('Factory Presets Validation', () => {
    it('should create all presets successfully', () => {
      const presets = StrategyFactory.getAvailablePresets();
      
      for (const preset of presets) {
        const strategy = StrategyFactory.fromPreset(preset as any);
        expect(strategy).toBeDefined();
        expect(strategy.name).toBeDefined();
        
        // Verify strategy works
        const agents = createTestAgents();
        const selected = strategy.selectAgent(agents, { taskId: 'test' });
        expect(selected).toBeDefined();
      }
    });

    it('should support all use cases', () => {
      const useCases = [
        'session-affinity',
        'caching',
        'cost-optimization',
        'speed',
        'reliability',
        'fair',
        'load-aware',
        'long-running',
      ];
      
      for (const useCase of useCases) {
        const strategy = StrategyFactory.forUseCase(useCase);
        expect(strategy).toBeDefined();
        
        // Verify strategy works
        const agents = createTestAgents();
        const selected = strategy.selectAgent(agents, { taskId: 'test' });
        expect(selected).toBeDefined();
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle single agent pool', () => {
      const singleAgent: Agent[] = [{ id: 'solo', capabilities: {} }];
      
      const strategies = [
        new RoundRobinStrategy(),
        new LeastConnectionsStrategy(),
        new WeightedStrategy(),
        new ConsistentHashStrategy(150),
      ];
      
      for (const strategy of strategies) {
        const selected = strategy.selectAgent(singleAgent, { taskId: 'test' });
        expect(selected.id).toBe('solo');
      }
    });

    it('should handle rapid agent changes', () => {
      const strategy = new ConsistentHashStrategy(50);
      
      // Rapidly add and remove agents
      for (let i = 0; i < 10; i++) {
        strategy.addAgent({ id: `agent-${i}`, capabilities: {} });
        strategy.removeAgent(`agent-${i}`);
      }
      
      // Ring should be empty
      expect(strategy.getRingStats().uniqueAgents).toBe(0);
    });

    it('should maintain consistency under concurrent-like usage', () => {
      const strategy = new LeastConnectionsStrategy();
      const agents = createTestAgents();
      
      // Simulate rapid selections
      for (let i = 0; i < 100; i++) {
        strategy.selectAgent(agents);
      }
      
      // Total active connections should equal selections (none completed)
      const stats = strategy.getStats() as { agentStats: Record<string, { active: number }> };
      const totalActive = Object.values(stats.agentStats)
        .reduce((sum, s) => sum + s.active, 0);
      expect(totalActive).toBe(100);
      
      // Now complete all
      for (const agent of agents) {
        for (let i = 0; i < 100; i++) {
          strategy.updateStats(agent.id, {
            duration: 100,
            success: true,
            cost: 0.01,
          });
        }
      }
      
      // All should be completed
      const finalStats = strategy.getStats() as { agentStats: Record<string, { active: number }> };
      const finalActive = Object.values(finalStats.agentStats)
        .reduce((sum, s) => sum + s.active, 0);
      expect(finalActive).toBe(0);
    });
  });
});

// ============================================================================
// VERIFICATION SCRIPT
// ============================================================================

/**
 * This section provides a runnable verification that can be executed
 * to demonstrate all strategies working correctly.
 */
describe('Verification Script', () => {
  it('should pass the verification example from spec', () => {
    const strategies = [
      new RoundRobinStrategy(),
      new LeastConnectionsStrategy(),
      new WeightedStrategy({ cost: 0.5, speed: 0.3, reliability: 0.2 }),
      new ConsistentHashStrategy(150),
    ];

    const agents = [
      { id: 'A', capabilities: { costPerHour: 2 } },
      { id: 'B', capabilities: { costPerHour: 3 } },
    ];

    const results: string[] = [];
    
    strategies.forEach(strategy => {
      const agent = strategy.selectAgent(agents, { taskId: 'test-123' });
      results.push(`${strategy.name} selected: ${agent.id}`);
    });

    // Log results for debugging
    console.log('\n--- Verification Results ---');
    results.forEach(r => console.log(r));

    // Verify all strategies produced valid selections
    expect(results).toHaveLength(4);
    results.forEach(result => {
      expect(result).toMatch(/selected: (A|B)/);
    });
  });
});
