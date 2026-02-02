/**
 * System Status Command
 * 
 * Displays overall system status and health
 */

import { logger } from '../../utils';
import { memoryStore } from '../storage';

export async function statusCommand(): Promise<void> {
  logger.info('Mission Control System Status');
  logger.info('==============================');
  logger.info('');
  
  const stats = memoryStore.getStats();
  
  logger.info('Storage:', { agents: stats.agents, tasks: stats.tasks, events: stats.events });
  
  logger.info('Commands:');
  logger.info('  agents   - Manage agents (list, status, spawn, kill, pause, resume)');
  logger.info('  tasks    - Manage tasks (list, create, update, assign, dependencies)');
  logger.info('  events   - Manage events (stream, replay, history, types)');
  logger.info('  context  - Manage context (get, add, remove, tree, analyze)');
  logger.info('  status   - Display this status');
  logger.info('  help     - Show help');
  logger.info('');
  
  logger.info('Status: OPERATIONAL');
}

export default statusCommand;
