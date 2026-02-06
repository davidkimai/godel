/**
 * Task Types
 *
 * Data models and types for the godel Tasks system.
 * File-system-based task management with dependency tracking
 * and multi-session coordination.
 */

import { randomBytes } from 'crypto';

/**
 * Possible states for a task in its lifecycle
 */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
export enum TaskStatus {
  /** Task has been created but not started */
  OPEN = 'open',
  /** Task is actively being worked on */
  IN_PROGRESS = 'in-progress',
  /** Task is blocked by dependencies */
  BLOCKED = 'blocked',
  /** Task is awaiting review/approval */
  REVIEW = 'review',
  /** Task has been completed */
  DONE = 'done'
}
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * Priority levels for tasks
 */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
export enum TaskPriority {
  /** Low priority - can be deferred */
  LOW = 'low',
  /** Medium priority - standard work */
  MEDIUM = 'medium',
  /** High priority - should be prioritized */
  HIGH = 'high',
  /** Critical priority - urgent/blocking */
  CRITICAL = 'critical'
}
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * Types of work items
 */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
export enum TaskType {
  /** General task */
  TASK = 'task',
  /** Bug fix */
  BUG = 'bug',
  /** New feature */
  FEATURE = 'feature',
  /** Code refactoring */
  REFACTOR = 'refactor',
  /** Research or investigation */
  RESEARCH = 'research'
}
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * Task list status
 */
/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
export enum TaskListStatus {
  /** List is active and tasks can be added/worked on */
  ACTIVE = 'active',
  /** All tasks in list are completed */
  COMPLETED = 'completed',
  /** List is archived (read-only) */
  ARCHIVED = 'archived'
}
/* eslint-enable no-unused-vars, @typescript-eslint/no-unused-vars */

/**
 * Core Task interface representing work to be done
 */
export interface Task {
  /** Unique task identifier (godel-{5-char} format) */
  id: string;
  /** Task title */
  title: string;
  /** Detailed description */
  description?: string;
  /** Current status */
  status: TaskStatus;

  // Dependencies
  /** Task IDs that must complete before this task */
  dependsOn: string[];
  /** Task IDs blocked by this task */
  blocks: string[];

  // Assignment
  /** Agent ID assigned to this task */
  assignee?: string;
  /** Git worktree path for this task */
  worktree?: string;

  // Metadata
  /** Priority level */
  priority: TaskPriority;
  /** Type of work */
  type: TaskType;
  /** Tags for categorization */
  tags: string[];

  // Git integration
  /** Git branch for this task */
  branch?: string;
  /** Associated commit hashes */
  commits: string[];

  // Timestamps
  /** When task was created (ISO 8601) */
  createdAt: string;
  /** When task was last updated */
  updatedAt: string;
  /** When task was completed */
  completedAt?: string;

  // Subagent coordination
  /** Session IDs working on this task */
  sessions: string[];
}

/**
 * TaskList interface for grouping related tasks
 */
export interface TaskList {
  /** Unique list identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** List description */
  description?: string;
  /** Task IDs in this list */
  tasks: string[];
  /** Current list status */
  status: TaskListStatus;

  // Collaboration
  /** Sessions subscribed to this list */
  sessions: string[];

  // Timestamps
  /** When list was created (ISO 8601) */
  createdAt: string;
  /** When list was last updated */
  updatedAt: string;
  /** When list was completed */
  completedAt?: string;
}

/**
 * Options for creating a task
 */
export interface CreateTaskOptions {
  /** Custom task ID (optional, auto-generated if not provided) */
  id?: string;
  /** Task title (required) */
  title: string;
  /** Task description */
  description?: string;
  /** Initial status (default: open) */
  status?: TaskStatus;
  /** Task IDs that must complete first */
  dependsOn?: string[];
  /** Task IDs blocked by this task */
  blocks?: string[];
  /** Agent ID to assign */
  assignee?: string;
  /** Git worktree path */
  worktree?: string;
  /** Priority level (default: medium) */
  priority?: TaskPriority;
  /** Type of work (default: task) */
  type?: TaskType;
  /** Tags for categorization */
  tags?: string[];
  /** Git branch */
  branch?: string;
  /** Initial commit hashes */
  commits?: string[];
  /** Session IDs */
  sessions?: string[];
}

/**
 * Options for creating a task list
 */
export interface CreateTaskListOptions {
  /** Custom list ID (optional, auto-generated from name if not provided) */
  id?: string;
  /** List name (required) */
  name: string;
  /** List description */
  description?: string;
  /** Initial task IDs */
  tasks?: string[];
  /** Initial status (default: active) */
  status?: TaskListStatus;
  /** Session IDs */
  sessions?: string[];
}

/**
 * Generate a unique task ID in godel-{5-char} format
 *
 * @returns A unique task ID
 *
 * @example
 * ```typescript
 * const id = generateTaskId(); // 'godel-a3f9k'
 * ```
 */
export function generateTaskId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'godel-';
  const bytes = randomBytes(5);
  for (let i = 0; i < 5; i++) {
    result += chars[bytes[i] % chars.length];
  }
  return result;
}

/**
 * Generate a task list ID from a name
 *
 * Converts the name to lowercase, replaces spaces/special chars with hyphens,
 * and removes consecutive hyphens.
 *
 * @param name - The list name
 * @returns A URL-safe list ID
 *
 * @example
 * ```typescript
 * const id = generateTaskListId('Sprint 1'); // 'sprint-1'
 * const id2 = generateTaskListId('Feature: Auth'); // 'feature-auth'
 * ```
 */
export function generateTaskListId(name: string): string {
  const id = name
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/_/g, '')
    .replace(/^-|-$/g, '');
  return id || 'list';
}

/**
 * Create a new Task instance
 *
 * @param options - Task creation options
 * @returns A new Task instance
 *
 * @example
 * ```typescript
 * const task = createTask({
 *   title: 'Fix authentication bug',
 *   description: 'OAuth2 tokens are expiring too quickly',
 *   type: TaskType.BUG,
 *   priority: TaskPriority.HIGH,
 *   tags: ['auth', 'urgent']
 * });
 * ```
 */
export function createTask(options: CreateTaskOptions): Task {
  const now = new Date().toISOString();

  return {
    id: options.id ?? generateTaskId(),
    title: options.title,
    description: options.description,
    status: options.status ?? TaskStatus.OPEN,
    dependsOn: options.dependsOn ?? [],
    blocks: options.blocks ?? [],
    assignee: options.assignee,
    worktree: options.worktree,
    priority: options.priority ?? TaskPriority.MEDIUM,
    type: options.type ?? TaskType.TASK,
    tags: options.tags ?? [],
    branch: options.branch,
    commits: options.commits ?? [],
    createdAt: now,
    updatedAt: now,
    completedAt: undefined,
    sessions: options.sessions ?? []
  };
}

/**
 * Create a new TaskList instance
 *
 * @param options - Task list creation options
 * @returns A new TaskList instance
 *
 * @example
 * ```typescript
 * const list = createTaskList({
 *   name: 'Sprint 1',
 *   description: 'Q1 sprint goals'
 * });
 * ```
 */
export function createTaskList(options: CreateTaskListOptions): TaskList {
  const now = new Date().toISOString();

  return {
    id: options.id ?? generateTaskListId(options.name),
    name: options.name,
    description: options.description,
    tasks: options.tasks ?? [],
    status: options.status ?? TaskListStatus.ACTIVE,
    sessions: options.sessions ?? [],
    createdAt: now,
    updatedAt: now,
    completedAt: undefined
  };
}
