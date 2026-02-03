/**
 * Tasks Command - Manage tasks
 */

import { Command } from 'commander';
import { logger } from '../../utils';

export function registerTasksCommand(program: Command): void {
  const tasks = program
    .command('tasks')
    .description('Manage tasks');

  tasks
    .command('list')
    .description('List all tasks')
    .option('-s, --status <status>', 'Filter by status')
    .option('-a, --agent <agent-id>', 'Filter by agent')
    .action(async (options) => {
      console.log('📋 Listing tasks...');
      if (options.status) console.log('Status filter:', options.status);
      if (options.agent) console.log('Agent filter:', options.agent);
      logger.info('tasks', 'No tasks found');
    });

  tasks
    .command('create')
    .description('Create a new task')
    .argument('<title>', 'Task title')
    .option('-d, --description <desc>', 'Task description')
    .option('-p, --priority <priority>', 'Priority (low|medium|high)', 'medium')
    .action(async (title, options) => {
      console.log('✅ Creating task:', title);
      console.log('Description:', options.description);
      console.log('Priority:', options.priority);
    });

  tasks
    .command('assign')
    .description('Assign task to agent')
    .argument('<task-id>', 'Task ID')
    .argument('<agent-id>', 'Agent ID')
    .action(async (taskId, agentId) => {
      console.log(`📤 Assigning task ${taskId} to agent ${agentId}...`);
    });

  tasks
    .command('complete')
    .description('Mark task as complete')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId) => {
      console.log(`✅ Marking task ${taskId} as complete...`);
    });

  tasks
    .command('show')
    .description('Show task details')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId) => {
      console.log(`📄 Task ${taskId} details:`);
      console.log('  Status: pending');
      console.log('  Assigned to: none');
    });
}
