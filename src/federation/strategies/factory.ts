/**
 * Strategy Factory - Godel Federation Engine
 * 
 * Factory for creating load balancing strategy instances.
 * Provides centralized strategy creation and configuration.
 * 
 * @module federation/strategies/factory
 */

import type { 
  LoadBalancingStrategy, 
  StrategyType, 
  WeightConfig 
} from './types';

import { 
  RoundRobinStrategy, 
  WeightedRoundRobinStrategy 
} from './round-robin';

import { 
  LeastConnectionsStrategy, 
  LeastLoadedStrategy 
} from './least-connections';

import { 
  WeightedStrategy, 
  PriorityWeightedStrategy,
  DEFAULT_WEIGHTS,
  COST_OPTIMIZED_WEIGHTS,
  SPEED_OPTIMIZED_WEIGHTS,
  RELIABILITY_OPTIMIZED_WEIGHTS,
} from './weighted';

import { 
  ConsistentHashStrategy, 
  RendezvousHashStrategy 
} from './consistent-hash';

/**
 * Strategy creation options
 */
export interface StrategyOptions {
  /** Weight configuration for weighted strategies */
  weights?: WeightConfig;
  
  /** Number of virtual nodes for consistent hashing */
  virtualNodes?: number;
  
  /** Default weight for weighted round-robin */
  defaultWeight?: number;
}

/**
 * Predefined strategy presets for common use cases
 */
export const STRATEGY_PRESETS = {
  /** Balanced optimization across all factors */
  balanced: {
    type: 'weighted' as const,
    weights: DEFAULT_WEIGHTS,
  },
  
  /** Cost-optimized for budget-conscious workloads */
  costOptimized: {
    type: 'weighted' as const,
    weights: COST_OPTIMIZED_WEIGHTS,
  },
  
  /** Speed-optimized for latency-sensitive workloads */
  speedOptimized: {
    type: 'weighted' as const,
    weights: SPEED_OPTIMIZED_WEIGHTS,
  },
  
  /** Reliability-optimized for critical workloads */
  reliabilityOptimized: {
    type: 'weighted' as const,
    weights: RELIABILITY_OPTIMIZED_WEIGHTS,
  },
  
  /** Session affinity for stateful workloads */
  sessionAffinity: {
    type: 'consistent-hash' as const,
    virtualNodes: 150,
  },
  
  /** Simple fair distribution */
  roundRobin: {
    type: 'round-robin' as const,
  },
  
  /** Load-aware distribution */
  leastConnections: {
    type: 'least-connections' as const,
  },
} as const;

/**
 * Factory class for creating load balancing strategies
 */
export class StrategyFactory {
  /**
   * Create a strategy instance by type
   * 
   * @param strategy - Strategy type identifier
   * @param options - Strategy configuration options
   * @returns Strategy instance
   * @throws Error if strategy type is unknown
   * 
   * @example
   * ```typescript
   * const strategy = StrategyFactory.create('weighted', {
   *   weights: { cost: 0.5, speed: 0.3, reliability: 0.2 }
   * });
   * ```
   */
  static create(strategy: StrategyType, options: StrategyOptions = {}): LoadBalancingStrategy {
    switch (strategy) {
      case 'round-robin':
        return new RoundRobinStrategy();
        
      case 'least-connections':
        return new LeastConnectionsStrategy();
        
      case 'least-loaded':
        return new LeastLoadedStrategy();
        
      case 'weighted':
        return new WeightedStrategy(options.weights);
        
      case 'consistent-hash':
        return new ConsistentHashStrategy(options.virtualNodes ?? 150);
        
      case 'random':
        return new RandomStrategy();
        
      default:
        throw new Error(`Unknown strategy type: ${strategy}. ` +
          `Available: round-robin, least-connections, least-loaded, weighted, consistent-hash, random`);
    }
  }

  /**
   * Create a strategy from a preset configuration
   * 
   * @param preset - Preset name from STRATEGY_PRESETS
   * @returns Strategy instance
   * 
   * @example
   * ```typescript
   * const strategy = StrategyFactory.fromPreset('costOptimized');
   * ```
   */
  static fromPreset(
    preset: keyof typeof STRATEGY_PRESETS
  ): LoadBalancingStrategy {
    const config = STRATEGY_PRESETS[preset];
    return this.create(config.type, config as StrategyOptions);
  }

  /**
   * Create a strategy optimized for specific use case
   * 
   * @param useCase - Use case identifier
   * @returns Strategy instance
   * 
   * @example
   * ```typescript
   * const strategy = StrategyFactory.forUseCase('session-affinity');
   * ```
   */
  static forUseCase(useCase: string): LoadBalancingStrategy {
    switch (useCase.toLowerCase()) {
      case 'session-affinity':
      case 'sticky-session':
      case 'caching':
        return new ConsistentHashStrategy(200); // More virtual nodes for better distribution
        
      case 'cost-optimization':
      case 'budget':
        return new WeightedStrategy(COST_OPTIMIZED_WEIGHTS);
        
      case 'speed':
      case 'latency':
      case 'performance':
        return new WeightedStrategy(SPEED_OPTIMIZED_WEIGHTS);
        
      case 'reliability':
      case 'critical':
      case 'high-availability':
        return new WeightedStrategy(RELIABILITY_OPTIMIZED_WEIGHTS);
        
      case 'fair':
      case 'balanced':
        return new RoundRobinStrategy();
        
      case 'load-aware':
      case 'adaptive':
        return new LeastConnectionsStrategy();
        
      case 'long-running':
      case 'streaming':
        return new LeastConnectionsStrategy(); // Best for long connections
        
      default:
        // Default to weighted with balanced weights
        return new WeightedStrategy(DEFAULT_WEIGHTS);
    }
  }

  /**
   * Get all available strategy types
   * @returns Array of strategy type identifiers
   */
  static getAvailableStrategies(): StrategyType[] {
    return [
      'round-robin',
      'least-connections',
      'least-loaded',
      'weighted',
      'consistent-hash',
      'random',
    ];
  }

  /**
   * Get available presets
   * @returns Array of preset names
   */
  static getAvailablePresets(): string[] {
    return Object.keys(STRATEGY_PRESETS);
  }

  /**
   * Validate strategy configuration
   * @param strategy - Strategy type
   * @param options - Strategy options
   * @returns Validation result
   */
  static validateConfig(
    strategy: StrategyType,
    options: StrategyOptions
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check strategy type
    const available = this.getAvailableStrategies();
    if (!available.includes(strategy)) {
      errors.push(`Unknown strategy: ${strategy}. Available: ${available.join(', ')}`);
    }

    // Validate weights
    if (options.weights) {
      const { cost, speed, reliability } = options.weights;
      
      if (cost !== undefined && (cost < 0 || cost > 1)) {
        errors.push('Weight "cost" must be between 0 and 1');
      }
      if (speed !== undefined && (speed < 0 || speed > 1)) {
        errors.push('Weight "speed" must be between 0 and 1');
      }
      if (reliability !== undefined && (reliability < 0 || reliability > 1)) {
        errors.push('Weight "reliability" must be between 0 and 1');
      }
      
      const total = (cost ?? 0) + (speed ?? 0) + (reliability ?? 0);
      if (total > 0 && Math.abs(total - 1) > 0.001) {
        errors.push(`Weights should sum to 1, got ${total}`);
      }
    }

    // Validate virtual nodes
    if (options.virtualNodes !== undefined) {
      if (options.virtualNodes < 1) {
        errors.push('virtualNodes must be at least 1');
      }
      if (options.virtualNodes > 1000) {
        errors.push('virtualNodes should not exceed 1000');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

/**
 * Random selection strategy
 * Simple random distribution across agents
 */
export class RandomStrategy implements LoadBalancingStrategy {
  readonly name = 'random';
  
  private selectionCounts: Map<string, number> = new Map();
  private totalSelections = 0;

  selectAgent(agents: Agent[]): Agent {
    if (agents.length === 0) {
      throw new Error('No agents available');
    }
    
    const index = Math.floor(Math.random() * agents.length);
    const agent = agents[index];
    
    // Track selection
    const count = this.selectionCounts.get(agent.id) || 0;
    this.selectionCounts.set(agent.id, count + 1);
    this.totalSelections++;
    
    return agent;
  }

  updateStats(): void {
    // Random strategy doesn't use execution stats
  }

  reset(): void {
    this.selectionCounts.clear();
    this.totalSelections = 0;
  }

  getStats(): Record<string, unknown> {
    return {
      name: this.name,
      totalSelections: this.totalSelections,
      selectionCounts: Object.fromEntries(this.selectionCounts),
    };
  }
}

// Import Agent type for RandomStrategy
import type { Agent } from './types';

/**
 * Strategy registry for managing multiple named strategies
 */
export class StrategyRegistry {
  private strategies: Map<string, LoadBalancingStrategy> = new Map();

  /**
   * Register a strategy with a name
   */
  register(name: string, strategy: LoadBalancingStrategy): void {
    this.strategies.set(name, strategy);
  }

  /**
   * Get a registered strategy
   */
  get(name: string): LoadBalancingStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Check if a strategy is registered
   */
  has(name: string): boolean {
    return this.strategies.has(name);
  }

  /**
   * Remove a strategy from registry
   */
  unregister(name: string): boolean {
    return this.strategies.delete(name);
  }

  /**
   * Get all registered strategy names
   */
  getNames(): string[] {
    return Array.from(this.strategies.keys());
  }

  /**
   * Clear all strategies
   */
  clear(): void {
    this.strategies.clear();
  }
}
