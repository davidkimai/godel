/**
 * Round-Robin Strategy Tests
 * 
 * Tests for RoundRobinStrategy and WeightedRoundRobinStrategy
 */

import { 
  RoundRobinStrategy,
  WeightedRoundRobinStrategy 
} from '../../../src/federation/strategies/round-robin';
import type { Agent } from '../../../src/federation/strategies/types';

describe('RoundRobinStrategy', () => {
  let strategy: RoundRobinStrategy;
  
  const createAgents = (count: number): Agent[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}`,
      capabilities: {},
    }));
  };

  beforeEach(() => {
    strategy = new RoundRobinStrategy();
  });

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should select the only agent when one available', () => {
      const agents = createAgents(1);
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-1');
    });

    it('should cycle through agents in order', () => {
      const agents = createAgents(3);
      
      const selections = [
        strategy.selectAgent(agents).id,
        strategy.selectAgent(agents).id,
        strategy.selectAgent(agents).id,
        strategy.selectAgent(agents).id,
      ];
      
      expect(selections).toEqual(['agent-1', 'agent-2', 'agent-3', 'agent-1']);
    });

    it('should distribute evenly across many selections', () => {
      const agents = createAgents(3);
      const counts: Record<string, number> = {};
      
      // Make 300 selections
      for (let i = 0; i < 300; i++) {
        const agent = strategy.selectAgent(agents);
        counts[agent.id] = (counts[agent.id] || 0) + 1;
      }
      
      // Each agent should get exactly 100 selections
      expect(counts['agent-1']).toBe(100);
      expect(counts['agent-2']).toBe(100);
      expect(counts['agent-3']).toBe(100);
    });

    it('should handle agents with missing IDs gracefully', () => {
      const agents = [
        { id: 'agent-1', capabilities: {} },
        { id: '', capabilities: {} }, // Invalid
        { id: 'agent-3', capabilities: {} },
      ] as Agent[];
      
      // Should filter out invalid agent
      const selections = [
        strategy.selectAgent(agents).id,
        strategy.selectAgent(agents).id,
      ];
      
      expect(selections).toContain('agent-1');
      expect(selections).toContain('agent-3');
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
    it('should reset selection state', () => {
      const agents = createAgents(3);
      
      // Make some selections
      strategy.selectAgent(agents);
      strategy.selectAgent(agents);
      
      // Reset
      strategy.reset();
      
      // Should start from beginning again
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-1');
    });
  });

  describe('getStats', () => {
    it('should return correct stats', () => {
      const agents = createAgents(3);
      
      strategy.selectAgent(agents);
      strategy.selectAgent(agents);
      
      const stats = strategy.getStats();
      
      expect(stats.name).toBe('round-robin');
      expect(stats.selectionCount).toBe(2);
      expect(stats.currentIndex).toBe(2);
    });
  });
});

describe('WeightedRoundRobinStrategy', () => {
  let strategy: WeightedRoundRobinStrategy;

  beforeEach(() => {
    strategy = new WeightedRoundRobinStrategy();
  });

  const createWeightedAgents = (): Agent[] => [
    { id: 'light', capabilities: { maxConnections: 1 } },
    { id: 'medium', capabilities: { maxConnections: 2 } },
    { id: 'heavy', capabilities: { maxConnections: 3 } },
  ];

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should distribute according to weights', () => {
      const agents = createWeightedAgents();
      const counts: Record<string, number> = {};
      
      // Total weight = 1 + 2 + 3 = 6
      // Make selections
      for (let i = 0; i < 600; i++) {
        const agent = strategy.selectAgent(agents);
        counts[agent.id] = (counts[agent.id] || 0) + 1;
      }
      
      // Expect proportional distribution
      // light: 1/6, medium: 2/6, heavy: 3/6
      expect(counts['light']).toBe(100);
      expect(counts['medium']).toBe(200);
      expect(counts['heavy']).toBe(300);
    });

    it('should use default weight when maxConnections not specified', () => {
      const agents = [
        { id: 'agent-1', capabilities: {} },
        { id: 'agent-2', capabilities: {} },
      ];
      
      const counts: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        const agent = strategy.selectAgent(agents);
        counts[agent.id] = (counts[agent.id] || 0) + 1;
      }
      
      // Should be roughly equal with default weight of 1
      expect(Math.abs(counts['agent-1'] - counts['agent-2'])).toBeLessThanOrEqual(2);
    });

    it('should handle custom default weight', () => {
      strategy = new WeightedRoundRobinStrategy(2);
      
      const agents = [
        { id: 'agent-1', capabilities: {} }, // weight 2 (default)
        { id: 'agent-2', capabilities: { maxConnections: 1 } }, // weight 1
      ];
      
      const counts: Record<string, number> = {};
      for (let i = 0; i < 300; i++) {
        const agent = strategy.selectAgent(agents);
        counts[agent.id] = (counts[agent.id] || 0) + 1;
      }
      
      // Expect 2:1 ratio
      expect(counts['agent-1']).toBe(200);
      expect(counts['agent-2']).toBe(100);
    });
  });

  describe('reset', () => {
    it('should reset weighted pool', () => {
      const agents = createWeightedAgents();
      
      strategy.selectAgent(agents);
      strategy.reset();
      
      const stats = strategy.getStats();
      expect(stats.poolSize).toBe(0);
      expect(stats.selectionCount).toBe(0);
    });
  });
});
