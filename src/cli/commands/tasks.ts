/**
 * Task Management Commands
 * 
 * Commands: list, create, update, assign, dependencies, checkpoint, resolve-blocker
 * 
 * Uses the MemoryStore for task persistence
 */

import { Command } from 'commander';

import { TaskStatus, createTask, createEvent } from '../../models';
import { memoryStore } from '../../storage';
import { logger } from '../../utils/logger';
import { formatTasks, formatTask } from '../formatters';
import { validateFormat, handleError, globalFormat } from '../main';

import type { Task} from '../../models';

export function tasksCommand(): Command {
  const program = new Command('tasks');
  
  program
    .description('Manage tasks in the system')
    .alias('task');
  
  // tasks list
  program
    .command('list')
    .alias('ls')
    .description('List all tasks')
    .option('--status <status>', 'Filter by status (pending, in_progress, completed, failed, blocked)')
    .option('--assignee <agent-id>', 'Filter by assignee')
    .option('--priority <priority>', 'Filter by priority (low, medium, high, critical)')
    .action(async (options: { format: string; status?: string; assignee?: string; priority?: string }) => {
      const format = validateFormat(globalFormat);
      
      try {
        let tasks = memoryStore.tasks.list();
        
        // Apply filters
        if (options.status) {
          tasks = tasks.filter((t: Task) => t.status === options.status);
        }
        if (options.assignee) {
          tasks = tasks.filter((t: Task) => t.assigneeId === options.assignee);
        }
        if (options.priority) {
          tasks = tasks.filter((t: Task) => t.priority === options.priority);
        }
        
        // Sort by createdAt descending (newest first)
        tasks.sort((a: Task, b: Task) => b.createdAt.getTime() - a.createdAt.getTime());
        
        logger.info(formatTasks(tasks, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks create
  program
    .command('create <title> <description>')
    .description('Create a new task')
    .option('--assignee <agent-id>', 'Assign to agent ID')
    .option('--depends-on <task-id>', 'Task ID this task depends on')
    .option('--priority <low|medium|high|critical>', 'Task priority', 'medium')
    .action(async (title: string, description: string, options: { format: string; assignee?: string; dependsOn?: string; priority?: string }) => {
      const format = validateFormat(globalFormat);
      
      try {
        const task = createTask({
          title,
          description,
          assigneeId: options.assignee,
          dependsOn: options.dependsOn ? [options.dependsOn] : [],
          priority: (options.priority as 'low' | 'medium' | 'high' | 'critical') || 'medium'
        });
        
        memoryStore.tasks.create(task);
        
        // Emit create event
        const event = createEvent({
          type: 'task.created',
          entityType: 'task',
          entityId: task.id,
          payload: { title, description, assigneeId: options.assignee, priority: options.priority }
        });
        memoryStore.events.create(event);

        logger.info(formatTask(task, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks get
  program
    .command('get <task-id>')
    .description('Get details of a specific task')
    .action(async (taskId: string) => {
      const format = validateFormat(globalFormat);
      
      try {
        const task = memoryStore.tasks.get(taskId);
        if (!task) {
          handleError(`Task not found: ${taskId}`);
        }
        logger.info(formatTask(task, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks update
  program
    .command('update <task-id> <status>')
    .description('Update task status')
    .action(async (taskId: string, status: string) => {
      const format = validateFormat(globalFormat);
      
      try {
        const task = memoryStore.tasks.get(taskId);
        if (!task) {
          handleError(`Task not found: ${taskId}`);
        }
        
        const oldStatus = task.status;
        const newStatus = status as TaskStatus;
        
        const updated = memoryStore.tasks.update(taskId, {
          status: newStatus,
          completedAt: newStatus === TaskStatus.COMPLETED ? new Date() : task.completedAt
        });
        
        // Emit status change event
        const event = createEvent({
          type: 'task.status_changed',
          entityType: 'task',
          entityId: taskId,
          payload: { previousStatus: oldStatus, newStatus }
        });
        memoryStore.events.create(event);

        logger.info(formatTask(updated!, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks assign
  program
    .command('assign <task-id> <agent-id>')
    .description('Assign a task to an agent')
    .action(async (taskId: string, agentId: string) => {
      const format = validateFormat(globalFormat);
      
      try {
        const task = memoryStore.tasks.get(taskId);
        if (!task) {
          handleError(`Task not found: ${taskId}`);
        }
        
        const updated = memoryStore.tasks.update(taskId, { assigneeId: agentId });

        // Emit assign event
        const event = createEvent({
          type: 'task.assigned',
          entityType: 'task',
          entityId: taskId,
          payload: { agentId }
        });
        memoryStore.events.create(event);

        logger.info(formatTask(updated!, format));
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks dependencies
  program
    .command('dependencies <task-id>')
    .description('Show dependencies for a task')
    .action(async (taskId: string) => {
      const format = validateFormat(globalFormat);
      
      try {
        const task = memoryStore.tasks.get(taskId);
        if (!task) {
          handleError(`Task not found: ${taskId}`);
        }
        
        // Get dependent tasks
        const dependents = memoryStore.tasks.findDependents(taskId);

        logger.info(`Task: ${taskId}`);
        logger.info(`Depends On: ${task.dependsOn.length > 0 ? task.dependsOn.join(', ') : 'none'}`);
        logger.info(`Blocked By: ${dependents.length > 0 ? dependents.map((t: Task) => t.id).join(', ') : 'none'}`);
        logger.debug('');

        if (format === 'json') {
          logger.info(JSON.stringify({
            taskId,
            dependsOn: task.dependsOn,
            blockedBy: dependents.map((t: Task) => t.id)
          }, null, 2));
        } else {
          logger.info('Depends On:');
          if (task.dependsOn.length === 0) {
            logger.info('  (none)');
          } else {
            task.dependsOn.forEach((depId: string) => {
              const dep = memoryStore.tasks.get(depId);
              logger.info(`  - ${depId} (${dep?.title || 'unknown'})`);
            });
          }
          logger.debug('');
          logger.info('Blocked By:');
          if (dependents.length === 0) {
            logger.info('  (none)');
          } else {
            dependents.forEach((t: Task) => {
              logger.info(`  - ${t.id} (${t.title})`);
            });
          }
        }
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks checkpoint
  program
    .command('checkpoint <task-id>')
    .description('Create a checkpoint for a task')
    .option('--progress <0-1>', 'Progress value (0.0 to 1.0)', parseFloat)
    .option('--state <json>', 'State JSON object')
    .option('--label <text>', 'Checkpoint label')
    .action(async (taskId: string, options: { progress?: number; state?: string; label?: string }) => {
      try {
        const task = memoryStore.tasks.get(taskId);
        if (!task) {
          handleError(`Task not found: ${taskId}`);
        }
        
        const checkpoint = {
          id: `cp-${Date.now()}`,
          name: options.label || `Checkpoint ${(task.checkpoints?.length || 0) + 1}`,
          createdAt: new Date(),
          progress: options.progress || 0,
          state: options.state ? JSON.parse(options.state) : {}
        };
        
        // Add checkpoint to task
        const checkpoints = task.checkpoints || [];
        checkpoints.push(checkpoint);
        memoryStore.tasks.update(taskId, { checkpoints });

        logger.info(`Checkpoint created for task ${taskId}:`);
        logger.info(`  ID: ${checkpoint.id}`);
        logger.info(`  Progress: ${(checkpoint.progress * 100).toFixed(0)}%`);
        logger.info(`  Name: ${checkpoint.name}`);
      } catch (error) {
        handleError(error);
      }
    });
  
  // tasks resolve-blocker
  program
    .command('resolve-blocker <task-id> <blocker-id>')
    .description('Mark a blocker as resolved')
    .action(async (taskId: string, blockerId: string) => {
      try {
        const task = memoryStore.tasks.get(taskId);
        if (!task) {
          handleError(`Task not found: ${taskId}`);
        }
        
        // Remove blocker from dependsOn
        const newDependsOn = task.dependsOn.filter((id: string) => id !== blockerId);
        memoryStore.tasks.update(taskId, { dependsOn: newDependsOn });

        logger.info(`Blocker ${blockerId} resolved for task ${taskId}`);
      } catch (error) {
        handleError(error);
      }
    });
  
  return program;
}

export default tasksCommand;
