/**
 * Round-Robin Load Balancing Strategy
 * 
 * Distributes requests evenly across agents in a cyclic manner.
 * Simple and fair distribution without considering agent load.
 * 
 * Use case: When all agents have similar capacity and you want
 * uniform distribution without complex heuristics.
 * 
 * @module federation/strategies/round-robin
 */

import type { 
  LoadBalancingStrategy, 
  Agent, 
  SelectionContext, 
  ExecutionStats 
} from './types';

/**
 * Round-robin strategy implementation
 * Cycles through agents sequentially
 */
export class RoundRobinStrategy implements LoadBalancingStrategy {
  readonly name = 'round-robin';
  
  /** Current index in the agent pool */
  private currentIndex = 0;
  
  /** Total selections made */
  private selectionCount = 0;

  /**
   * Select next agent using round-robin algorithm
   * @param agents - Available agents
   * @returns Selected agent
   * @throws Error if no agents available
   */
  selectAgent(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    // Filter out any invalid agents
    const validAgents = agents.filter(agent => agent && agent.id);
    if (validAgents.length === 0) {
      throw new Error('No valid agents available');
    }
    
    // Select agent using modulo for cyclic distribution
    const index = this.currentIndex % validAgents.length;
    const agent = validAgents[index];
    
    // Advance to next position
    this.currentIndex = (this.currentIndex + 1) % validAgents.length;
    this.selectionCount++;
    
    return agent;
  }

  /**
   * No-op for round-robin (doesn't use stats)
   */
  updateStats(): void {
    // Round-robin doesn't track execution statistics
  }

  /**
   * Reset strategy state
   */
  reset(): void {
    this.currentIndex = 0;
    this.selectionCount = 0;
  }

  /**
   * Get strategy statistics
   */
  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      selectionCount: this.selectionCount,
      currentIndex: this.currentIndex,
    };
  }
}

/**
 * Weighted round-robin strategy
 * Distributes requests according to agent weights
 */
export class WeightedRoundRobinStrategy implements LoadBalancingStrategy {
  readonly name = 'weighted-round-robin';
  
  /** Current index in the weighted pool */
  private currentIndex = 0;
  
  /** Total selections made */
  private selectionCount = 0;
  
  /** Expanded pool with weights applied */
  private weightedPool: Agent[] = [];

  constructor(private defaultWeight = 1) {}

  /**
   * Build weighted pool from agents
   * Expands agents into the pool according to their weights
   */
  private buildWeightedPool(agents: Agent[]): Agent[] {
    const pool: Agent[] = [];
    
    for (const agent of agents) {
      const weight = agent.capabilities?.maxConnections || this.defaultWeight;
      // Add agent to pool 'weight' number of times
      for (let i = 0; i < weight; i++) {
        pool.push(agent);
      }
    }
    
    return pool;
  }

  /**
   * Select agent using weighted round-robin
   */
  selectAgent(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    // Rebuild pool if agents changed
    this.weightedPool = this.buildWeightedPool(agents);
    
    if (this.weightedPool.length === 0) {
      throw new Error('No weighted agents available');
    }
    
    const index = this.currentIndex % this.weightedPool.length;
    const agent = this.weightedPool[index];
    
    this.currentIndex = (this.currentIndex + 1) % this.weightedPool.length;
    this.selectionCount++;
    
    return agent;
  }

  updateStats(): void {
    // Weighted round-robin doesn't track execution statistics
  }

  reset(): void {
    this.currentIndex = 0;
    this.selectionCount = 0;
    this.weightedPool = [];
  }

  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      selectionCount: this.selectionCount,
      currentIndex: this.currentIndex,
      poolSize: this.weightedPool.length,
    };
  }
}
