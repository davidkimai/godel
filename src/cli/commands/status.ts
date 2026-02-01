/**
 * System Status Command
 * 
 * Displays overall system status and health
 */

import { memoryStore } from '../storage';

export async function statusCommand(): Promise<void> {
  console.log('Mission Control System Status');
  console.log('==============================');
  console.log('');
  
  const stats = memoryStore.getStats();
  
  console.log('Storage:');
  console.log(`  Agents:   ${stats.agents}`);
  console.log(`  Tasks:    ${stats.tasks}`);
  console.log(`  Events:   ${stats.events}`);
  console.log('');
  
  console.log('Commands:');
  console.log('  agents   - Manage agents (list, status, spawn, kill, pause, resume)');
  console.log('  tasks    - Manage tasks (list, create, update, assign, dependencies)');
  console.log('  events   - Manage events (stream, replay, history, types)');
  console.log('  context  - Manage context (get, add, remove, tree, analyze)');
  console.log('  status   - Display this status');
  console.log('  help     - Show help');
  console.log('');
  
  console.log('Status: OPERATIONAL');
}

export default statusCommand;
