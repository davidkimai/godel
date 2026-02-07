/**
 * Task Fixtures
 * 
 * Pre-built task data for consistent testing.
 * 
 * @example
 * ```typescript
 * import { mockTask, createTestTask } from '../fixtures/tasks';
 * 
 * // Use predefined fixture
 * const task = { ...mockTask };
 * 
 * // Create customized task
 * const customTask = createTestTask({ priority: 'high' });
 * ```
 */

import { Task, TaskStatus, TaskPriority, QualityGate, Checkpoint, createTask, CreateTaskOptions } from '../../src/models/task';

// ============================================================================
// Predefined Task Fixtures
// ============================================================================

/**
 * Basic mock task for general testing
 */
export const mockTask: Task = {
  id: 'task-456',
  title: 'Implement user authentication',
  description: 'Add JWT-based authentication to the API endpoints with proper validation and error handling',
  status: TaskStatus.PENDING,
  assigneeId: undefined,
  dependsOn: [],
  blocks: [],
  reasoning: {
    hypothesis: 'JWT tokens provide stateless authentication suitable for our API architecture',
    alternatives: ['Session-based auth', 'OAuth 2.0', 'API Keys'],
    criteria: ['Security', 'Scalability', 'Ease of implementation'],
    evaluation: 'JWT strikes the best balance for our requirements',
    confidence: 0.85,
  },
  qualityGate: {
    type: 'test',
    criteria: [
      { dimension: 'correctness', weight: 0.4, threshold: 0.9 },
      { dimension: 'test_coverage', weight: 0.3, threshold: 0.8 },
      { dimension: 'security', weight: 0.3, threshold: 0.95 },
    ],
    passingThreshold: 0.85,
    maxIterations: 3,
    autoRetry: true,
  },
  checkpoints: [],
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  priority: 'high',
  metadata: {
    estimatedHours: 8,
    tags: ['backend', 'security'],
  },
};

/**
 * In-progress task fixture
 */
export const mockInProgressTask: Task = {
  ...mockTask,
  id: 'task-in-progress',
  title: 'Refactor database layer',
  status: TaskStatus.IN_PROGRESS,
  assigneeId: 'agent-123',
  updatedAt: new Date(),
  checkpoints: [
    {
      id: 'checkpoint-1',
      name: 'Schema design complete',
      progress: 0.3,
      state: { schemaDefined: true },
      createdAt: new Date(Date.now() - 3600000),
    },
  ],
};

/**
 * Completed task fixture
 */
export const mockCompletedTask: Task = {
  ...mockTask,
  id: 'task-completed',
  title: 'Set up CI/CD pipeline',
  status: TaskStatus.COMPLETED,
  assigneeId: 'agent-456',
  completedAt: new Date(),
  checkpoints: [
    {
      id: 'checkpoint-1',
      name: 'GitHub Actions configured',
      progress: 0.5,
      state: {},
      createdAt: new Date(Date.now() - 7200000),
    },
    {
      id: 'checkpoint-2',
      name: 'Tests passing',
      progress: 1.0,
      state: {},
      createdAt: new Date(),
    },
  ],
};

/**
 * Blocked task fixture (waiting on dependencies)
 */
export const mockBlockedTask: Task = {
  ...mockTask,
  id: 'task-blocked',
  title: 'Implement API endpoints',
  status: TaskStatus.BLOCKED,
  dependsOn: ['task-auth', 'task-db'],
  metadata: {
    blockedReason: 'Waiting for authentication and database tasks',
  },
};

/**
 * Failed task fixture
 */
export const mockFailedTask: Task = {
  ...mockTask,
  id: 'task-failed',
  title: 'Optimize query performance',
  status: TaskStatus.FAILED,
  assigneeId: 'agent-789',
  updatedAt: new Date(),
  metadata: {
    failureReason: 'Query optimization exceeded time limit',
    errorCount: 3,
  },
};

/**
 * Task with dependencies
 */
export const mockTaskWithDeps: Task = {
  ...mockTask,
  id: 'task-with-deps',
  title: 'Build frontend dashboard',
  dependsOn: ['task-api', 'task-design'],
  blocks: ['task-deployment'],
};

/**
 * High priority critical task
 */
export const mockCriticalTask: Task = {
  ...mockTask,
  id: 'task-critical',
  title: 'Fix security vulnerability',
  priority: 'critical',
  status: TaskStatus.IN_PROGRESS,
  assigneeId: 'agent-security',
  qualityGate: {
    type: 'security',
    criteria: [
      { dimension: 'security', weight: 1.0, threshold: 1.0 },
    ],
    passingThreshold: 1.0,
    maxIterations: 5,
    autoRetry: false,
  },
};

/**
 * Task awaiting approval
 */
export const mockAwaitingApprovalTask: Task = {
  ...mockTask,
  id: 'task-approval',
  title: 'Deploy to production',
  status: TaskStatus.AWAITING_APPROVAL,
  assigneeId: 'agent-deploy',
  qualityGate: {
    type: 'manual',
    criteria: [
      { dimension: 'correctness', weight: 0.5, threshold: 0.9 },
      { dimension: 'performance', weight: 0.5, threshold: 0.8 },
    ],
    passingThreshold: 0.85,
    maxIterations: 1,
    autoRetry: false,
  },
};

/**
 * Cancelled task
 */
export const mockCancelledTask: Task = {
  ...mockTask,
  id: 'task-cancelled',
  title: 'Implement feature X',
  status: TaskStatus.CANCELLED,
  metadata: {
    cancellationReason: 'Requirements changed',
    cancelledBy: 'product-owner',
  },
};

// ============================================================================
// Task Collections
// ============================================================================

/**
 * Collection of tasks with various statuses
 */
export const mockTasksWithMixedStatuses: Task[] = [
  mockTask,
  mockInProgressTask,
  mockCompletedTask,
  mockBlockedTask,
  mockFailedTask,
  mockAwaitingApprovalTask,
  mockCancelledTask,
];

/**
 * Collection of tasks with dependencies forming a DAG
 */
export const mockTaskDAG: Task[] = [
  {
    ...mockTask,
    id: 'task-1',
    title: 'Database schema',
    status: TaskStatus.COMPLETED,
    dependsOn: [],
    blocks: ['task-2', 'task-3'],
  },
  {
    ...mockTask,
    id: 'task-2',
    title: 'API layer',
    status: TaskStatus.IN_PROGRESS,
    dependsOn: ['task-1'],
    blocks: ['task-4'],
  },
  {
    ...mockTask,
    id: 'task-3',
    title: 'Authentication',
    status: TaskStatus.PENDING,
    dependsOn: ['task-1'],
    blocks: ['task-4'],
  },
  {
    ...mockTask,
    id: 'task-4',
    title: 'Frontend integration',
    status: TaskStatus.BLOCKED,
    dependsOn: ['task-2', 'task-3'],
    blocks: [],
  },
];

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a test task with customizable properties
 * 
 * @example
 * ```typescript
 * const task = createTestTask({
 *   priority: 'high',
 *   status: TaskStatus.IN_PROGRESS
 * });
 * ```
 */
export function createTestTask(overrides: Partial<Task> = {}): Task {
  const id = overrides.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = new Date();
  
  return {
    ...mockTask,
    id,
    title: `Test Task ${id}`,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Creates multiple test tasks
 * 
 * @example
 * ```typescript
 * const tasks = createTestTasks(5, { priority: 'medium' });
 * ```
 */
export function createTestTasks(count: number, overrides: Partial<Task> = {}): Task[] {
  return Array.from({ length: count }, (_, i) =>
    createTestTask({
      title: `Test Task ${i + 1}`,
      ...overrides,
    })
  );
}

/**
 * Creates a task using the model factory
 * 
 * @example
 * ```typescript
 * const task = createTaskFromOptions({
 *   title: 'New Feature',
 *   description: 'Implement new functionality',
 *   priority: 'high'
 * });
 * ```
 */
export function createTaskFromOptions(options: CreateTaskOptions): Task {
  return createTask(options);
}

/**
 * Creates a quality gate configuration
 * 
 * @example
 * ```typescript
 * const qualityGate = createQualityGate([
 *   { dimension: 'correctness', weight: 0.5, threshold: 0.9 }
 * ]);
 * ```
 */
export function createQualityGate(
  criteria: QualityGate['criteria'],
  overrides: Partial<Omit<QualityGate, 'criteria'>> = {}
): QualityGate {
  return {
    type: 'critique',
    criteria,
    passingThreshold: 0.8,
    maxIterations: 3,
    autoRetry: true,
    ...overrides,
  };
}

/**
 * Creates a checkpoint
 * 
 * @example
 * ```typescript
 * const checkpoint = createCheckpoint('Milestone 1', 0.5, { done: true });
 * ```
 */
export function createCheckpoint(
  name: string,
  progress: number,
  state: Record<string, unknown> = {}
): Checkpoint {
  return {
    id: `checkpoint-${Date.now()}`,
    name,
    progress,
    state,
    createdAt: new Date(),
  };
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Checks if an object is a valid task structure
 * 
 * @example
 * ```typescript
 * expect(isValidTask(task)).toBe(true);
 * ```
 */
export function isValidTask(obj: unknown): obj is Task {
  if (!obj || typeof obj !== 'object') return false;
  
  const task = obj as Partial<Task>;
  return (
    typeof task.id === 'string' &&
    typeof task.title === 'string' &&
    typeof task.description === 'string' &&
    typeof task.status === 'string' &&
    typeof task.priority === 'string' &&
    task.createdAt instanceof Date &&
    task.updatedAt instanceof Date &&
    Array.isArray(task.dependsOn) &&
    Array.isArray(task.blocks) &&
    typeof task.metadata === 'object'
  );
}

/**
 * Checks if a task has a specific status
 * 
 * @example
 * ```typescript
 * expect(hasTaskStatus(task, TaskStatus.COMPLETED)).toBe(true);
 * ```
 */
export function hasTaskStatus(task: Task, status: TaskStatus): boolean {
  return task.status === status;
}

/**
 * Checks if a task is ready to execute (pending with no unmet dependencies)
 * 
 * @example
 * ```typescript
 * expect(isTaskReady(task, [completedTask1, completedTask2])).toBe(true);
 * ```
 */
export function isTaskReady(task: Task, completedTaskIds: string[]): boolean {
  if (task.status !== TaskStatus.PENDING) return false;
  return task.dependsOn.every(depId => completedTaskIds.includes(depId));
}

/**
 * Gets all valid task statuses
 */
export const TASK_STATUSES = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.PAUSED,
  TaskStatus.AWAITING_APPROVAL,
  TaskStatus.CANCELLED,
  TaskStatus.FAILED,
  TaskStatus.COMPLETED,
] as const;

/**
 * Gets terminal statuses (tasks that are done)
 */
export const TERMINAL_TASK_STATUSES = [
  TaskStatus.COMPLETED,
  TaskStatus.FAILED,
  TaskStatus.CANCELLED,
] as const;

/**
 * Gets active statuses (tasks that are in progress or waiting)
 */
export const ACTIVE_TASK_STATUSES = [
  TaskStatus.PENDING,
  TaskStatus.IN_PROGRESS,
  TaskStatus.BLOCKED,
  TaskStatus.PAUSED,
  TaskStatus.AWAITING_APPROVAL,
] as const;

/**
 * All valid priority levels
 */
export const TASK_PRIORITIES: TaskPriority[] = ['low', 'medium', 'high', 'critical'];

// ============================================================================
// Default Export
// ============================================================================

export default {
  mockTask,
  mockInProgressTask,
  mockCompletedTask,
  mockBlockedTask,
  mockFailedTask,
  mockTaskWithDeps,
  mockCriticalTask,
  mockAwaitingApprovalTask,
  mockCancelledTask,
  mockTasksWithMixedStatuses,
  mockTaskDAG,
  createTestTask,
  createTestTasks,
  createTaskFromOptions,
  createQualityGate,
  createCheckpoint,
  isValidTask,
  hasTaskStatus,
  isTaskReady,
  TASK_STATUSES,
  TERMINAL_TASK_STATUSES,
  ACTIVE_TASK_STATUSES,
  TASK_PRIORITIES,
};
