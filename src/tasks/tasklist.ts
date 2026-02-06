/**
 * TaskList Service
 *
 * Manages tasks and their coordination including:
 * - Task CRUD operations
 * - Status management and transitions
 * - Dependency resolution
 * - Task assignment
 * - TaskList management
 *
 * @module tasks/tasklist
 */

import { EventEmitter } from 'events';

// ═══════════════════════════════════════════════════════════════════════════════
// Type Definitions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Task status values
 */
export type TaskStatus = 'open' | 'in-progress' | 'blocked' | 'review' | 'done';

/**
 * Task priority levels
 */
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/**
 * Task types
 */
export type TaskType = 'task' | 'bug' | 'feature' | 'refactor' | 'research';

/**
 * Task entity
 */
export interface Task {
  /** Unique task identifier */
  id: string;
  /** Task title */
  title: string;
  /** Task description */
  description?: string;
  /** Current status */
  status: TaskStatus;
  /** IDs of tasks this task depends on */
  dependsOn: string[];
  /** IDs of tasks blocked by this task */
  blocks: string[];
  /** Assigned agent ID */
  assignee?: string;
  /** Git worktree path */
  worktree?: string;
  /** Task priority */
  priority: TaskPriority;
  /** Task type */
  type: TaskType;
  /** Task tags */
  tags: string[];
  /** Git branch for this task */
  branch?: string;
  /** Associated commits */
  commits: string[];
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Completion timestamp (ISO 8601) */
  completedAt?: string;
  /** Session IDs working on this task */
  sessions: string[];
}

/**
 * TaskList entity
 */
export interface TaskList {
  /** Unique list identifier */
  id: string;
  /** List name */
  name: string;
  /** List description */
  description?: string;
  /** Task IDs in this list */
  tasks: string[];
  /** List status */
  status: 'active' | 'completed' | 'archived';
  /** Session IDs subscribed to this list */
  sessions: string[];
  /** Creation timestamp (ISO 8601) */
  createdAt: string;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Completion timestamp (ISO 8601) */
  completedAt?: string;
}

/**
 * Options for creating a task
 */
export interface CreateTaskOptions {
  /** Task title */
  title: string;
  /** Task description */
  description?: string;
  /** Task type */
  type?: TaskType;
  /** Task priority */
  priority?: TaskPriority;
  /** IDs of tasks this depends on */
  dependsOn?: string[];
  /** Assigned agent ID */
  assignee?: string;
}

/**
 * Options for creating a task list
 */
export interface CreateTaskListOptions {
  /** List name */
  name: string;
  /** List description */
  description?: string;
}

/**
 * Task storage interface
 */
export interface TaskStorage {
  /** Save a task */
  saveTask(task: Task): Promise<void>;
  /** Get a task by ID */
  getTask(id: string): Promise<Task | null>;
  /** Delete a task */
  deleteTask(id: string): Promise<void>;
  /** List all tasks */
  listTasks(): Promise<Task[]>;
  /** Save a task list */
  saveTaskList(list: TaskList): Promise<void>;
  /** Get a task list by ID */
  getTaskList(id: string): Promise<TaskList | null>;
  /** Delete a task list */
  deleteTaskList(id: string): Promise<void>;
  /** List all task lists */
  listTaskLists(): Promise<TaskList[]>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a unique task ID
 * Format: godel-{5-char-random}
 */
function generateTaskId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'godel-';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a unique list ID
 * Format: list-{5-char-random}
 */
function generateListId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'list-';
  for (let i = 0; i < 5; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Get current ISO timestamp
 */
function now(): string {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TaskListService Class
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Events emitted by TaskListService:
 * - 'task:created' - { task, listId }
 * - 'task:updated' - { task, changes }
 * - 'task:deleted' - { taskId }
 * - 'task:statusChanged' - { task, oldStatus, newStatus }
 * - 'list:updated' - { list }
 */
export class TaskListService extends EventEmitter {
  private storage: TaskStorage;

  /**
   * Create a new TaskListService
   * @param storage - TaskStorage implementation
   */
  constructor(storage: TaskStorage) {
    super();
    this.storage = storage;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Task Management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new task in a task list
   * @param listId - ID of the task list
   * @param options - Task creation options
   * @returns The created task
   */
  async createTask(listId: string, options: CreateTaskOptions): Promise<Task> {
    // Verify list exists
    const list = await this.storage.getTaskList(listId);
    if (!list) {
      throw new Error(`TaskList not found: ${listId}`);
    }

    // Create task
    const task: Task = {
      id: generateTaskId(),
      title: options.title,
      description: options.description,
      status: 'open',
      dependsOn: options.dependsOn || [],
      blocks: [],
      assignee: options.assignee,
      worktree: undefined,
      priority: options.priority || 'medium',
      type: options.type || 'task',
      tags: [],
      branch: undefined,
      commits: [],
      createdAt: now(),
      updatedAt: now(),
      completedAt: undefined,
      sessions: [],
    };

    // Save task
    await this.storage.saveTask(task);

    // Update list
    list.tasks.push(task.id);
    list.updatedAt = now();
    await this.storage.saveTaskList(list);

    // Update blocks on dependency tasks
    if (task.dependsOn.length > 0) {
      for (const depId of task.dependsOn) {
        const dep = await this.storage.getTask(depId);
        if (dep && !dep.blocks.includes(task.id)) {
          dep.blocks.push(task.id);
          dep.updatedAt = now();
          await this.storage.saveTask(dep);
        }
      }
    }

    // Emit events
    this.emit('task:created', { task, listId });
    this.emit('list:updated', { list });

    return task;
  }

  /**
   * Get a task by ID
   * @param taskId - Task ID
   * @returns The task or null if not found
   */
  async getTask(taskId: string): Promise<Task | null> {
    return this.storage.getTask(taskId);
  }

  /**
   * Update a task
   * @param taskId - Task ID
   * @param updates - Partial task updates
   * @returns The updated task
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const oldStatus = task.status;
    const changes: string[] = [];

    // Apply updates (excluding immutable fields)
    const immutableFields: (keyof Task)[] = ['id', 'createdAt'];
    const taskRecord = task as unknown as Record<string, unknown>;
    for (const [key, value] of Object.entries(updates)) {
      if (!immutableFields.includes(key as keyof Task)) {
        if (taskRecord[key] !== value) {
          taskRecord[key] = value;
          changes.push(key);
        }
      }
    }

    if (changes.length === 0) {
      return task;
    }

    task.updatedAt = now();
    await this.storage.saveTask(task);

    // Emit events
    this.emit('task:updated', { task, changes });

    if (changes.includes('status') && oldStatus !== task.status) {
      this.emit('task:statusChanged', {
        task,
        oldStatus,
        newStatus: task.status,
      });
    }

    return task;
  }

  /**
   * Delete a task
   * @param taskId - Task ID
   */
  async deleteTask(taskId: string): Promise<void> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Remove from dependency blocks
    for (const depId of task.dependsOn) {
      const dep = await this.storage.getTask(depId);
      if (dep) {
        dep.blocks = dep.blocks.filter(id => id !== taskId);
        dep.updatedAt = now();
        await this.storage.saveTask(dep);
      }
    }

    // Update blocked tasks
    for (const blockedId of task.blocks) {
      const blocked = await this.storage.getTask(blockedId);
      if (blocked) {
        blocked.dependsOn = blocked.dependsOn.filter(id => id !== taskId);
        blocked.updatedAt = now();
        await this.storage.saveTask(blocked);
      }
    }

    // Remove from all lists
    const lists = await this.storage.listTaskLists();
    for (const list of lists) {
      if (list.tasks.includes(taskId)) {
        list.tasks = list.tasks.filter(id => id !== taskId);
        list.updatedAt = now();
        await this.storage.saveTaskList(list);
        this.emit('list:updated', { list });
      }
    }

    // Delete task
    await this.storage.deleteTask(taskId);

    this.emit('task:deleted', { taskId });
  }

  /**
   * Move a task to a different list
   * @param taskId - Task ID
   * @param newListId - Destination list ID
   */
  async moveTask(taskId: string, newListId: string): Promise<void> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const newList = await this.storage.getTaskList(newListId);
    if (!newList) {
      throw new Error(`TaskList not found: ${newListId}`);
    }

    // Find and update old list
    const lists = await this.storage.listTaskLists();
    for (const list of lists) {
      if (list.tasks.includes(taskId)) {
        list.tasks = list.tasks.filter(id => id !== taskId);
        list.updatedAt = now();
        await this.storage.saveTaskList(list);
        this.emit('list:updated', { list });
        break;
      }
    }

    // Add to new list
    if (!newList.tasks.includes(taskId)) {
      newList.tasks.push(taskId);
      newList.updatedAt = now();
      await this.storage.saveTaskList(newList);
      this.emit('list:updated', { list: newList });
    }

    // Update task
    task.updatedAt = now();
    await this.storage.saveTask(task);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Status Management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Start a task (set status to 'in-progress')
   * @param taskId - Task ID
   * @returns The updated task
   */
  async startTask(taskId: string): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Check dependencies
    const depsSatisfied = await this.checkDependencies(taskId);
    if (!depsSatisfied) {
      throw new Error(`Cannot start task: dependencies not satisfied`);
    }

    const oldStatus = task.status;
    task.status = 'in-progress';
    task.updatedAt = now();

    await this.storage.saveTask(task);

    this.emit('task:updated', { task, changes: ['status'] });
    this.emit('task:statusChanged', {
      task,
      oldStatus,
      newStatus: task.status,
    });

    return task;
  }

  /**
   * Complete a task (set status to 'done')
   * @param taskId - Task ID
   * @returns The updated task
   */
  async completeTask(taskId: string): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const oldStatus = task.status;
    task.status = 'done';
    task.completedAt = now();
    task.updatedAt = now();

    await this.storage.saveTask(task);

    // Check if any blocked tasks can be unblocked
    for (const blockedId of task.blocks) {
      const blocked = await this.storage.getTask(blockedId);
      if (blocked && blocked.status === 'blocked') {
        await this.unblockTask(blockedId);
      }
    }

    // Check if list is complete
    const lists = await this.storage.listTaskLists();
    for (const list of lists) {
      if (list.tasks.includes(taskId)) {
        await this.checkListCompletion(list.id);
        break;
      }
    }

    this.emit('task:updated', { task, changes: ['status', 'completedAt'] });
    this.emit('task:statusChanged', {
      task,
      oldStatus,
      newStatus: task.status,
    });

    return task;
  }

  /**
   * Block a task
   * @param taskId - Task ID
   * @param reason - Optional reason for blocking
   * @returns The updated task
   */
  async blockTask(taskId: string, reason?: string): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const oldStatus = task.status;
    task.status = 'blocked';

    if (reason && !task.description?.includes(`BLOCKED: ${reason}`)) {
      task.description = task.description
        ? `${task.description}\n\nBLOCKED: ${reason}`
        : `BLOCKED: ${reason}`;
    }

    task.updatedAt = now();
    await this.storage.saveTask(task);

    this.emit('task:updated', { task, changes: ['status', 'description'] });
    this.emit('task:statusChanged', {
      task,
      oldStatus,
      newStatus: task.status,
    });

    return task;
  }

  /**
   * Unblock a task (check dependencies, set to 'open' or 'in-progress')
   * @param taskId - Task ID
   * @returns The updated task
   */
  async unblockTask(taskId: string): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.status !== 'blocked') {
      return task;
    }

    // Check dependencies
    const depsSatisfied = await this.checkDependencies(taskId);

    const oldStatus = task.status;
    task.status = depsSatisfied ? 'open' : 'blocked';

    // Remove BLOCKED prefix from description if present
    if (task.description) {
      task.description = task.description.replace(/\n?\n?BLOCKED:[\s\S]*$/, '');
      if (task.description === '') {
        task.description = undefined;
      }
    }

    task.updatedAt = now();
    await this.storage.saveTask(task);

    this.emit('task:updated', { task, changes: ['status', 'description'] });
    this.emit('task:statusChanged', {
      task,
      oldStatus,
      newStatus: task.status,
    });

    return task;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Dependency Resolution
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if all dependencies for a task are satisfied (done)
   * @param taskId - Task ID
   * @returns True if all dependencies are done
   */
  async checkDependencies(taskId: string): Promise<boolean> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    if (task.dependsOn.length === 0) {
      return true;
    }

    for (const depId of task.dependsOn) {
      const dep = await this.storage.getTask(depId);
      if (!dep || dep.status !== 'done') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get tasks that are blocked by a given task
   * @param taskId - Task ID
   * @returns Array of task IDs that are blocked by this task
   */
  async getBlockedTasks(taskId: string): Promise<string[]> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return [...task.blocks];
  }

  /**
   * Add a dependency to a task
   * @param taskId - Task ID that depends on another
   * @param dependsOnId - Task ID that must complete first
   */
  async addDependency(taskId: string, dependsOnId: string): Promise<void> {
    if (taskId === dependsOnId) {
      throw new Error('Task cannot depend on itself');
    }

    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const dependsOn = await this.storage.getTask(dependsOnId);
    if (!dependsOn) {
      throw new Error(`Dependency task not found: ${dependsOnId}`);
    }

    // Check for circular dependency
    if (dependsOn.dependsOn.includes(taskId)) {
      throw new Error('Circular dependency detected');
    }

    // Add dependency
    if (!task.dependsOn.includes(dependsOnId)) {
      task.dependsOn.push(dependsOnId);
      task.updatedAt = now();
      await this.storage.saveTask(task);

      // Update blocks on dependency task
      if (!dependsOn.blocks.includes(taskId)) {
        dependsOn.blocks.push(taskId);
        dependsOn.updatedAt = now();
        await this.storage.saveTask(dependsOn);
      }

      // If dependency is not done, block the task
      if (dependsOn.status !== 'done') {
        await this.blockTask(taskId, `Waiting for ${dependsOnId}`);
      }

      this.emit('task:updated', { task, changes: ['dependsOn'] });
    }
  }

  /**
   * Remove a dependency from a task
   * @param taskId - Task ID
   * @param dependsOnId - Dependency task ID to remove
   */
  async removeDependency(taskId: string, dependsOnId: string): Promise<void> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const dependsOn = await this.storage.getTask(dependsOnId);

    // Remove from task's dependsOn
    if (task.dependsOn.includes(dependsOnId)) {
      task.dependsOn = task.dependsOn.filter(id => id !== dependsOnId);
      task.updatedAt = now();
      await this.storage.saveTask(task);

      // Remove from dependency's blocks
      if (dependsOn) {
        dependsOn.blocks = dependsOn.blocks.filter(id => id !== taskId);
        dependsOn.updatedAt = now();
        await this.storage.saveTask(dependsOn);
      }

      // Try to unblock the task
      if (task.status === 'blocked') {
        await this.unblockTask(taskId);
      }

      this.emit('task:updated', { task, changes: ['dependsOn'] });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Assignment
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Assign a task to an agent
   * @param taskId - Task ID
   * @param agentId - Agent ID
   * @returns The updated task
   */
  async assignTask(taskId: string, agentId: string): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.assignee = agentId;
    task.updatedAt = now();

    await this.storage.saveTask(task);

    this.emit('task:updated', { task, changes: ['assignee'] });

    return task;
  }

  /**
   * Unassign a task
   * @param taskId - Task ID
   * @returns The updated task
   */
  async unassignTask(taskId: string): Promise<Task> {
    const task = await this.storage.getTask(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    task.assignee = undefined;
    task.updatedAt = now();

    await this.storage.saveTask(task);

    this.emit('task:updated', { task, changes: ['assignee'] });

    return task;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TaskList Management
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Create a new task list
   * @param options - Task list creation options
   * @returns The created task list
   */
  async createTaskList(options: CreateTaskListOptions): Promise<TaskList> {
    const list: TaskList = {
      id: generateListId(),
      name: options.name,
      description: options.description,
      tasks: [],
      status: 'active',
      sessions: [],
      createdAt: now(),
      updatedAt: now(),
    };

    await this.storage.saveTaskList(list);

    this.emit('list:updated', { list });

    return list;
  }

  /**
   * Get a task list by ID
   * @param listId - List ID
   * @returns The task list or null if not found
   */
  async getTaskList(listId: string): Promise<TaskList | null> {
    return this.storage.getTaskList(listId);
  }

  /**
   * Archive a task list
   * @param listId - List ID
   * @returns The updated task list
   */
  async archiveTaskList(listId: string): Promise<TaskList> {
    const list = await this.storage.getTaskList(listId);
    if (!list) {
      throw new Error(`TaskList not found: ${listId}`);
    }

    list.status = 'archived';
    list.updatedAt = now();

    await this.storage.saveTaskList(list);

    this.emit('list:updated', { list });

    return list;
  }

  /**
   * Delete a task list and optionally its tasks
   * @param listId - List ID
   */
  async deleteTaskList(listId: string): Promise<void> {
    const list = await this.storage.getTaskList(listId);
    if (!list) {
      throw new Error(`TaskList not found: ${listId}`);
    }

    // Delete all tasks in the list
    for (const taskId of list.tasks) {
      await this.deleteTask(taskId);
    }

    // Delete the list
    await this.storage.deleteTaskList(listId);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Query Methods
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Get all tasks in a task list
   * @param listId - List ID
   * @returns Array of tasks
   */
  async getTasksByList(listId: string): Promise<Task[]> {
    const list = await this.storage.getTaskList(listId);
    if (!list) {
      throw new Error(`TaskList not found: ${listId}`);
    }

    const tasks: Task[] = [];
    for (const taskId of list.tasks) {
      const task = await this.storage.getTask(taskId);
      if (task) {
        tasks.push(task);
      }
    }

    return tasks;
  }

  /**
   * Get tasks by status
   * @param status - Task status
   * @returns Array of tasks with the given status
   */
  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const allTasks = await this.storage.listTasks();
    return allTasks.filter(task => task.status === status);
  }

  /**
   * Get tasks assigned to an agent
   * @param agentId - Agent ID
   * @returns Array of tasks assigned to the agent
   */
  async getTasksByAssignee(agentId: string): Promise<Task[]> {
    const allTasks = await this.storage.listTasks();
    return allTasks.filter(task => task.assignee === agentId);
  }

  /**
   * Get tasks that are ready to work on (all dependencies satisfied)
   * @param listId - Optional list ID to filter by
   * @returns Array of ready tasks
   */
  async getReadyTasks(listId?: string): Promise<Task[]> {
    let tasks: Task[];

    if (listId) {
      tasks = await this.getTasksByList(listId);
    } else {
      tasks = await this.storage.listTasks();
    }

    const readyTasks: Task[] = [];

    for (const task of tasks) {
      if (task.status === 'open' || task.status === 'blocked') {
        const depsSatisfied = await this.checkDependencies(task.id);
        if (depsSatisfied) {
          readyTasks.push(task);
        }
      }
    }

    return readyTasks;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Private Helpers
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Check if a task list is complete and update its status
   * @param listId - List ID
   */
  private async checkListCompletion(listId: string): Promise<void> {
    const list = await this.storage.getTaskList(listId);
    if (!list || list.status === 'archived') {
      return;
    }

    if (list.tasks.length === 0) {
      return;
    }

    const tasks = await this.getTasksByList(listId);
    const allDone = tasks.every(task => task.status === 'done');

    if (allDone) {
      list.status = 'completed';
      list.completedAt = now();
      list.updatedAt = now();
      await this.storage.saveTaskList(list);
      this.emit('list:updated', { list });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════════════════

export default TaskListService;
