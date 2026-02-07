/**
 * Federation Engine - Dependency Resolution and Distributed Execution
 * 
 * This module provides tools for:
 * - DAG-based dependency modeling
 * - Topological sorting and cycle detection
 * - Parallel execution planning
 * - Visual progress tracking
 * 
 * @example
 * ```typescript
 * import { 
 *   DependencyResolver, 
 *   ExecutionEngine, 
 *   ExecutionTracker,
 *   DAG 
 * } from './federation';
 * 
 * // Create tasks with dependencies
 * const tasks = [
 *   { id: 'A', task: { name: 'Setup', requiredSkills: ['devops'] }, dependencies: [] },
 *   { id: 'B', task: { name: 'Build', requiredSkills: ['build'] }, dependencies: ['A'] },
 *   { id: 'C', task: { name: 'Test', requiredSkills: ['testing'] }, dependencies: ['B'] },
 * ];
 * 
 * // Resolve dependencies
 * const resolver = new DependencyResolver();
 * resolver.buildGraph(tasks);
 * const plan = resolver.getExecutionPlan();
 * 
 * // Execute the plan
 * const engine = new ExecutionEngine(selector, executor);
 * const result = await engine.executePlan(plan);
 * ```
 */

// Core DAG implementation
export { DAG, createDAGFromItems, validateDAG, type DAGValidationResult } from './dag';

// Dependency resolution
export { DependencyResolver } from './dependency-resolver';

// Execution engine
export {
  ExecutionEngine,
  InMemoryTaskExecutor,
  InMemoryAgentSelector,
  type ExecuteOptions,
} from './execution-engine';

// Progress tracking
export {
  ExecutionTracker,
  createConsoleReporter,
  type ExecutionTrackerOptions,
} from './execution-tracker';

// Type definitions
export type {
  // Subtask types
  Subtask,
  TaskWithDependencies,
  
  // Execution plan types
  ExecutionPlan,
  ExecutionLevel,
  ExecutionConfig,
  
  // Result types
  TaskResult,
  ExecutionResult,
  ExecutionError,
  TaskExecutionStatus,
  
  // Progress types
  ProgressReport,
  TaskStartedEvent,
  TaskCompletedEvent,
  TaskFailedEvent,
  LevelCompletedEvent,
  
  // Agent types
  AgentSelectionCriteria,
  AgentSelectionStrategy,
  SelectedAgent,
  AgentSelector,
  TaskExecutor,
  
  // Resolution types
  ResolutionResult,
  ResolutionOptions,
  
  // Event types
  ExecutionEventType,
  ExecutionEvent,
  ExecutionStartedEvent,
  ExecutionCompletedEvent,
  ExecutionFailedEvent,
  LevelStartedEvent,
  TaskRetryEvent,
  ProgressUpdatedEvent,
} from './types';

// Constants
export { DefaultExecutionConfig, DefaultResolutionOptions } from './types';

// Task Decomposition Engine (Phase 3)
export {
  TaskDecomposer,
  FileBasedStrategy,
  ComponentBasedStrategy,
  DomainBasedStrategy,
  LLMAssistedStrategy,
  buildDependencyGraph,
  detectCycle,
  getExecutionOrder,
  calculateParallelizationRatio,
  quickDecompose,
  validateDecomposition,
  DEFAULT_DECOMPOSITION_OPTIONS,
} from './task-decomposer';

export type {
  ComplexityLevel,
  DecompositionStrategy,
  DecompositionOptions,
  TaskContext,
  DecompositionResult,
} from './task-decomposer';
