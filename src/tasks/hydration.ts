/**
 * Task Hydration Module
 * 
 * Implements the "Hydration Pattern" from Claude Code Tasks:
 * Load tasks from persistent markdown spec files into session-scoped Tasks.
 * 
 * The hydration pattern bridges the gap between:
 * - Persistent storage (markdown files in .godel/specs/)
 * - Session-scoped execution (godel Tasks)
 * 
 * Usage:
 * ```typescript
 * const hydrate = new TaskHydrator(storage);
 * const result = await hydrate.fromMarkdown('./specs/tasks.md');
 * console.log(`Created ${result.tasks.length} tasks`);
 * ```
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { TaskStorage } from './storage';
import { TaskListService } from './tasklist';
import { createTask, TaskPriority, TaskStatus, TaskType } from './types';

/**
 * Parsed task from markdown
 */
export interface ParsedTask {
  /** Task ID from markdown (e.g., "M2-T01") */
  id: string;
  /** Task subject/title */
  subject: string;
  /** Present continuous form for display */
  activeForm?: string;
  /** Task description */
  description?: string;
  /** Completion status */
  completed: boolean;
  /** Dependencies (other task IDs) */
  blockedBy?: string[];
  /** Task priority */
  priority?: TaskPriority;
  /** Task type */
  type?: TaskType;
  /** Arbitrary metadata */
  metadata?: Record<string, string>;
  /** Epic/feature group */
  epic?: string;
}

/**
 * Parsed spec section from markdown
 */
export interface ParsedSpec {
  /** Section name (e.g., "M2: Monaco Editor") */
  name: string;
  /** Tasks in this section */
  tasks: ParsedTask[];
  /** Section metadata */
  metadata?: Record<string, string>;
}

/**
 * Result of hydration operation
 */
export interface HydrationResult {
  /** Created task IDs */
  tasks: string[];
  /** Created task list ID */
  taskListId: string;
  /** Number of tasks created */
  count: number;
  /** Tasks that were already completed (skipped) */
  completed: string[];
  /** Dependencies set up */
  dependencies: number;
}

/**
 * Task hydrator - loads tasks from markdown spec files
 */
export class TaskHydrator {
  private storage: TaskStorage;
  private service: TaskListService;

  constructor(storage: TaskStorage) {
    this.storage = storage;
    this.service = new TaskListService(storage);
  }

  /**
   * Initialize the hydrator
   */
  async init(): Promise<void> {
    await this.storage.init();
  }

  /**
   * Hydrate tasks from a markdown file
   * 
   * @param filePath - Path to markdown file (e.g., './specs/tasks.md')
   * @param options - Hydration options
   * @returns Hydration result with created task IDs
   * 
   * @example
   * ```typescript
   * const result = await hydrator.fromMarkdown('./specs/tasks.md', {
   *   listId: 'sprint-1',
   *   skipCompleted: true
   * });
   * ```
   */
  async fromMarkdown(
    filePath: string,
    options: {
      /** Task list ID to add tasks to (default: 'default') */
      listId?: string;
      /** Skip already completed tasks (default: true) */
      skipCompleted?: boolean;
      /** Auto-setup dependencies (default: true) */
      setupDependencies?: boolean;
      /** Default priority for tasks */
      defaultPriority?: TaskPriority;
      /** Default type for tasks */
      defaultType?: TaskType;
    } = {}
  ): Promise<HydrationResult> {
    const {
      listId = 'default',
      skipCompleted = true,
      setupDependencies = true,
      defaultPriority = TaskPriority.MEDIUM,
      defaultType = TaskType.TASK,
    } = options;

    // Read and parse markdown
    const content = await this.readFile(filePath);
    const specs = this.parseMarkdown(content);

    const result: HydrationResult = {
      tasks: [],
      taskListId: listId,
      count: 0,
      completed: [],
      dependencies: 0,
    };

    // Track task ID mappings (spec ID -> godel task ID)
    const idMapping = new Map<string, string>();

    // Create tasks
    for (const spec of specs) {
      for (const parsed of spec.tasks) {
        // Skip completed tasks if requested
        if (skipCompleted && parsed.completed) {
          result.completed.push(parsed.id);
          continue;
        }

        // Create the task
        const task = await this.service.createTask(listId, {
          title: parsed.subject,
          description: parsed.description,
          priority: parsed.priority || defaultPriority,
          type: parsed.type || defaultType,
        });

        // Update with additional fields
        if (parsed.activeForm || parsed.metadata) {
          await this.service.updateTask(task.id, {
            activeForm: parsed.activeForm,
            metadata: parsed.metadata,
          });
        }

        // Store ID mapping for dependency setup
        idMapping.set(parsed.id, task.id);
        result.tasks.push(task.id);
        result.count++;
      }
    }

    // Setup dependencies
    if (setupDependencies) {
      for (const spec of specs) {
        for (const parsed of spec.tasks) {
          if (parsed.completed && skipCompleted) continue;

          const taskId = idMapping.get(parsed.id);
          if (!taskId || !parsed.blockedBy) continue;

          for (const depId of parsed.blockedBy) {
            const depTaskId = idMapping.get(depId);
            if (depTaskId) {
              await this.service.addDependency(taskId, depTaskId);
              result.dependencies++;
            }
          }
        }
      }
    }

    return result;
  }

  /**
   * Parse markdown content into structured specs
   * 
   * Supports format:
   * ```markdown
   * ## M2: Monaco Editor
   * - [ ] M2-T01: Integrate Monaco Editor in RuleZ UI
   * - [x] M2-T02: Add Monaco editor features
   * - [ ] M2-T03: Create EditorToolbar component ⚠ blocked by M2-T01
   * 
   * ## M3: Schema Validation
   * - [ ] M3-T01: Create JSON Schema for hooks.yaml validation
   * ```
   */
  parseMarkdown(content: string): ParsedSpec[] {
    const specs: ParsedSpec[] = [];
    const lines = content.split('\n');

    let currentSpec: ParsedSpec | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Parse section header (## Section Name)
      const sectionMatch = trimmed.match(/^##\s+(.+)$/);
      if (sectionMatch) {
        if (currentSpec) {
          specs.push(currentSpec);
        }
        currentSpec = {
          name: sectionMatch[1].trim(),
          tasks: [],
        };
        continue;
      }

      // Parse task item (- [ ] ID: Subject)
      const taskMatch = trimmed.match(/^-\s+\[([ xX])\]\s+(\S+):\s+(.+)$/);
      if (taskMatch && currentSpec) {
        const completed = taskMatch[1].toLowerCase() === 'x';
        const id = taskMatch[2];
        let subject = taskMatch[3].trim();

        // Parse dependency notation (⚠ blocked by X, ⛔ depends on X)
        const blockedBy: string[] = [];
        const depMatch = subject.match(/(?:⚠|⛔|blocked by|depends on)\s+([A-Z0-9-]+)/i);
        if (depMatch) {
          blockedBy.push(depMatch[1]);
          subject = subject.replace(/\s*(?:⚠|⛔|blocked by|depends on)\s+[A-Z0-9-]+/i, '').trim();
        }

        // Generate activeForm from subject
        const activeForm = this.generateActiveForm(subject);

        currentSpec.tasks.push({
          id,
          subject,
          activeForm,
          completed,
          blockedBy: blockedBy.length > 0 ? blockedBy : undefined,
          priority: this.inferPriority(subject),
          type: this.inferType(subject),
        });
      }
    }

    // Add last spec
    if (currentSpec) {
      specs.push(currentSpec);
    }

    return specs;
  }

  /**
   * Generate present continuous form from subject
   * e.g., "Implement OAuth" -> "Implementing OAuth"
   */
  private generateActiveForm(subject: string): string {
    const words = subject.split(' ');
    if (words.length === 0) return subject;

    const firstWord = words[0];
    const verbForms: Record<string, string> = {
      'implement': 'implementing',
      'add': 'adding',
      'create': 'creating',
      'fix': 'fixing',
      'update': 'updating',
      'refactor': 'refactoring',
      'integrate': 'integrating',
      'configure': 'configuring',
      'setup': 'setting up',
      'write': 'writing',
      'test': 'testing',
      'deploy': 'deploying',
      'build': 'building',
      'remove': 'removing',
      'delete': 'deleting',
      'migrate': 'migrating',
      'convert': 'converting',
    };

    const lowerFirst = firstWord.toLowerCase();
    if (verbForms[lowerFirst]) {
      words[0] = verbForms[lowerFirst];
      return words.join(' ');
    }

    // Default: add "ing" to first word
    return `Working on: ${subject}`;
  }

  /**
   * Infer priority from task subject
   */
  private inferPriority(subject: string): TaskPriority | undefined {
    const lower = subject.toLowerCase();
    if (lower.includes('critical') || lower.includes('urgent') || lower.includes('hotfix')) {
      return TaskPriority.CRITICAL;
    }
    if (lower.includes('high priority') || lower.includes('important')) {
      return TaskPriority.HIGH;
    }
    if (lower.includes('low priority') || lower.includes('nice to have')) {
      return TaskPriority.LOW;
    }
    return undefined;
  }

  /**
   * Infer task type from subject
   */
  private inferType(subject: string): TaskType | undefined {
    const lower = subject.toLowerCase();
    if (lower.includes('bug') || lower.includes('fix') || lower.includes('hotfix')) {
      return TaskType.BUG;
    }
    if (lower.includes('feature') || lower.includes('add')) {
      return TaskType.FEATURE;
    }
    if (lower.includes('refactor') || lower.includes('clean up')) {
      return TaskType.REFACTOR;
    }
    if (lower.includes('research') || lower.includes('investigate') || lower.includes('spike')) {
      return TaskType.RESEARCH;
    }
    return undefined;
  }

  /**
   * Read file content
   */
  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to read spec file ${filePath}: ${(error as Error).message}`);
    }
  }
}

/**
 * Convenience function for one-off hydration
 */
export async function hydrateFromMarkdown(
  filePath: string,
  storage: TaskStorage,
  options?: Parameters<TaskHydrator['fromMarkdown']>[1]
): Promise<HydrationResult> {
  const hydrator = new TaskHydrator(storage);
  await hydrator.init();
  return hydrator.fromMarkdown(filePath, options);
}
