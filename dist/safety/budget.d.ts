/**
 * Budget Tracking Module
 *
 * Provides budget tracking per task, agent, swarm, and project.
 * Tracks token usage and cost calculation with threshold monitoring.
 * Budget configurations are persisted to disk for cross-session survival.
 */
import { ThresholdConfig, ThresholdCheckResult } from './thresholds';
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
    scope: string;
    maxTokens: number;
    maxCost: number;
    period?: BudgetPeriod;
    resetHour?: number;
    resetDay?: number;
}
export interface BudgetUsage {
    tokensUsed: TokenCount;
    costUsed: CostBreakdown;
    percentageUsed: number;
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
declare let budgetConfigs: Map<string, BudgetConfig>;
declare const activeBudgets: Map<string, BudgetTracking>;
declare const budgetHistory: BudgetHistoryEntry[];
declare let budgetAlerts: Map<string, BudgetAlert[]>;
declare const DEFAULT_THRESHOLDS: ThresholdConfig[];
/**
 * Get the path to the budgets file (for debugging)
 */
export declare function getBudgetsFilePath(): string;
/**
 * Set a budget configuration for a specific scope
 */
export declare function setBudgetConfig(config: BudgetConfig): BudgetConfig;
export declare function setBudgetConfig(scope: string, config: BudgetConfig): BudgetConfig;
export declare function setBudgetConfig(type: BudgetType, scope: string, config: Partial<BudgetConfig>): BudgetConfig;
/**
 * Get budget configuration for a scope
 */
export declare function getBudgetConfig(type: BudgetType, scope: string): BudgetConfig | undefined;
export declare function getBudgetConfig(scope: string): BudgetConfig | undefined;
/**
 * List all budget configurations
 */
export declare function listBudgetConfigs(): BudgetConfig[];
/**
 * List budget configurations by type
 */
export declare function listBudgetConfigsByType(type: BudgetType): BudgetConfig[];
/**
 * Clear all budget configurations (for testing/reset)
 */
export declare function clearAllBudgetConfigs(): void;
/**
 * Delete a specific budget configuration
 */
export declare function deleteBudgetConfig(type: BudgetType, scope: string): boolean;
/**
 * Set project-level daily budget
 */
export declare function setProjectDailyBudget(projectId: string, maxTokens: number, maxCost: number, resetHour?: number): BudgetConfig;
/**
 * Set task-level budget
 */
export declare function setTaskBudget(taskId: string, maxTokens: number, maxCost: number): BudgetConfig;
/**
 * Set agent-level budget
 */
export declare function setAgentBudget(agentId: string, maxTokens: number, maxCost: number): BudgetConfig;
/**
 * Start tracking budget for an agent/task
 */
export declare function startBudgetTracking(agentId: string, taskId: string, projectId: string, model: string, swarmId?: string): BudgetTracking;
export declare function startBudgetTracking(params: {
    agentId: string;
    taskId: string;
    projectId: string;
    model: string;
    budgetConfig?: Partial<BudgetConfig>;
    swarmId?: string;
}): BudgetTracking;
/**
 * Record token usage and update budget tracking
 */
export declare function recordTokenUsage(budgetId: string, promptTokens: number, completionTokens: number, model?: string): ThresholdCheckResult | null;
/**
 * Get current budget usage for a tracking instance
 */
export declare function getBudgetUsage(trackingOrId: BudgetTracking | string): BudgetUsage;
/**
 * Get budget tracking by ID
 */
export declare function getBudgetTracking(budgetId: string): BudgetTracking | undefined;
/**
 * Complete budget tracking
 */
export declare function completeBudgetTracking(budgetId: string): BudgetTracking | null;
/**
 * Kill a budget tracking instance (emergency stop)
 */
export declare function killBudgetTracking(budgetId: string, reason: string): BudgetTracking | null;
/**
 * Get budget status for an agent
 */
export declare function getAgentBudgetStatus(agentId: string): BudgetTracking[];
/**
 * Get budget status for a project
 */
export declare function getProjectBudgetStatus(projectId: string): {
    budgets: BudgetTracking[];
    totalUsed: CostBreakdown;
    config?: BudgetConfig;
};
/**
 * Generate budget report for a project
 */
export declare function generateBudgetReport(projectId: string, period?: 'week' | 'month'): BudgetReport;
/**
 * Add a budget alert
 */
export declare function addBudgetAlert(projectId: string, threshold: number, options: {
    webhookUrl?: string;
    email?: string;
    sms?: string;
}): BudgetAlert;
/**
 * Get budget alerts for a project
 */
export declare function getBudgetAlerts(projectId: string): BudgetAlert[];
/**
 * Remove a budget alert
 */
export declare function removeBudgetAlert(projectId: string, alertId: string): boolean;
/**
 * Clear all budget alerts (for testing/reset)
 */
export declare function clearAllBudgetAlerts(): void;
/**
 * Get budget history
 */
export declare function getBudgetHistory(projectId?: string, since?: Date): BudgetHistoryEntry[];
/**
 * Track token usage and update budget tracking (test compatibility)
 */
export declare function trackTokenUsage(budgetId: string, promptTokensOrTokenCount: number | {
    prompt: number;
    completion: number;
    total: number;
}, completionTokens?: number): ThresholdCheckResult | null;
/**
 * Check if budget has been exceeded (test compatibility)
 */
export declare function checkBudgetExceeded(budgetId: string): {
    exceeded: boolean;
    percentageUsed: number;
    budgetConfig: BudgetConfig | undefined;
};
/**
 * Set a budget alert (test compatibility - wraps addBudgetAlert)
 */
export declare function setBudgetAlert(projectId: string, thresholdOrConfig: number | {
    threshold: number;
    message?: string;
    webhookUrl?: string;
    email?: string;
    sms?: string;
}, message?: string): BudgetAlert;
/**
 * Calculate cost for token usage (test compatibility)
 */
export declare function calculateCostForUsage(promptTokensOrModel: number | string, completionTokensOrTokenCount?: number | {
    prompt: number;
    completion: number;
    total: number;
}, model?: string): {
    prompt: number;
    completion: number;
    total: number;
};
export { DEFAULT_THRESHOLDS, budgetConfigs, activeBudgets, budgetHistory, budgetAlerts, };
//# sourceMappingURL=budget.d.ts.map