/**
 * Threshold Management Module
 *
 * Provides threshold configuration, checking logic, and action triggering.
 * Supports configurable thresholds with actions: warn, notify, block, kill, audit.
 */

import { logger } from '../utils';
import type { BudgetTracking, BudgetType } from './budget';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type ThresholdAction = 'warn' | 'notify' | 'block' | 'kill' | 'audit';

export interface ThresholdConfig {
  threshold: number; // 0-100 percentage
  action: ThresholdAction;
  notify?: string[]; // Webhook URLs, email addresses, or channel identifiers
  coolDown?: number; // Seconds before re-triggering the same threshold
  message?: string; // Custom message for this threshold
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

// ============================================================================
// Default Threshold Configurations
// ============================================================================

/**
 * Default thresholds as specified in the spec:
 * - 50%: warn (log warning, continue)
 * - 75%: warn + notify (log, send webhook alert)
 * - 90%: block (pause agent, request approval)
 * - 100%: kill (immediately terminate)
 * - 110%: audit (flag for compliance review)
 */
export const DEFAULT_THRESHOLDS: ThresholdConfig[] = [
  { threshold: 50, action: 'warn', message: 'Budget at 50% - continuing with warning' },
  {
    threshold: 75,
    action: 'notify',
    notify: ['webhook:alerts'],
    message: 'Budget at 75% - notification sent',
  },
  {
    threshold: 90,
    action: 'block',
    notify: ['webhook:alerts', 'email:admin'],
    message: 'Budget at 90% - agent blocked pending approval',
  },
  {
    threshold: 100,
    action: 'kill',
    notify: ['webhook:critical', 'email:admin'],
    message: 'Budget at 100% - agent terminated',
  },
  { threshold: 110, action: 'audit', message: 'Budget exceeded 110% - flagged for compliance review' },
];

// ============================================================================
// State Management
// ============================================================================

// Track threshold trigger times to enforce cooldowns
const thresholdStates = new Map<string, ThresholdState>();

// Track blocked agents waiting for approval
const blockedAgents = new Map<string, BlockedAgent>();

// Audit log for compliance review
const auditLog: Array<{
  timestamp: Date;
  budgetId: string;
  agentId: string;
  threshold: number;
  action: ThresholdAction;
  details: Record<string, unknown>;
}> = [];

// ============================================================================
// Threshold Checking
// ============================================================================

/**
 * Check if any thresholds are crossed given the current percentage
 */
export function checkThresholds(
  percentageUsed: number,
  thresholds: ThresholdConfig[] = DEFAULT_THRESHOLDS
): ThresholdCheckResult {
  // Sort thresholds by percentage descending to find the highest crossed threshold
  const sortedThresholds = [...thresholds].sort((a, b) => b.threshold - a.threshold);

  for (const config of sortedThresholds) {
    if (percentageUsed >= config.threshold) {
      return {
        triggered: true,
        threshold: config.threshold,
        action: config.action,
        message: config.message || `Budget threshold ${config.threshold}% reached`,
        shouldBlock: config.action === 'block',
        shouldKill: config.action === 'kill',
      };
    }
  }

  return { triggered: false };
}

/**
 * Check thresholds with cooldown enforcement
 */
export function checkThresholdsWithCooldown(
  budgetId: string,
  percentageUsed: number,
  thresholds: ThresholdConfig[] = DEFAULT_THRESHOLDS
): ThresholdCheckResult {
  const state = getOrCreateThresholdState(budgetId);
  const result = checkThresholds(percentageUsed, thresholds);

  if (!result.triggered || !result.threshold) {
    return result;
  }

  // Check cooldown
  const config = thresholds.find((t) => t.threshold === result.threshold);
  const lastTriggered = state.lastTriggeredAt.get(result.threshold);

  if (lastTriggered && config?.coolDown) {
    const cooldownMs = config.coolDown * 1000;
    const elapsedMs = Date.now() - lastTriggered.getTime();

    if (elapsedMs < cooldownMs) {
      // Still in cooldown, suppress the action
      return { triggered: false };
    }
  }

  // Update last triggered time
  state.lastTriggeredAt.set(result.threshold, new Date());

  return result;
}

// ============================================================================
// Action Execution
// ============================================================================

/**
 * Execute the appropriate action for a threshold crossing
 */
export function executeThresholdAction(
  result: ThresholdCheckResult,
  tracking: BudgetTracking
): void {
  if (!result.triggered || !result.action) {
    return;
  }

  const { action, threshold, message } = result;
  const { id: budgetId, agentId } = tracking;

  logger.warn(`[BUDGET ${action.toUpperCase()}] ${message}`, {
    budgetId,
    agentId,
    threshold,
    percentageUsed: ((tracking.costUsed.total / tracking.budgetConfig.maxCost) * 100).toFixed(2),
  });

  switch (action) {
    case 'warn':
      executeWarn(tracking, threshold!, message);
      break;

    case 'notify':
      executeNotify(tracking, threshold!, message);
      break;

    case 'block':
      executeBlock(tracking, threshold!, message);
      break;

    case 'kill':
      executeKill(tracking, threshold!, message);
      break;

    case 'audit':
      executeAudit(tracking, threshold!, message);
      break;
  }
}

/**
 * Execute warn action - log warning and continue
 */
function executeWarn(tracking: BudgetTracking, threshold: number, message?: string): void {
  console.warn(`[COST WARNING] ${message || `Budget at ${threshold}%`}`);
  console.warn(`  Agent: ${tracking.agentId}`);
  console.warn(`  Used: $${tracking.costUsed.total.toFixed(4)} / $${tracking.budgetConfig.maxCost}`);
  console.warn(`  Tokens: ${tracking.tokensUsed.total.toLocaleString()}`);
}

/**
 * Execute notify action - log warning and send notifications
 */
function executeNotify(tracking: BudgetTracking, threshold: number, message?: string): void {
  // Log warning first
  executeWarn(tracking, threshold, message);

  // Send notifications
  const config = DEFAULT_THRESHOLDS.find((t) => t.threshold === threshold);
  if (config?.notify) {
    for (const channel of config.notify) {
      sendNotification(channel, tracking, threshold, message);
    }
  }
}

/**
 * Execute block action - pause agent and request approval
 */
function executeBlock(tracking: BudgetTracking, threshold: number, message?: string): void {
  // Log and notify
  executeNotify(tracking, threshold, message);

  // Block the agent
  const blockedAgent: BlockedAgent = {
    agentId: tracking.agentId,
    budgetId: tracking.id,
    blockedAt: new Date(),
    threshold,
    requestedBy: 'budget_system',
  };

  blockedAgents.set(tracking.agentId, blockedAgent);

  // Update state
  const state = getOrCreateThresholdState(tracking.id);
  state.blockedAt = new Date();

  console.error(`\n[BUDGET BLOCK] Agent ${tracking.agentId} has been blocked.`);
  console.error(`Budget usage: ${threshold}% ($${tracking.costUsed.total.toFixed(4)})`);
  console.error(`Approval required to continue.\n`);
}

/**
 * Execute kill action - immediately terminate agent
 */
function executeKill(tracking: BudgetTracking, threshold: number, message?: string): void {
  // Log and notify
  executeNotify(tracking, threshold, message);

  // Remove from active tracking (this signals the agent should terminate)
  blockedAgents.set(tracking.agentId, {
    agentId: tracking.agentId,
    budgetId: tracking.id,
    blockedAt: new Date(),
    threshold,
    requestedBy: 'budget_system',
  });

  console.error(`\n[BUDGET KILL] Agent ${tracking.agentId} has been terminated.`);
  console.error(`Budget exceeded: ${threshold}% ($${tracking.costUsed.total.toFixed(4)})`);
  console.error(`This is a critical budget overrun.\n`);
}

/**
 * Execute audit action - flag for compliance review
 */
function executeAudit(tracking: BudgetTracking, threshold: number, message?: string): void {
  // Log to audit
  auditLog.push({
    timestamp: new Date(),
    budgetId: tracking.id,
    agentId: tracking.agentId,
    threshold,
    action: 'audit',
    details: {
      costUsed: tracking.costUsed,
      tokensUsed: tracking.tokensUsed,
      maxCost: tracking.budgetConfig.maxCost,
      percentageUsed: (tracking.costUsed.total / tracking.budgetConfig.maxCost) * 100,
    },
  });

  // Also kill the agent at this extreme threshold
  executeKill(tracking, threshold, message || 'Budget exceeded 110% - compliance review required');

  console.error(`\n[BUDGET AUDIT] Agent ${tracking.agentId} flagged for compliance review.`);
  console.error(`Severe budget overrun: ${threshold}%`);
  console.error(`This incident has been logged for security review.\n`);
}

// ============================================================================
// Notification Helpers
// ============================================================================

/**
 * Send notification to a channel
 */
function sendNotification(
  channel: string,
  tracking: BudgetTracking,
  threshold: number,
  message?: string
): void {
  const payload = {
    type: 'budget_alert',
    severity: threshold >= 100 ? 'critical' : threshold >= 90 ? 'high' : 'warning',
    agentId: tracking.agentId,
    budgetId: tracking.id,
    threshold,
    costUsed: tracking.costUsed.total,
    maxCost: tracking.budgetConfig.maxCost,
    tokensUsed: tracking.tokensUsed.total,
    message: message || `Budget threshold ${threshold}% reached`,
    timestamp: new Date().toISOString(),
  };

  if (channel.startsWith('webhook:')) {
    const webhookId = channel.replace('webhook:', '');
    logger.info(`Sending webhook notification to ${webhookId}`, payload);
    // In real implementation, this would send an HTTP request
  } else if (channel.startsWith('email:')) {
    const emailRecipient = channel.replace('email:', '');
    logger.info(`Sending email notification to ${emailRecipient}`, payload);
    // In real implementation, this would send an email
  } else if (channel.startsWith('sms:')) {
    const phoneNumber = channel.replace('sms:', '');
    logger.info(`Sending SMS notification to ${phoneNumber}`, payload);
    // In real implementation, this would send an SMS
  } else {
    logger.info(`Sending notification to ${channel}`, payload);
  }
}

// ============================================================================
// Block/Approval Management
// ============================================================================

/**
 * Check if an agent is blocked
 */
export function isAgentBlocked(agentId: string): boolean {
  const blocked = blockedAgents.get(agentId);
  if (!blocked) return false;

  // Check if approval has expired
  if (blocked.approved && blocked.approvedAt) {
    const state = thresholdStates.get(blocked.budgetId);
    if (state?.approvalExpiresAt && new Date() > state.approvalExpiresAt) {
      // Approval expired, re-block
      blocked.approved = false;
      return true;
    }
  }

  return !blocked.approved;
}

/**
 * Request approval to continue for a blocked agent
 */
export function requestApproval(agentId: string, requestedBy: string): BlockedAgent | null {
  const blocked = blockedAgents.get(agentId);
  if (!blocked) return null;

  blocked.requestedBy = requestedBy;
  return blocked;
}

/**
 * Approve a blocked agent to continue
 */
export function approveBlockedAgent(
  agentId: string,
  approvedBy: string,
  durationMinutes = 30
): BlockedAgent | null {
  const blocked = blockedAgents.get(agentId);
  if (!blocked) return null;

  blocked.approved = true;
  blocked.approvedBy = approvedBy;
  blocked.approvedAt = new Date();

  // Set expiration
  const state = thresholdStates.get(blocked.budgetId);
  if (state) {
    const expiration = new Date();
    expiration.setMinutes(expiration.getMinutes() + durationMinutes);
    state.approvalExpiresAt = expiration;
    state.approvedToContinue = true;
  }

  logger.info(`Agent ${agentId} approved to continue by ${approvedBy}`, {
    durationMinutes,
    expiresAt: state?.approvalExpiresAt,
  });

  return blocked;
}

/**
 * Get blocked agent info
 */
export function getBlockedAgent(agentId: string): BlockedAgent | undefined {
  return blockedAgents.get(agentId);
}

/**
 * Get all blocked agents
 */
export function getAllBlockedAgents(): BlockedAgent[] {
  return Array.from(blockedAgents.values()).filter((b) => !b.approved);
}

/**
 * Unblock an agent (manual override)
 */
export function unblockAgent(agentId: string): boolean {
  const blocked = blockedAgents.get(agentId);
  if (!blocked) return false;

  blockedAgents.delete(agentId);
  return true;
}

// ============================================================================
// Threshold State Management
// ============================================================================

function getOrCreateThresholdState(budgetId: string): ThresholdState {
  let state = thresholdStates.get(budgetId);
  if (!state) {
    state = {
      lastTriggeredAt: new Map(),
    };
    thresholdStates.set(budgetId, state);
  }
  return state;
}

/**
 * Reset threshold state for a budget
 */
export function resetThresholdState(budgetId: string): void {
  thresholdStates.delete(budgetId);
}

// ============================================================================
// Audit Log
// ============================================================================

/**
 * Get audit log entries
 */
export function getAuditLog(
  budgetId?: string,
  since?: Date
): Array<{
  timestamp: Date;
  budgetId: string;
  agentId: string;
  threshold: number;
  action: ThresholdAction;
  details: Record<string, unknown>;
}> {
  let logs = [...auditLog];

  if (budgetId) {
    logs = logs.filter((l) => l.budgetId === budgetId);
  }

  if (since) {
    logs = logs.filter((l) => l.timestamp >= since);
  }

  return logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

/**
 * Clear audit log (for testing)
 */
export function clearAuditLog(): void {
  auditLog.length = 0;
}

// ============================================================================
// Exports
// ============================================================================

export { thresholdStates, blockedAgents, auditLog };
