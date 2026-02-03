"use strict";
/**
 * Budget Tracking Module
 *
 * Provides budget tracking per task, agent, swarm, and project.
 * Tracks token usage and cost calculation with threshold monitoring.
 * Budget configurations are persisted to disk for cross-session survival.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.budgetAlerts = exports.budgetHistory = exports.activeBudgets = exports.budgetConfigs = exports.DEFAULT_THRESHOLDS = void 0;
exports.getBudgetsFilePath = getBudgetsFilePath;
exports.setBudgetConfig = setBudgetConfig;
exports.getBudgetConfig = getBudgetConfig;
exports.listBudgetConfigs = listBudgetConfigs;
exports.listBudgetConfigsByType = listBudgetConfigsByType;
exports.clearAllBudgetConfigs = clearAllBudgetConfigs;
exports.deleteBudgetConfig = deleteBudgetConfig;
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
exports.clearAllBudgetAlerts = clearAllBudgetAlerts;
exports.getBudgetHistory = getBudgetHistory;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const utils_1 = require("../utils");
const cost_1 = require("./cost");
const thresholds_1 = require("./thresholds");
// ============================================================================
// Persistence Configuration
// ============================================================================
// Budget storage location (in user's home directory for persistence)
const BUDGETS_DIR = path.join(os.homedir(), '.config', 'dash');
const BUDGETS_FILE = path.join(BUDGETS_DIR, 'budgets.json');
// ============================================================================
// In-Memory Storage (initialized from file)
// ============================================================================
// Budget configurations by scope - loaded from disk
let budgetConfigs = new Map();
exports.budgetConfigs = budgetConfigs;
// Active budget tracking instances (runtime only - not persisted)
const activeBudgets = new Map();
exports.activeBudgets = activeBudgets;
// Budget history for audit (runtime only - not persisted)
const budgetHistory = [];
exports.budgetHistory = budgetHistory;
// Configured alerts - loaded from disk
let budgetAlerts = new Map();
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
// Persistence Functions
// ============================================================================
/**
 * Ensure the budgets directory exists
 */
function ensureBudgetsDir() {
    if (!fs.existsSync(BUDGETS_DIR)) {
        fs.mkdirSync(BUDGETS_DIR, { recursive: true });
    }
}
/**
 * Load persisted budgets from disk
 */
function loadPersistedBudgets() {
    try {
        ensureBudgetsDir();
        if (fs.existsSync(BUDGETS_FILE)) {
            const data = fs.readFileSync(BUDGETS_FILE, 'utf-8');
            const persisted = JSON.parse(data);
            // Restore configs
            exports.budgetConfigs = budgetConfigs = new Map(Object.entries(persisted.configs || {}));
            // Restore alerts
            exports.budgetAlerts = budgetAlerts = new Map(Object.entries(persisted.alerts || {}));
            utils_1.logger.debug(`Loaded ${budgetConfigs.size} budget configs and ${budgetAlerts.size} alert sets from disk`);
        }
    }
    catch (error) {
        console.error('Warning: Failed to load persisted budgets:', error);
        // Start with empty maps
        exports.budgetConfigs = budgetConfigs = new Map();
        exports.budgetAlerts = budgetAlerts = new Map();
    }
}
/**
 * Save budgets to disk for persistence
 */
function savePersistedBudgets() {
    try {
        ensureBudgetsDir();
        const persisted = {
            configs: Object.fromEntries(budgetConfigs),
            alerts: Object.fromEntries(budgetAlerts),
            version: '1.0.0',
            updatedAt: new Date().toISOString(),
        };
        fs.writeFileSync(BUDGETS_FILE, JSON.stringify(persisted, null, 2), 'utf-8');
        utils_1.logger.debug(`Saved ${budgetConfigs.size} budget configs to disk`);
    }
    catch (error) {
        console.error('Warning: Failed to save budgets to disk:', error);
    }
}
/**
 * Get the path to the budgets file (for debugging)
 */
function getBudgetsFilePath() {
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
function setBudgetConfig(config) {
    const key = `${config.type}:${config.scope}`;
    budgetConfigs.set(key, config);
    // Persist to disk immediately
    savePersistedBudgets();
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
 * List all budget configurations
 */
function listBudgetConfigs() {
    return Array.from(budgetConfigs.values());
}
/**
 * List budget configurations by type
 */
function listBudgetConfigsByType(type) {
    return Array.from(budgetConfigs.values()).filter(config => config.type === type);
}
/**
 * Clear all budget configurations (for testing/reset)
 */
function clearAllBudgetConfigs() {
    budgetConfigs.clear();
    savePersistedBudgets();
    utils_1.logger.info('All budget configurations cleared');
}
/**
 * Delete a specific budget configuration
 */
function deleteBudgetConfig(type, scope) {
    const key = `${type}:${scope}`;
    const existed = budgetConfigs.has(key);
    if (existed) {
        budgetConfigs.delete(key);
        savePersistedBudgets();
        utils_1.logger.info(`Budget configuration deleted: ${key}`);
    }
    return existed;
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
    // Persist to disk
    savePersistedBudgets();
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
    // Persist to disk
    savePersistedBudgets();
    return true;
}
/**
 * Clear all budget alerts (for testing/reset)
 */
function clearAllBudgetAlerts() {
    budgetAlerts.clear();
    savePersistedBudgets();
    utils_1.logger.info('All budget alerts cleared');
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