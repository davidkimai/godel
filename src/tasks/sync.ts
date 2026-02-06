/**
 * Task Sync Module
 * 
 * Implements the "Sync-Back Pattern" from Claude Code Tasks:
 * Export session-scoped Tasks back to persistent markdown spec files.
 * 
 * This completes the hydration cycle:
 * 1. Session Start: Hydrate tasks from markdown
 * 2. During Work: Update task status
 * 3. Session End: Sync back to markdown
 * 
 * Usage:
 * ```typescript
 * const sync = new TaskSync(storage);
 * await sync.toMarkdown('default', './specs/tasks.md');
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskStorage } from './storage';
import { TaskListService, Task } from './tasklist';

/**
 * Options for markdown export
 */
export interface SyncOptions {
  /** Include completed tasks (default: true) */
  includeCompleted?: boolean;
  /** Group tasks by epic/metadata (default: true) */
  groupByEpic?: boolean;
  /** Include task descriptions (default: false) */
  includeDescriptions?: boolean;
  /** Add dependency notes (default: true) */
  showDependencies?: boolean;
  /** Custom task formatter */
  formatTask?: (task: Task) => string;
}

/**
 * Result of sync operation
 */
export interface SyncResult {
  /** Number of tasks exported */
  exported: number;
  /** Number of tasks completed */
  completed: number;
  /** Number of tasks pending */
  pending: number;
  /** Output file path */
  filePath: string;
}

/**
 * Task sync - exports tasks back to markdown
 */
export class TaskSync {
  private storage: TaskStorage;
  private service: TaskListService;

  constructor(storage: TaskStorage) {
    this.storage = storage;
    this.service = new TaskListService(storage);
  }

  /**
   * Initialize the sync
   */
  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Export tasks to markdown file
   * 
   * @param listId - Task list ID to export
   * @param filePath - Output markdown file path
   * @param options - Export options
   * @returns Sync result
   * 
   * @example
   * ```typescript
   * const result = await sync.toMarkdown('sprint-1', './specs/tasks.md', {
   *   includeCompleted: true,
   *   showDependencies: true
   * });
   * console.log(`Exported ${result.exported} tasks`);
   * ```
   */
  async toMarkdown(
    listId: string,
    filePath: string,
    options: SyncOptions = {}
  ): Promise<SyncResult> {
    const {
      includeCompleted = true,
      groupByEpic = true,
      includeDescriptions = false,
      showDependencies = true,
    } = options;

    // Get tasks from list
    const tasks = await this.service.getTasksByList(listId);

    // Filter if not including completed
    const filteredTasks = includeCompleted
      ? tasks
      : tasks.filter(t => t.status !== 'done');

    // Group tasks
    const groups = groupByEpic
      ? this.groupByEpic(filteredTasks)
      : { 'Tasks': filteredTasks };

    // Generate markdown
    const lines: string[] = [];
    lines.push('# Task List\n');
    lines.push(`Generated: ${new Date().toISOString()}\n`);
    lines.push(`Total: ${filteredTasks.length} tasks (${tasks.filter(t => t.status === 'done').length} completed)\n`);
    lines.push('---\n');

    for (const [groupName, groupTasks] of Object.entries(groups)) {
      if (groupTasks.length === 0) continue;

      lines.push(`\n## ${groupName}\n`);

      for (const task of groupTasks) {
        const line = this.formatTaskLine(task, {
          includeDescriptions,
          showDependencies,
        });
        lines.push(line);
      }
    }

    // Write file
    const content = lines.join('\n');
    await this.ensureDirectory(filePath);
    await fs.writeFile(filePath, content, 'utf-8');

    return {
      exported: filteredTasks.length,
      completed: filteredTasks.filter(t => t.status === 'done').length,
      pending: filteredTasks.filter(t => t.status !== 'done').length,
      filePath,
    };
  }

  /**
   * Export tasks to a simple checklist format
   * 
   * @param listId - Task list ID
   * @param filePath - Output file path
   * @returns Sync result
   * 
   * @example
   * Output format:
   * ```markdown
   * ## Tasks
   * - [x] Fix authentication bug
   * - [ ] Implement OAuth
   * - [ ] Add tests
   * ```
   */
  async toChecklist(listId: string, filePath: string): Promise<SyncResult> {
    const tasks = await this.service.getTasksByList(listId);

    const lines: string[] = [];
    lines.push('# Task Checklist\n');
    lines.push('');

    for (const task of tasks) {
      const checkbox = task.status === 'done' ? '[x]' : '[ ]';
      lines.push(`- ${checkbox} ${task.title}`);
    }

    const content = lines.join('\n') + '\n';
    await this.ensureDirectory(filePath);
    await fs.writeFile(filePath, content, 'utf-8');

    return {
      exported: tasks.length,
      completed: tasks.filter(t => t.status === 'done').length,
      pending: tasks.filter(t => t.status !== 'done').length,
      filePath,
    };
  }

  /**
   * Sync tasks and update an existing spec file in place
   * Only updates the checkbox status, preserves other content
   * 
   * @param listId - Task list ID
   * @param filePath - Existing spec file path
   * @returns Sync result
   */
  async updateExisting(listId: string, filePath: string): Promise<SyncResult> {
    // Read existing content
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch {
      // File doesn't exist, create new
      return this.toMarkdown(listId, filePath);
    }

    // Get tasks
    const tasks = await this.service.getTasksByList(listId);
    const taskMap = new Map(tasks.map(t => [t.title, t]));

    // Update checkboxes in content
    const lines = content.split('\n');
    const updatedLines = lines.map(line => {
      const match = line.match(/^(-\s+\[)[ xX](\]\s+)(.+)$/);
      if (!match) return line;

      const title = match[3].trim();
      const task = taskMap.get(title);
      if (!task) return line;

      const checkbox = task.status === 'done' ? '[x]' : '[ ]';
      return `- ${checkbox} ${title}`;
    });

    // Write back
    await fs.writeFile(filePath, updatedLines.join('\n'), 'utf-8');

    return {
      exported: tasks.length,
      completed: tasks.filter(t => t.status === 'done').length,
      pending: tasks.filter(t => t.status !== 'done').length,
      filePath,
    };
  }

  /**
   * Format a single task as markdown line
   */
  private formatTaskLine(
    task: Task,
    options: { includeDescriptions?: boolean; showDependencies?: boolean }
  ): string {
    const { includeDescriptions, showDependencies } = options;

    const checkbox = task.status === 'done' ? '[x]' : '[ ]';
    let line = `- ${checkbox} ${task.id}: ${task.title}`;

    // Add dependency note
    if (showDependencies && task.dependsOn && task.dependsOn.length > 0) {
      line += ` ⚠ blocked by ${task.dependsOn.join(', ')}`;
    }

    // Add priority indicator
    if (task.priority === 'critical' || task.priority === 'high') {
      line += ` [${task.priority}]`;
    }

    line += '\n';

    // Add description if requested
    if (includeDescriptions && task.description) {
      const desc = task.description
        .split('\n')
        .map(d => `  > ${d}`)
        .join('\n');
      line += desc + '\n';
    }

    return line;
  }

  /**
   * Group tasks by epic/feature from metadata
   */
  private groupByEpic(tasks: Task[]): Record<string, Task[]> {
    const groups: Record<string, Task[]> = {};

    for (const task of tasks) {
      const epic = task.metadata?.['epic'] || task.metadata?.['feature'] || 'General';
      if (!groups[epic]) {
        groups[epic] = [];
      }
      groups[epic].push(task);
    }

    return groups;
  }

  /**
   * Ensure parent directory exists
   */
  private async ensureDirectory(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {
      // Directory might already exist
    }
  }
}

/**
 * Convenience function for one-off sync
 */
export async function syncToMarkdown(
  listId: string,
  filePath: string,
  storage: TaskStorage,
  options?: SyncOptions
): Promise<SyncResult> {
  const sync = new TaskSync(storage);
  await sync.init();
  return sync.toMarkdown(listId, filePath, options);
}

/**
 * Convenience function for checklist export
 */
export async function syncToChecklist(
  listId: string,
  filePath: string,
  storage: TaskStorage
): Promise<SyncResult> {
  const sync = new TaskSync(storage);
  await sync.init();
  return sync.toChecklist(listId, filePath);
}
