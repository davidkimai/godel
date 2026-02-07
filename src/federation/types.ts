/**
 * Federation Types - Core type definitions for the federation engine
 * 
 * These types define the data models for dependency resolution,
 * execution planning, and task execution in distributed systems.
 */

import { Task } from '../models/task';

// ============================================================================
// Subtask Types
// ============================================================================

/**
 * Represents a subtask within a larger task
 */
export interface Subtask {
  id: string;
  name: string;
  description: string;
  requiredSkills: string[];
  estimatedDuration?: number; // in milliseconds
  priority: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

/**
 * Task with its dependencies for the resolver
 */
export interface TaskWithDependencies {
  id: string;
  task: Subtask;
  dependencies: string[]; // IDs of tasks that must complete first
}

// ============================================================================
// Execution Plan Types
// ============================================================================

/**
 * Represents a level of tasks that can be executed in parallel
 */
export interface ExecutionLevel {
  level: number;
  tasks: TaskWithDependencies[];
  parallel: boolean;
}

/**
 * Complete execution plan for a set of tasks
 */
export interface ExecutionPlan {
  levels: ExecutionLevel[];
  totalTasks: number;
  estimatedParallelism: number;
  criticalPath: string[];
}

/**
 * Execution configuration options
 */
export interface ExecutionConfig {
  /** Maximum number of concurrent tasks */
  maxConcurrency: number;
  /** Whether to continue on task failure */
  continueOnFailure: boolean;
  /** Maximum time to wait for a level to complete (ms) */
  levelTimeoutMs: number;
  /** Maximum time for entire execution (ms) */
  totalTimeoutMs: number;
  /** Number of retry attempts for failed tasks */
  retryAttempts: number;
  /** Delay between retries (ms) */
  retryDelayMs: number;
}

/**
 * Default execution configuration
 */
export const DefaultExecutionConfig: ExecutionConfig = {
  maxConcurrency: 10,
  continueOnFailure: false,
  levelTimeoutMs: 300000, // 5 minutes
  totalTimeoutMs: 3600000, // 1 hour
  retryAttempts: 0,
  retryDelayMs: 1000,
};

// ============================================================================
// Execution Result Types
// ============================================================================

/**
 * Status of a task execution
 */
export type TaskExecutionStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

/**
 * Result of a single task execution
 */
export interface TaskResult {
  taskId: string;
  status: TaskExecutionStatus;
  result?: unknown;
  error?: Error;
  startedAt?: Date;
  completedAt?: Date;
  durationMs?: number;
  attempts: number;
  agentId?: string;
}

/**
 * Overall execution result
 */
export interface ExecutionResult {
  completed: number;
  failed: number;
  cancelled: number;
  skipped: number;
  results: Map<string, TaskResult>;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  errors: Error[];
}

/**
 * Execution error with details about failures
 */
export class ExecutionError extends Error {
  constructor(
    message: string,
    public failures: TaskResult[],
    public level: number
  ) {
    super(message);
    this.name = 'ExecutionError';
  }
}

// ============================================================================
// Progress Tracking Types
// ============================================================================

/**
 * Progress report for execution
 */
export interface ProgressReport {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  pendingTasks: number;
  runningTasks: number;
  percentage: number;
  currentLevel: number;
  totalLevels: number;
  activeAgents: string[];
  estimatedTimeRemaining?: number;
}

/**
 * Task started event
 */
export interface TaskStartedEvent {
  taskId: string;
  agentId: string;
  timestamp: number;
  level: number;
}

/**
 * Task completed event
 */
export interface TaskCompletedEvent {
  taskId: string;
  result: unknown;
  timestamp: number;
  durationMs: number;
}

/**
 * Task failed event
 */
export interface TaskFailedEvent {
  taskId: string;
  error: Error;
  timestamp: number;
  willRetry: boolean;
}

/**
 * Level completed event
 */
export interface LevelCompletedEvent {
  level: number;
  completedTasks: string[];
  failedTasks: string[];
  timestamp: number;
}

// ============================================================================
// Agent Selection Types
// ============================================================================

/**
 * Strategy for agent selection
 */
export type AgentSelectionStrategy = 
  | 'balanced'      // Balance load across agents
  | 'fastest'       // Select the fastest available agent
  | 'cheapest'      // Select the most cost-effective agent
  | 'skill-match'   // Select agent with best skill match
  | 'round-robin';  // Distribute evenly

/**
 * Criteria for selecting an agent
 */
export interface AgentSelectionCriteria {
  requiredSkills: string[];
  strategy: AgentSelectionStrategy;
  preferredAgentId?: string;
  excludedAgentIds?: string[];
  maxCost?: number;
  maxLatency?: number;
}

/**
 * Selected agent information
 */
export interface SelectedAgent {
  id: string;
  name: string;
  skills: string[];
  estimatedCost: number;
  estimatedLatency: number;
}

/**
 * Agent selector interface
 */
export interface AgentSelector {
  selectAgent(criteria: AgentSelectionCriteria): Promise<SelectedAgent>;
  selectAgents(criteria: AgentSelectionCriteria, count: number): Promise<SelectedAgent[]>;
}

/**
 * Task executor interface
 */
export interface TaskExecutor {
  execute(agentId: string, task: Subtask): Promise<unknown>;
  cancel(taskId: string): Promise<boolean>;
}

// ============================================================================
// Dependency Resolver Types
// ============================================================================

/**
 * Resolution result containing the execution plan
 */
export interface ResolutionResult {
  plan: ExecutionPlan;
  valid: boolean;
  errors: string[];
}

/**
 * Options for dependency resolution
 */
export interface ResolutionOptions {
  /** Validate graph before resolution */
  validate: boolean;
  /** Maximum number of levels */
  maxLevels: number;
  /** Whether to allow parallel execution within levels */
  allowParallel: boolean;
}

/**
 * Default resolution options
 */
export const DefaultResolutionOptions: ResolutionOptions = {
  validate: true,
  maxLevels: 1000,
  allowParallel: true,
};

// ============================================================================
// Event Types for Execution Tracking
// ============================================================================

/**
 * All possible execution event types
 */
export type ExecutionEventType =
  | 'execution:started'
  | 'execution:completed'
  | 'execution:failed'
  | 'execution:cancelled'
  | 'level:started'
  | 'level:completed'
  | 'task:started'
  | 'task:completed'
  | 'task:failed'
  | 'task:retry'
  | 'task:cancelled'
  | 'progress:updated';

/**
 * Base execution event
 */
export interface ExecutionEvent {
  type: ExecutionEventType;
  timestamp: number;
  executionId: string;
}

/**
 * Event payload types
 */
export interface ExecutionStartedEvent extends ExecutionEvent {
  type: 'execution:started';
  plan: ExecutionPlan;
}

export interface ExecutionCompletedEvent extends ExecutionEvent {
  type: 'execution:completed';
  result: ExecutionResult;
}

export interface ExecutionFailedEvent extends ExecutionEvent {
  type: 'execution:failed';
  error: Error;
  failedTasks: TaskResult[];
}

export interface LevelStartedEvent extends ExecutionEvent {
  type: 'level:started';
  level: number;
  taskCount: number;
}

export interface TaskRetryEvent extends ExecutionEvent {
  type: 'task:retry';
  taskId: string;
  attempt: number;
  maxAttempts: number;
}

export interface ProgressUpdatedEvent extends ExecutionEvent {
  type: 'progress:updated';
  progress: ProgressReport;
}
