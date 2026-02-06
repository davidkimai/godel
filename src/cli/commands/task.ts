/**
 * Task Commands
 * 
 * File-system-based task management system for coordinating work across
 * multiple agents and sessions. Inspired by Claude Code's Tasks.
 * 
 * Commands:
 * - godel task create <title> [options]
 * - godel task list [options]
 * - godel task show <task-id>
 * - godel task start <task-id>
 * - godel task complete <task-id>
 * - godel task block <task-id> --reason <reason>
 * - godel task assign <task-id> --agent <agent-id>
 * - godel task delete <task-id>
 */

import { Command } from 'commander';
import * as chalk from 'chalk';
import { logger } from '../../utils/logger';
import { registerHydrateCommand, registerSyncCommand } from './task-sync';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/** Task types as defined in the design doc */
type TaskType = 'task' | 'bug' | 'feature' | 'refactor' | 'research';

/** Task priority levels */
type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

/** Task status in the lifecycle */
type TaskStatus = 'open' | 'in-progress' | 'blocked' | 'review' | 'done';

/** Core Task interface matching the design document */
interface Task {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  assignee?: string;
  priority: TaskPriority;
  type: TaskType;
  dependsOn: string[];
  blocks: string[];
  tags: string[];
  branch?: string;
  commits: string[];
  listId: string;
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/** TaskList interface */
interface TaskList {
  id: string;
  name: string;
  description?: string;
  tasks: string[];
  status: 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

/** Options for creating a task */
interface CreateTaskOptions {
  title: string;
  type: TaskType;
  priority: TaskPriority;
  description?: string;
  dependsOn: string[];
  listId: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// In-Memory Storage (Placeholder for file-system implementation)
// ═══════════════════════════════════════════════════════════════════════════════

class TaskStorage {
  private tasks = new Map<string, Task>();
  private lists = new Map<string, TaskList>();
  private idCounter = 0;

  constructor() {
    // Initialize default list
    const now = new Date().toISOString();
    this.lists.set('default', {
      id: 'default',
      name: 'Default',
      description: 'Default task list',
      tasks: [],
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  }

  generateId(): string {
    this.idCounter++;
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 5; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `godel-${result}`;
  }

  createTask(options: CreateTaskOptions): Task {
    const now = new Date().toISOString();
    const task: Task = {
      id: this.generateId(),
      title: options.title,
      description: options.description,
      status: 'open',
      priority: options.priority,
      type: options.type,
      dependsOn: options.dependsOn,
      blocks: [],
      tags: [],
      commits: [],
      listId: options.listId,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(task.id, task);

    // Add to list
    const list = this.lists.get(options.listId);
    if (list) {
      list.tasks.push(task.id);
      list.updatedAt = now;
    }

    // Update dependency blocks
    for (const depId of options.dependsOn) {
      const dep = this.tasks.get(depId);
      if (dep && !dep.blocks.includes(task.id)) {
        dep.blocks.push(task.id);
        dep.updatedAt = now;
      }
    }

    return task;
  }

  getTask(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  getTasksByList(listId: string): Task[] {
    const list = this.lists.get(listId);
    if (!list) return [];
    return list.tasks
      .map(id => this.tasks.get(id))
      .filter((t): t is Task => t !== undefined);
  }

  getAllTasks(): Task[] {
    return Array.from(this.tasks.values());
  }

  updateTask(id: string, updates: Partial<Task>): Task | undefined {
    const task = this.tasks.get(id);
    if (!task) return undefined;

    Object.assign(task, updates, { updatedAt: new Date().toISOString() });
    return task;
  }

  deleteTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    // Remove from list
    const list = this.lists.get(task.listId);
    if (list) {
      list.tasks = list.tasks.filter(tid => tid !== id);
    }

    // Remove from dependency blocks
    for (const depId of task.dependsOn) {
      const dep = this.tasks.get(depId);
      if (dep) {
        dep.blocks = dep.blocks.filter(bid => bid !== id);
      }
    }

    return this.tasks.delete(id);
  }

  getList(id: string): TaskList | undefined {
    return this.lists.get(id);
  }
}

// Global storage instance
const storage = new TaskStorage();

// ═══════════════════════════════════════════════════════════════════════════════
// Utility Functions
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the current task list ID from environment or default */
function getCurrentListId(): string {
  return process.env['GODEL_TASK_LIST_ID'] || 'default';
}

/** Format status with emoji indicator */
function formatStatus(status: TaskStatus): string {
  const indicators: Record<TaskStatus, string> = {
    'open': '⏳ open',
    'in-progress': '🔄 in-progress',
    'blocked': '⏸️ blocked',
    'review': '👀 review',
    'done': '✅ done',
  };
  return indicators[status] || status;
}

/** Format priority with color */
function formatPriority(priority: TaskPriority): string {
  const colors: Record<TaskPriority, (s: string) => string> = {
    'critical': chalk.red.bold,
    'high': chalk.red,
    'medium': chalk.yellow,
    'low': chalk.gray,
  };
  return colors[priority](priority);
}

/** Format type with color */
function formatType(type: TaskType): string {
  const colors: Record<TaskType, (s: string) => string> = {
    'bug': chalk.red,
    'feature': chalk.green,
    'refactor': chalk.blue,
    'research': chalk.magenta,
    'task': chalk.cyan,
  };
  return colors[type](type);
}

/** Format task ID with color */
function formatTaskId(id: string): string {
  return chalk.cyan(id);
}

/** Format assignee */
function formatAssignee(assignee?: string): string {
  return assignee ? chalk.green(assignee) : chalk.gray('-');
}

/** Parse comma-separated task IDs */
function parseTaskIds(value: string): string[] {
  return value.split(',').map(id => id.trim()).filter(id => id.length > 0);
}

/** Truncate string to max length */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/** Format date for display */
function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Check if all dependencies are completed */
function areDependenciesMet(task: Task): boolean {
  for (const depId of task.dependsOn) {
    const dep = storage.getTask(depId);
    if (!dep || dep.status !== 'done') {
      return false;
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLI Command Registration
// ═══════════════════════════════════════════════════════════════════════════════

export function registerTaskCommand(program: Command): void {
  const task = program
    .command('task')
    .description('Manage tasks');

  // ============================================================================
  // task create
  // ============================================================================
  task
    .command('create')
    .description('Create a new task')
    .argument('<title>', 'Task title')
    .option('-t, --type <type>', 'Task type (task|bug|feature|refactor|research)', 'task')
    .option('-p, --priority <priority>', 'Priority (low|medium|high|critical)', 'medium')
    .option('-d, --description <desc>', 'Task description')
    .option('--depends-on <ids>', 'Comma-separated task IDs this task depends on')
    .option('-l, --list <list-id>', 'Task list ID (default: from GODEL_TASK_LIST_ID or "default")')
    .action(async (title: string, options) => {
      try {
        // Validate type
        const validTypes: TaskType[] = ['task', 'bug', 'feature', 'refactor', 'research'];
        const taskType = options.type as TaskType;
        if (!validTypes.includes(taskType)) {
          logger.error(`❌ Invalid type: ${options.type}. Valid types: ${validTypes.join(', ')}`);
          process.exit(1);
        }

        // Validate priority
        const validPriorities: TaskPriority[] = ['low', 'medium', 'high', 'critical'];
        const priority = options.priority as TaskPriority;
        if (!validPriorities.includes(priority)) {
          logger.error(`❌ Invalid priority: ${options.priority}. Valid priorities: ${validPriorities.join(', ')}`);
          process.exit(1);
        }

        // Parse dependencies
        const dependsOn = options.dependsOn ? parseTaskIds(options.dependsOn) : [];

        // Verify dependencies exist
        for (const depId of dependsOn) {
          const dep = storage.getTask(depId);
          if (!dep) {
            logger.error(`❌ Dependency task not found: ${depId}`);
            process.exit(1);
          }
        }

        const listId = options.list || getCurrentListId();

        // Create task
        const newTask = storage.createTask({
          title,
          type: taskType,
          priority,
          description: options.description,
          dependsOn,
          listId,
        });

        logger.info(chalk.green('✅ Task created successfully!\n'));
        logger.info(`   ID:          ${formatTaskId(newTask.id)}`);
        logger.info(`   Title:       ${newTask.title}`);
        logger.info(`   Type:        ${formatType(newTask.type)}`);
        logger.info(`   Priority:    ${formatPriority(newTask.priority)}`);
        logger.info(`   Status:      ${formatStatus(newTask.status)}`);
        logger.info(`   List:        ${chalk.blue(listId)}`);

        if (newTask.description) {
          logger.info(`   Description: ${truncate(newTask.description, 50)}`);
        }

        if (newTask.dependsOn.length > 0) {
          logger.info(`   Depends on:  ${newTask.dependsOn.map(formatTaskId).join(', ')}`);
        }

        logger.info(chalk.gray(`\n💡 Use "godel task start ${newTask.id}" to begin working on this task`));
      } catch (error) {
        logger.error('❌ Failed to create task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task list
  // ============================================================================
  task
    .command('list')
    .description('List tasks')
    .option('-s, --status <status>', 'Filter by status (open|in-progress|blocked|review|done)')
    .option('-a, --assignee <agent>', 'Filter by assignee')
    .option('-l, --list <list-id>', 'Show tasks from specific list')
    .option('--all', 'Show all tasks across lists')
    .action(async (options) => {
      try {
        // Get tasks
        let tasks: Task[];
        let listName: string;

        if (options.all) {
          tasks = storage.getAllTasks();
          listName = 'all lists';
        } else {
          const listId = options.list || getCurrentListId();
          tasks = storage.getTasksByList(listId);
          listName = listId;
        }

        // Apply filters
        if (options.status) {
          const validStatuses: TaskStatus[] = ['open', 'in-progress', 'blocked', 'review', 'done'];
          if (!validStatuses.includes(options.status as TaskStatus)) {
            logger.error(`❌ Invalid status: ${options.status}. Valid statuses: ${validStatuses.join(', ')}`);
            process.exit(1);
          }
          tasks = tasks.filter(t => t.status === options.status);
        }

        if (options.assignee) {
          tasks = tasks.filter(t => t.assignee === options.assignee);
        }

        // Display header
        logger.info(chalk.bold(`\n📋 Tasks in '${listName}' (${tasks.length} total)\n`));

        if (tasks.length === 0) {
          logger.info(chalk.gray('   No tasks found.\n'));
          logger.info(chalk.gray('💡 Use "godel task create <title>" to create a new task'));
          return;
        }

        // Sort tasks: in-progress first, then by priority
        const priorityOrder: Record<TaskPriority, number> = {
          'critical': 0,
          'high': 1,
          'medium': 2,
          'low': 3,
        };

        const statusOrder: Record<TaskStatus, number> = {
          'in-progress': 0,
          'blocked': 1,
          'open': 2,
          'review': 3,
          'done': 4,
        };

        tasks.sort((a, b) => {
          const statusDiff = statusOrder[a.status] - statusOrder[b.status];
          if (statusDiff !== 0) return statusDiff;
          return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        // Calculate column widths
        const idWidth = Math.max(10, ...tasks.map(t => t.id.length));
        const titleWidth = Math.max(20, ...tasks.map(t => t.title.length));

        // Print header
        const header = [
          chalk.bold('ID'.padEnd(idWidth)),
          chalk.bold('Title'.padEnd(titleWidth)),
          chalk.bold('Status'.padEnd(14)),
          chalk.bold('Assignee'.padEnd(12)),
          chalk.bold('Priority'),
        ].join('  ');
        logger.info(header);
        logger.info(chalk.gray('─'.repeat(idWidth + titleWidth + 40)));

        // Print tasks
        for (const t of tasks) {
          const row = [
            formatTaskId(t.id.padEnd(idWidth)),
            truncate(t.title, titleWidth).padEnd(titleWidth),
            formatStatus(t.status).padEnd(14),
            formatAssignee(t.assignee).padEnd(12),
            formatPriority(t.priority),
          ].join('  ');
          logger.info(row);
        }

        logger.info(''); // Empty line
      } catch (error) {
        logger.error('❌ Failed to list tasks:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task show
  // ============================================================================
  task
    .command('show')
    .description('Show task details')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId: string) => {
      try {
        const task = storage.getTask(taskId);
        if (!task) {
          logger.error(`❌ Task not found: ${taskId}`);
          process.exit(1);
        }

        logger.info(chalk.bold(`\n📄 Task: ${task.title}\n`));
        logger.info(`   ID:          ${formatTaskId(task.id)}`);
        logger.info(`   Type:        ${formatType(task.type)}`);
        logger.info(`   Status:      ${formatStatus(task.status)}`);
        logger.info(`   Priority:    ${formatPriority(task.priority)}`);
        logger.info(`   List:        ${chalk.blue(task.listId)}`);
        logger.info(`   Assignee:    ${formatAssignee(task.assignee)}`);

        if (task.description) {
          logger.info(`\n   Description:`);
          logger.info(`   ${task.description.split('\n').join('\n   ')}`);
        }

        if (task.blockedReason) {
          logger.info(chalk.yellow(`\n   ⏸️  Blocked: ${task.blockedReason}`));
        }

        // Dependencies
        if (task.dependsOn.length > 0) {
          logger.info(chalk.bold(`\n   📥 Dependencies:`));
          for (const depId of task.dependsOn) {
            const dep = storage.getTask(depId);
            const status = dep ? formatStatus(dep.status) : chalk.red('deleted');
            logger.info(`      • ${formatTaskId(depId)} ${dep ? `- ${truncate(dep.title, 40)}` : ''} (${status})`);
          }
        }

        // Blocked tasks
        if (task.blocks.length > 0) {
          logger.info(chalk.bold(`\n   📤 Blocks:`));
          for (const blockedId of task.blocks) {
            const blocked = storage.getTask(blockedId);
            logger.info(`      • ${formatTaskId(blockedId)} ${blocked ? `- ${truncate(blocked.title, 40)}` : ''}`);
          }
        }

        // Tags
        if (task.tags.length > 0) {
          logger.info(chalk.bold(`\n   🏷️  Tags:`));
          logger.info(`      ${task.tags.map(t => chalk.cyan(`#${t}`)).join(' ')}`);
        }

        // Git integration
        if (task.branch || task.commits.length > 0) {
          logger.info(chalk.bold(`\n   🔀 Git:`));
          if (task.branch) {
            logger.info(`      Branch: ${chalk.yellow(task.branch)}`);
          }
          if (task.commits.length > 0) {
            logger.info(`      Commits: ${task.commits.length}`);
          }
        }

        // Timestamps
        logger.info(chalk.bold(`\n   🕒 Timeline:`));
        logger.info(`      Created:  ${formatDate(task.createdAt)}`);
        logger.info(`      Updated:  ${formatDate(task.updatedAt)}`);
        if (task.completedAt) {
          logger.info(`      Completed: ${formatDate(task.completedAt)}`);
        }

        logger.info(''); // Empty line
      } catch (error) {
        logger.error('❌ Failed to show task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task start
  // ============================================================================
  task
    .command('start')
    .description('Mark task as in-progress')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId: string) => {
      try {
        const task = storage.getTask(taskId);
        if (!task) {
          logger.error(`❌ Task not found: ${taskId}`);
          process.exit(1);
        }

        if (task.status === 'in-progress') {
          logger.info(chalk.yellow(`ℹ️  Task ${taskId} is already in-progress`));
          return;
        }

        if (task.status === 'done') {
          logger.error(`❌ Cannot start a completed task`);
          process.exit(1);
        }

        // Check dependencies
        if (!areDependenciesMet(task)) {
          logger.error(chalk.red(`❌ Cannot start task - dependencies not met:`));
          for (const depId of task.dependsOn) {
            const dep = storage.getTask(depId);
            if (!dep || dep.status !== 'done') {
              logger.error(`   • ${formatTaskId(depId)} (${dep ? formatStatus(dep.status) : 'not found'})`);
            }
          }
          process.exit(1);
        }

        storage.updateTask(taskId, { status: 'in-progress' });

        logger.info(chalk.green(`✅ Started task: ${task.title}`));
        logger.info(chalk.gray(`   ${formatTaskId(taskId)} is now in-progress`));
      } catch (error) {
        logger.error('❌ Failed to start task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task complete
  // ============================================================================
  task
    .command('complete')
    .description('Mark task as done')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId: string) => {
      try {
        const task = storage.getTask(taskId);
        if (!task) {
          logger.error(`❌ Task not found: ${taskId}`);
          process.exit(1);
        }

        if (task.status === 'done') {
          logger.info(chalk.yellow(`ℹ️  Task ${taskId} is already completed`));
          return;
        }

        storage.updateTask(taskId, {
          status: 'done',
          completedAt: new Date().toISOString(),
        });

        logger.info(chalk.green(`✅ Completed task: ${task.title}`));
        logger.info(chalk.gray(`   ${formatTaskId(taskId)} marked as done`));

        // Check if any blocked tasks can now be unblocked
        if (task.blocks.length > 0) {
          const unblocked = task.blocks
            .map(id => storage.getTask(id))
            .filter((t): t is Task => t !== undefined && t.status === 'blocked');

          if (unblocked.length > 0) {
            logger.info(chalk.blue(`\n💡 Dependencies resolved for:`));
            for (const t of unblocked) {
              logger.info(`   • ${formatTaskId(t.id)} - ${truncate(t.title, 40)}`);
            }
          }
        }
      } catch (error) {
        logger.error('❌ Failed to complete task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task block
  // ============================================================================
  task
    .command('block')
    .description('Mark task as blocked')
    .argument('<task-id>', 'Task ID')
    .requiredOption('-r, --reason <reason>', 'Reason for blocking')
    .action(async (taskId: string, options) => {
      try {
        const task = storage.getTask(taskId);
        if (!task) {
          logger.error(`❌ Task not found: ${taskId}`);
          process.exit(1);
        }

        if (task.status === 'done') {
          logger.error(`❌ Cannot block a completed task`);
          process.exit(1);
        }

        if (task.status === 'blocked') {
          logger.info(chalk.yellow(`ℹ️  Task ${taskId} is already blocked`));
          logger.info(chalk.gray(`   Current reason: ${task.blockedReason}`));
          
          // Update reason
          storage.updateTask(taskId, {
            blockedReason: options.reason,
          });
          logger.info(chalk.green(`   Updated block reason`));
          return;
        }

        storage.updateTask(taskId, {
          status: 'blocked',
          blockedReason: options.reason,
        });

        logger.info(chalk.yellow(`⏸️  Blocked task: ${task.title}`));
        logger.info(chalk.gray(`   ${formatTaskId(taskId)} is now blocked`));
        logger.info(chalk.gray(`   Reason: ${options.reason}`));
      } catch (error) {
        logger.error('❌ Failed to block task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task assign
  // ============================================================================
  task
    .command('assign')
    .description('Assign task to agent')
    .argument('<task-id>', 'Task ID')
    .requiredOption('-a, --agent <agent-id>', 'Agent ID to assign to')
    .action(async (taskId: string, options) => {
      try {
        const task = storage.getTask(taskId);
        if (!task) {
          logger.error(`❌ Task not found: ${taskId}`);
          process.exit(1);
        }

        const previousAssignee = task.assignee;
        storage.updateTask(taskId, { assignee: options.agent });

        logger.info(chalk.green(`✅ Assigned task: ${task.title}`));
        logger.info(chalk.gray(`   ${formatTaskId(taskId)} assigned to ${chalk.green(options.agent)}`));

        if (previousAssignee && previousAssignee !== options.agent) {
          logger.info(chalk.gray(`   Previous assignee: ${previousAssignee}`));
        }
      } catch (error) {
        logger.error('❌ Failed to assign task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task delete
  // ============================================================================
  task
    .command('delete')
    .description('Delete a task')
    .argument('<task-id>', 'Task ID')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (taskId: string, options) => {
      try {
        const task = storage.getTask(taskId);
        if (!task) {
          logger.error(`❌ Task not found: ${taskId}`);
          process.exit(1);
        }

        // Check if other tasks depend on this one
        if (task.blocks.length > 0) {
          logger.error(chalk.red(`❌ Cannot delete task - other tasks depend on it:`));
          for (const blockedId of task.blocks) {
            const blocked = storage.getTask(blockedId);
            logger.error(`   • ${formatTaskId(blockedId)} ${blocked ? `- ${blocked.title}` : ''}`);
          }
          process.exit(1);
        }

        // Confirmation
        if (!options.yes) {
          logger.info(chalk.yellow(`⚠️  You are about to delete task:`));
          logger.info(`   ${formatTaskId(taskId)}: ${task.title}`);
          logger.info(chalk.gray('\n💡 Use --yes to confirm deletion'));
          return;
        }

        storage.deleteTask(taskId);
        logger.info(chalk.green(`✅ Deleted task: ${task.title}`));
        logger.info(chalk.gray(`   ${formatTaskId(taskId)} has been removed`));
      } catch (error) {
        logger.error('❌ Failed to delete task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // Hydrate and sync commands
  registerHydrateCommand(task);
  registerSyncCommand(task);
}
