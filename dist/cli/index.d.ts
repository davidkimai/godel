/**
 * CLI Command Registration v2
 * Imports and registers all CLI commands per SPEC_v2.md
 */
import { Command } from 'commander';
/**
 * Register all CLI commands with the program
 * per SPEC_v2.md requirements:
 * - dash swarm create/destroy/scale/status
 * - dash dashboard (launch TUI)
 * - dash agents spawn/kill/pause/resume (v2 versions)
 * - dash events stream/list (v2 versions)
 */
export declare function registerCommands(program: Command): void;
export * from './commands/agents';
export * from './commands/events';
export * from './commands/swarm';
export * from './commands/dashboard';
//# sourceMappingURL=index.d.ts.map