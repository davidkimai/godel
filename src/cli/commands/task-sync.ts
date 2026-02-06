/**
 * Task Sync Commands
 * 
 * Implements the Hydration and Sync-Back patterns from Claude Code Tasks:
 * - Hydrate: Load tasks from markdown spec files into godel
 * - Sync: Export godel tasks back to markdown spec files
 * 
 * Usage:
 *   godel task hydrate <spec-file> [options]
 *   godel task sync [options]
 */

import { Command } from 'commander';
import * as chalk from 'chalk';
import * as path from 'path';
import { logger } from '../../utils/logger';
import { TaskStorage, TaskHydrator, TaskSync, DEFAULT_TASK_LIST_ID } from '../../tasks';

/**
 * Register hydrate subcommand
 */
export function registerHydrateCommand(parent: Command): void {
  parent
    .command('hydrate')
    .description('Hydrate tasks from a markdown spec file')
    .argument('<file>', 'Path to markdown spec file (e.g., ./specs/tasks.md)')
    .option('-l, --list <list-id>', 'Task list ID to add tasks to', DEFAULT_TASK_LIST_ID)
    .option('-s, --skip-completed', 'Skip already completed tasks', true)
    .option('--no-skip-completed', 'Include completed tasks')
    .option('--no-deps', 'Skip dependency setup')
    .option('-p, --priority <priority>', 'Default priority (low|medium|high|critical)', 'medium')
    .option('-t, --type <type>', 'Default type (task|bug|feature|refactor|research)', 'task')
    .action(async (filePath, options) => {
      try {
        const storage = new TaskStorage();
        await storage.init();

        const hydrator = new TaskHydrator(storage);
        await hydrator.init();

        // Resolve relative paths
        const resolvedPath = path.resolve(filePath);

        logger.info(chalk.blue('📥 Hydrating tasks from spec file...'));
        logger.info(chalk.gray(`   Source: ${resolvedPath}`));
        logger.info(chalk.gray(`   Target list: ${options.list}`));

        const result = await hydrator.fromMarkdown(resolvedPath, {
          listId: options.list,
          skipCompleted: options.skipCompleted,
          setupDependencies: options.deps,
          defaultPriority: options.priority,
          defaultType: options.type,
        });

        // Display results
        logger.info('');
        logger.info(chalk.green(`✅ Hydration complete!`));
        logger.info(chalk.gray(`   Created: ${result.count} tasks`));
        
        if (result.completed.length > 0) {
          logger.info(chalk.gray(`   Skipped: ${result.completed.length} completed`));
        }
        
        if (result.dependencies > 0) {
          logger.info(chalk.gray(`   Dependencies: ${result.dependencies} relationships`));
        }

        if (result.tasks.length > 0) {
          logger.info('');
          logger.info(chalk.blue('📋 Created tasks:'));
          for (const taskId of result.tasks.slice(0, 10)) {
            const task = await storage.getTask(taskId);
            if (task) {
              const status = getStatusIcon(task.status);
              logger.info(`   ${status} ${chalk.cyan(taskId)}: ${task.title}`);
            }
          }
          if (result.tasks.length > 10) {
            logger.info(chalk.gray(`   ... and ${result.tasks.length - 10} more`));
          }
        }

        // Show ready tasks (no dependencies)
        const { TaskListService } = await import('../../tasks/tasklist');
        const service = new TaskListService(storage);
        const readyTasks = await service.getReadyTasks(options.list);
        
        if (readyTasks.length > 0) {
          logger.info('');
          logger.info(chalk.green('🚀 Ready to start:'));
          for (const task of readyTasks.slice(0, 5)) {
            logger.info(`   ⏳ ${chalk.cyan(task.id)}: ${task.title}`);
          }
        }

      } catch (error) {
        logger.error(chalk.red('❌ Hydration failed:'), (error as Error).message);
        process.exit(1);
      }
    });
}

/**
 * Register sync subcommand
 */
export function registerSyncCommand(parent: Command): void {
  parent
    .command('sync')
    .description('Sync tasks back to markdown spec file')
    .option('-l, --list <list-id>', 'Task list ID to sync', DEFAULT_TASK_LIST_ID)
    .option('-o, --output <file>', 'Output markdown file path')
    .option('-c, --checklist', 'Export as simple checklist')
    .option('--completed', 'Include completed tasks', true)
    .option('--no-completed', 'Exclude completed tasks')
    .option('--update', 'Update existing file (preserve content)')
    .action(async (options) => {
      try {
        const storage = new TaskStorage();
        await storage.init();

        const sync = new TaskSync(storage);
        await sync.init();

        // Determine output path
        let outputPath = options.output;
        if (!outputPath) {
          // Default to .godel/specs/{list-id}-tasks.md
          const homeDir = process.env['HOME'] || process.env['USERPROFILE'] || '.';
          outputPath = path.join(homeDir, '.godel', 'specs', `${options.list}-tasks.md`);
        }
        const resolvedPath = path.resolve(outputPath);

        logger.info(chalk.blue('📤 Syncing tasks to spec file...'));
        logger.info(chalk.gray(`   Source list: ${options.list}`));
        logger.info(chalk.gray(`   Output: ${resolvedPath}`));

        let result;
        if (options.update) {
          result = await sync.updateExisting(options.list, resolvedPath);
        } else if (options.checklist) {
          result = await sync.toChecklist(options.list, resolvedPath);
        } else {
          result = await sync.toMarkdown(options.list, resolvedPath, {
            includeCompleted: options.completed,
          });
        }

        // Display results
        logger.info('');
        logger.info(chalk.green(`✅ Sync complete!`));
        logger.info(chalk.gray(`   Exported: ${result.exported} tasks`));
        logger.info(chalk.gray(`   Completed: ${result.completed}`));
        logger.info(chalk.gray(`   Pending: ${result.pending}`));
        logger.info(chalk.gray(`   File: ${result.filePath}`));

        // Suggest git commit
        logger.info('');
        logger.info(chalk.blue('💡 Next steps:'));
        logger.info(chalk.gray('   git add ' + result.filePath));
        logger.info(chalk.gray('   git commit -m "Update task list"'));

      } catch (error) {
        logger.error(chalk.red('❌ Sync failed:'), (error as Error).message);
        process.exit(1);
      }
    });
}

/**
 * Get status icon for display
 */
function getStatusIcon(status: string): string {
  switch (status) {
    case 'open':
      return chalk.gray('⏳');
    case 'in-progress':
      return chalk.yellow('🔄');
    case 'blocked':
      return chalk.red('⏸️');
    case 'review':
      return chalk.blue('👀');
    case 'done':
      return chalk.green('✅');
    default:
      return chalk.gray('◻️');
  }
}
