/**
 * @fileoverview Intent Types - Type definitions for natural language intent parsing
 * 
 * This module provides TypeScript interfaces and types for the "godel do" command
 * which allows users to express tasks in natural language that get parsed into
 * structured intents and executed by agent teams.
 * 
 * @module @godel/cli/intent/types
 */

import { TeamConfig } from '../../core/team';
import { WorktreeConfig } from '../../core/worktree/types';

// ============================================================================
// INTENT TYPES
// ============================================================================

/**
 * Supported intent types for natural language commands.
 * These represent the core actions that can be performed by agent teams.
 */
export type IntentType = 
  | 'implement' 
  | 'refactor' 
  | 'test' 
  | 'review' 
  | 'deploy' 
  | 'fix' 
  | 'analyze';

/**
 * All valid intent type values for validation and iteration.
 */
export const INTENT_TYPES: IntentType[] = [
  'implement',
  'refactor', 
  'test',
  'review',
  'deploy',
  'fix',
  'analyze'
];

/**
 * Complexity levels determine team configuration.
 * - low: Simple tasks (1 Worker)
 * - medium: Standard tasks (1 Coordinator + 3 Workers + 1 Reviewer)
 * - high: Complex tasks (1 Coordinator + 5 Workers + 2 Reviewers + 1 Specialist)
 */
export type ComplexityLevel = 'low' | 'medium' | 'high';

/**
 * Represents a parsed natural language intent.
 * This is the core data structure that captures what the user wants to do.
 */
export interface Intent {
  /** The type of action to perform */
  type: IntentType;
  
  /** The main subject/target of the intent (e.g., "user authentication") */
  subject: string;
  
  /** Additional requirements extracted from the input */
  requirements: string[];
  
  /** Assessed complexity level */
  complexity: ComplexityLevel;
  
  /** Additional context extracted during parsing */
  context?: Record<string, unknown>;
}

/**
 * Configuration for team execution based on intent.
 */
export interface TeamConfiguration extends TeamConfig {
  /** Strategy for agent coordination */
  strategy: 'parallel' | 'pipeline' | 'map-reduce';
  
  /** Agent roles for this execution */
  roles: AgentRoleConfig[];
}

/**
 * Configuration for a specific agent role in the team.
 */
export interface AgentRoleConfig {
  /** Role identifier */
  role: 'coordinator' | 'worker' | 'reviewer' | 'specialist';
  
  /** Number of agents with this role */
  count: number;
  
  /** Specific task for this role */
  task: string;
  
  /** Model preference for this role */
  model?: string;
}

/**
 * Execution plan generated from an intent.
 * Contains all configuration needed to execute the intent.
 */
export interface ExecutionPlan {
  /** Team configuration for execution */
  teamConfig: TeamConfiguration;
  
  /** Optional worktree configuration for isolated execution */
  worktreeConfig?: WorktreeConfig;
  
  /** Estimated duration in minutes */
  estimatedDuration: number;
}

// ============================================================================
// PARSER TYPES
// ============================================================================

/**
 * Result of parsing a natural language input.
 */
export interface ParseResult {
  /** Whether parsing was successful */
  success: boolean;
  
  /** The parsed intent (if successful) */
  intent?: Intent;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Alternative interpretations */
  alternatives?: Intent[];
}

/**
 * Pattern definition for intent matching.
 */
export interface IntentPattern {
  /** Pattern type */
  type: IntentType;
  
  /** Primary regex patterns for matching */
  patterns: RegExp[];
  
  /** Keywords that trigger this intent type */
  keywords: string[];
  
  /** Complexity indicators */
  complexityIndicators: {
    low: string[];
    medium: string[];
    high: string[];
  };
}

/**
 * Configuration for the intent parser.
 */
export interface ParserConfig {
  /** Minimum confidence threshold for parsing (0-1) */
  minConfidence: number;
  
  /** Whether to include alternative interpretations */
  includeAlternatives: boolean;
  
  /** Custom patterns to add to the parser */
  customPatterns?: IntentPattern[];
  
  /** Whether to enable strict mode (rejects ambiguous inputs) */
  strictMode: boolean;
}

// ============================================================================
// EXECUTOR TYPES
// ============================================================================

/**
 * Result of executing an intent.
 */
export interface ExecutionResult {
  /** Whether execution was successful */
  success: boolean;
  
  /** Team ID created for execution */
  teamId?: string;
  
  /** Worktree ID if created */
  worktreeId?: string;
  
  /** Execution output */
  output?: string;
  
  /** Error message (if failed) */
  error?: string;
  
  /** Execution metrics */
  metrics?: ExecutionMetrics;
}

/**
 * Metrics collected during execution.
 */
export interface ExecutionMetrics {
  /** Start time */
  startTime: Date;
  
  /** End time (if completed) */
  endTime?: Date;
  
  /** Duration in milliseconds */
  durationMs?: number;
  
  /** Total cost incurred */
  totalCost: number;
  
  /** Number of agents spawned */
  agentsSpawned: number;
  
  /** Number of tasks completed */
  tasksCompleted: number;
}

/**
 * Progress event for streaming execution updates.
 */
export interface ProgressEvent {
  /** Event type */
  type: 'start' | 'progress' | 'agent_spawned' | 'agent_completed' | 'complete' | 'error';
  
  /** Event timestamp */
  timestamp: Date;
  
  /** Progress percentage (0-100) */
  progress: number;
  
  /** Human-readable message */
  message: string;
  
  /** Additional event data */
  data?: Record<string, unknown>;
}

/**
 * Progress callback function type.
 */
export type ProgressCallback = (event: ProgressEvent) => void;

/**
 * Configuration for intent execution.
 */
export interface ExecutorConfig {
  /** Whether to use isolated worktrees */
  useWorktrees: boolean;
  
  /** Base directory for worktrees */
  worktreeBasePath?: string;
  
  /** Default budget limit */
  defaultBudget: number;
  
  /** Maximum execution time in minutes */
  maxExecutionTime: number;
  
  /** Progress callback for streaming updates */
  onProgress?: ProgressCallback;
}

// ============================================================================
// TEAM SIZE CONFIGURATIONS
// ============================================================================

/**
 * Team configurations for different complexity levels.
 */
export const TEAM_CONFIGS: Record<ComplexityLevel, TeamConfiguration> = {
  low: {
    name: 'simple-task',
    task: '',
    initialAgents: 1,
    maxAgents: 1,
    strategy: 'parallel',
    roles: [
      { role: 'worker', count: 1, task: 'Execute the task' }
    ],
  },
  
  medium: {
    name: 'standard-task',
    task: '',
    initialAgents: 5,
    maxAgents: 8,
    strategy: 'pipeline',
    roles: [
      { role: 'coordinator', count: 1, task: 'Coordinate execution and integrate results' },
      { role: 'worker', count: 3, task: 'Execute subtasks in parallel' },
      { role: 'reviewer', count: 1, task: 'Review and validate outputs' }
    ],
  },
  
  high: {
    name: 'complex-task',
    task: '',
    initialAgents: 9,
    maxAgents: 15,
    strategy: 'map-reduce',
    roles: [
      { role: 'coordinator', count: 1, task: 'Coordinate execution and integrate results' },
      { role: 'worker', count: 5, task: 'Execute subtasks in parallel' },
      { role: 'reviewer', count: 2, task: 'Review and validate outputs' },
      { role: 'specialist', count: 1, task: 'Handle edge cases and complex logic' }
    ],
  },
};

// ============================================================================
// ESTIMATED DURATIONS
// ============================================================================

/**
 * Estimated durations in minutes for different complexity levels.
 */
export const ESTIMATED_DURATIONS: Record<ComplexityLevel, number> = {
  low: 5,
  medium: 30,
  high: 120,
};
