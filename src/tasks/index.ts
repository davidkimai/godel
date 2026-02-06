/**
 * Tasks Module
 * 
 * File-system-based task management for godel.
 * Inspired by Claude Code Tasks (which was inspired by Steve Yegge's Beads).
 * 
 * Features:
 * - Persistent task storage in ~/.godel/tasks/
 * - Task dependencies and blocking
 * - Multi-session coordination via file watching
 * - Git integration (branches, commits)
 * 
 * @example
 * ```typescript
 * import { TaskStorage, TaskListService, createTask } from './tasks';
 * 
 * const storage = new TaskStorage();
 * await storage.init();
 * 
 * const service = new TaskListService(storage);
 * const task = await service.createTask('default', {
 *   title: 'Fix authentication bug',
 *   type: 'bug',
 *   priority: 'high'
 * });
 * ```
 */

// Types
export {
  Task,
  TaskList,
  TaskStatus,
  TaskPriority,
  TaskType,
  TaskListStatus,
  CreateTaskOptions,
  CreateTaskListOptions,
  generateTaskId,
  generateTaskListId,
  createTask,
  createTaskList,
} from './types';

// Storage
export {
  TaskStorage,
  TaskStorageError,
  TaskNotFoundError,
  TaskListNotFoundError,
  LockError,
  Lock,
  TaskIndex,
} from './storage';

// TaskList Service
export { TaskListService } from './tasklist';

// Constants
export const DEFAULT_TASK_LIST_ID = 'default';
export const TASKS_DIR_NAME = 'tasks';
export const TASK_LISTS_SUBDIR = 'lists';
export const TASK_LOCK_SUBDIR = '.lock';
