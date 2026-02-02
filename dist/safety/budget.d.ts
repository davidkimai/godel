/**
 * Budget Tracking Module
 *
 * Provides budget tracking per task, agent, swarm, and project.
 * Tracks token usage and cost calculation with threshold monitoring.
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
declare const budgetConfigs: Map<string, BudgetConfig>;
declare const activeBudgets: Map<string, BudgetTracking>;
declare const budgetHistory: BudgetHistoryEntry[];
declare const budgetAlerts: Map<string, BudgetAlert[]>;
declare const DEFAULT_THRESHOLDS: ThresholdConfig[];
/**
 * Set a budget configuration for a specific scope
 */
export declare function setBudgetConfig(config: BudgetConfig): BudgetConfig;
/**
 * Get budget configuration for a scope
 */
export declare function getBudgetConfig(type: BudgetType, scope: string): BudgetConfig | undefined;
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
/**
 * Record token usage and update budget tracking
 */
export declare function recordTokenUsage(budgetId: string, promptTokens: number, completionTokens: number, model?: string): ThresholdCheckResult | null;
/**
 * Get current budget usage for a tracking instance
 */
export declare function getBudgetUsage(tracking: BudgetTracking): BudgetUsage;
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
 * Get budget history
 */
export declare function getBudgetHistory(projectId?: string, since?: Date): BudgetHistoryEntry[];
export { DEFAULT_THRESHOLDS, budgetConfigs, activeBudgets, budgetHistory, budgetAlerts, };
//# sourceMappingURL=budget.d.ts.map