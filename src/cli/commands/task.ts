/**
 * Task Commands
 * 
 * Commands:
 * - swarmctl task list [--format json|jsonl|table] [--status <status>]
 * - swarmctl task create --title <title> --description <desc> [options]
 * - swarmctl task get <task-id> [--format json]
 * - swarmctl task assign <task-id> <agent-id>
 * - swarmctl task complete <task-id>
 * - swarmctl task cancel <task-id>
 */

import { Command } from 'commander';
import { getGlobalClient } from '../lib/client';
import { formatTasks, type OutputFormat } from '../lib/output';

export function registerTaskCommand(program: Command): void {
  const task = program
    .command('task')
    .description('Manage tasks');

  // ============================================================================
  // task list
  // ============================================================================
  task
    .command('list')
    .description('List all tasks')
    .option('-f, --format <format>', 'Output format (table|json|jsonl)', 'table')
    .option('-s, --status <status>', 'Filter by status (pending|in_progress|completed|failed|cancelled)')
    .option('-a, --assignee <agent-id>', 'Filter by assignee agent ID')
    .option('--page <page>', 'Page number', '1')
    .option('--page-size <size>', 'Items per page', '50')
    .action(async (options) => {
      try {
        const client = getGlobalClient();
        const response = await client.listTasks({
          status: options.status,
          assigneeId: options.assignee,
          page: parseInt(options.page, 10),
          pageSize: parseInt(options.pageSize, 10),
        });

        if (!response.success || !response.data) {
          console.error('❌ Failed to list tasks:', response.error?.message);
          process.exit(1);
        }

        const tasks = response.data.items;

        if (tasks.length === 0) {
          console.log('📭 No tasks found');
          console.log('💡 Use "swarmctl task create" to create a task');
          return;
        }

        const format = options.format as OutputFormat;
        console.log(formatTasks(tasks, { format }));

        if (response.data.hasMore) {
          console.log(`\n📄 Page ${response.data.page} of ${Math.ceil(response.data.total / response.data.pageSize)}`);
        }
      } catch (error) {
        console.error('❌ Failed to list tasks:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task create
  // ============================================================================
  task
    .command('create')
    .description('Create a new task')
    .requiredOption('-t, --title <title>', 'Task title')
    .requiredOption('-d, --description <description>', 'Task description')
    .option('-p, --priority <priority>', 'Priority (low|medium|high|critical)', 'medium')
    .option('-a, --assignee <agent-id>', 'Assignee agent ID')
    .option('--depends-on <ids>', 'Comma-separated list of task IDs this task depends on')
    .option('--dry-run', 'Show configuration without creating')
    .action(async (options) => {
      try {
        console.log('📝 Creating task...\n');

        // Validate priority
        const validPriorities = ['low', 'medium', 'high', 'critical'];
        if (!validPriorities.includes(options.priority)) {
          console.error(`❌ Invalid priority: ${options.priority}`);
          console.error(`   Valid priorities: ${validPriorities.join(', ')}`);
          process.exit(1);
        }

        const dependsOn = options.dependsOn 
          ? options.dependsOn.split(',').map((id: string) => id.trim()) 
          : undefined;

        if (options.dryRun) {
          console.log('📋 Configuration (dry run):');
          console.log(`   Title: ${options.title}`);
          console.log(`   Description: ${options.description}`);
          console.log(`   Priority: ${options.priority}`);
          console.log(`   Assignee: ${options.assignee || '(none)'}`);
          console.log(`   Depends On: ${dependsOn?.join(', ') || '(none)'}`);
          return;
        }

        const client = getGlobalClient();

        // Validate assignee if specified
        if (options.assignee) {
          const agentResponse = await client.getAgent(options.assignee);
          if (!agentResponse.success) {
            console.error(`❌ Agent ${options.assignee} not found`);
            process.exit(1);
          }
        }

        const response = await client.createTask({
          title: options.title,
          description: options.description,
          priority: options.priority,
          assigneeId: options.assignee,
          dependsOn,
        });

        if (!response.success || !response.data) {
          console.error('❌ Failed to create task:', response.error?.message);
          process.exit(1);
        }

        const newTask = response.data;

        console.log('✅ Task created successfully!\n');
        console.log(`   ID: ${newTask.id}`);
        console.log(`   Title: ${newTask.title}`);
        console.log(`   Status: ${newTask.status}`);
        console.log(`   Priority: ${newTask.priority}`);
        if (options.assignee) {
          console.log(`   Assignee: ${options.assignee}`);
        }
        console.log(`\n💡 Use 'swarmctl task get ${newTask.id}' to view details`);

      } catch (error) {
        console.error('❌ Failed to create task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task get
  // ============================================================================
  task
    .command('get')
    .description('Get task details')
    .argument('<task-id>', 'Task ID')
    .option('-f, --format <format>', 'Output format (table|json)', 'table')
    .action(async (taskId, options) => {
      try {
        const client = getGlobalClient();
        const response = await client.getTask(taskId);

        if (!response.success || !response.data) {
          console.error(`❌ Task ${taskId} not found`);
          process.exit(1);
        }

        const task = response.data;

        if (options.format === 'json') {
          console.log(JSON.stringify(task, null, 2));
          return;
        }

        console.log(`📋 Task: ${taskId}\n`);
        console.log(`   Title:       ${task.title}`);
        console.log(`   Description: ${task.description}`);
        console.log(`   Status:      ${task.status}`);
        console.log(`   Priority:    ${task.priority}`);
        
        if (task.assigneeId) {
          console.log(`   Assignee:    ${task.assigneeId}`);
        } else {
          console.log(`   Assignee:    (unassigned)`);
        }

        if (task.dependsOn.length > 0) {
          console.log(`   Depends On:  ${task.dependsOn.join(', ')}`);
        }

        console.log(`\n   Created:     ${task.createdAt.toISOString()}`);
        console.log(`   Updated:     ${task.updatedAt.toISOString()}`);
        
        if (task.completedAt) {
          console.log(`   Completed:   ${task.completedAt.toISOString()}`);
        }

        if (task.reasoning) {
          console.log(`\n   Reasoning:`);
          if (task.reasoning.hypothesis) {
            console.log(`     Hypothesis: ${task.reasoning.hypothesis}`);
          }
          if (task.reasoning.confidence !== undefined) {
            console.log(`     Confidence: ${(task.reasoning.confidence * 100).toFixed(0)}%`);
          }
        }

      } catch (error) {
        console.error('❌ Failed to get task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task assign
  // ============================================================================
  task
    .command('assign')
    .description('Assign task to an agent')
    .argument('<task-id>', 'Task ID')
    .argument('<agent-id>', 'Agent ID')
    .action(async (taskId, agentId) => {
      try {
        const client = getGlobalClient();

        // Verify task exists
        const taskResponse = await client.getTask(taskId);
        if (!taskResponse.success) {
          console.error(`❌ Task ${taskId} not found`);
          process.exit(1);
        }

        // Verify agent exists
        const agentResponse = await client.getAgent(agentId);
        if (!agentResponse.success) {
          console.error(`❌ Agent ${agentId} not found`);
          process.exit(1);
        }

        console.log(`📤 Assigning task ${taskId} to agent ${agentId}...`);

        const response = await client.assignTask(taskId, agentId);

        if (!response.success || !response.data) {
          console.error('❌ Failed to assign task:', response.error?.message);
          process.exit(1);
        }

        console.log('✅ Task assigned successfully');

      } catch (error) {
        console.error('❌ Failed to assign task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task complete
  // ============================================================================
  task
    .command('complete')
    .description('Mark task as complete')
    .argument('<task-id>', 'Task ID')
    .action(async (taskId) => {
      try {
        const client = getGlobalClient();

        // Verify task exists
        const taskResponse = await client.getTask(taskId);
        if (!taskResponse.success || !taskResponse.data) {
          console.error(`❌ Task ${taskId} not found`);
          process.exit(1);
        }

        const task = taskResponse.data;

        if (task.status === 'completed') {
          console.log(`ℹ️  Task ${taskId} is already completed`);
          return;
        }

        console.log(`✅ Completing task ${taskId}...`);

        const response = await client.completeTask(taskId);

        if (!response.success || !response.data) {
          console.error('❌ Failed to complete task:', response.error?.message);
          process.exit(1);
        }

        console.log('✅ Task marked as complete');

      } catch (error) {
        console.error('❌ Failed to complete task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });

  // ============================================================================
  // task cancel
  // ============================================================================
  task
    .command('cancel')
    .description('Cancel a task')
    .argument('<task-id>', 'Task ID')
    .option('--yes', 'Skip confirmation prompt')
    .action(async (taskId, options) => {
      try {
        const client = getGlobalClient();

        // Verify task exists
        const taskResponse = await client.getTask(taskId);
        if (!taskResponse.success || !taskResponse.data) {
          console.error(`❌ Task ${taskId} not found`);
          process.exit(1);
        }

        const task = taskResponse.data;

        if (task.status === 'cancelled') {
          console.log(`ℹ️  Task ${taskId} is already cancelled`);
          return;
        }

        if (task.status === 'completed') {
          console.error(`❌ Cannot cancel a completed task`);
          process.exit(1);
        }

        console.log(`⚠️  You are about to cancel task: ${task.title}`);
        console.log(`   ID: ${task.id}`);
        console.log(`   Status: ${task.status}`);

        if (!options.yes) {
          console.log('\n🛑 Use --yes to confirm cancellation');
          return;
        }

        console.log('\n🚫 Cancelling task...');

        const response = await client.cancelTask(taskId);

        if (!response.success || !response.data) {
          console.error('❌ Failed to cancel task:', response.error?.message);
          process.exit(1);
        }

        console.log('✅ Task cancelled');

      } catch (error) {
        console.error('❌ Failed to cancel task:', error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    });
}
