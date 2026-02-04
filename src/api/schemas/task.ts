/**
 * Task Zod Schemas
 * 
 * Validation schemas for task-related API endpoints
 */

import { z } from 'zod';
import { MetadataSchema, TimestampSchema, OptionalTimestampSchema } from './common';

// ============================================================================
// Task Status Enum
// ============================================================================

export const TaskStatusSchema = z.enum([
  'pending',
  'in_progress',
  'blocked',
  'paused',
  'awaiting_approval',
  'cancelled',
  'failed',
  'completed',
]);

// ============================================================================
// Task Priority Enum
// ============================================================================

export const TaskPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

// ============================================================================
// Quality Dimension Enum
// ============================================================================

export const QualityDimensionSchema = z.enum([
  'correctness',
  'completeness',
  'consistency',
  'clarity',
  'performance',
  'security',
  'style',
  'type_safety',
  'test_coverage',
]);

// ============================================================================
// Quality Criterion Schema
// ============================================================================

export const QualityCriterionSchema = z.object({
  dimension: QualityDimensionSchema.describe('Quality dimension'),
  weight: z.number().min(0).max(1).describe('Weight in overall score'),
  threshold: z.number().min(0).max(1).default(0.7)
    .describe('Minimum threshold to pass'),
});

// ============================================================================
// Quality Gate Schema
// ============================================================================

export const QualityGateSchema = z.object({
  type: z.enum(['critique', 'test', 'lint', 'types', 'security', 'manual'])
    .describe('Type of quality gate'),
  criteria: z.array(QualityCriterionSchema)
    .describe('Evaluation criteria'),
  passingThreshold: z.number().min(0).max(1).default(0.8)
    .describe('Weighted average threshold to pass'),
  maxIterations: z.number().int().min(1).default(3)
    .describe('Maximum iterations for improvement'),
  autoRetry: z.boolean().default(true)
    .describe('Whether to auto-retry on failure'),
});

// ============================================================================
// Checkpoint Schema
// ============================================================================

export const CheckpointSchema = z.object({
  id: z.string().describe('Checkpoint identifier'),
  name: z.string().describe('Checkpoint name'),
  progress: z.number().min(0).max(1).describe('Progress value (0-1)'),
  state: MetadataSchema.describe('State snapshot at checkpoint'),
  createdAt: TimestampSchema.describe('Checkpoint creation timestamp'),
});

// ============================================================================
// Task Reasoning Schema
// ============================================================================

export const TaskReasoningSchema = z.object({
  hypothesis: z.string().optional().describe('Initial hypothesis'),
  alternatives: z.array(z.string()).optional().describe('Alternative approaches'),
  criteria: z.array(z.string()).optional().describe('Success criteria'),
  evaluation: z.string().optional().describe('Post-completion evaluation'),
  confidence: z.number().min(0).max(1).default(1).describe('Confidence level'),
});

// ============================================================================
// Base Task Schema
// ============================================================================

export const TaskSchema = z.object({
  id: z.string().describe('Unique task identifier'),
  title: z.string().describe('Task title'),
  description: z.string().describe('Detailed description'),
  status: TaskStatusSchema.describe('Current task status'),
  assigneeId: z.string().optional().describe('Assigned agent ID'),
  dependsOn: z.array(z.string()).default([]).describe('Task dependencies'),
  blocks: z.array(z.string()).default([]).describe('Tasks blocked by this task'),
  reasoning: TaskReasoningSchema.optional().describe('Reasoning and planning data'),
  qualityGate: QualityGateSchema.optional().describe('Quality gate configuration'),
  checkpoints: z.array(CheckpointSchema).default([]).describe('Progress checkpoints'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
  completedAt: OptionalTimestampSchema.describe('Completion timestamp'),
  priority: TaskPrioritySchema.default('medium').describe('Priority level'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Create Task Schema
// ============================================================================

export const CreateTaskSchema = z.object({
  title: z.string().min(1).max(500).describe('Task title'),
  description: z.string().min(1).describe('Detailed description'),
  assigneeId: z.string().optional().describe('Agent to assign the task to'),
  dependsOn: z.array(z.string()).default([]).describe('Task dependencies'),
  priority: TaskPrioritySchema.default('medium').describe('Priority level'),
  qualityGate: QualityGateSchema.optional().describe('Quality gate configuration'),
  reasoning: TaskReasoningSchema.optional().describe('Initial reasoning data'),
  metadata: MetadataSchema.describe('Additional metadata'),
});

// ============================================================================
// Update Task Schema
// ============================================================================

export const UpdateTaskSchema = z.object({
  title: z.string().min(1).max(500).optional().describe('Task title'),
  description: z.string().min(1).optional().describe('Detailed description'),
  status: TaskStatusSchema.optional().describe('New status'),
  priority: TaskPrioritySchema.optional().describe('Priority level'),
  metadata: MetadataSchema.optional().describe('Additional metadata'),
});

// ============================================================================
// Assign Task Schema
// ============================================================================

export const AssignTaskSchema = z.object({
  agentId: z.string().min(1).describe('Agent ID to assign the task to'),
});

// ============================================================================
// Task Assignment Response Schema
// ============================================================================

export const TaskAssignmentSchema = z.object({
  taskId: z.string().describe('Task ID'),
  agentId: z.string().describe('Assigned agent ID'),
  assignedAt: TimestampSchema.describe('Assignment timestamp'),
  previousAgentId: z.string().optional().describe('Previous agent ID if reassigned'),
});

// ============================================================================
// Checkpoint Update Schema
// ============================================================================

export const CreateCheckpointSchema = z.object({
  name: z.string().min(1).describe('Checkpoint name'),
  progress: z.number().min(0).max(1).describe('Progress value (0-1)'),
  state: MetadataSchema.optional().describe('State snapshot'),
});

// ============================================================================
// Task Dependencies Schema
// ============================================================================

export const TaskDependencySchema = z.object({
  taskId: z.string().describe('Task ID'),
  dependsOn: z.string().describe('Depends on task ID'),
  createdAt: TimestampSchema.describe('Dependency creation timestamp'),
});

export const AddDependencySchema = z.object({
  taskId: z.string().describe('Task to add dependency to'),
  dependsOn: z.string().describe('Task that must complete first'),
});

export const RemoveDependencySchema = z.object({
  taskId: z.string().describe('Task to remove dependency from'),
  dependsOn: z.string().describe('Dependency to remove'),
});

// ============================================================================
// List Tasks Query Schema
// ============================================================================

export const ListTasksQuerySchema = z.object({
  status: TaskStatusSchema.optional().describe('Filter by status'),
  assigneeId: z.string().optional().describe('Filter by assignee'),
  priority: TaskPrioritySchema.optional().describe('Filter by priority'),
  swarmId: z.string().optional().describe('Filter by swarm'),
  cursor: z.string().optional().describe('Pagination cursor'),
  limit: z.coerce.number().int().min(1).max(500).default(50)
    .describe('Number of items per page'),
  sort: z.enum(['created_at', 'updated_at', 'priority', 'status']).default('created_at')
    .describe('Sort field'),
  direction: z.enum(['asc', 'desc']).default('desc').describe('Sort direction'),
});

// ============================================================================
// Task Summary Schema (for list view)
// ============================================================================

export const TaskSummarySchema = z.object({
  id: z.string().describe('Task ID'),
  title: z.string().describe('Task title'),
  status: TaskStatusSchema.describe('Task status'),
  priority: TaskPrioritySchema.describe('Priority level'),
  assigneeId: z.string().optional().describe('Assigned agent ID'),
  createdAt: TimestampSchema.describe('Creation timestamp'),
  updatedAt: TimestampSchema.describe('Last update timestamp'),
  completedAt: OptionalTimestampSchema.describe('Completion timestamp'),
  dependencyCount: z.number().int().describe('Number of dependencies'),
  blockedCount: z.number().int().describe('Number of blocked tasks'),
});

// ============================================================================
// Task Stats Schema
// ============================================================================

export const TaskStatsSchema = z.object({
  total: z.number().int().describe('Total tasks'),
  pending: z.number().int().describe('Pending tasks'),
  inProgress: z.number().int().describe('In-progress tasks'),
  blocked: z.number().int().describe('Blocked tasks'),
  paused: z.number().int().describe('Paused tasks'),
  awaitingApproval: z.number().int().describe('Tasks awaiting approval'),
  cancelled: z.number().int().describe('Cancelled tasks'),
  failed: z.number().int().describe('Failed tasks'),
  completed: z.number().int().describe('Completed tasks'),
  byPriority: z.record(z.number().int()).describe('Count by priority'),
});

// ============================================================================
// Response Schemas
// ============================================================================

export const TaskListResponseSchema = z.object({
  tasks: z.array(TaskSummarySchema),
  total: z.number().int().optional(),
  hasMore: z.boolean(),
  nextCursor: z.string().optional(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type QualityDimension = z.infer<typeof QualityDimensionSchema>;
export type QualityCriterion = z.infer<typeof QualityCriterionSchema>;
export type QualityGate = z.infer<typeof QualityGateSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
export type TaskReasoning = z.infer<typeof TaskReasoningSchema>;
export type Task = z.infer<typeof TaskSchema>;
export type TaskSummary = z.infer<typeof TaskSummarySchema>;
export type TaskStats = z.infer<typeof TaskStatsSchema>;
export type CreateTask = z.infer<typeof CreateTaskSchema>;
export type UpdateTask = z.infer<typeof UpdateTaskSchema>;
export type AssignTask = z.infer<typeof AssignTaskSchema>;
export type TaskAssignment = z.infer<typeof TaskAssignmentSchema>;
export type CreateCheckpoint = z.infer<typeof CreateCheckpointSchema>;
export type ListTasksQuery = z.infer<typeof ListTasksQuerySchema>;
