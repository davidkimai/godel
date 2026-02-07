/**
 * Load Balancing Strategy Types - Godel Federation Engine
 * 
 * Defines interfaces for implementing various load balancing strategies
 * for routing tasks across federated agent instances.
 * 
 * @module federation/strategies/types
 */

import type { OpenClawInstance } from '../../core/federation/types';

/**
 * Context for agent selection decisions
 * Provides hints and constraints for strategy selection
 */
export interface SelectionContext {
  /** Task complexity level */
  taskComplexity?: 'low' | 'medium' | 'high';
  
  /** Deadline for task completion */
  deadline?: Date;
  
  /** Priority level (higher = more important) */
  priority?: number;
  
  /** Session/task ID for consistent hashing */
  taskId?: string;
  
  /** Required capabilities */
  requiredCapabilities?: string[];
  
  /** Preferred region */
  preferredRegion?: string;
}

/**
 * Execution statistics for an agent instance
 * Used by adaptive strategies to improve routing decisions
 */
export interface ExecutionStats {
  /** Execution duration in milliseconds */
  duration: number;
  
  /** Whether execution succeeded */
  success: boolean;
  
  /** Cost of execution */
  cost: number;
  
  /** Timestamp of execution */
  timestamp?: Date;
  
  /** Any error that occurred */
  error?: string;
}

/**
 * Agent representation for strategy selection
 * Compatible with OpenClawInstance but with required fields
 */
export interface Agent {
  /** Unique identifier */
  id: string;
  
  /** Agent capabilities */
  capabilities: AgentCapabilities;
}

/**
 * Agent capabilities used for selection decisions
 */
export interface AgentCapabilities {
  /** Cost per hour for this agent */
  costPerHour?: number;
  
  /** Maximum concurrent connections/sessions */
  maxConnections?: number;
  
  /** Supported capability tags */
  tags?: string[];
  
  /** Current load (0-1) */
  currentLoad?: number;
}

/**
 * Internal agent statistics tracked by strategies
 */
export interface AgentStats {
  /** Total number of executions */
  totalExecutions: number;
  
  /** Number of successful executions */
  successfulExecutions: number;
  
  /** Average execution speed (tasks per second) */
  avgSpeed: number;
  
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Configuration for weighted strategy
 */
export interface WeightConfig {
  /** Weight for cost factor (0-1) */
  cost: number;
  
  /** Weight for speed factor (0-1) */
  speed: number;
  
  /** Weight for reliability factor (0-1) */
  reliability: number;
}

/**
 * Configuration for consistent hashing strategy
 */
export interface ConsistentHashConfig {
  /** Number of virtual nodes per agent */
  virtualNodes?: number;
}

/**
 * Result of a strategy selection
 */
export interface StrategySelectionResult {
  /** Selected agent */
  agent: Agent;
  
  /** Strategy that made the selection */
  strategy: string;
  
  /** Selection reason/score */
  reason?: string;
  
  /** Time taken to make selection in ms */
  decisionTimeMs: number;
}

/**
 * Load balancing strategy interface
 * All strategies must implement this interface
 */
export interface LoadBalancingStrategy {
  /** Strategy name identifier */
  readonly name: string;
  
  /**
   * Select an agent from the available pool
   * @param agents - Available agents to choose from
   * @param context - Optional selection context
   * @returns Selected agent
   * @throws Error if no agents available
   */
  selectAgent(agents: Agent[], context?: SelectionContext): Agent;
  
  /**
   * Update strategy with execution statistics
   * Used by adaptive strategies to learn from past performance
   * @param agentId - ID of agent that executed
   * @param stats - Execution statistics
   */
  updateStats(agentId: string, stats: ExecutionStats): void;
  
  /**
   * Reset strategy state
   * Clears all accumulated statistics
   */
  reset?(): void;
  
  /**
   * Get strategy-specific statistics
   * @returns Strategy statistics object
   */
  getStats?(): Record<string, unknown>;
}

/**
 * Strategy type identifiers
 */
export type StrategyType = 
  | 'round-robin'
  | 'least-connections'
  | 'weighted'
  | 'consistent-hash'
  | 'random'
  | 'least-loaded';

/**
 * Factory configuration for creating strategies
 */
export interface StrategyFactoryConfig {
  /** Strategy type to create */
  type: StrategyType;
  
  /** Weight configuration for weighted strategy */
  weights?: WeightConfig;
  
  /** Virtual nodes for consistent hashing */
  virtualNodes?: number;
}
