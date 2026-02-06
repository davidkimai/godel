/**
 * Task Storage Layer - File-system based storage for godel Tasks
 * 
 * Provides CRUD operations for Tasks and TaskLists with:
 * - JSON serialization/deserialization
 * - Directory management
 * - File locking for multi-session coordination
 * - Index management
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface Task {
  id: string;
  title: string;
  description?: string;
  status: 'open' | 'in-progress' | 'blocked' | 'review' | 'done';
  dependsOn: string[];
  blocks: string[];
  assignee?: string;
  worktree?: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  type: 'task' | 'bug' | 'feature' | 'refactor' | 'research';
  tags: string[];
  branch?: string;
  commits: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  sessions: string[];
}

export interface TaskList {
  id: string;
  name: string;
  description?: string;
  tasks: string[];
  status: 'active' | 'completed' | 'archived';
  sessions: string[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Lock {
  id: string;
  filePath: string;
  acquiredAt: number;
}

export interface TaskIndex {
  lists: string[];
}

// ============================================================================
// Errors
// ============================================================================

export class TaskStorageError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'TaskStorageError';
  }
}

export class TaskNotFoundError extends TaskStorageError {
  constructor(taskId: string) {
    super(`Task not found: ${taskId}`);
    this.name = 'TaskNotFoundError';
  }
}

export class TaskListNotFoundError extends TaskStorageError {
  constructor(listId: string) {
    super(`TaskList not found: ${listId}`);
    this.name = 'TaskListNotFoundError';
  }
}

export class LockError extends TaskStorageError {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

// ============================================================================
// TaskStorage Class
// ============================================================================

export class TaskStorage {
  private readonly basePath: string;
  private readonly listsPath: string;
  private readonly lockPath: string;
  private readonly indexPath: string;
  private initialized: boolean = false;

  /**
   * Create a new TaskStorage instance
   * @param basePath - Base directory for task storage (defaults to ~/.godel/tasks)
   */
  constructor(basePath?: string) {
    this.basePath = basePath || path.join(os.homedir(), '.godel', 'tasks');
    this.listsPath = path.join(this.basePath, 'lists');
    this.lockPath = path.join(this.basePath, '.lock');
    this.indexPath = path.join(this.basePath, 'index.json');
  }

  /**
   * Initialize the storage directories
   * Creates all necessary directories if they don't exist
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Create base directories recursively
      await fs.mkdir(this.basePath, { recursive: true });
      await fs.mkdir(this.listsPath, { recursive: true });
      await fs.mkdir(this.lockPath, { recursive: true });

      // Mark as initialized early to prevent recursive init calls
      this.initialized = true;

      // Create index file if it doesn't exist
      try {
        await fs.access(this.indexPath);
      } catch {
        // Index doesn't exist, create it
        await this.writeJson(this.indexPath, { lists: [] });
      }

      // Create default list if it doesn't exist
      const defaultListPath = this.getTaskListPath('default');
      try {
        await fs.access(defaultListPath);
      } catch {
        // Default list doesn't exist, create it
        const defaultList: TaskList = {
          id: 'default',
          name: 'Default',
          description: 'Default task list',
          tasks: [],
          status: 'active',
          sessions: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await this.saveTaskList(defaultList);
      }
    } catch (error) {
      throw new TaskStorageError(
        `Failed to initialize task storage at ${this.basePath}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Ensure storage is initialized before operations
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.init();
    }
  }

  // ============================================================================
  // Path Helpers
  // ============================================================================

  /**
   * Get the file path for a task
   * Tasks are stored in lists directory as {listId}/{taskId}.json
   * For standalone tasks, they go to lists/default/{taskId}.json
   */
  getTaskPath(taskId: string, listId: string = 'default'): string {
    return path.join(this.listsPath, listId, `${taskId}.json`);
  }

  /**
   * Get the file path for a task list
   */
  getTaskListPath(listId: string): string {
    return path.join(this.listsPath, `${listId}.json`);
  }

  /**
   * Get the lock file path for a given ID
   */
  private getLockPath(id: string): string {
    return path.join(this.lockPath, `${id}.lock`);
  }

  // ============================================================================
  // JSON Helpers
  // ============================================================================

  /**
   * Read and parse JSON from a file
   */
  private async readJson<T>(filePath: string): Promise<T | null> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      throw new TaskStorageError(
        `Failed to read JSON from ${filePath}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Write JSON to a file
   */
  private async writeJson(filePath: string, data: unknown): Promise<void> {
    try {
      // Ensure parent directory exists
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });

      // Write with pretty formatting for readability
      await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch (error) {
      throw new TaskStorageError(
        `Failed to write JSON to ${filePath}`,
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Delete a file
   */
  private async deleteFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw new TaskStorageError(
          `Failed to delete file ${filePath}`,
          error instanceof Error ? error : undefined
        );
      }
    }
  }

  // ============================================================================
  // Task CRUD Operations
  // ============================================================================

  /**
   * Save a task to storage
   */
  async saveTask(task: Task, listId: string = 'default'): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.getTaskPath(task.id, listId);
    
    // Update the updatedAt timestamp
    const taskToSave: Task = {
      ...task,
      updatedAt: new Date().toISOString(),
    };

    await this.writeJson(filePath, taskToSave);
  }

  /**
   * Get a task by ID
   * Searches across all lists if listId not specified
   */
  async getTask(taskId: string, listId?: string): Promise<Task | null> {
    await this.ensureInitialized();

    if (listId) {
      // Search in specific list
      const filePath = this.getTaskPath(taskId, listId);
      return this.readJson<Task>(filePath);
    }

    // Search across all lists
    const lists = await this.listTaskLists();
    for (const list of lists) {
      const filePath = this.getTaskPath(taskId, list.id);
      const task = await this.readJson<Task>(filePath);
      if (task) {
        return task;
      }
    }

    return null;
  }

  /**
   * Delete a task by ID
   */
  async deleteTask(taskId: string, listId: string = 'default'): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.getTaskPath(taskId, listId);
    await this.deleteFile(filePath);
  }

  /**
   * List all tasks in a specific list
   */
  async listTasks(listId: string = 'default'): Promise<Task[]> {
    await this.ensureInitialized();

    const listDir = path.join(this.listsPath, listId);
    
    try {
      const entries = await fs.readdir(listDir, { withFileTypes: true });
      const tasks: Task[] = [];

      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const filePath = path.join(listDir, entry.name);
          const task = await this.readJson<Task>(filePath);
          if (task) {
            tasks.push(task);
          }
        }
      }

      // Sort by createdAt (newest first)
      return tasks.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // List directory doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if a task exists
   */
  async taskExists(taskId: string, listId: string = 'default'): Promise<boolean> {
    await this.ensureInitialized();

    const filePath = this.getTaskPath(taskId, listId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // TaskList CRUD Operations
  // ============================================================================

  /**
   * Save a task list to storage
   */
  async saveTaskList(list: TaskList): Promise<void> {
    await this.ensureInitialized();

    const filePath = this.getTaskListPath(list.id);
    
    // Update the updatedAt timestamp
    const listToSave: TaskList = {
      ...list,
      updatedAt: new Date().toISOString(),
    };

    await this.writeJson(filePath, listToSave);

    // Update the index
    await this.updateIndex(listToSave);
  }

  /**
   * Get a task list by ID
   */
  async getTaskList(listId: string): Promise<TaskList | null> {
    await this.ensureInitialized();

    const filePath = this.getTaskListPath(listId);
    return this.readJson<TaskList>(filePath);
  }

  /**
   * Delete a task list by ID
   * Also deletes all tasks in the list
   */
  async deleteTaskList(listId: string): Promise<void> {
    await this.ensureInitialized();

    // Delete the list file
    const filePath = this.getTaskListPath(listId);
    await this.deleteFile(filePath);

    // Delete all tasks in the list directory
    const listDir = path.join(this.listsPath, listId);
    try {
      await fs.rm(listDir, { recursive: true, force: true });
    } catch (error) {
      // Directory might not exist, that's okay
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    // Update index to remove this list
    const index = await this.getIndex();
    const updatedIndex: TaskIndex = {
      lists: index.lists.filter(id => id !== listId),
    };
    await this.writeJson(this.indexPath, updatedIndex);
  }

  /**
   * List all task lists
   */
  async listTaskLists(): Promise<TaskList[]> {
    await this.ensureInitialized();

    try {
      const entries = await fs.readdir(this.listsPath, { withFileTypes: true });
      const lists: TaskList[] = [];

      for (const entry of entries) {
        // Only process .json files (task list files, not directories)
        if (entry.isFile() && entry.name.endsWith('.json')) {
          const filePath = path.join(this.listsPath, entry.name);
          const list = await this.readJson<TaskList>(filePath);
          if (list) {
            lists.push(list);
          }
        }
      }

      // Sort by createdAt (newest first)
      return lists.sort((a, b) => 
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        // Lists directory doesn't exist yet
        return [];
      }
      throw error;
    }
  }

  /**
   * Check if a task list exists
   */
  async taskListExists(listId: string): Promise<boolean> {
    await this.ensureInitialized();

    const filePath = this.getTaskListPath(listId);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Index Management
  // ============================================================================

  /**
   * Update the index with a task list
   */
  async updateIndex(list: TaskList): Promise<void> {
    await this.ensureInitialized();

    const index = await this.getIndex();
    
    // Add list ID if not already present
    if (!index.lists.includes(list.id)) {
      const updatedIndex: TaskIndex = {
        lists: [...index.lists, list.id],
      };
      await this.writeJson(this.indexPath, updatedIndex);
    }
  }

  /**
   * Get the current index
   */
  async getIndex(): Promise<TaskIndex> {
    await this.ensureInitialized();

    const index = await this.readJson<TaskIndex>(this.indexPath);
    return index || { lists: [] };
  }

  // ============================================================================
  // File Locking (for multi-session coordination)
  // ============================================================================

  /**
   * Acquire a lock for a given ID
   * @param id - The ID to lock (task ID or list ID)
   * @param timeoutMs - How long to wait for lock (default: 5000ms)
   * @param retryIntervalMs - How long between retries (default: 100ms)
   */
  async acquireLock(
    id: string,
    timeoutMs: number = 5000,
    retryIntervalMs: number = 100
  ): Promise<Lock> {
    await this.ensureInitialized();

    const lockPath = this.getLockPath(id);
    const startTime = Date.now();
    const lockContent = {
      pid: process.pid,
      acquiredAt: new Date().toISOString(),
    };

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Try to create the lock file with exclusive flag
        await fs.writeFile(lockPath, JSON.stringify(lockContent), {
          flag: 'wx', // Write exclusively (fails if file exists)
        });

        // Lock acquired successfully
        return {
          id,
          filePath: lockPath,
          acquiredAt: Date.now(),
        };
      } catch (error) {
        const errnoError = error as NodeJS.ErrnoException;
        
        // If file already exists, lock is held by another process
        if (errnoError.code === 'EEXIST') {
          // Check if lock is stale (older than timeout)
          try {
            const lockData = await this.readJson<{ acquiredAt: string }>(lockPath);
            if (lockData) {
              const lockAge = Date.now() - new Date(lockData.acquiredAt).getTime();
              // If lock is older than 30 seconds, consider it stale
              if (lockAge > 30000) {
                // Remove stale lock and try again
                await this.deleteFile(lockPath);
                continue;
              }
            }
          } catch {
            // Couldn't read lock file, might be corrupted
            // Try to remove it
            try {
              await this.deleteFile(lockPath);
            } catch {
              // Ignore errors when removing stale lock
            }
          }

          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryIntervalMs));
          continue;
        }

        // Other error, throw
        throw new LockError(`Failed to acquire lock for ${id}: ${(error as Error).message}`);
      }
    }

    throw new LockError(`Timeout acquiring lock for ${id} after ${timeoutMs}ms`);
  }

  /**
   * Release a lock
   */
  async releaseLock(lock: Lock): Promise<void> {
    try {
      await this.deleteFile(lock.filePath);
    } catch (error) {
      throw new LockError(
        `Failed to release lock for ${lock.id}: ${(error as Error).message}`
      );
    }
  }

  /**
   * Check if a lock is held
   */
  async isLocked(id: string): Promise<boolean> {
    await this.ensureInitialized();

    const lockPath = this.getLockPath(id);
    try {
      await fs.access(lockPath);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get the base storage path
   */
  getBasePath(): string {
    return this.basePath;
  }

  /**
   * Clear all tasks and lists (useful for testing)
   */
  async clear(): Promise<void> {
    await this.ensureInitialized();

    try {
      await fs.rm(this.basePath, { recursive: true, force: true });
      this.initialized = false;
      await this.init();
    } catch (error) {
      throw new TaskStorageError(
        'Failed to clear task storage',
        error instanceof Error ? error : undefined
      );
    }
  }

  /**
   * Move a task from one list to another
   */
  async moveTask(taskId: string, fromListId: string, toListId: string): Promise<void> {
    await this.ensureInitialized();

    const fromPath = this.getTaskPath(taskId, fromListId);
    const toPath = this.getTaskPath(taskId, toListId);

    const task = await this.readJson<Task>(fromPath);
    if (!task) {
      throw new TaskNotFoundError(taskId);
    }

    // Write to new location
    await this.writeJson(toPath, task);

    // Delete from old location
    await this.deleteFile(fromPath);

    // Update source list
    const fromList = await this.getTaskList(fromListId);
    if (fromList) {
      fromList.tasks = fromList.tasks.filter(id => id !== taskId);
      fromList.updatedAt = new Date().toISOString();
      await this.saveTaskList(fromList);
    }

    // Update destination list
    const toList = await this.getTaskList(toListId);
    if (toList) {
      if (!toList.tasks.includes(taskId)) {
        toList.tasks.push(taskId);
        toList.updatedAt = new Date().toISOString();
        await this.saveTaskList(toList);
      }
    }
  }
}

// Export default for convenience
export default TaskStorage;
