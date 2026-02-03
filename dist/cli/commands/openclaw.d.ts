/**
 * OpenClaw CLI Command - Manage OpenClaw Gateway integration
 *
 * Commands:
 * - dash openclaw connect [--host HOST] [--port PORT] [--token TOKEN]
 * - dash openclaw status
 * - dash openclaw sessions list [--active] [--kind main|group|thread]
 * - dash openclaw sessions history <session-key> [--limit N]
 * - dash openclaw spawn --task "..." [--model MODEL] [--budget AMOUNT]
 * - dash openclaw send --session SESSION "message"
 * - dash openclaw kill <session-key> [--force]
 *
 * Per OPENCLAW_INTEGRATION_SPEC.md section 5.1
 */
import { Command } from 'commander';
import { GatewayClient, SessionManager, AgentExecutor } from '../../integrations/openclaw';
export declare function registerOpenClawCommand(program: Command): void;
export { GatewayClient, SessionManager, AgentExecutor };
/**
 * Reset global state (for testing)
 */
export declare function resetOpenClawState(): void;
export default registerOpenClawCommand;
//# sourceMappingURL=openclaw.d.ts.map