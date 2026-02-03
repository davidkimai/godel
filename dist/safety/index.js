"use strict";
/**
 * Safety Module - Budget Enforcement
 *
 * Provides budget tracking, cost calculation, and threshold-based enforcement
 * for controlling costs and preventing runaway agent spending.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBlockedAgent = exports.unblockAgent = exports.approveBlockedAgent = exports.requestApproval = exports.isAgentBlocked = exports.executeThresholdAction = exports.checkThresholdsWithCooldown = exports.checkThresholds = exports.customPricing = exports.costHistory = exports.generateOptimizationSuggestions = exports.aggregateCostsByModel = exports.aggregateCostsByPeriod = exports.getProjectCostSummary = exports.getTaskCostSummary = exports.getAgentCostSummary = exports.getCostHistory = exports.recordCost = exports.listPricing = exports.getCostPerThousandTokens = exports.removePricing = exports.setPricing = exports.getPricing = exports.MODEL_PRICING = exports.estimateCost = exports.calculateCostFromTokens = exports.calculateCost = exports.DEFAULT_THRESHOLDS = exports.budgetAlerts = exports.budgetHistory = exports.activeBudgets = exports.budgetConfigs = exports.getBudgetHistory = exports.removeBudgetAlert = exports.getBudgetAlerts = exports.addBudgetAlert = exports.generateBudgetReport = exports.getProjectBudgetStatus = exports.getAgentBudgetStatus = exports.killBudgetTracking = exports.completeBudgetTracking = exports.getBudgetTracking = exports.getBudgetUsage = exports.recordTokenUsage = exports.startBudgetTracking = exports.setAgentBudget = exports.setTaskBudget = exports.setProjectDailyBudget = exports.getBudgetConfig = exports.setBudgetConfig = void 0;
exports.auditLog = exports.blockedAgents = exports.thresholdStates = exports.clearAuditLog = exports.getAuditLog = exports.getAllBlockedAgents = void 0;
// Budget tracking
var budget_1 = require("./budget");
// Configuration
Object.defineProperty(exports, "setBudgetConfig", { enumerable: true, get: function () { return budget_1.setBudgetConfig; } });
Object.defineProperty(exports, "getBudgetConfig", { enumerable: true, get: function () { return budget_1.getBudgetConfig; } });
Object.defineProperty(exports, "setProjectDailyBudget", { enumerable: true, get: function () { return budget_1.setProjectDailyBudget; } });
Object.defineProperty(exports, "setTaskBudget", { enumerable: true, get: function () { return budget_1.setTaskBudget; } });
Object.defineProperty(exports, "setAgentBudget", { enumerable: true, get: function () { return budget_1.setAgentBudget; } });
// Tracking
Object.defineProperty(exports, "startBudgetTracking", { enumerable: true, get: function () { return budget_1.startBudgetTracking; } });
Object.defineProperty(exports, "recordTokenUsage", { enumerable: true, get: function () { return budget_1.recordTokenUsage; } });
Object.defineProperty(exports, "getBudgetUsage", { enumerable: true, get: function () { return budget_1.getBudgetUsage; } });
Object.defineProperty(exports, "getBudgetTracking", { enumerable: true, get: function () { return budget_1.getBudgetTracking; } });
Object.defineProperty(exports, "completeBudgetTracking", { enumerable: true, get: function () { return budget_1.completeBudgetTracking; } });
Object.defineProperty(exports, "killBudgetTracking", { enumerable: true, get: function () { return budget_1.killBudgetTracking; } });
// Status and reporting
Object.defineProperty(exports, "getAgentBudgetStatus", { enumerable: true, get: function () { return budget_1.getAgentBudgetStatus; } });
Object.defineProperty(exports, "getProjectBudgetStatus", { enumerable: true, get: function () { return budget_1.getProjectBudgetStatus; } });
Object.defineProperty(exports, "generateBudgetReport", { enumerable: true, get: function () { return budget_1.generateBudgetReport; } });
// Alerts and history
Object.defineProperty(exports, "addBudgetAlert", { enumerable: true, get: function () { return budget_1.addBudgetAlert; } });
Object.defineProperty(exports, "getBudgetAlerts", { enumerable: true, get: function () { return budget_1.getBudgetAlerts; } });
Object.defineProperty(exports, "removeBudgetAlert", { enumerable: true, get: function () { return budget_1.removeBudgetAlert; } });
Object.defineProperty(exports, "getBudgetHistory", { enumerable: true, get: function () { return budget_1.getBudgetHistory; } });
// State (for testing)
Object.defineProperty(exports, "budgetConfigs", { enumerable: true, get: function () { return budget_1.budgetConfigs; } });
Object.defineProperty(exports, "activeBudgets", { enumerable: true, get: function () { return budget_1.activeBudgets; } });
Object.defineProperty(exports, "budgetHistory", { enumerable: true, get: function () { return budget_1.budgetHistory; } });
Object.defineProperty(exports, "budgetAlerts", { enumerable: true, get: function () { return budget_1.budgetAlerts; } });
// Re-export DEFAULT_THRESHOLDS from thresholds (single source of truth)
var thresholds_1 = require("./thresholds");
Object.defineProperty(exports, "DEFAULT_THRESHOLDS", { enumerable: true, get: function () { return thresholds_1.DEFAULT_THRESHOLDS; } });
// Cost calculation
var cost_1 = require("./cost");
// Cost calculation
Object.defineProperty(exports, "calculateCost", { enumerable: true, get: function () { return cost_1.calculateCost; } });
Object.defineProperty(exports, "calculateCostFromTokens", { enumerable: true, get: function () { return cost_1.calculateCostFromTokens; } });
Object.defineProperty(exports, "estimateCost", { enumerable: true, get: function () { return cost_1.estimateCost; } });
// Model pricing
Object.defineProperty(exports, "MODEL_PRICING", { enumerable: true, get: function () { return cost_1.MODEL_PRICING; } });
Object.defineProperty(exports, "getPricing", { enumerable: true, get: function () { return cost_1.getPricing; } });
Object.defineProperty(exports, "setPricing", { enumerable: true, get: function () { return cost_1.setPricing; } });
Object.defineProperty(exports, "removePricing", { enumerable: true, get: function () { return cost_1.removePricing; } });
Object.defineProperty(exports, "getCostPerThousandTokens", { enumerable: true, get: function () { return cost_1.getCostPerThousandTokens; } });
Object.defineProperty(exports, "listPricing", { enumerable: true, get: function () { return cost_1.listPricing; } });
// Cost tracking
Object.defineProperty(exports, "recordCost", { enumerable: true, get: function () { return cost_1.recordCost; } });
Object.defineProperty(exports, "getCostHistory", { enumerable: true, get: function () { return cost_1.getCostHistory; } });
Object.defineProperty(exports, "getAgentCostSummary", { enumerable: true, get: function () { return cost_1.getAgentCostSummary; } });
Object.defineProperty(exports, "getTaskCostSummary", { enumerable: true, get: function () { return cost_1.getTaskCostSummary; } });
Object.defineProperty(exports, "getProjectCostSummary", { enumerable: true, get: function () { return cost_1.getProjectCostSummary; } });
// Aggregation
Object.defineProperty(exports, "aggregateCostsByPeriod", { enumerable: true, get: function () { return cost_1.aggregateCostsByPeriod; } });
Object.defineProperty(exports, "aggregateCostsByModel", { enumerable: true, get: function () { return cost_1.aggregateCostsByModel; } });
// Optimization
Object.defineProperty(exports, "generateOptimizationSuggestions", { enumerable: true, get: function () { return cost_1.generateOptimizationSuggestions; } });
// State (for testing)
Object.defineProperty(exports, "costHistory", { enumerable: true, get: function () { return cost_1.costHistory; } });
Object.defineProperty(exports, "customPricing", { enumerable: true, get: function () { return cost_1.customPricing; } });
// Thresholds
var thresholds_2 = require("./thresholds");
// Threshold checking
Object.defineProperty(exports, "checkThresholds", { enumerable: true, get: function () { return thresholds_2.checkThresholds; } });
Object.defineProperty(exports, "checkThresholdsWithCooldown", { enumerable: true, get: function () { return thresholds_2.checkThresholdsWithCooldown; } });
// Action execution
Object.defineProperty(exports, "executeThresholdAction", { enumerable: true, get: function () { return thresholds_2.executeThresholdAction; } });
// Block management
Object.defineProperty(exports, "isAgentBlocked", { enumerable: true, get: function () { return thresholds_2.isAgentBlocked; } });
Object.defineProperty(exports, "requestApproval", { enumerable: true, get: function () { return thresholds_2.requestApproval; } });
Object.defineProperty(exports, "approveBlockedAgent", { enumerable: true, get: function () { return thresholds_2.approveBlockedAgent; } });
Object.defineProperty(exports, "unblockAgent", { enumerable: true, get: function () { return thresholds_2.unblockAgent; } });
Object.defineProperty(exports, "getBlockedAgent", { enumerable: true, get: function () { return thresholds_2.getBlockedAgent; } });
Object.defineProperty(exports, "getAllBlockedAgents", { enumerable: true, get: function () { return thresholds_2.getAllBlockedAgents; } });
// Audit
Object.defineProperty(exports, "getAuditLog", { enumerable: true, get: function () { return thresholds_2.getAuditLog; } });
Object.defineProperty(exports, "clearAuditLog", { enumerable: true, get: function () { return thresholds_2.clearAuditLog; } });
// State (for testing)
Object.defineProperty(exports, "thresholdStates", { enumerable: true, get: function () { return thresholds_2.thresholdStates; } });
Object.defineProperty(exports, "blockedAgents", { enumerable: true, get: function () { return thresholds_2.blockedAgents; } });
Object.defineProperty(exports, "auditLog", { enumerable: true, get: function () { return thresholds_2.auditLog; } });
//# sourceMappingURL=index.js.map