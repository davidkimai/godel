/**
 * Threshold Management Module
 *
 * Provides threshold configuration, checking logic, and action triggering.
 * Supports configurable thresholds with actions: warn, notify, block, kill, audit.
 */
import type { BudgetTracking } from './budget';
export type ThresholdAction = 'warn' | 'notify' | 'block' | 'kill' | 'audit';
export interface ThresholdConfig {
    threshold: number;
    action: ThresholdAction;
    notify?: string[];
    coolDown?: number;
    message?: string;
}
export interface ThresholdCheckResult {
    triggered: boolean;
    threshold?: number;
    action?: ThresholdAction;
    message?: string;
    shouldBlock?: boolean;
    shouldKill?: boolean;
}
export interface ThresholdState {
    lastTriggeredAt: Map<number, Date>;
    blockedAt?: Date;
    approvedToContinue?: boolean;
    approvalExpiresAt?: Date;
}
export interface BlockedAgent {
    agentId: string;
    budgetId: string;
    blockedAt: Date;
    threshold: number;
    requestedBy: string;
    approved?: boolean;
    approvedBy?: string;
    approvedAt?: Date;
}
/**
 * Default thresholds as specified in the spec:
 * - 50%: warn (log warning, continue)
 * - 75%: warn + notify (log, send webhook alert)
 * - 90%: block (pause agent, request approval)
 * - 100%: kill (immediately terminate)
 * - 110%: audit (flag for compliance review)
 */
export declare const DEFAULT_THRESHOLDS: ThresholdConfig[];
declare const thresholdStates: Map<string, ThresholdState>;
declare const blockedAgents: Map<string, BlockedAgent>;
declare const auditLog: Array<{
    timestamp: Date;
    budgetId: string;
    agentId: string;
    threshold: number;
    action: ThresholdAction;
    details: Record<string, unknown>;
}>;
/**
 * Check if any thresholds are crossed given the current percentage
 */
export declare function checkThresholds(percentageUsed: number, thresholds?: ThresholdConfig[]): ThresholdCheckResult;
/**
 * Check thresholds with cooldown enforcement
 */
export declare function checkThresholdsWithCooldown(budgetId: string, percentageUsed: number, thresholds?: ThresholdConfig[]): ThresholdCheckResult;
/**
 * Execute the appropriate action for a threshold crossing
 */
export declare function executeThresholdAction(result: ThresholdCheckResult, tracking: BudgetTracking): void;
/**
 * Check if an agent is blocked
 */
export declare function isAgentBlocked(agentId: string): boolean;
/**
 * Request approval to continue for a blocked agent
 */
export declare function requestApproval(agentId: string, requestedBy: string): BlockedAgent | null;
/**
 * Approve a blocked agent to continue
 */
export declare function approveBlockedAgent(agentId: string, approvedBy: string, durationMinutes?: number): BlockedAgent | null;
/**
 * Get blocked agent info
 */
export declare function getBlockedAgent(agentId: string): BlockedAgent | undefined;
/**
 * Get all blocked agents
 */
export declare function getAllBlockedAgents(): BlockedAgent[];
/**
 * Unblock an agent (manual override)
 */
export declare function unblockAgent(agentId: string): boolean;
/**
 * Reset threshold state for a budget
 */
export declare function resetThresholdState(budgetId: string): void;
/**
 * Get audit log entries
 */
export declare function getAuditLog(budgetId?: string, since?: Date): Array<{
    timestamp: Date;
    budgetId: string;
    agentId: string;
    threshold: number;
    action: ThresholdAction;
    details: Record<string, unknown>;
}>;
/**
 * Clear audit log (for testing)
 */
export declare function clearAuditLog(): void;
export { thresholdStates, blockedAgents, auditLog };
//# sourceMappingURL=thresholds.d.ts.map