/**
 * Status Command - System Overview
 *
 * Shows Dash system status including:
 * - API version and health
 * - Agent count (running/idle)
 * - Swarm count (active)
 * - Budget summary
 * - OpenClaw connection status
 *
 * Usage: dash status
 */
import { Command } from 'commander';
/**
 * Register the status command with the CLI program
 */
export declare function registerStatusCommand(program: Command): void;
/**
 * Create status command for lazy loading pattern
 */
export declare function createStatusCommand(): Command;
export default registerStatusCommand;
//# sourceMappingURL=status.d.ts.map