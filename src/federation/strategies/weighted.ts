/**
 * Weighted Load Balancing Strategy
 * 
 * Routes requests based on weighted scoring of multiple factors:
 * - Cost efficiency
 * - Execution speed
 * - Reliability/success rate
 * 
 * Use case: When you need to optimize for specific business metrics
 * like cost, performance, or reliability.
 * 
 * @module federation/strategies/weighted
 */

import type { 
  LoadBalancingStrategy, 
  Agent, 
  SelectionContext, 
  ExecutionStats,
  WeightConfig,
  AgentStats
} from './types';

/**
 * Default weight configuration
 * Balanced across all factors
 */
export const DEFAULT_WEIGHTS: WeightConfig = {
  cost: 0.33,
  speed: 0.33,
  reliability: 0.34,
};

/**
 * Cost-optimized weight configuration
 * Prioritizes low cost
 */
export const COST_OPTIMIZED_WEIGHTS: WeightConfig = {
  cost: 0.6,
  speed: 0.2,
  reliability: 0.2,
};

/**
 * Speed-optimized weight configuration
 * Prioritizes fast execution
 */
export const SPEED_OPTIMIZED_WEIGHTS: WeightConfig = {
  cost: 0.2,
  speed: 0.6,
  reliability: 0.2,
};

/**
 * Reliability-optimized weight configuration
 * Prioritizes high success rate
 */
export const RELIABILITY_OPTIMIZED_WEIGHTS: WeightConfig = {
  cost: 0.2,
  speed: 0.2,
  reliability: 0.6,
};

/**
 * Weighted strategy implementation
 * Scores agents based on configurable weights
 */
export class WeightedStrategy implements LoadBalancingStrategy {
  readonly name: string = 'weighted';
  
  /** Agent statistics map */
  private stats: Map<string, AgentStats> = new Map();
  
  /** Weight configuration */
  private weights: WeightConfig;
  
  /** Selection count per agent */
  private selectionCounts: Map<string, number> = new Map();
  
  /** Total selections made */
  private totalSelections = 0;

  constructor(weights?: Partial<WeightConfig>) {
    // Start with defaults
    const merged: WeightConfig = {
      ...DEFAULT_WEIGHTS,
      ...weights,
    };
    
    // Normalize weights to sum to 1 only if custom weights were provided
    if (weights && (weights.cost !== undefined || weights.speed !== undefined || weights.reliability !== undefined)) {
      const total = merged.cost + merged.speed + merged.reliability;
      if (total !== 1 && total > 0) {
        this.weights = {
          cost: merged.cost / total,
          speed: merged.speed / total,
          reliability: merged.reliability / total,
        };
      } else {
        this.weights = merged;
      }
    } else {
      this.weights = merged;
    }
  }

  /**
   * Select agent based on weighted scoring
   * Higher score = better agent
   * 
   * @param agents - Available agents
   * @param context - Optional selection context
   * @returns Best scoring agent
   * @throws Error if no agents available
   */
  selectAgent(agents: Agent[], context?: SelectionContext): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    if (agents.length === 1) {
      this.trackSelection(agents[0].id);
      return agents[0];
    }
    
    // Score all agents
    const scored = agents.map(agent => ({
      agent,
      score: this.calculateScore(agent, context),
    }));
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Select highest scoring agent
    const selected = scored[0].agent;
    this.trackSelection(selected.id);
    
    return selected;
  }

  /**
   * Calculate weighted score for an agent
   * Score range: 0-1 (higher is better)
   */
  private calculateScore(agent: Agent, context?: SelectionContext): number {
    const agentStats = this.stats.get(agent.id);
    
    // Cost score: inverse of cost (lower cost = higher score)
    // Normalize cost: assume max cost is 10
    const maxCost = 10;
    const costPerHour = agent.capabilities?.costPerHour ?? 5;
    const costScore = 1 - (costPerHour / maxCost);
    
    // Speed score: based on average execution speed
    // Higher avgSpeed = faster execution = higher score
    const speedScore = agentStats 
      ? Math.min(agentStats.avgSpeed / 10, 1)
      : 0.5; // Neutral for new agents
    
    // Reliability score: success rate
    const reliabilityScore = agentStats?.successRate ?? 0.5; // Neutral for new agents
    
    // Context adjustments
    let adjustedWeights = { ...this.weights };
    
    if (context?.taskComplexity === 'high') {
      // For complex tasks, prioritize reliability
      adjustedWeights = {
        cost: adjustedWeights.cost * 0.8,
        speed: adjustedWeights.speed * 0.8,
        reliability: adjustedWeights.reliability * 1.4,
      };
    } else if (context?.taskComplexity === 'low') {
      // For simple tasks, prioritize cost
      adjustedWeights = {
        cost: adjustedWeights.cost * 1.3,
        speed: adjustedWeights.speed * 0.9,
        reliability: adjustedWeights.reliability * 0.8,
      };
    }
    
    // Calculate weighted score
    const score = 
      costScore * adjustedWeights.cost +
      speedScore * adjustedWeights.speed +
      reliabilityScore * adjustedWeights.reliability;
    
    return Math.max(0, Math.min(1, score));
  }

  /**
   * Track a selection for statistics
   */
  private trackSelection(agentId: string): void {
    const count = this.selectionCounts.get(agentId) || 0;
    this.selectionCounts.set(agentId, count + 1);
    this.totalSelections++;
  }

  /**
   * Update agent statistics with execution result
   * Uses rolling averages for speed and success rate
   */
  updateStats(agentId: string, execution: ExecutionStats): void {
    const current = this.stats.get(agentId) || {
      totalExecutions: 0,
      successfulExecutions: 0,
      avgSpeed: 0,
      successRate: 0.5,
    };
    
    current.totalExecutions++;
    
    if (execution.success) {
      current.successfulExecutions++;
    }
    
    // Update rolling average speed (tasks per second)
    // Speed = 1 / duration (in seconds)
    const executionSpeed = execution.duration > 0 
      ? 1000 / execution.duration 
      : 0;
    
    // Rolling average: new_avg = (old_avg * (n-1) + new_value) / n
    const n = current.totalExecutions;
    current.avgSpeed = (current.avgSpeed * (n - 1) + executionSpeed) / n;
    
    // Update success rate
    current.successRate = current.successfulExecutions / current.totalExecutions;
    
    this.stats.set(agentId, current);
  }

  /**
   * Get agent statistics
   * @param agentId - Agent ID
   * @returns Agent stats or undefined if not found
   */
  getAgentStats(agentId: string): AgentStats | undefined {
    return this.stats.get(agentId);
  }

  /**
   * Get all agent statistics
   */
  getAllStats(): Map<string, AgentStats> {
    return new Map(this.stats);
  }

  /**
   * Update weight configuration
   * @param weights - New weight configuration
   */
  setWeights(weights: Partial<WeightConfig>): void {
    const merged: WeightConfig = {
      ...this.weights,
      ...weights,
    };
    
    // Normalize weights to sum to 1
    const total = merged.cost + merged.speed + merged.reliability;
    if (total > 0) {
      this.weights = {
        cost: merged.cost / total,
        speed: merged.speed / total,
        reliability: merged.reliability / total,
      };
    }
  }

  /**
   * Get current weights
   */
  getWeights(): WeightConfig {
    return { ...this.weights };
  }

  /**
   * Reset strategy state
   */
  reset(): void {
    this.stats.clear();
    this.selectionCounts.clear();
    this.totalSelections = 0;
  }

  /**
   * Get strategy statistics
   */
  getStats(): Record<string, unknown> {
    const agentStats: Record<string, AgentStats & { selections: number }> = {};
    
    for (const [agentId, stats] of this.stats) {
      agentStats[agentId] = {
        ...stats,
        selections: this.selectionCounts.get(agentId) || 0,
      };
    }
    
    return {
      name: this.name,
      weights: this.weights,
      totalSelections: this.totalSelections,
      agentStats,
    };
  }
}

/**
 * Priority-based weighted strategy
 * Considers task priority in selection
 */
export class PriorityWeightedStrategy extends WeightedStrategy {
  readonly name = 'priority-weighted' as const;

  /**
   * Select agent with priority-based adjustments
   */
  selectAgent(agents: Agent[], context?: SelectionContext): Agent {
    if (!context?.priority || agents.length <= 1) {
      return super.selectAgent(agents, context);
    }
    
    // For high priority tasks, favor agents with better reliability
    // by temporarily adjusting weights
    if (context.priority >= 8) {
      const originalWeights = this.getWeights();
      this.setWeights({
        cost: 0.1,
        speed: 0.3,
        reliability: 0.6,
      });
      
      const selected = super.selectAgent(agents, context);
      
      // Restore original weights
      this.setWeights(originalWeights);
      return selected;
    }
    
    return super.selectAgent(agents, context);
  }
}
