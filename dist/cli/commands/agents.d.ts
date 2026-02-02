/**
 * Agents Command v2 - Manage AI agents with Swarm and Lifecycle integration
 *
 * Commands:
 * - dash agents list [--format table|json] [--swarm <id>]
 * - dash agents spawn <task> [--model <model>] [--swarm <id>]
 * - dash agents pause <agent-id>
 * - dash agents resume <agent-id>
 * - dash agents kill <agent-id> [--force]
 * - dash agents status <agent-id>
 * - dash agents retry <agent-id> [--model <model>]
 */
import { Command } from 'commander';
export declare function registerAgentsCommand(program: Command): void;
//# sourceMappingURL=agents.d.ts.map