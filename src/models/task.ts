/**
 * Task Model
 * 
 * Core data model representing a task in the Mission Control system.
 * Includes status, dependencies, quality gates, and checkpoints.
 */

/**
 * Possible states for a task
 */
export enum TaskStatus {
  /** Task has been created but not yet started */
  PENDING = 'pending',
  /** Task is actively being worked on */
  IN_PROGRESS = 'in_progress',
  /** Task is blocked by dependencies */
  BLOCKED = 'blocked',
  /** Task has been paused */
  PAUSED = 'paused',
  /** Task is awaiting quality gate approval */
  AWAITING_APPROVAL = 'awaiting_approval',
  /** Task has been cancelled */
  CANCELLED = 'cancelled',
  /** Task has failed */
  FAILED = 'failed',
  /** Task has been completed successfully */
  COMPLETED = 'completed'
}

/**
 * Priority levels for tasks
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Quality criterion dimension
 */
export type QualityDimension = 
  | 'correctness'
  | 'completeness'
  | 'consistency'
  | 'clarity'
  | 'performance'
  | 'security'
  | 'style'
  | 'type_safety'
  | 'test_coverage';

/**
 * Individual quality criterion
 */
export interface QualityCriterion {
  /** The dimension being evaluated */
  dimension: QualityDimension;
  /** Weight of this criterion (0-1) */
  weight: number;
  /** Minimum threshold to pass (0-1) */
  threshold: number;
}

/**
 * Quality gate configuration for a task
 */
export interface QualityGate {
  /** Type of quality gate */
  type: 'critique' | 'test' | 'lint' | 'types' | 'security' | 'manual';
  /** Evaluation criteria */
  criteria: QualityCriterion[];
  /** Weighted average threshold to pass (0-1) */
  passingThreshold: number;
  /** Maximum iterations for improvement */
  maxIterations: number;
  /** Whether to auto-retry on failure */
  autoRetry: boolean;
}

/**
 * Checkpoint within a task
 */
export interface Checkpoint {
  /** Unique checkpoint identifier */
  id: string;
  /** Checkpoint name */
  name: string;
  /** Progress value (0-1) */
  progress: number;
  /** State snapshot at checkpoint */
  state: Record<string, unknown>;
  /** When the checkpoint was created */
  createdAt: Date;
}

/**
 * Task reasoning data
 */
export interface TaskReasoning {
  /** Initial hypothesis for the task */
  hypothesis?: string;
  /** Alternative approaches considered */
  alternatives?: string[];
  /** Success criteria */
  criteria?: string[];
  /** Evaluation after completion */
  evaluation?: string;
  /** Confidence level 0-1 */
  confidence: number;
}

/**
 * Core Task model representing work to be done
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Task title */
  title: string;
  /** Detailed description */
  description: string;
  /** Current status */
  status: TaskStatus;
  /** Assigned agent ID */
  assigneeId?: string;
  
  /** Task dependencies (IDs of tasks that must complete first) */
  dependsOn: string[];
  /** Tasks blocked by this task (IDs) */
  blocks: string[];
  
  /** Reasoning and planning data */
  reasoning?: TaskReasoning;
  
  /** Quality gate configuration */
  qualityGate?: QualityGate;
  
  /** Progress checkpoints */
  checkpoints?: Checkpoint[];
  
  /** When the task was created */
  createdAt: Date;
  /** When the task was last updated */
  updatedAt: Date;
  /** When the task was completed */
  completedAt?: Date;
  /** Priority level */
  priority: TaskPriority;
  /** Additional metadata */
  metadata: Record<string, unknown>;
}

/**
 * Options for creating a task
 */
export interface CreateTaskOptions {
  /** Unique identifier (optional, auto-generated if not provided) */
  id?: string;
  /** Task title */
  title: string;
  /** Detailed description */
  description: string;
  /** Assignee agent ID */
  assigneeId?: string;
  /** Task dependencies */
  dependsOn?: string[];
  /** Priority level */
  priority?: TaskPriority;
  /** Quality gate configuration */
  qualityGate?: QualityGate;
  /** Initial reasoning data */
  reasoning?: TaskReasoning;
}

/**
 * Creates a new Task instance
 * 
 * @param options - Task creation options
 * @returns A new Task instance
 * 
 * @example
 * ```typescript
 * const task = createTask({
 *   title: 'Implement user auth',
 *   description: 'Add JWT-based authentication',
 *   priority: 'high',
 *   dependsOn: ['task-123']
 * });
 * ```
 */
export function createTask(options: CreateTaskOptions): Task {
  const id = options.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  return {
    id,
    title: options.title,
    description: options.description,
    status: TaskStatus.PENDING,
    assigneeId: options.assigneeId,
    dependsOn: options.dependsOn || [],
    blocks: [],
    reasoning: options.reasoning,
    qualityGate: options.qualityGate,
    checkpoints: [],
    createdAt: now,
    updatedAt: now,
    completedAt: undefined,
    priority: options.priority || 'medium',
    metadata: {}
  };
}

/**
 * Creates a quality gate with default settings
 * 
 * @param criteria - Quality criteria to evaluate
 * @param passingThreshold - Threshold to pass (0-1)
 * @returns Quality gate configuration
 */
export function createQualityGate(
  criteria: QualityCriterion[],
  passingThreshold: number = 0.8
): QualityGate {
  return {
    type: 'critique',
    criteria,
    passingThreshold,
    maxIterations: 3,
    autoRetry: true
  };
}

/**
 * Creates a quality criterion
 * 
 * @param dimension - Quality dimension
 * @param weight - Weight in overall score (0-1)
 * @param threshold - Minimum threshold to pass (0-1)
 * @returns Quality criterion
 */
export function createQualityCriterion(
  dimension: QualityDimension,
  weight: number,
  threshold: number = 0.7
): QualityCriterion {
  return { dimension, weight, threshold };
}
