/**
 * Task Read Model
 *
 * CQRS read model for task projections. Maintains denormalized task views
 * optimized for status tracking and queries.
 *
 * @module loop/read-models/task-read-model
 */

import type { GodelEvent, ProjectionHandler } from '../event-replay';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Task status in the read model
 */
export type TaskStatus =
  | 'pending'
  | 'assigned'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Denormalized task view for queries
 */
export interface TaskView {
  /** Task ID */
  id: string;
  /** Task title */
  title?: string;
  /** Current status */
  status: TaskStatus;
  /** Assigned agent ID */
  assignedTo?: string;
  /** When task was created */
  createdAt?: number;
  /** When task was started */
  startedAt?: number;
  /** When task was completed */
  completedAt?: number;
  /** Task duration in ms */
  duration?: number;
  /** Number of attempts */
  attempts: number;
  /** Error message (if failed) */
  error?: string;
  /** Task priority */
  priority?: TaskPriority;
  /** Task dependencies */
  dependsOn: string[];
  /** Tasks blocked by this task */
  blocks: string[];
  /** Task type/category */
  type?: string;
  /** Progress (0-1) */
  progress: number;
  /** Last updated timestamp */
  updatedAt: number;
}

/**
 * Task statistics
 */
export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  failed: number;
  cancelled: number;
  averageDuration: number;
  successRate: number;
}

/**
 * Query options for filtering tasks
 */
export interface TaskQueryOptions {
  /** Filter by status */
  status?: TaskStatus;
  /** Filter by statuses */
  statuses?: TaskStatus[];
  /** Assigned to agent */
  assignedTo?: string;
  /** Minimum priority */
  minPriority?: TaskPriority;
  /** Created after timestamp */
  createdAfter?: number;
  /** Created before timestamp */
  createdBefore?: number;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

// ============================================================================
// Event Type Guards
// ============================================================================

interface TaskCreatedEvent extends GodelEvent {
  type: 'task.created';
  payload: {
    taskId?: string;
    id?: string;
    title?: string;
    priority?: TaskPriority;
    dependsOn?: string[];
    [key: string]: unknown;
  };
}

interface TaskAssignedEvent extends GodelEvent {
  type: 'task.assigned';
  payload: {
    taskId: string;
    agentId: string;
    [key: string]: unknown;
  };
}

interface TaskStartedEvent extends GodelEvent {
  type: 'task.started' | 'task.status_changed';
  payload: {
    taskId: string;
    newStatus?: string;
    [key: string]: unknown;
  };
}

interface TaskCompletedEvent extends GodelEvent {
  type: 'task.completed';
  payload: {
    taskId: string;
    duration?: number;
    runtime?: number;
    output?: string;
    result?: unknown;
    [key: string]: unknown;
  };
}

interface TaskFailedEvent extends GodelEvent {
  type: 'task.failed';
  payload: {
    taskId: string;
    error?: string;
    reason?: string;
    [key: string]: unknown;
  };
}

interface TaskCancelledEvent extends GodelEvent {
  type: 'task.cancelled';
  payload: {
    taskId: string;
    reason?: string;
    [key: string]: unknown;
  };
}

interface TaskProgressEvent extends GodelEvent {
  type: 'task.progress';
  payload: {
    taskId: string;
    progress: number;
    [key: string]: unknown;
  };
}

// ============================================================================
// Task Read Model
// ============================================================================

/**
 * Task Read Model for CQRS queries
 *
 * Projects task lifecycle events into a denormalized view
 * optimized for fast queries. Supports status tracking,
 * dependency management, and performance metrics.
 *
 * @example
 * ```typescript
 * const taskReadModel = new TaskReadModel();
 *
 * // Replay events to build state
 * await replayEngine.replay({ from: Date.now() - 86400000 });
 *
 * // Query the read model
 * const pending = await taskReadModel.getPending();
 * const stats = await taskReadModel.getStats();
 * const blocked = await taskReadModel.getBlocked();
 * ```
 */
export class TaskReadModel implements ProjectionHandler {
  readonly name = 'TaskReadModel';

  private tasks = new Map<string, TaskView>();

  // ============================================================================
  // ProjectionHandler Implementation
  // ============================================================================

  /**
   * Handle incoming events to update the read model
   */
  async handle(event: GodelEvent): Promise<void> {
    switch (event.type) {
      case 'task.created':
        this.handleTaskCreated(event as TaskCreatedEvent);
        break;

      case 'task.assigned':
        this.handleTaskAssigned(event as TaskAssignedEvent);
        break;

      case 'task.started':
        this.handleTaskStarted(event as TaskStartedEvent);
        break;

      case 'task.status_changed':
        this.handleStatusChanged(event as TaskStartedEvent);
        break;

      case 'task.completed':
        this.handleTaskCompleted(event as TaskCompletedEvent);
        break;

      case 'task.failed':
        this.handleTaskFailed(event as TaskFailedEvent);
        break;

      case 'task.cancelled':
        this.handleTaskCancelled(event as TaskCancelledEvent);
        break;

      case 'task.progress':
        this.handleTaskProgress(event as TaskProgressEvent);
        break;
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get a single task by ID
   */
  async getById(taskId: string): Promise<TaskView | null> {
    return this.tasks.get(taskId) || null;
  }

  /**
   * Get all tasks matching the query options
   */
  async getAll(options: TaskQueryOptions = {}): Promise<TaskView[]> {
    let tasks = Array.from(this.tasks.values());

    // Apply filters
    if (options.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }

    if (options.statuses?.length) {
      tasks = tasks.filter(t => options.statuses!.includes(t.status));
    }

    if (options.assignedTo) {
      tasks = tasks.filter(t => t.assignedTo === options.assignedTo);
    }

    if (options.minPriority) {
      const priorityOrder: Record<TaskPriority, number> = {
        low: 0,
        medium: 1,
        high: 2,
        critical: 3,
      };
      const minPriorityValue = priorityOrder[options.minPriority];
      tasks = tasks.filter(t =>
        t.priority ? priorityOrder[t.priority] >= minPriorityValue : false
      );
    }

    if (options.createdAfter) {
      tasks = tasks.filter(t =>
        t.createdAt ? t.createdAt >= options.createdAfter! : false
      );
    }

    if (options.createdBefore) {
      tasks = tasks.filter(t =>
        t.createdAt ? t.createdAt <= options.createdBefore! : false
      );
    }

    // Sort by priority and creation time
    tasks.sort((a, b) => {
      const priorityOrder: Record<TaskPriority, number> = {
        critical: 0,
        high: 1,
        medium: 2,
        low: 3,
      };
      const priorityA = a.priority ? priorityOrder[a.priority] : 4;
      const priorityB = b.priority ? priorityOrder[b.priority] : 4;

      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }

      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    // Apply pagination
    if (options.offset) {
      tasks = tasks.slice(options.offset);
    }
    if (options.limit) {
      tasks = tasks.slice(0, options.limit);
    }

    return tasks;
  }

  /**
   * Get pending tasks
   */
  async getPending(): Promise<TaskView[]> {
    return this.getAll({ status: 'pending' });
  }

  /**
   * Get in-progress tasks
   */
  async getInProgress(): Promise<TaskView[]> {
    return this.getAll({ status: 'in-progress' });
  }

  /**
   * Get assigned but not started tasks
   */
  async getAssigned(): Promise<TaskView[]> {
    return this.getAll({ status: 'assigned' });
  }

  /**
   * Get completed tasks
   */
  async getCompleted(options: Omit<TaskQueryOptions, 'status'> = {}): Promise<TaskView[]> {
    return this.getAll({ ...options, status: 'completed' });
  }

  /**
   * Get failed tasks
   */
  async getFailed(): Promise<TaskView[]> {
    return this.getAll({ status: 'failed' });
  }

  /**
   * Get tasks assigned to a specific agent
   */
  async getByAgent(agentId: string): Promise<TaskView[]> {
    return this.getAll({ assignedTo: agentId });
  }

  /**
   * Get tasks ready to execute (pending with satisfied dependencies)
   */
  async getReady(): Promise<TaskView[]> {
    const pending = await this.getPending();
    return pending.filter(task =>
      task.dependsOn.every(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status === 'completed';
      })
    );
  }

  /**
   * Get blocked tasks (pending with uncompleted dependencies)
   */
  async getBlocked(): Promise<TaskView[]> {
    const pending = await this.getPending();
    return pending.filter(task =>
      task.dependsOn.some(depId => {
        const dep = this.tasks.get(depId);
        return dep?.status !== 'completed';
      })
    );
  }

  /**
   * Get task statistics
   */
  async getStats(): Promise<TaskStats> {
    const tasks = Array.from(this.tasks.values());

    const completed = tasks.filter(t => t.status === 'completed');
    const withDuration = completed.filter(t => t.duration && t.duration > 0);

    const averageDuration =
      withDuration.length > 0
        ? withDuration.reduce((sum, t) => sum + (t.duration || 0), 0) /
          withDuration.length
        : 0;

    const totalCompleted = tasks.filter(t => t.status === 'completed').length;
    const totalFailed = tasks.filter(t => t.status === 'failed').length;
    const total = totalCompleted + totalFailed;

    return {
      total: tasks.length,
      pending: tasks.filter(t => t.status === 'pending').length,
      inProgress: tasks.filter(t => t.status === 'in-progress').length,
      completed: totalCompleted,
      failed: totalFailed,
      cancelled: tasks.filter(t => t.status === 'cancelled').length,
      averageDuration,
      successRate: total > 0 ? totalCompleted / total : 0,
    };
  }

  /**
   * Get overdue tasks (in-progress for too long)
   */
  async getOverdue(maxDuration: number = 3600000): Promise<TaskView[]> {
    const now = Date.now();
    return Array.from(this.tasks.values()).filter(
      t =>
        t.status === 'in-progress' &&
        t.startedAt &&
        now - t.startedAt > maxDuration
    );
  }

  /**
   * Get tasks that should be retried (failed with attempts remaining)
   */
  async getRetryable(maxAttempts: number = 3): Promise<TaskView[]> {
    return Array.from(this.tasks.values()).filter(
      t => t.status === 'failed' && t.attempts < maxAttempts
    );
  }

  /**
   * Get task count
   */
  getCount(): number {
    return this.tasks.size;
  }

  /**
   * Clear all tasks (for testing)
   */
  clear(): void {
    this.tasks.clear();
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleTaskCreated(event: TaskCreatedEvent): void {
    const payload = event.payload;
    const taskId = payload.taskId || (payload['id'] as string);

    if (!taskId || this.tasks.has(taskId)) return;

    const view: TaskView = {
      id: taskId,
      title: payload.title,
      status: 'pending',
      priority: payload.priority,
      dependsOn: payload.dependsOn || [],
      blocks: [],
      attempts: 0,
      progress: 0,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
    };

    this.tasks.set(view.id, view);

    // Update dependency relationships
    for (const depId of view.dependsOn) {
      const dep = this.tasks.get(depId);
      if (dep && !dep.blocks.includes(view.id)) {
        dep.blocks.push(view.id);
      }
    }
  }

  private handleTaskAssigned(event: TaskAssignedEvent): void {
    const { taskId, agentId } = event.payload;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.assignedTo = agentId;
    task.status = 'assigned';
    task.updatedAt = event.timestamp;
  }

  private handleTaskStarted(event: TaskStartedEvent): void {
    const { taskId } = event.payload;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'in-progress';
    task.startedAt = event.timestamp;
    task.attempts++;
    task.updatedAt = event.timestamp;
  }

  private handleStatusChanged(event: TaskStartedEvent): void {
    const { taskId, newStatus } = event.payload;
    if (!newStatus) return;

    const task = this.tasks.get(taskId);
    if (!task) return;

    // Map status changes
    const statusMap: Record<string, TaskStatus> = {
      pending: 'pending',
      in_progress: 'in-progress',
      inprogress: 'in-progress',
      completed: 'completed',
      failed: 'failed',
      cancelled: 'cancelled',
    };

    const mappedStatus = statusMap[newStatus.toLowerCase()];
    if (mappedStatus) {
      task.status = mappedStatus;

      if (mappedStatus === 'in-progress' && !task.startedAt) {
        task.startedAt = event.timestamp;
        task.attempts++;
      }
    }

    task.updatedAt = event.timestamp;
  }

  private handleTaskCompleted(event: TaskCompletedEvent): void {
    const { taskId, duration, runtime } = event.payload;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'completed';
    task.completedAt = event.timestamp;
    task.duration = duration || runtime;
    task.progress = 1;
    task.updatedAt = event.timestamp;
  }

  private handleTaskFailed(event: TaskFailedEvent): void {
    const { taskId, error, reason } = event.payload;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'failed';
    task.completedAt = event.timestamp;
    task.error = error || reason;
    task.updatedAt = event.timestamp;
  }

  private handleTaskCancelled(event: TaskCancelledEvent): void {
    const { taskId } = event.payload;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.status = 'cancelled';
    task.completedAt = event.timestamp;
    task.updatedAt = event.timestamp;
  }

  private handleTaskProgress(event: TaskProgressEvent): void {
    const { taskId, progress } = event.payload;
    const task = this.tasks.get(taskId);
    if (!task) return;

    task.progress = Math.max(0, Math.min(1, progress));
    task.updatedAt = event.timestamp;
  }
}

// ============================================================================
// Task Dependency Graph
// ============================================================================

/**
 * Task dependency graph for managing task relationships
 */
export class TaskDependencyGraph {
  private dependencies = new Map<string, Set<string>>();
  private dependents = new Map<string, Set<string>>();

  /**
   * Add a dependency edge (task depends on dependency)
   */
  addDependency(taskId: string, dependencyId: string): void {
    if (!this.dependencies.has(taskId)) {
      this.dependencies.set(taskId, new Set());
    }
    this.dependencies.get(taskId)!.add(dependencyId);

    if (!this.dependents.has(dependencyId)) {
      this.dependents.set(dependencyId, new Set());
    }
    this.dependents.get(dependencyId)!.add(taskId);
  }

  /**
   * Remove a dependency edge
   */
  removeDependency(taskId: string, dependencyId: string): void {
    this.dependencies.get(taskId)?.delete(dependencyId);
    this.dependents.get(dependencyId)?.delete(taskId);
  }

  /**
   * Get all dependencies for a task
   */
  getDependencies(taskId: string): string[] {
    return Array.from(this.dependencies.get(taskId) || []);
  }

  /**
   * Get all tasks that depend on a task
   */
  getDependents(taskId: string): string[] {
    return Array.from(this.dependents.get(taskId) || []);
  }

  /**
   * Check if all dependencies are satisfied (completed)
   */
  areDependenciesMet(taskId: string, completedTasks: Set<string>): boolean {
    const deps = this.dependencies.get(taskId);
    if (!deps || deps.size === 0) return true;

    return Array.from(deps).every(depId => completedTasks.has(depId));
  }

  /**
   * Topological sort of tasks
   */
  topologicalSort(taskIds: string[]): string[] {
    const inDegree = new Map<string, number>();
    const graph = new Map<string, Set<string>>();

    // Initialize
    for (const taskId of taskIds) {
      inDegree.set(taskId, 0);
      graph.set(taskId, new Set());
    }

    // Build graph
    for (const taskId of taskIds) {
      const deps = this.dependencies.get(taskId);
      if (deps) {
        for (const depId of deps) {
          if (graph.has(depId)) {
            graph.get(depId)!.add(taskId);
            inDegree.set(taskId, (inDegree.get(taskId) || 0) + 1);
          }
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    const result: string[] = [];

    for (const [taskId, degree] of inDegree) {
      if (degree === 0) queue.push(taskId);
    }

    while (queue.length > 0) {
      const taskId = queue.shift()!;
      result.push(taskId);

      const neighbors = graph.get(taskId);
      if (neighbors) {
        for (const neighbor of neighbors) {
          const newDegree = (inDegree.get(neighbor) || 0) - 1;
          inDegree.set(neighbor, newDegree);
          if (newDegree === 0) queue.push(neighbor);
        }
      }
    }

    // Check for cycles
    if (result.length !== taskIds.length) {
      throw new Error('Circular dependency detected in tasks');
    }

    return result;
  }

  /**
   * Clear all dependencies
   */
  clear(): void {
    this.dependencies.clear();
    this.dependents.clear();
  }
}
