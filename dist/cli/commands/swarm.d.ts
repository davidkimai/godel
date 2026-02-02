/**
 * Swarm Command - Manage agent swarms
 *
 * Commands:
 * - dash swarm create --name <name> --task <task> [options]
 * - dash swarm destroy <swarm-id> [--force]
 * - dash swarm scale <swarm-id> <target-size>
 * - dash swarm status [swarm-id]
 * - dash swarm list [--active]
 */
import { Command } from 'commander';
export declare function registerSwarmCommand(program: Command): void;
//# sourceMappingURL=swarm.d.ts.map