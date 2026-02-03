"use strict";
/**
 * Core Engine - SPEC_v2.md Implementation
 *
 * Exports:
 * - SwarmManager: Create/destroy/scale/status swarms
 * - AgentLifecycle: spawn/kill/pause/resume/retry agents
 * - OpenClawCore: Core primitive for OpenClaw integration
 * - BudgetController: Budget limits and enforcement
 * - StateManager: Checkpoint and recovery
 * - HealthMonitor: System health checks
 * - ContextSummarizer: Recursive context compression
 * - NightModeManager: Overnight operation
 * - MetricsCollector: Time-series metrics
 * - VerificationPipeline: Build/test/rollback
 *
 * OpenClaw is a core primitive, not an integration.
 * It is initialized at startup and available to all agents automatically.
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getVerificationStatus = exports.quickVerify = exports.verificationPipeline = exports.VerificationPipeline = exports.recordCurrentState = exports.getRecentMetrics = exports.getMetricsHealth = exports.metricsCollector = exports.MetricsCollector = exports.canSpawnInNightMode = exports.recordHumanReturn = exports.getNightModeStatus = exports.isNightModeActive = exports.nightModeManager = exports.NightModeManager = exports.getContextStats = exports.runSummarization = exports.getContextQuickSummary = exports.contextSummarizer = exports.ContextSummarizer = exports.getQuickStatus = exports.formatHealthReport = exports.isSystemHealthy = exports.healthMonitor = exports.HealthMonitor = exports.getCheckpointStatus = exports.loadState = exports.saveState = exports.stateManager = exports.StateManager = exports.NIGHT_MODE_LIMITS = exports.BudgetController = exports.getBudgetStatus = exports.canAddAgent = exports.canSpend = exports.budgetController = exports.BUDGET_ALERTS = exports.SOFT_LIMITS = exports.HARD_LIMITS = void 0;
// Core modules
__exportStar(require("./swarm"), exports);
__exportStar(require("./lifecycle"), exports);
__exportStar(require("./openclaw"), exports);
// Budget and limits - explicit exports to avoid duplicates
var budget_controller_1 = require("./budget-controller");
Object.defineProperty(exports, "HARD_LIMITS", { enumerable: true, get: function () { return budget_controller_1.HARD_LIMITS; } });
Object.defineProperty(exports, "SOFT_LIMITS", { enumerable: true, get: function () { return budget_controller_1.SOFT_LIMITS; } });
Object.defineProperty(exports, "BUDGET_ALERTS", { enumerable: true, get: function () { return budget_controller_1.BUDGET_ALERTS; } });
Object.defineProperty(exports, "budgetController", { enumerable: true, get: function () { return budget_controller_1.budgetController; } });
Object.defineProperty(exports, "canSpend", { enumerable: true, get: function () { return budget_controller_1.canSpend; } });
Object.defineProperty(exports, "canAddAgent", { enumerable: true, get: function () { return budget_controller_1.canAddAgent; } });
Object.defineProperty(exports, "getBudgetStatus", { enumerable: true, get: function () { return budget_controller_1.getBudgetStatus; } });
var budget_controller_2 = require("./budget-controller");
Object.defineProperty(exports, "BudgetController", { enumerable: true, get: function () { return budget_controller_2.BudgetController; } });
Object.defineProperty(exports, "NIGHT_MODE_LIMITS", { enumerable: true, get: function () { return budget_controller_2.NIGHT_MODE_LIMITS; } });
// State management
var state_manager_1 = require("./state-manager");
Object.defineProperty(exports, "StateManager", { enumerable: true, get: function () { return state_manager_1.StateManager; } });
Object.defineProperty(exports, "stateManager", { enumerable: true, get: function () { return state_manager_1.stateManager; } });
Object.defineProperty(exports, "saveState", { enumerable: true, get: function () { return state_manager_1.saveState; } });
Object.defineProperty(exports, "loadState", { enumerable: true, get: function () { return state_manager_1.loadState; } });
Object.defineProperty(exports, "getCheckpointStatus", { enumerable: true, get: function () { return state_manager_1.getCheckpointStatus; } });
// Health monitoring
var health_monitor_1 = require("./health-monitor");
Object.defineProperty(exports, "HealthMonitor", { enumerable: true, get: function () { return health_monitor_1.HealthMonitor; } });
Object.defineProperty(exports, "healthMonitor", { enumerable: true, get: function () { return health_monitor_1.healthMonitor; } });
Object.defineProperty(exports, "isSystemHealthy", { enumerable: true, get: function () { return health_monitor_1.isSystemHealthy; } });
Object.defineProperty(exports, "formatHealthReport", { enumerable: true, get: function () { return health_monitor_1.formatHealthReport; } });
Object.defineProperty(exports, "getQuickStatus", { enumerable: true, get: function () { return health_monitor_1.getQuickStatus; } });
// Context summarization
var context_summarizer_1 = require("./context-summarizer");
Object.defineProperty(exports, "ContextSummarizer", { enumerable: true, get: function () { return context_summarizer_1.ContextSummarizer; } });
Object.defineProperty(exports, "contextSummarizer", { enumerable: true, get: function () { return context_summarizer_1.contextSummarizer; } });
Object.defineProperty(exports, "getContextQuickSummary", { enumerable: true, get: function () { return context_summarizer_1.getContextQuickSummary; } });
Object.defineProperty(exports, "runSummarization", { enumerable: true, get: function () { return context_summarizer_1.runSummarization; } });
Object.defineProperty(exports, "getContextStats", { enumerable: true, get: function () { return context_summarizer_1.getContextStats; } });
// Night mode
var night_mode_1 = require("./night-mode");
Object.defineProperty(exports, "NightModeManager", { enumerable: true, get: function () { return night_mode_1.NightModeManager; } });
Object.defineProperty(exports, "nightModeManager", { enumerable: true, get: function () { return night_mode_1.nightModeManager; } });
Object.defineProperty(exports, "isNightModeActive", { enumerable: true, get: function () { return night_mode_1.isNightModeActive; } });
Object.defineProperty(exports, "getNightModeStatus", { enumerable: true, get: function () { return night_mode_1.getNightModeStatus; } });
Object.defineProperty(exports, "recordHumanReturn", { enumerable: true, get: function () { return night_mode_1.recordHumanReturn; } });
Object.defineProperty(exports, "canSpawnInNightMode", { enumerable: true, get: function () { return night_mode_1.canSpawnInNightMode; } });
// Metrics
var metrics_1 = require("./metrics");
Object.defineProperty(exports, "MetricsCollector", { enumerable: true, get: function () { return metrics_1.MetricsCollector; } });
Object.defineProperty(exports, "metricsCollector", { enumerable: true, get: function () { return metrics_1.metricsCollector; } });
Object.defineProperty(exports, "getMetricsHealth", { enumerable: true, get: function () { return metrics_1.getMetricsHealth; } });
Object.defineProperty(exports, "getRecentMetrics", { enumerable: true, get: function () { return metrics_1.getRecentMetrics; } });
Object.defineProperty(exports, "recordCurrentState", { enumerable: true, get: function () { return metrics_1.recordCurrentState; } });
// Verification
var verification_1 = require("./verification");
Object.defineProperty(exports, "VerificationPipeline", { enumerable: true, get: function () { return verification_1.VerificationPipeline; } });
Object.defineProperty(exports, "verificationPipeline", { enumerable: true, get: function () { return verification_1.verificationPipeline; } });
Object.defineProperty(exports, "quickVerify", { enumerable: true, get: function () { return verification_1.quickVerify; } });
Object.defineProperty(exports, "getVerificationStatus", { enumerable: true, get: function () { return verification_1.getVerificationStatus; } });
//# sourceMappingURL=index.js.map