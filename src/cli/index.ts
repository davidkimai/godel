/**
 * CLI Command Registration
 * Imports and registers all CLI commands
 */

import { Command } from 'commander';

// Import command modules
import { registerAgentsCommand } from './commands/agents.js';
import { registerTasksCommand } from './commands/tasks.js';
import { registerQualityCommand } from './commands/quality.js';
import { registerReasoningCommand } from './commands/reasoning.js';
import { registerEventsCommand } from './commands/events.js';
import { registerTestsCommand } from './commands/tests.js';
import { registerContextCommand } from './commands/context.js';
import { createBudgetCommand } from './commands/budget.js';
import { registerSafetyCommand } from './commands/safety.js';
import { createApprovalCommand } from './commands/approve.js';

/**
 * Register all CLI commands with the program
 */
export function registerCommands(program: Command): void {
  registerAgentsCommand(program);
  registerTasksCommand(program);
  registerQualityCommand(program);
  registerReasoningCommand(program);
  registerEventsCommand(program);
  registerTestsCommand(program);
  registerContextCommand(program);
  program.addCommand(createBudgetCommand());
  registerSafetyCommand(program);
  program.addCommand(createApprovalCommand());
}
