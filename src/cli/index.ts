/**
 * CLI Command Registration v2
 * Imports and registers all CLI commands per SPEC_v2.md
 */

import { Command } from 'commander';

// Import command modules
import { registerAgentsCommand } from './commands/agents';
import { registerTasksCommand } from './commands/tasks';
import { registerQualityCommand } from './commands/quality';
import { registerReasoningCommand } from './commands/reasoning';
import { registerEventsCommand } from './commands/events';
import { registerTestsCommand } from './commands/tests';
import { registerContextCommand } from './commands/context';
import { createBudgetCommand } from './commands/budget';
import { registerSafetyCommand } from './commands/safety';
import { createApprovalCommand } from './commands/approve';

// v2 Commands per SPEC_v2.md
import { registerSwarmCommand } from './commands/swarm';
import { registerDashboardCommand } from './commands/dashboard';
import { registerSelfImproveCommand } from './commands/self-improve';

/**
 * Register all CLI commands with the program
 * per SPEC_v2.md requirements:
 * - dash swarm create/destroy/scale/status
 * - dash dashboard (launch TUI)
 * - dash agents spawn/kill/pause/resume (v2 versions)
 * - dash events stream/list (v2 versions)
 */
export function registerCommands(program: Command): void {
  // v1 commands (maintained for compatibility)
  registerTasksCommand(program);
  registerQualityCommand(program);
  registerReasoningCommand(program);
  registerTestsCommand(program);
  registerContextCommand(program);
  program.addCommand(createBudgetCommand());
  registerSafetyCommand(program);
  program.addCommand(createApprovalCommand());

  // v2 commands per SPEC_v2.md
  registerSwarmCommand(program);      // dash swarm create/destroy/scale/status
  registerDashboardCommand(program);  // dash dashboard
  registerAgentsCommand(program);     // dash agents spawn/kill/pause/resume (v2)
  registerEventsCommand(program);     // dash events stream/list (v2)
  
  // Self-improvement command
  registerSelfImproveCommand(program); // dash self-improve run/status/report
}

// Re-export for testing
export * from './commands/agents';
export * from './commands/events';
export * from './commands/swarm';
export * from './commands/dashboard';
