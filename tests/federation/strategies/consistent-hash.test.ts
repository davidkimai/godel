/**
 * Consistent Hashing Strategy Tests
 * 
 * Tests for ConsistentHashStrategy and RendezvousHashStrategy
 */

import { 
  ConsistentHashStrategy,
  RendezvousHashStrategy 
} from '../../../src/federation/strategies/consistent-hash';
import type { Agent, SelectionContext } from '../../../src/federation/strategies/types';

describe('ConsistentHashStrategy', () => {
  let strategy: ConsistentHashStrategy;
  
  const createAgents = (count: number): Agent[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}`,
      capabilities: {},
    }));
  };

  beforeEach(() => {
    strategy = new ConsistentHashStrategy(150);
  });

  describe('constructor', () => {
    it('should use default virtual nodes when not specified', () => {
      const defaultStrategy = new ConsistentHashStrategy();
      expect(defaultStrategy.getVirtualNodes()).toBe(150);
    });

    it('should accept custom virtual node count', () => {
      const custom = new ConsistentHashStrategy(50);
      expect(custom.getVirtualNodes()).toBe(50);
    });
  });

  describe('addAgent', () => {
    it('should add agent to ring', () => {
      const agent: Agent = { id: 'test-agent', capabilities: {} };
      strategy.addAgent(agent);
      
      const stats = strategy.getRingStats();
      expect(stats.uniqueAgents).toBe(1);
      expect(stats.totalNodes).toBe(150);
    });

    it('should handle re-adding same agent', () => {
      const agent: Agent = { id: 'test-agent', capabilities: {} };
      strategy.addAgent(agent);
      strategy.addAgent(agent); // Re-add
      
      const stats = strategy.getRingStats();
      expect(stats.uniqueAgents).toBe(1);
      expect(stats.totalNodes).toBe(150);
    });
  });

  describe('addAgents', () => {
    it('should add multiple agents at once', () => {
      const agents = createAgents(3);
      strategy.addAgents(agents);
      
      const stats = strategy.getRingStats();
      expect(stats.uniqueAgents).toBe(3);
      expect(stats.totalNodes).toBe(450); // 3 * 150
    });

    it('should skip existing agents', () => {
      const agents = createAgents(2);
      strategy.addAgent(agents[0]);
      strategy.addAgents(agents);
      
      const stats = strategy.getRingStats();
      expect(stats.uniqueAgents).toBe(2);
    });
  });

  describe('removeAgent', () => {
    it('should remove agent from ring', () => {
      const agent: Agent = { id: 'test-agent', capabilities: {} };
      strategy.addAgent(agent);
      expect(strategy.getRingStats().uniqueAgents).toBe(1);
      
      strategy.removeAgent('test-agent');
      expect(strategy.getRingStats().uniqueAgents).toBe(0);
    });

    it('should handle removing non-existent agent', () => {
      expect(() => strategy.removeAgent('non-existent')).not.toThrow();
    });
  });

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should throw error when no taskId in context', () => {
      const agents = createAgents(2);
      expect(() => strategy.selectAgent(agents, {})).toThrow('Consistent hash requires taskId in context');
    });

    it('should select same agent for same taskId', () => {
      const agents = createAgents(3);
      const context: SelectionContext = { taskId: 'task-123' };
      
      const selection1 = strategy.selectAgent(agents, context);
      const selection2 = strategy.selectAgent(agents, context);
      const selection3 = strategy.selectAgent(agents, context);
      
      // All selections should be the same agent
      expect(selection1.id).toBe(selection2.id);
      expect(selection2.id).toBe(selection3.id);
    });

    it('should distribute different taskIds across agents', () => {
      const agents = createAgents(3);
      const counts: Record<string, number> = {};
      
      // Hash 100 different task IDs
      for (let i = 0; i < 100; i++) {
        const context: SelectionContext = { taskId: `task-${i}` };
        const selected = strategy.selectAgent(agents, context);
        counts[selected.id] = (counts[selected.id] || 0) + 1;
      }
      
      // All agents should get some tasks (with high probability)
      expect(Object.keys(counts).length).toBeGreaterThanOrEqual(2);
      
      // No agent should get all tasks
      Object.values(counts).forEach(count => {
        expect(count).toBeLessThan(100);
      });
    });

    it('should add new agents to ring automatically', () => {
      const agents = createAgents(2);
      const context: SelectionContext = { taskId: 'task-123' };
      
      strategy.selectAgent(agents, context);
      
      expect(strategy.getRingStats().uniqueAgents).toBe(2);
    });

    it('should remove unavailable agents from ring', () => {
      const agents = createAgents(3);
      const context: SelectionContext = { taskId: 'task-123' };
      
      // First selection with all 3
      strategy.selectAgent(agents, context);
      expect(strategy.getRingStats().uniqueAgents).toBe(3);
      
      // Selection with only 2 (should remove agent-3 from ring)
      const subset = agents.slice(0, 2);
      strategy.selectAgent(subset, context);
      
      expect(strategy.getRingStats().uniqueAgents).toBe(2);
    });
  });

  describe('peekAgent', () => {
    it('should return agent ID without selecting', () => {
      const agents = createAgents(2);
      strategy.addAgents(agents);
      
      const agentId = strategy.peekAgent('task-123');
      expect(['agent-1', 'agent-2']).toContain(agentId);
      
      // Stats should not be updated
      expect(strategy.getStats().totalSelections).toBe(0);
    });

    it('should return undefined when ring is empty', () => {
      expect(strategy.peekAgent('task-123')).toBeUndefined();
    });

    it('should be consistent with selectAgent when agents are pre-added', () => {
      const agents = createAgents(3);
      const taskId = 'task-456';
      
      // Pre-add agents to ensure consistency
      strategy.addAgents(agents);
      
      const peekedId = strategy.peekAgent(taskId);
      const selected = strategy.selectAgent(agents, { taskId });
      
      // Both should return the same agent for same task
      expect(peekedId).toBe(selected.id);
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
    it('should clear all state', () => {
      const agents = createAgents(2);
      strategy.addAgents(agents);
      strategy.selectAgent(agents, { taskId: 'task-123' });
      
      strategy.reset();
      
      expect(strategy.getRingStats().totalNodes).toBe(0);
      expect(strategy.getRingStats().uniqueAgents).toBe(0);
      expect(strategy.getStats().totalSelections).toBe(0);
    });
  });

  describe('getRingStats', () => {
    it('should return correct ring statistics', () => {
      const agents = createAgents(3);
      strategy.addAgents(agents);
      
      const stats = strategy.getRingStats();
      
      expect(stats.totalNodes).toBe(450); // 3 * 150
      expect(stats.uniqueAgents).toBe(3);
      expect(stats.virtualNodesPerAgent).toBe(150);
    });
  });

  describe('getStats', () => {
    it('should return complete stats', () => {
      const agents = createAgents(2);
      strategy.selectAgent(agents, { taskId: 'task-1' });
      strategy.selectAgent(agents, { taskId: 'task-2' });
      
      const stats = strategy.getStats();
      
      expect(stats.name).toBe('consistent-hash');
      expect(stats.virtualNodes).toBe(150);
      expect(stats.totalSelections).toBe(2);
      expect(stats.agentCount).toBe(2);
    });
  });

  describe('hash distribution', () => {
    it('should maintain stability when agents are added', () => {
      const agents = createAgents(2);
      strategy.addAgents(agents);
      
      // Map 100 tasks to agents
      const originalMapping: Record<string, string> = {};
      for (let i = 0; i < 100; i++) {
        const taskId = `task-${i}`;
        originalMapping[taskId] = strategy.peekAgent(taskId)!;
      }
      
      // Add a third agent
      strategy.addAgent({ id: 'agent-3', capabilities: {} });
      
      // Count how many tasks moved
      let movedCount = 0;
      for (let i = 0; i < 100; i++) {
        const taskId = `task-${i}`;
        const newAgent = strategy.peekAgent(taskId);
        if (newAgent !== originalMapping[taskId]) {
          movedCount++;
        }
      }
      
      // With consistent hashing, only ~1/3 of tasks should move
      // (actually fewer due to virtual nodes)
      expect(movedCount).toBeGreaterThan(0);
      expect(movedCount).toBeLessThan(50); // Should be less than half
    });
  });
});

describe('RendezvousHashStrategy', () => {
  let strategy: RendezvousHashStrategy;

  beforeEach(() => {
    strategy = new RendezvousHashStrategy();
  });

  const createAgents = (count: number): Agent[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}`,
      capabilities: {},
    }));
  };

  describe('addAgent', () => {
    it('should add agent to pool', () => {
      const agent: Agent = { id: 'test-agent', capabilities: {} };
      strategy.addAgent(agent);
      
      expect(strategy.getStats().agentCount).toBe(1);
    });
  });

  describe('removeAgent', () => {
    it('should remove agent from pool', () => {
      const agent: Agent = { id: 'test-agent', capabilities: {} };
      strategy.addAgent(agent);
      expect(strategy.getStats().agentCount).toBe(1);
      
      strategy.removeAgent('test-agent');
      expect(strategy.getStats().agentCount).toBe(0);
    });
  });

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should throw error when no taskId in context', () => {
      const agents = createAgents(2);
      expect(() => strategy.selectAgent(agents, {})).toThrow('Rendezvous hash requires taskId in context');
    });

    it('should select same agent for same taskId', () => {
      const agents = createAgents(3);
      const context: SelectionContext = { taskId: 'task-123' };
      
      const selection1 = strategy.selectAgent(agents, context);
      const selection2 = strategy.selectAgent(agents, context);
      
      expect(selection1.id).toBe(selection2.id);
    });

    it('should update internal agent map', () => {
      const agents = createAgents(2);
      strategy.selectAgent(agents, { taskId: 'task-123' });
      
      expect(strategy.getStats().agentCount).toBe(2);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const agents = createAgents(2);
      strategy.selectAgent(agents, { taskId: 'task-123' });
      
      strategy.reset();
      
      expect(strategy.getStats().agentCount).toBe(0);
    });
  });
});
