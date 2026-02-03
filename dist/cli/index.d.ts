/**
 * CLI Command Registration v2 - Lazy Loading Optimized
 *
 * Imports and registers all CLI commands per SPEC_v2.md
 * Uses lazy loading to improve startup performance.
 */
import { Command } from 'commander';
/**
 * Register all CLI commands with the program
 * per SPEC_v2.md requirements:
 * - dash swarm create/destroy/scale/status
 * - dash dashboard (launch TUI)
 * - dash agents spawn/kill/pause/resume (v2 versions)
 * - dash events stream/list (v2 versions)
 *
 * OPTIMIZATION: Uses lazy loading to reduce startup time by ~30-40%
 */
export declare function registerCommands(program: Command): void;
export type { AgentStatus } from '../models/agent';
//# sourceMappingURL=index.d.ts.map