/**
 * Load Balancing Strategies - Godel Federation Engine
 * 
 * Comprehensive collection of load balancing strategies for distributed
 * agent routing. Supports various algorithms optimized for different
 * use cases and workloads.
 * 
 * @module federation/strategies
 * 
 * @example
 * ```typescript
 * import { 
 *   StrategyFactory,
 *   RoundRobinStrategy,
 *   WeightedStrategy 
 * } from './federation/strategies';
 * 
 * // Create strategy using factory
 * const strategy = StrategyFactory.create('weighted', {
 *   weights: { cost: 0.5, speed: 0.3, reliability: 0.2 }
 * });
 * 
 * // Or use a preset
 * const costOptimized = StrategyFactory.fromPreset('costOptimized');
 * 
 * // Select an agent
 * const agent = strategy.selectAgent(agents, {
 *   taskComplexity: 'high',
 *   priority: 8
 * });
 * ```
 */

// ============================================================================
// TYPES
// ============================================================================

export type {
  LoadBalancingStrategy,
  SelectionContext,
  ExecutionStats,
  Agent,
  AgentCapabilities,
  AgentStats,
  WeightConfig,
  ConsistentHashConfig,
  StrategySelectionResult,
  StrategyType,
  StrategyFactoryConfig,
} from './types';

// ============================================================================
// STRATEGIES
// ============================================================================

export { 
  RoundRobinStrategy,
  WeightedRoundRobinStrategy,
} from './round-robin';

export { 
  LeastConnectionsStrategy,
  LeastLoadedStrategy,
} from './least-connections';

export { 
  WeightedStrategy,
  PriorityWeightedStrategy,
  DEFAULT_WEIGHTS,
  COST_OPTIMIZED_WEIGHTS,
  SPEED_OPTIMIZED_WEIGHTS,
  RELIABILITY_OPTIMIZED_WEIGHTS,
} from './weighted';

export { 
  ConsistentHashStrategy,
  RendezvousHashStrategy,
} from './consistent-hash';

export {
  RandomStrategy,
} from './factory';

// ============================================================================
// FACTORY & REGISTRY
// ============================================================================

export {
  StrategyFactory,
  StrategyRegistry,
  STRATEGY_PRESETS,
} from './factory';

export type {
  StrategyOptions,
} from './factory';

// ============================================================================
// STRATEGY SELECTION GUIDE
// ============================================================================

/**
 * STRATEGY SELECTION GUIDE
 * 
 * Use this guide to choose the right strategy for your use case:
 * 
 * ┌─────────────────────┬─────────────────────────────────────────────────────┐
 * │ Strategy            │ Best For                                            │
 * ├─────────────────────┼─────────────────────────────────────────────────────┤
 * │ Round Robin         │ Fair distribution, simple use cases                │
 * │                     │ When all agents have equal capacity                │
 * ├─────────────────────┼─────────────────────────────────────────────────────┤
 * │ Least Connections   │ Long-running tasks, varying load                   │
 * │                     │ WebSocket connections, streaming                   │
 * ├─────────────────────┼─────────────────────────────────────────────────────┤
 * │ Weighted            │ Optimizing for specific metrics                    │
 * │                     │ Cost, speed, or reliability optimization           │
 * ├─────────────────────┼─────────────────────────────────────────────────────┤
 * │ Consistent Hash     │ Session affinity, caching                          │
 * │                     │ When same task should hit same agent               │
 * ├─────────────────────┼─────────────────────────────────────────────────────┤
 * │ Random              │ Simple random distribution                         │
 * │                     │ Stateless, short tasks                             │
 * └─────────────────────┴─────────────────────────────────────────────────────┘
 * 
 * PRESETS AVAILABLE:
 * - 'balanced': Equal weight to all factors
 * - 'costOptimized': Prioritize low cost
 * - 'speedOptimized': Prioritize fast execution
 * - 'reliabilityOptimized': Prioritize high success rate
 * - 'sessionAffinity': Consistent hashing for sticky sessions
 * - 'roundRobin': Simple fair distribution
 * - 'leastConnections': Load-aware distribution
 */

// ============================================================================
// VERSION
// ============================================================================

export const STRATEGIES_VERSION = '1.0.0';
