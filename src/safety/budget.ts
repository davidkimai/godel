/**
 * Budget Tracking Module
 *
 * Provides budget tracking per task, agent, swarm, and project.
 * Tracks token usage and cost calculation with threshold monitoring.
 */

import { logger } from '../utils';
import { calculateCost, getCostPerThousandTokens, MODEL_PRICING } from './cost';
import { checkThresholds, executeThresholdAction, ThresholdConfig, ThresholdCheckResult } from './thresholds';

// ============================================================================
// Types & Interfaces
// ============================================================================

export type BudgetType = 'task' | 'agent' | 'swarm' | 'project';
export type BudgetPeriod = 'daily' | 'weekly' | 'monthly';

export interface TokenCount {
  prompt: number;
  completion: number;
  total: number;
}

export interface CostBreakdown {
  prompt: number;
  completion: number;
  total: number;
}

export interface BudgetConfig {
  type: BudgetType;
  scope: string; // taskId, agentId, swarmId, or projectId
  maxTokens: number;
  maxCost: number;
  period?: BudgetPeriod;
  resetHour?: number; // UTC hour for daily reset (0-23)
  resetDay?: number; // 0-6 for weekly (Sunday=0), 1-28 for monthly
}

export interface BudgetUsage {
  tokensUsed: TokenCount;
  costUsed: CostBreakdown;
  percentageUsed: number; // 0-100+
}

export interface BudgetTracking {
  id: string;
  agentId: string;
  taskId: string;
  swarmId?: string;
  projectId: string;
  model: string;

  tokensUsed: TokenCount;
  costUsed: CostBreakdown;

  startedAt: Date;
  lastUpdated: Date;
  completedAt?: Date;

  budgetConfig: BudgetConfig;
  thresholdHistory: ThresholdEvent[];
}

export interface ThresholdEvent {
  timestamp: Date;
  threshold: number;
  action: string;
  message: string;
}

export interface BudgetAlert {
  id: string;
  budgetId: string;
  threshold: number;
  webhookUrl?: string;
  email?: string;
  sms?: string;
  createdAt: Date;
}

export interface BudgetHistoryEntry {
  id: string;
  budgetId: string;
  timestamp: Date;
  eventType: 'budget_set' | 'budget_exceeded' | 'budget_killed' | 'budget_warning' | 'budget_alert';
  details: Record<string, unknown>;
}

export interface BudgetReport {
  projectId: string;
  period: string;
  startDate: Date;
  endDate: Date;
  totalBudget: number;
  totalUsed: number;
  totalRemaining: number;
  percentageUsed: number;
  agentBreakdown: AgentBudgetReport[];
  dailyUsage: DailyUsage[];
}

export interface AgentBudgetReport {
  agentId: string;
  tokensUsed: number;
  costUsed: number;
  percentageOfTotal: number;
  status: 'running' | 'completed' | 'killed';
}

export interface DailyUsage {
  date: string;
  tokens: number;
  cost: number;
}

// ============================================================================
// In-Memory Storage
// ============================================================================

// Budget configurations by scope
const budgetConfigs = new Map<string, BudgetConfig>();

// Active budget tracking instances
const activeBudgets = new Map<string, BudgetTracking>();

// Budget history for audit
const budgetHistory: BudgetHistoryEntry[] = [];

// Configured alerts
const budgetAlerts = new Map<string, BudgetAlert[]>();

// Default thresholds
const DEFAULT_THRESHOLDS: ThresholdConfig[] = [
  { threshold: 50, action: 'warn' },
  { threshold: 75, action: 'warn', notify: ['webhook:alerts'] },
  { threshold: 90, action: 'block', notify: ['webhook:alerts', 'email:admin'] },
  { threshold: 100, action: 'kill', notify: ['webhook:critical', 'email:admin'] },
  { threshold: 110, action: 'audit' },
];

// ============================================================================
// Budget Configuration
// ============================================================================

/**
 * Set a budget configuration for a specific scope
 */
export function setBudgetConfig(config: BudgetConfig): BudgetConfig {
  const key = `${config.type}:${config.scope}`;
  budgetConfigs.set(key, config);

  // Log to history
  budgetHistory.push({
    id: generateId(),
    budgetId: key,
    timestamp: new Date(),
    eventType: 'budget_set',
    details: { config },
  });

  logger.info(`Budget configured: ${key}`, { config });
  return config;
}

/**
 * Get budget configuration for a scope
 */
export function getBudgetConfig(type: BudgetType, scope: string): BudgetConfig | undefined {
  const key = `${type}:${scope}`;
  return budgetConfigs.get(key);
}

/**
 * Set project-level daily budget
 */
export function setProjectDailyBudget(
  projectId: string,
  maxTokens: number,
  maxCost: number,
  resetHour = 0
): BudgetConfig {
  return setBudgetConfig({
    type: 'project',
    scope: projectId,
    maxTokens,
    maxCost,
    period: 'daily',
    resetHour,
  });
}

/**
 * Set task-level budget
 */
export function setTaskBudget(
  taskId: string,
  maxTokens: number,
  maxCost: number
): BudgetConfig {
  return setBudgetConfig({
    type: 'task',
    scope: taskId,
    maxTokens,
    maxCost,
  });
}

/**
 * Set agent-level budget
 */
export function setAgentBudget(
  agentId: string,
  maxTokens: number,
  maxCost: number
): BudgetConfig {
  return setBudgetConfig({
    type: 'agent',
    scope: agentId,
    maxTokens,
    maxCost,
  });
}

// ============================================================================
// Budget Tracking
// ============================================================================

/**
 * Start tracking budget for an agent/task
 */
export function startBudgetTracking(
  agentId: string,
  taskId: string,
  projectId: string,
  model: string,
  swarmId?: string
): BudgetTracking {
  // Find the most specific budget config
  const config =
    getBudgetConfig('task', taskId) ||
    getBudgetConfig('agent', agentId) ||
    (swarmId && getBudgetConfig('swarm', swarmId)) ||
    getBudgetConfig('project', projectId) ||
    getDefaultBudgetConfig();

  const tracking: BudgetTracking = {
    id: generateId(),
    agentId,
    taskId,
    swarmId,
    projectId,
    model,
    tokensUsed: { prompt: 0, completion: 0, total: 0 },
    costUsed: { prompt: 0, completion: 0, total: 0 },
    startedAt: new Date(),
    lastUpdated: new Date(),
    budgetConfig: config,
    thresholdHistory: [],
  };

  activeBudgets.set(tracking.id, tracking);
  logger.info(`Budget tracking started: ${tracking.id}`, { agentId, taskId, projectId });

  return tracking;
}

/**
 * Record token usage and update budget tracking
 */
export function recordTokenUsage(
  budgetId: string,
  promptTokens: number,
  completionTokens: number,
  model?: string
): ThresholdCheckResult | null {
  const tracking = activeBudgets.get(budgetId);
  if (!tracking) {
    logger.warn(`Budget tracking not found: ${budgetId}`);
    return null;
  }

  // Update token counts
  tracking.tokensUsed.prompt += promptTokens;
  tracking.tokensUsed.completion += completionTokens;
  tracking.tokensUsed.total += promptTokens + completionTokens;

  // Calculate costs
  const useModel = model || tracking.model;
  tracking.costUsed = calculateCost(tracking.tokensUsed, useModel);

  tracking.lastUpdated = new Date();

  // Check thresholds
  const usage = getBudgetUsage(tracking);
  const thresholdResult = checkThresholds(usage.percentageUsed, DEFAULT_THRESHOLDS);

  if (thresholdResult.triggered && thresholdResult.action) {
    // Record threshold event
    const event: ThresholdEvent = {
      timestamp: new Date(),
      threshold: thresholdResult.threshold!,
      action: thresholdResult.action,
      message: thresholdResult.message || `Threshold ${thresholdResult.threshold}% reached`,
    };
    tracking.thresholdHistory.push(event);

    // Log to history
    budgetHistory.push({
      id: generateId(),
      budgetId,
      timestamp: new Date(),
      eventType: thresholdResult.action === 'kill' ? 'budget_killed' : 'budget_warning',
      details: {
        threshold: thresholdResult.threshold,
        action: thresholdResult.action,
        tokensUsed: tracking.tokensUsed.total,
        costUsed: tracking.costUsed.total,
      },
    });

    // Execute the action
    executeThresholdAction(thresholdResult, tracking);
  }

  return thresholdResult;
}

/**
 * Get current budget usage for a tracking instance
 */
export function getBudgetUsage(tracking: BudgetTracking): BudgetUsage {
  const percentageUsed = (tracking.costUsed.total / tracking.budgetConfig.maxCost) * 100;

  return {
    tokensUsed: tracking.tokensUsed,
    costUsed: tracking.costUsed,
    percentageUsed: Math.round(percentageUsed * 100) / 100,
  };
}

/**
 * Get budget tracking by ID
 */
export function getBudgetTracking(budgetId: string): BudgetTracking | undefined {
  return activeBudgets.get(budgetId);
}

/**
 * Complete budget tracking
 */
export function completeBudgetTracking(budgetId: string): BudgetTracking | null {
  const tracking = activeBudgets.get(budgetId);
  if (!tracking) {
    return null;
  }

  tracking.completedAt = new Date();
  logger.info(`Budget tracking completed: ${budgetId}`, {
    tokensUsed: tracking.tokensUsed.total,
    costUsed: tracking.costUsed.total,
  });

  return tracking;
}

/**
 * Kill a budget tracking instance (emergency stop)
 */
export function killBudgetTracking(budgetId: string, reason: string): BudgetTracking | null {
  const tracking = activeBudgets.get(budgetId);
  if (!tracking) {
    return null;
  }

  tracking.completedAt = new Date();

  // Log to history
  budgetHistory.push({
    id: generateId(),
    budgetId,
    timestamp: new Date(),
    eventType: 'budget_killed',
    details: { reason, tokensUsed: tracking.tokensUsed.total, costUsed: tracking.costUsed.total },
  });

  logger.warn(`Budget tracking killed: ${budgetId}`, { reason });
  return tracking;
}

// ============================================================================
// Budget Status & Reporting
// ============================================================================

/**
 * Get budget status for an agent
 */
export function getAgentBudgetStatus(agentId: string): BudgetTracking[] {
  return Array.from(activeBudgets.values()).filter(
    (tracking) => tracking.agentId === agentId
  );
}

/**
 * Get budget status for a project
 */
export function getProjectBudgetStatus(projectId: string): {
  budgets: BudgetTracking[];
  totalUsed: CostBreakdown;
  config?: BudgetConfig;
} {
  const budgets = Array.from(activeBudgets.values()).filter(
    (tracking) => tracking.projectId === projectId
  );

  const totalUsed = budgets.reduce(
    (acc, tracking) => ({
      prompt: acc.prompt + tracking.costUsed.prompt,
      completion: acc.completion + tracking.costUsed.completion,
      total: acc.total + tracking.costUsed.total,
    }),
    { prompt: 0, completion: 0, total: 0 }
  );

  const config = getBudgetConfig('project', projectId);

  return { budgets, totalUsed, config };
}

/**
 * Generate budget report for a project
 */
export function generateBudgetReport(
  projectId: string,
  period: 'week' | 'month' = 'month'
): BudgetReport {
  const { budgets, totalUsed, config } = getProjectBudgetStatus(projectId);

  // Calculate date range
  const endDate = new Date();
  const startDate = new Date();
  if (period === 'week') {
    startDate.setDate(startDate.getDate() - 7);
  } else {
    startDate.setMonth(startDate.getMonth() - 1);
  }

  // Filter budgets within period
  const periodBudgets = budgets.filter(
    (b) => b.startedAt >= startDate && b.startedAt <= endDate
  );

  // Calculate agent breakdown
  const agentMap = new Map<string, AgentBudgetReport>();
  for (const budget of periodBudgets) {
    const existing = agentMap.get(budget.agentId);
    if (existing) {
      existing.tokensUsed += budget.tokensUsed.total;
      existing.costUsed += budget.costUsed.total;
    } else {
      agentMap.set(budget.agentId, {
        agentId: budget.agentId,
        tokensUsed: budget.tokensUsed.total,
        costUsed: budget.costUsed.total,
        percentageOfTotal: 0,
        status: budget.completedAt ? 'completed' : 'running',
      });
    }
  }

  const agentBreakdown = Array.from(agentMap.values());
  const totalCost = agentBreakdown.reduce((sum, a) => sum + a.costUsed, 0);
  for (const agent of agentBreakdown) {
    agent.percentageOfTotal = totalCost > 0 ? (agent.costUsed / totalCost) * 100 : 0;
  }

  // Calculate daily usage
  const dailyMap = new Map<string, DailyUsage>();
  for (const budget of periodBudgets) {
    const date = budget.startedAt.toISOString().split('T')[0];
    const existing = dailyMap.get(date);
    if (existing) {
      existing.tokens += budget.tokensUsed.total;
      existing.cost += budget.costUsed.total;
    } else {
      dailyMap.set(date, { date, tokens: budget.tokensUsed.total, cost: budget.costUsed.total });
    }
  }
  const dailyUsage = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const totalBudget = config?.maxCost || 0;

  return {
    projectId,
    period,
    startDate,
    endDate,
    totalBudget,
    totalUsed: totalUsed.total,
    totalRemaining: Math.max(0, totalBudget - totalUsed.total),
    percentageUsed: totalBudget > 0 ? (totalUsed.total / totalBudget) * 100 : 0,
    agentBreakdown,
    dailyUsage,
  };
}

// ============================================================================
// Budget Alerts
// ============================================================================

/**
 * Add a budget alert
 */
export function addBudgetAlert(
  projectId: string,
  threshold: number,
  options: { webhookUrl?: string; email?: string; sms?: string }
): BudgetAlert {
  const alert: BudgetAlert = {
    id: generateId(),
    budgetId: projectId,
    threshold,
    ...options,
    createdAt: new Date(),
  };

  const existing = budgetAlerts.get(projectId) || [];
  existing.push(alert);
  budgetAlerts.set(projectId, existing);

  logger.info(`Budget alert added for ${projectId} at ${threshold}%`);
  return alert;
}

/**
 * Get budget alerts for a project
 */
export function getBudgetAlerts(projectId: string): BudgetAlert[] {
  return budgetAlerts.get(projectId) || [];
}

/**
 * Remove a budget alert
 */
export function removeBudgetAlert(projectId: string, alertId: string): boolean {
  const alerts = budgetAlerts.get(projectId);
  if (!alerts) return false;

  const filtered = alerts.filter((a) => a.id !== alertId);
  if (filtered.length === alerts.length) return false;

  budgetAlerts.set(projectId, filtered);
  return true;
}

// ============================================================================
// Budget History
// ============================================================================

/**
 * Get budget history
 */
export function getBudgetHistory(
  projectId?: string,
  since?: Date
): BudgetHistoryEntry[] {
  let history = budgetHistory;

  if (projectId) {
    history = history.filter((h) => h.budgetId.includes(projectId));
  }

  if (since) {
    history = history.filter((h) => h.timestamp >= since);
  }

  return history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

// ============================================================================
// Helpers
// ============================================================================

function getDefaultBudgetConfig(): BudgetConfig {
  return {
    type: 'project',
    scope: 'default',
    maxTokens: 10_000_000,
    maxCost: 1000,
  };
}

function generateId(): string {
  return `budget_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================================================
// Exports
// ============================================================================

export {
  DEFAULT_THRESHOLDS,
  budgetConfigs,
  activeBudgets,
  budgetHistory,
  budgetAlerts,
};
