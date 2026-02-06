/**
 * TaskList Command - Manage task lists
 *
 * Provides CLI commands for creating, viewing, archiving, and deleting
 * task lists with kanban-style board visualization.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { logger } from '../../utils/logger';
import { TaskStorage, TaskList, Task } from '../../tasks/storage';

// Storage instance (singleton per process)
const storage = new TaskStorage();

/**
 * Generate a task list ID from a name
 */
function generateTaskListId(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Format a timestamp as a relative time string
 */
function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

/**
 * Get status color for tasks
 */
function getStatusColor(status: string): chalk.Chalk {
  switch (status) {
    case 'open':
      return chalk.gray;
    case 'in-progress':
      return chalk.blue;
    case 'blocked':
      return chalk.red;
    case 'review':
      return chalk.yellow;
    case 'done':
      return chalk.green;
    default:
      return chalk.white;
  }
}

/**
 * Get priority color
 */
function getPriorityColor(priority: string): chalk.Chalk {
  switch (priority) {
    case 'low':
      return chalk.gray;
    case 'medium':
      return chalk.white;
    case 'high':
      return chalk.yellow;
    case 'critical':
      return chalk.red;
    default:
      return chalk.white;
  }
}

/**
 * Get status emoji
 */
function getStatusEmoji(status: string): string {
  switch (status) {
    case 'open':
      return '⏳';
    case 'in-progress':
      return '🔄';
    case 'blocked':
      return '⏸️';
    case 'review':
      return '👀';
    case 'done':
      return '✅';
    default:
      return '⚪';
  }
}

/**
 * Truncate text to max length
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Pad text to specific width (accounting for ANSI codes)
 */
function padText(text: string, width: number): string {
  // Strip ANSI codes for length calculation
  const plainText = text.replace(/\u001b\[\d+m/g, '');
  const padding = Math.max(0, width - plainText.length);
  return text + ' '.repeat(padding);
}

/**
 * Register tasklist commands with the CLI program
 */
export function registerTaskListCommand(program: Command): void {
  const tasklist = program
    .command('tasklist')
    .description('Manage task lists');

  // ============================================================================
  // Create command
  // ============================================================================
  tasklist
    .command('create <name>')
    .description('Create a new task list')
    .option('-d, --description <desc>', 'List description')
    .action(async (name: string, options: { description?: string }) => {
      try {
        await storage.init();
        const listId = generateTaskListId(name);

        // Check if list already exists
        const existing = await storage.taskListExists(listId);
        if (existing) {
          logger.error('tasklist', `Task list '${name}' already exists (id: ${listId})`);
          process.exit(1);
        }

        // Create new task list
        const now = new Date().toISOString();
        const list: TaskList = {
          id: listId,
          name,
          description: options.description,
          tasks: [],
          status: 'active',
          sessions: [],
          createdAt: now,
          updatedAt: now,
        };

        await storage.saveTaskList(list);

        console.log(chalk.green(`✅ Created task list: ${chalk.bold(name)}`));
        console.log(chalk.gray(`   ID: ${listId}`));
        if (options.description) {
          console.log(chalk.gray(`   Description: ${options.description}`));
        }
      } catch (error) {
        logger.error('tasklist', `Failed to create task list: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // List command
  // ============================================================================
  tasklist
    .command('list')
    .description('Show all task lists with summary')
    .action(async () => {
      try {
        await storage.init();
        const lists = await storage.listTaskLists();

        if (lists.length === 0) {
          console.log(chalk.yellow('📋 No task lists found'));
          console.log(chalk.gray('   Create one with: godel tasklist create <name>'));
          return;
        }

        console.log(chalk.bold(`📋 Task Lists (${lists.length} total)\n`));

        // Table header
        const colWidths = { id: 16, name: 20, tasks: 8, status: 12, updated: 14 };
        const header = [
          padText(chalk.bold('ID'), colWidths.id),
          padText(chalk.bold('Name'), colWidths.name),
          padText(chalk.bold('Tasks'), colWidths.tasks),
          padText(chalk.bold('Status'), colWidths.status),
          padText(chalk.bold('Updated'), colWidths.updated),
        ].join('  ');

        const separator = '─'.repeat(colWidths.id + colWidths.name + colWidths.tasks + colWidths.status + colWidths.updated + 8);

        console.log(header);
        console.log(separator);

        // Table rows
        for (const list of lists) {
          const statusColor = list.status === 'active' ? chalk.green : list.status === 'completed' ? chalk.blue : chalk.gray;

          const row = [
            padText(chalk.cyan(list.id), colWidths.id),
            padText(truncate(list.name, colWidths.name - 2), colWidths.name),
            padText(chalk.yellow(String(list.tasks.length)), colWidths.tasks),
            padText(statusColor(list.status), colWidths.status),
            padText(chalk.gray(formatRelativeTime(list.updatedAt)), colWidths.updated),
          ].join('  ');

          console.log(row);
        }
      } catch (error) {
        logger.error('tasklist', `Failed to list task lists: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // Show command (Kanban board)
  // ============================================================================
  tasklist
    .command('show <list-id>')
    .description('Show kanban-style board of tasks in a list')
    .action(async (listId: string) => {
      try {
        await storage.init();

        // Get the task list
        const list = await storage.getTaskList(listId);
        if (!list) {
          logger.error('tasklist', `Task list '${listId}' not found`);
          process.exit(1);
        }

        // Print header
        console.log(chalk.bold(`\n📋 Task List: ${chalk.cyan(list.name)}`));
        if (list.description) {
          console.log(chalk.gray(`   ${list.description}`));
        }
        console.log(chalk.gray(`   Status: ${list.status} | Tasks: ${list.tasks.length}`));
        console.log();

        // Load all tasks in the list
        const tasks: Task[] = [];
        for (const taskId of list.tasks) {
          const task = await storage.getTask(taskId, listId);
          if (task) {
            tasks.push(task);
          }
        }

        if (tasks.length === 0) {
          console.log(chalk.yellow('   No tasks in this list yet'));
          console.log(chalk.gray(`   Add tasks with: godel task create <title> --list ${listId}`));
          console.log();
          return;
        }

        // Group tasks by status
        const columns: Record<string, Task[]> = {
          open: [],
          'in-progress': [],
          blocked: [],
          review: [],
          done: [],
        };

        for (const task of tasks) {
          if (columns[task.status]) {
            columns[task.status].push(task);
          }
        }

        // Column configuration
        const columnConfig = [
          { key: 'open', label: 'OPEN', emoji: '⏳' },
          { key: 'in-progress', label: 'IN PROGRESS', emoji: '🔄' },
          { key: 'blocked', label: 'BLOCKED', emoji: '⏸️' },
          { key: 'review', label: 'REVIEW', emoji: '👀' },
          { key: 'done', label: 'DONE', emoji: '✅' },
        ];

        // Print kanban header
        const colWidth = 20;
        const headerRow = columnConfig
          .map(col => {
            const emoji = col.emoji;
            const label = col.label;
            return padText(chalk.bold(`${emoji} ${label}`), colWidth);
          })
          .join('  ');

        const separator = '─'.repeat(columnConfig.length * (colWidth + 2) - 2);

        console.log(headerRow);
        console.log(separator);

        // Find the maximum number of tasks in any column
        const maxTasks = Math.max(...columnConfig.map(col => columns[col.key].length));

        // Print tasks row by row
        for (let i = 0; i < maxTasks; i++) {
          const rowCells: string[] = [];

          for (const col of columnConfig) {
            const colTasks = columns[col.key];
            const task = colTasks[i];

            if (task) {
              const idStr = chalk.dim(task.id);
              const titleStr = truncate(task.title, colWidth - 4);
              const priorityStr = getPriorityColor(task.priority)(`[${task.priority}]`);
              const cell = `${idStr}\n${titleStr}\n${priorityStr}`;
              rowCells.push(cell);
            } else {
              rowCells.push(chalk.gray('-'));
            }
          }

          // Print each row with proper spacing
          const lines = rowCells.map(cell => cell.split('\n'));
          const maxLines = Math.max(...lines.map(l => l.length));

          for (let lineIdx = 0; lineIdx < maxLines; lineIdx++) {
            const lineParts = lines.map((lineParts, colIdx) => {
              const text = lineParts[lineIdx] || '';
              return padText(text, colWidth);
            });
            console.log(lineParts.join('  '));
          }
          console.log(); // Empty line between task cards
        }
      } catch (error) {
        logger.error('tasklist', `Failed to show task list: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // Archive command
  // ============================================================================
  tasklist
    .command('archive <list-id>')
    .description('Archive a completed list')
    .action(async (listId: string) => {
      try {
        await storage.init();

        const list = await storage.getTaskList(listId);
        if (!list) {
          logger.error('tasklist', `Task list '${listId}' not found`);
          process.exit(1);
        }

        if (list.status === 'archived') {
          console.log(chalk.yellow(`⚠️  Task list '${list.name}' is already archived`));
          return;
        }

        list.status = 'archived';
        list.updatedAt = new Date().toISOString();
        await storage.saveTaskList(list);

        console.log(chalk.blue(`📦 Archived task list: ${chalk.bold(list.name)}`));
        console.log(chalk.gray(`   ID: ${listId}`));
        console.log(chalk.gray(`   Tasks: ${list.tasks.length}`));
      } catch (error) {
        logger.error('tasklist', `Failed to archive task list: ${(error as Error).message}`);
        process.exit(1);
      }
    });

  // ============================================================================
  // Delete command
  // ============================================================================
  tasklist
    .command('delete <list-id>')
    .description('Delete a list and all its tasks (with confirmation)')
    .option('-f, --force', 'Skip confirmation prompt')
    .action(async (listId: string, options: { force?: boolean }) => {
      try {
        await storage.init();

        const list = await storage.getTaskList(listId);
        if (!list) {
          logger.error('tasklist', `Task list '${listId}' not found`);
          process.exit(1);
        }

        // Show warning
        console.log(chalk.red(`⚠️  WARNING: You are about to delete task list '${list.name}'`));
        console.log(chalk.red(`   This will also delete all ${list.tasks.length} tasks in this list.`));
        console.log();

        if (!options.force) {
          // In a real CLI, you'd use a prompt library here
          // For now, we'll just require the --force flag
          console.log(chalk.yellow('   Use --force to confirm deletion:'));
          console.log(chalk.gray(`   godel tasklist delete ${listId} --force`));
          console.log();
          return;
        }

        await storage.deleteTaskList(listId);

        console.log(chalk.red(`🗑️  Deleted task list: ${chalk.bold(list.name)}`));
        console.log(chalk.gray(`   ID: ${listId}`));
        console.log(chalk.gray(`   Tasks removed: ${list.tasks.length}`));
      } catch (error) {
        logger.error('tasklist', `Failed to delete task list: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
