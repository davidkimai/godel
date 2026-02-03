/**
 * Budget Tracking Module
 *
 * Provides budget tracking per task, agent, swarm, and project.
 * Tracks token usage and cost calculation with threshold monitoring.
 * Budget configurations are persisted to disk for cross-session survival.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { logger } from '../utils';
import { calculateCost, getCostPerThousandTokens, MODEL_PRICING } from './cost';
import { checkThresholds, executeThresholdAction, ThresholdConfig, ThresholdCheckResult } from './thresholds';

// ============================================================================
// Persistence Configuration
// ============================================================================

// Budget storage location (in user's home directory for persistence)
const BUDGETS_DIR = path.join(os.homedir(), '.config', 'dash');
const BUDGETS_FILE = path.join(BUDGETS_DIR, 'budgets.json');

// Persisted data structure
interface PersistedBudgets {
  configs: Record<string, BudgetConfig>;  // key -> BudgetConfig
  alerts: Record<string, BudgetAlert[]>;  // projectId -> BudgetAlert[]
  version: string;
  updatedAt: string;
}

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
// In-Memory Storage (initialized from file)
// ============================================================================

// Budget configurations by scope - loaded from disk
let budgetConfigs = new Map<string, BudgetConfig>();

// Active budget tracking instances (runtime only - not persisted)
const activeBudgets = new Map<string, BudgetTracking>();

// Budget history for audit (runtime only - not persisted)
const budgetHistory: BudgetHistoryEntry[] = [];

// Configured alerts - loaded from disk
let budgetAlerts = new Map<string, BudgetAlert[]>();

// Default thresholds
const DEFAULT_THRESHOLDS: ThresholdConfig[] = [
  { threshold: 50, action: 'warn' },
  { threshold: 75, action: 'warn', notify: ['webhook:alerts'] },
  { threshold: 90, action: 'block', notify: ['webhook:alerts', 'email:admin'] },
  { threshold: 100, action: 'kill', notify: ['webhook:critical', 'email:admin'] },
  { threshold: 110, action: 'audit' },
];

// ============================================================================
// Persistence Functions
// ============================================================================

/**
 * Ensure the budgets directory exists
 */
function ensureBudgetsDir(): void {
  if (!fs.existsSync(BUDGETS_DIR)) {
    fs.mkdirSync(BUDGETS_DIR, { recursive: true });
  }
}

/**
 * Load persisted budgets from disk
 */
function loadPersistedBudgets(): void {
  try {
    ensureBudgetsDir();
    if (fs.existsSync(BUDGETS_FILE)) {
      const data = fs.readFileSync(BUDGETS_FILE, 'utf-8');
      const persisted = JSON.parse(data) as PersistedBudgets;
      
      // Restore configs
      budgetConfigs = new Map(Object.entries(persisted.configs || {}));
      
      // Restore alerts
      budgetAlerts = new Map(Object.entries(persisted.alerts || {}));
      
      logger.debug(`Loaded ${budgetConfigs.size} budget configs and ${budgetAlerts.size} alert sets from disk`);
    }
  } catch (error) {
    console.error('Warning: Failed to load persisted budgets:', error);
    // Start with empty maps
    budgetConfigs = new Map();
    budgetAlerts = new Map();
  }
}

/**
 * Save budgets to disk for persistence
 */
function savePersistedBudgets(): void {
  try {
    ensureBudgetsDir();
    const persisted: PersistedBudgets = {
      configs: Object.fromEntries(budgetConfigs),
      alerts: Object.fromEntries(budgetAlerts),
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
    };
    fs.writeFileSync(BUDGETS_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
    logger.debug(`Saved ${budgetConfigs.size} budget configs to disk`);
  } catch (error) {
    console.error('Warning: Failed to save budgets to disk:', error);
  }
}

/**
 * Get the path to the budgets file (for debugging)
 */
export function getBudgetsFilePath(): string {
  return BUDGETS_FILE;
}

// Load persisted budgets on module initialization
loadPersistedBudgets();

// ============================================================================
// Budget Configuration
// ============================================================================

/**
 * Set a budget configuration for a specific scope
 */
export function setBudgetConfig(config: BudgetConfig): BudgetConfig;
export function setBudgetConfig(type: BudgetType, scope: string, config: Partial<BudgetConfig>): BudgetConfig;
export function setBudgetConfig(
  typeOrConfig: BudgetType | BudgetConfig,
  scopeOrConfig?: string | Partial<BudgetConfig>,
  config?: Partial<BudgetConfig>
): BudgetConfig {
  if (typeof typeOrConfig === 'object') {
    // Single argument form: setBudgetConfig(config)
    const fullConfig: BudgetConfig = {
      type: 'project',
      scope: 'default',
      maxTokens: 10_000_000,
      maxCost: 1000,
      ...typeOrConfig,
    };
    return setBudgetConfig(fullConfig);
  }

  // Three argument form: setBudgetConfig(type, scope, config)
  const type = typeOrConfig;
  const scope = scopeOrConfig as string;
  const partialConfig = config || {};

  const fullConfig: BudgetConfig = {
    type,
    scope,
    maxTokens: 10_000_000,
    maxCost: 1000,
    ...partialConfig,
  };

  return setBudgetConfig(fullConfig);
}

/**
 * Get budget configuration for a scope
 */
export function getBudgetConfig(type: BudgetType, scope: string): BudgetConfig | undefined {
  const key = `${type}:${scope}`;
  return budgetConfigs.get(key);
}

/**
 * List all budget configurations
 */
export function listBudgetConfigs(): BudgetConfig[] {
  return Array.from(budgetConfigs.values());
}

/**
 * List budget configurations by type
 */
export function listBudgetConfigsByType(type: BudgetType): BudgetConfig[] {
  return Array.from(budgetConfigs.values()).filter(config => config.type === type);
}

/**
 * Clear all budget configurations (for testing/reset)
 */
export function clearAllBudgetConfigs(): void {
  budgetConfigs.clear();
  savePersistedBudgets();
  logger.info('All budget configurations cleared');
}

/**
 * Delete a specific budget configuration
 */
export function deleteBudgetConfig(type: BudgetType, scope: string): boolean {
  const key = `${type}:${scope}`;
  const existed = budgetConfigs.has(key);
  if (existed) {
    budgetConfigs.delete(key);
    savePersistedBudgets();
    logger.info(`Budget configuration deleted: ${key}`);
  }
  return existed;
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
): BudgetTracking;
export function startBudgetTracking(params: {
  agentId: string;
  taskId: string;
  projectId: string;
  model: string;
  budgetConfig?: Partial<BudgetConfig>;
  swarmId?: string;
}): BudgetTracking;
export function startBudgetTracking(
  agentIdOrParams: string | { agentId: string; taskId: string; projectId: string; model: string; budgetConfig?: Partial<BudgetConfig>; swarmId?: string },
  taskIdArg?: string,
  projectIdArg?: string,
  modelArg?: string,
  swarmIdArg?: string
): BudgetTracking {
  let params: { agentId: string; taskId: string; projectId: string; model: string; budgetConfig?: Partial<BudgetConfig>; swarmId?: string };

  if (typeof agentIdOrParams === 'object') {
    params = agentIdOrParams;
  } else {
    params = {
      agentId: agentIdOrParams,
      taskId: taskIdArg || '',
      projectId: projectIdArg || '',
      model: modelArg || 'unknown',
      swarmId: swarmIdArg,
    };
  }

  const { agentId, taskId, projectId, model, swarmId, budgetConfig } = params;

  // Find the most specific budget config
  let config = 
    getBudgetConfig('task', taskId) ||
    getBudgetConfig('agent', agentId) ||
    (swarmId && getBudgetConfig('swarm', swarmId)) ||
    getBudgetConfig('project', projectId) ||
    getDefaultBudgetConfig();

  // Apply any partial config overrides
  if (budgetConfig) {
    config = { ...config, ...budgetConfig };
  }

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
export function getBudgetUsage(trackingOrId: BudgetTracking | string): BudgetUsage {
  const tracking = typeof trackingOrId === 'string' 
    ? activeBudgets.get(trackingOrId) 
    : trackingOrId;
    
  if (!tracking) {
    return {
      tokensUsed: { prompt: 0, completion: 0, total: 0 },
      costUsed: { prompt: 0, completion: 0, total: 0 },
      percentageUsed: 0,
    };
  }

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

  // Persist to disk
  savePersistedBudgets();

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

  // Persist to disk
  savePersistedBudgets();

  return true;
}

/**
 * Clear all budget alerts (for testing/reset)
 */
export function clearAllBudgetAlerts(): void {
  budgetAlerts.clear();
  savePersistedBudgets();
  logger.info('All budget alerts cleared');
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
// Test Compatibility Wrappers
// ============================================================================

/**
 * Track token usage and update budget tracking (test compatibility)
 */
export function trackTokenUsage(
  budgetId: string,
  promptTokensOrTokenCount: number | { prompt: number; completion: number; total: number },
  completionTokens?: number
): BudgetTracking | null {
  const tracking = activeBudgets.get(budgetId);
  if (!tracking) return null;

  let prompt: number;
  let completion: number;
  let total: number;

  if (typeof promptTokensOrTokenCount === 'object') {
    prompt = promptTokensOrTokenCount.prompt;
    completion = promptTokensOrTokenCount.completion;
    total = promptTokensOrTokenCount.total;
  } else {
    prompt = promptTokensOrTokenCount;
    completion = completionTokens || 0;
    total = prompt + completion;
  }

  return recordTokenUsage(budgetId, prompt, completion);
}

/**
 * Check if budget has been exceeded (test compatibility)
 */
export function checkBudgetExceeded(budgetId: string): {
  exceeded: boolean;
  percentageUsed: number;
  budgetConfig: BudgetConfig | undefined;
} {
  const tracking = activeBudgets.get(budgetId);
  const config = tracking?.budgetConfig;

  if (!tracking) {
    return { exceeded: false, percentageUsed: 0, budgetConfig: config };
  }

  const usage = getBudgetUsage(tracking);
  const exceeded = tracking.costUsed.total >= tracking.budgetConfig.maxCost;

  return {
    exceeded,
    percentageUsed: usage.percentageUsed,
    budgetConfig: config,
  };
}

/**
 * Set a budget alert (test compatibility - wraps addBudgetAlert)
 */
export function setBudgetAlert(
  projectId: string,
  thresholdOrConfig: number | { threshold: number; message?: string },
  message?: string
): BudgetAlert {
  let threshold: number;
  let alertMessage: string;

  if (typeof thresholdOrConfig === 'number') {
    threshold = thresholdOrConfig;
    alertMessage = message || `Budget alert: ${threshold}% threshold reached`;
  } else {
    threshold = thresholdOrConfig.threshold;
    alertMessage = thresholdOrConfig.message || `Budget alert: ${threshold}% threshold reached`;
  }

  return addBudgetAlert(projectId, threshold, {});
}

/**
 * Calculate cost for token usage (test compatibility)
 */
export function calculateCostForUsage(
  promptTokensOrModel: number | string,
  completionTokensOrTokenCount?: number | { prompt: number; completion: number; total: number },
  model?: string
): CostBreakdown {
  // Handle test signature: (model, {prompt, completion, total})
  if (typeof promptTokensOrModel === 'string') {
    const tokenCount = completionTokensOrTokenCount as { prompt: number; completion: number; total: number };
    return calculateCost(
      tokenCount || { prompt: 0, completion: 0, total: 0 },
      promptTokensOrModel
    );
  }

  // Handle normal signature: (promptTokens, completionTokens, model?)
  const promptTokens = promptTokensOrModel;
  const completionTokens = completionTokensOrTokenCount as number;
  const useModel = model || 'default';
  return calculateCost(
    { prompt: promptTokens, completion: completionTokens, total: promptTokens + completionTokens },
    useModel
  );
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
