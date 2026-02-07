/**
 * Least-Connections Load Balancing Strategy
 * 
 * Routes requests to the agent with the fewest active connections.
 * Best for long-running connections where load varies.
 * 
 * Use case: When agents have varying capacity or connection durations
 * differ significantly.
 * 
 * @module federation/strategies/least-connections
 */

import type { 
  LoadBalancingStrategy, 
  Agent, 
  SelectionContext, 
  ExecutionStats 
} from './types';

/**
 * Least-connections strategy implementation
 * Tracks active connections per agent and routes to least loaded
 */
export class LeastConnectionsStrategy implements LoadBalancingStrategy {
  readonly name = 'least-connections';
  
  /** Map of agent ID to active connection count */
  private connectionCounts: Map<string, number> = new Map();
  
  /** Map of agent ID to total connections handled */
  private totalConnections: Map<string, number> = new Map();
  
  /** Total selections made */
  private selectionCount = 0;

  /**
   * Select agent with lowest active connections
   * If tie, uses agent with lower total connections
   * If still tie, uses first in array
   * 
   * @param agents - Available agents
   * @returns Selected agent with lowest load
   * @throws Error if no agents available
   */
  selectAgent(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    if (agents.length === 1) {
      return agents[0];
    }
    
    // Find agent with minimum connections
    const selected = agents.reduce((min, agent) => {
      const minCount = this.connectionCounts.get(min.id) || 0;
      const agentCount = this.connectionCounts.get(agent.id) || 0;
      
      if (agentCount < minCount) {
        return agent;
      }
      
      // Tie-breaker: use total connections handled
      if (agentCount === minCount) {
        const minTotal = this.totalConnections.get(min.id) || 0;
        const agentTotal = this.totalConnections.get(agent.id) || 0;
        return agentTotal < minTotal ? agent : min;
      }
      
      return min;
    });
    
    // Increment connection count for selected agent
    this.incrementConnections(selected.id);
    this.selectionCount++;
    
    return selected;
  }

  /**
   * Increment active connection count for an agent
   * Call this when a connection/task is assigned
   * @param agentId - Agent ID
   */
  incrementConnections(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    this.connectionCounts.set(agentId, current + 1);
    
    // Also track total
    const total = this.totalConnections.get(agentId) || 0;
    this.totalConnections.set(agentId, total + 1);
  }

  /**
   * Decrement active connection count for an agent
   * Call this when a connection/task completes
   * @param agentId - Agent ID
   */
  decrementConnections(agentId: string): void {
    const current = this.connectionCounts.get(agentId) || 0;
    this.connectionCounts.set(agentId, Math.max(0, current - 1));
  }

  /**
   * Update stats based on execution result
   * Decrements connection count on completion
   */
  updateStats(agentId: string, stats: ExecutionStats): void {
    // Decrement active connections when task completes
    this.decrementConnections(agentId);
    
    // If task failed, we might want to penalize this agent
    // by temporarily increasing its perceived load
    if (!stats.success) {
      const penalty = 0.5; // Small penalty for failed tasks
      const current = this.connectionCounts.get(agentId) || 0;
      this.connectionCounts.set(agentId, current + penalty);
      
      // Remove penalty after a short time (in a real system)
      // For now, we'll clear penalties on next successful task
    } else {
      // Clear any penalty on successful completion
      const current = this.connectionCounts.get(agentId) || 0;
      const integerPart = Math.floor(current);
      this.connectionCounts.set(agentId, integerPart);
    }
  }

  /**
   * Get current connection count for an agent
   * @param agentId - Agent ID
   * @returns Active connection count
   */
  getConnectionCount(agentId: string): number {
    return this.connectionCounts.get(agentId) || 0;
  }

  /**
   * Get total connections handled by agent
   * @param agentId - Agent ID
   * @returns Total connection count
   */
  getTotalConnections(agentId: string): number {
    return this.totalConnections.get(agentId) || 0;
  }

  /**
   * Reset strategy state
   */
  reset(): void {
    this.connectionCounts.clear();
    this.totalConnections.clear();
    this.selectionCount = 0;
  }

  /**
   * Get strategy statistics
   */
  getStats(): Record<string, unknown> {
    const agentStats: Record<string, { active: number; total: number }> = {};
    
    // Combine all known agents
    const allAgentIds = new Set([
      ...this.connectionCounts.keys(),
      ...this.totalConnections.keys(),
    ]);
    
    for (const agentId of allAgentIds) {
      agentStats[agentId] = {
        active: this.connectionCounts.get(agentId) || 0,
        total: this.totalConnections.get(agentId) || 0,
      };
    }
    
    return {
      name: this.name,
      selectionCount: this.selectionCount,
      activeAgents: this.connectionCounts.size,
      agentStats,
    };
  }
}

/**
 * Least-loaded strategy variant
 * Uses agent's reported load percentage instead of connection count
 */
export class LeastLoadedStrategy implements LoadBalancingStrategy {
  readonly name = 'least-loaded';
  
  /** Map of agent ID to current load (0-1) */
  private agentLoads: Map<string, number> = new Map();
  
  /** Selection count per agent */
  private selectionCounts: Map<string, number> = new Map();

  /**
   * Select agent with lowest reported load
   */
  selectAgent(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    // Find agent with minimum load
    const selected = agents.reduce((min, agent) => {
      const minLoad = this.agentLoads.get(min.id) ?? min.capabilities?.currentLoad ?? 0;
      const agentLoad = this.agentLoads.get(agent.id) ?? agent.capabilities?.currentLoad ?? 0;
      
      return agentLoad < minLoad ? agent : min;
    });
    
    // Track selection
    const count = this.selectionCounts.get(selected.id) || 0;
    this.selectionCounts.set(selected.id, count + 1);
    
    return selected;
  }

  /**
   * Update agent load based on execution stats
   * Estimates load from duration relative to typical performance
   */
  updateStats(agentId: string, stats: ExecutionStats): void {
    // Simple load estimation based on execution duration
    // Longer duration = higher load
    const normalizedDuration = Math.min(stats.duration / 1000, 1); // Cap at 1 second
    const successFactor = stats.success ? 1 : 1.5; // Failed tasks indicate higher load
    
    this.agentLoads.set(agentId, normalizedDuration * successFactor);
  }

  /**
   * Manually set agent load
   * @param agentId - Agent ID
   * @param load - Load value (0-1)
   */
  setAgentLoad(agentId: string, load: number): void {
    this.agentLoads.set(agentId, Math.max(0, Math.min(1, load)));
  }

  /**
   * Get agent load
   * @param agentId - Agent ID
   * @returns Load value (0-1)
   */
  getAgentLoad(agentId: string): number {
    return this.agentLoads.get(agentId) || 0;
  }

  reset(): void {
    this.agentLoads.clear();
    this.selectionCounts.clear();
  }

  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      agentLoads: Object.fromEntries(this.agentLoads),
      selectionCounts: Object.fromEntries(this.selectionCounts),
    };
  }
}
