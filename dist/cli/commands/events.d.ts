/**
 * Events Command v2 - Event streaming and listing with Message Bus integration
 *
 * Commands:
 * - dash events stream [--agent <id>] [--type <type>] [--severity <level>]
 * - dash events list [--since <duration>] [--agent <id>] [--limit <n>]
 * - dash events show <event-id>
 * - dash events replay <session-id> [--speed <n>x]
 */
import { Command } from 'commander';
export declare function registerEventsCommand(program: Command): void;
//# sourceMappingURL=events.d.ts.map