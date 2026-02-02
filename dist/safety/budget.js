"use strict";
/**
 * Budget Tracking Module
 *
 * Provides budget tracking per task, agent, swarm, and project.
 * Tracks token usage and cost calculation with threshold monitoring.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetAlerts = exports.budgetHistory = exports.activeBudgets = exports.budgetConfigs = exports.DEFAULT_THRESHOLDS = void 0;
exports.setBudgetConfig = setBudgetConfig;
exports.getBudgetConfig = getBudgetConfig;
exports.setProjectDailyBudget = setProjectDailyBudget;
exports.setTaskBudget = setTaskBudget;
exports.setAgentBudget = setAgentBudget;
exports.startBudgetTracking = startBudgetTracking;
exports.recordTokenUsage = recordTokenUsage;
exports.getBudgetUsage = getBudgetUsage;
exports.getBudgetTracking = getBudgetTracking;
exports.completeBudgetTracking = completeBudgetTracking;
exports.killBudgetTracking = killBudgetTracking;
exports.getAgentBudgetStatus = getAgentBudgetStatus;
exports.getProjectBudgetStatus = getProjectBudgetStatus;
exports.generateBudgetReport = generateBudgetReport;
exports.addBudgetAlert = addBudgetAlert;
exports.getBudgetAlerts = getBudgetAlerts;
exports.removeBudgetAlert = removeBudgetAlert;
exports.getBudgetHistory = getBudgetHistory;
const utils_1 = require("../utils");
const cost_1 = require("./cost");
const thresholds_1 = require("./thresholds");
// ============================================================================
// In-Memory Storage
// ============================================================================
// Budget configurations by scope
const budgetConfigs = new Map();
exports.budgetConfigs = budgetConfigs;
// Active budget tracking instances
const activeBudgets = new Map();
exports.activeBudgets = activeBudgets;
// Budget history for audit
const budgetHistory = [];
exports.budgetHistory = budgetHistory;
// Configured alerts
const budgetAlerts = new Map();
exports.budgetAlerts = budgetAlerts;
// Default thresholds
const DEFAULT_THRESHOLDS = [
    { threshold: 50, action: 'warn' },
    { threshold: 75, action: 'warn', notify: ['webhook:alerts'] },
    { threshold: 90, action: 'block', notify: ['webhook:alerts', 'email:admin'] },
    { threshold: 100, action: 'kill', notify: ['webhook:critical', 'email:admin'] },
    { threshold: 110, action: 'audit' },
];
exports.DEFAULT_THRESHOLDS = DEFAULT_THRESHOLDS;
// ============================================================================
// Budget Configuration
// ============================================================================
/**
 * Set a budget configuration for a specific scope
 */
function setBudgetConfig(config) {
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
    utils_1.logger.info(`Budget configured: ${key}`, { config });
    return config;
}
/**
 * Get budget configuration for a scope
 */
function getBudgetConfig(type, scope) {
    const key = `${type}:${scope}`;
    return budgetConfigs.get(key);
}
/**
 * Set project-level daily budget
 */
function setProjectDailyBudget(projectId, maxTokens, maxCost, resetHour = 0) {
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
function setTaskBudget(taskId, maxTokens, maxCost) {
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
function setAgentBudget(agentId, maxTokens, maxCost) {
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
function startBudgetTracking(agentId, taskId, projectId, model, swarmId) {
    // Find the most specific budget config
    const config = getBudgetConfig('task', taskId) ||
        getBudgetConfig('agent', agentId) ||
        (swarmId && getBudgetConfig('swarm', swarmId)) ||
        getBudgetConfig('project', projectId) ||
        getDefaultBudgetConfig();
    const tracking = {
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
    utils_1.logger.info(`Budget tracking started: ${tracking.id}`, { agentId, taskId, projectId });
    return tracking;
}
/**
 * Record token usage and update budget tracking
 */
function recordTokenUsage(budgetId, promptTokens, completionTokens, model) {
    const tracking = activeBudgets.get(budgetId);
    if (!tracking) {
        utils_1.logger.warn(`Budget tracking not found: ${budgetId}`);
        return null;
    }
    // Update token counts
    tracking.tokensUsed.prompt += promptTokens;
    tracking.tokensUsed.completion += completionTokens;
    tracking.tokensUsed.total += promptTokens + completionTokens;
    // Calculate costs
    const useModel = model || tracking.model;
    tracking.costUsed = (0, cost_1.calculateCost)(tracking.tokensUsed, useModel);
    tracking.lastUpdated = new Date();
    // Check thresholds
    const usage = getBudgetUsage(tracking);
    const thresholdResult = (0, thresholds_1.checkThresholds)(usage.percentageUsed, DEFAULT_THRESHOLDS);
    if (thresholdResult.triggered && thresholdResult.action) {
        // Record threshold event
        const event = {
            timestamp: new Date(),
            threshold: thresholdResult.threshold,
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
        (0, thresholds_1.executeThresholdAction)(thresholdResult, tracking);
    }
    return thresholdResult;
}
/**
 * Get current budget usage for a tracking instance
 */
function getBudgetUsage(tracking) {
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
function getBudgetTracking(budgetId) {
    return activeBudgets.get(budgetId);
}
/**
 * Complete budget tracking
 */
function completeBudgetTracking(budgetId) {
    const tracking = activeBudgets.get(budgetId);
    if (!tracking) {
        return null;
    }
    tracking.completedAt = new Date();
    utils_1.logger.info(`Budget tracking completed: ${budgetId}`, {
        tokensUsed: tracking.tokensUsed.total,
        costUsed: tracking.costUsed.total,
    });
    return tracking;
}
/**
 * Kill a budget tracking instance (emergency stop)
 */
function killBudgetTracking(budgetId, reason) {
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
    utils_1.logger.warn(`Budget tracking killed: ${budgetId}`, { reason });
    return tracking;
}
// ============================================================================
// Budget Status & Reporting
// ============================================================================
/**
 * Get budget status for an agent
 */
function getAgentBudgetStatus(agentId) {
    return Array.from(activeBudgets.values()).filter((tracking) => tracking.agentId === agentId);
}
/**
 * Get budget status for a project
 */
function getProjectBudgetStatus(projectId) {
    const budgets = Array.from(activeBudgets.values()).filter((tracking) => tracking.projectId === projectId);
    const totalUsed = budgets.reduce((acc, tracking) => ({
        prompt: acc.prompt + tracking.costUsed.prompt,
        completion: acc.completion + tracking.costUsed.completion,
        total: acc.total + tracking.costUsed.total,
    }), { prompt: 0, completion: 0, total: 0 });
    const config = getBudgetConfig('project', projectId);
    return { budgets, totalUsed, config };
}
/**
 * Generate budget report for a project
 */
function generateBudgetReport(projectId, period = 'month') {
    const { budgets, totalUsed, config } = getProjectBudgetStatus(projectId);
    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
    }
    else {
        startDate.setMonth(startDate.getMonth() - 1);
    }
    // Filter budgets within period
    const periodBudgets = budgets.filter((b) => b.startedAt >= startDate && b.startedAt <= endDate);
    // Calculate agent breakdown
    const agentMap = new Map();
    for (const budget of periodBudgets) {
        const existing = agentMap.get(budget.agentId);
        if (existing) {
            existing.tokensUsed += budget.tokensUsed.total;
            existing.costUsed += budget.costUsed.total;
        }
        else {
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
    const dailyMap = new Map();
    for (const budget of periodBudgets) {
        const date = budget.startedAt.toISOString().split('T')[0];
        const existing = dailyMap.get(date);
        if (existing) {
            existing.tokens += budget.tokensUsed.total;
            existing.cost += budget.costUsed.total;
        }
        else {
            dailyMap.set(date, { date, tokens: budget.tokensUsed.total, cost: budget.costUsed.total });
        }
    }
    const dailyUsage = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));
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
function addBudgetAlert(projectId, threshold, options) {
    const alert = {
        id: generateId(),
        budgetId: projectId,
        threshold,
        ...options,
        createdAt: new Date(),
    };
    const existing = budgetAlerts.get(projectId) || [];
    existing.push(alert);
    budgetAlerts.set(projectId, existing);
    utils_1.logger.info(`Budget alert added for ${projectId} at ${threshold}%`);
    return alert;
}
/**
 * Get budget alerts for a project
 */
function getBudgetAlerts(projectId) {
    return budgetAlerts.get(projectId) || [];
}
/**
 * Remove a budget alert
 */
function removeBudgetAlert(projectId, alertId) {
    const alerts = budgetAlerts.get(projectId);
    if (!alerts)
        return false;
    const filtered = alerts.filter((a) => a.id !== alertId);
    if (filtered.length === alerts.length)
        return false;
    budgetAlerts.set(projectId, filtered);
    return true;
}
// ============================================================================
// Budget History
// ============================================================================
/**
 * Get budget history
 */
function getBudgetHistory(projectId, since) {
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
function getDefaultBudgetConfig() {
    return {
        type: 'project',
        scope: 'default',
        maxTokens: 10000000,
        maxCost: 1000,
    };
}
function generateId() {
    return `budget_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
//# sourceMappingURL=budget.js.map