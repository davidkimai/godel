/**
 * Least-Connections Strategy Tests
 * 
 * Tests for LeastConnectionsStrategy and LeastLoadedStrategy
 */

import { 
  LeastConnectionsStrategy,
  LeastLoadedStrategy 
} from '../../../src/federation/strategies/least-connections';
import type { Agent } from '../../../src/federation/strategies/types';

describe('LeastConnectionsStrategy', () => {
  let strategy: LeastConnectionsStrategy;
  
  const createAgents = (count: number): Agent[] => {
    return Array.from({ length: count }, (_, i) => ({
      id: `agent-${i + 1}`,
      capabilities: {},
    }));
  };

  beforeEach(() => {
    strategy = new LeastConnectionsStrategy();
  });

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should return the only agent when one available', () => {
      const agents = createAgents(1);
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-1');
    });

    it('should select agent with least connections', () => {
      const agents = createAgents(3);
      
      // Pre-populate connection counts
      strategy['connectionCounts'].set('agent-1', 5);
      strategy['connectionCounts'].set('agent-2', 2);
      strategy['connectionCounts'].set('agent-3', 8);
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-2'); // Has fewest connections
    });

    it('should use total connections as tiebreaker', () => {
      const agents = createAgents(3);
      
      // All have same active connections
      strategy['connectionCounts'].set('agent-1', 2);
      strategy['connectionCounts'].set('agent-2', 2);
      strategy['connectionCounts'].set('agent-3', 2);
      
      // But different totals
      strategy['totalConnections'].set('agent-1', 100);
      strategy['totalConnections'].set('agent-2', 50); // Fewer total
      strategy['totalConnections'].set('agent-3', 100);
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-2');
    });

    it('should increment connection count on selection', () => {
      const agents = createAgents(2);
      
      strategy.selectAgent(agents);
      
      expect(strategy.getConnectionCount('agent-1')).toBe(1);
    });
  });

  describe('incrementConnections', () => {
    it('should increment connection count', () => {
      strategy.incrementConnections('agent-1');
      strategy.incrementConnections('agent-1');
      
      expect(strategy.getConnectionCount('agent-1')).toBe(2);
    });
  });

  describe('decrementConnections', () => {
    it('should decrement connection count', () => {
      strategy.incrementConnections('agent-1');
      strategy.incrementConnections('agent-1');
      
      strategy.decrementConnections('agent-1');
      
      expect(strategy.getConnectionCount('agent-1')).toBe(1);
    });

    it('should not go below zero', () => {
      strategy.decrementConnections('agent-1');
      
      expect(strategy.getConnectionCount('agent-1')).toBe(0);
    });
  });

  describe('updateStats', () => {
    it('should decrement connections on completion', () => {
      strategy.incrementConnections('agent-1');
      expect(strategy.getConnectionCount('agent-1')).toBe(1);
      
      strategy.updateStats('agent-1', {
        duration: 100,
        success: true,
        cost: 0.01,
      });
      
      expect(strategy.getConnectionCount('agent-1')).toBe(0);
    });

    it('should apply penalty for failed tasks', () => {
      strategy.incrementConnections('agent-1');
      expect(strategy.getConnectionCount('agent-1')).toBe(1);
      
      strategy.updateStats('agent-1', {
        duration: 100,
        success: false,
        cost: 0.01,
      });
      
      // Should have penalty of 0.5
      expect(strategy.getConnectionCount('agent-1')).toBe(0.5);
    });

    it('should clear penalty on successful task', () => {
      // First fail to add penalty
      strategy.incrementConnections('agent-1');
      strategy.updateStats('agent-1', {
        duration: 100,
        success: false,
        cost: 0.01,
      });
      expect(strategy.getConnectionCount('agent-1')).toBe(0.5);
      
      // Then succeed
      strategy.incrementConnections('agent-1');
      strategy.updateStats('agent-1', {
        duration: 100,
        success: true,
        cost: 0.01,
      });
      
      // Should clear to integer
      expect(strategy.getConnectionCount('agent-1')).toBe(0);
    });
  });

  describe('getTotalConnections', () => {
    it('should track total connections', () => {
      const agents = createAgents(2);
      
      strategy.selectAgent(agents);
      strategy.selectAgent(agents);
      strategy.selectAgent(agents);
      
      expect(strategy.getTotalConnections('agent-1')).toBe(2);
      expect(strategy.getTotalConnections('agent-2')).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      const agents = createAgents(2);
      
      strategy.selectAgent(agents);
      strategy.updateStats('agent-1', { duration: 100, success: true, cost: 0.01 });
      
      strategy.reset();
      
      expect(strategy.getConnectionCount('agent-1')).toBe(0);
      expect(strategy.getTotalConnections('agent-1')).toBe(0);
      expect(strategy.getStats().selectionCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return complete stats', () => {
      const agents = createAgents(2);
      
      strategy.selectAgent(agents);
      strategy.selectAgent(agents);
      
      const stats = strategy.getStats();
      
      expect(stats.name).toBe('least-connections');
      expect(stats.selectionCount).toBe(2);
      expect(stats.activeAgents).toBe(2);
      expect(stats.agentStats).toHaveProperty('agent-1');
      expect(stats.agentStats).toHaveProperty('agent-2');
    });
  });
});

describe('LeastLoadedStrategy', () => {
  let strategy: LeastLoadedStrategy;

  beforeEach(() => {
    strategy = new LeastLoadedStrategy();
  });

  const createAgents = (loads: number[]): Agent[] => {
    return loads.map((load, i) => ({
      id: `agent-${i + 1}`,
      capabilities: { currentLoad: load },
    }));
  };

  describe('selectAgent', () => {
    it('should throw error when no agents available', () => {
      expect(() => strategy.selectAgent([])).toThrow('No agents available');
    });

    it('should select agent with lowest load', () => {
      const agents = createAgents([0.8, 0.3, 0.9]);
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-2'); // 0.3 load
    });

    it('should use capability load when not tracked', () => {
      const agents = [
        { id: 'agent-1', capabilities: { currentLoad: 0.9 } },
        { id: 'agent-2', capabilities: { currentLoad: 0.2 } },
      ];
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-2');
    });

    it('should prefer tracked load over capability', () => {
      const agents = [
        { id: 'agent-1', capabilities: { currentLoad: 0.1 } },
        { id: 'agent-2', capabilities: { currentLoad: 0.9 } },
      ];
      
      // Set tracked load that contradicts capability
      strategy.setAgentLoad('agent-1', 0.9);
      strategy.setAgentLoad('agent-2', 0.1);
      
      const selected = strategy.selectAgent(agents);
      expect(selected.id).toBe('agent-2');
    });
  });

  describe('setAgentLoad', () => {
    it('should set agent load', () => {
      strategy.setAgentLoad('agent-1', 0.5);
      expect(strategy.getAgentLoad('agent-1')).toBe(0.5);
    });

    it('should clamp load to 0-1 range', () => {
      strategy.setAgentLoad('agent-1', -0.5);
      expect(strategy.getAgentLoad('agent-1')).toBe(0);
      
      strategy.setAgentLoad('agent-1', 1.5);
      expect(strategy.getAgentLoad('agent-1')).toBe(1);
    });
  });

  describe('updateStats', () => {
    it('should update load based on duration', () => {
      strategy.updateStats('agent-1', {
        duration: 500, // 0.5 seconds
        success: true,
        cost: 0.01,
      });
      
      expect(strategy.getAgentLoad('agent-1')).toBe(0.5);
    });

    it('should cap load at 1', () => {
      strategy.updateStats('agent-1', {
        duration: 2000, // 2 seconds
        success: true,
        cost: 0.01,
      });
      
      expect(strategy.getAgentLoad('agent-1')).toBe(1);
    });

    it('should apply higher load for failed tasks', () => {
      strategy.updateStats('agent-1', {
        duration: 500,
        success: false,
        cost: 0.01,
      });
      
      // 0.5 * 1.5 = 0.75
      expect(strategy.getAgentLoad('agent-1')).toBe(0.75);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      strategy.setAgentLoad('agent-1', 0.5);
      
      strategy.reset();
      
      expect(strategy.getAgentLoad('agent-1')).toBe(0);
    });
  });
});
