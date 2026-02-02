/**
 * Safety Module - Budget Enforcement
 *
 * Provides budget tracking, cost calculation, and threshold-based enforcement
 * for controlling costs and preventing runaway agent spending.
 */

// Budget tracking
export {
  // Configuration
  setBudgetConfig,
  getBudgetConfig,
  setProjectDailyBudget,
  setTaskBudget,
  setAgentBudget,
  
  // Tracking
  startBudgetTracking,
  recordTokenUsage,
  getBudgetUsage,
  getBudgetTracking,
  completeBudgetTracking,
  killBudgetTracking,
  
  // Status and reporting
  getAgentBudgetStatus,
  getProjectBudgetStatus,
  generateBudgetReport,
  
  // Alerts and history
  addBudgetAlert,
  getBudgetAlerts,
  removeBudgetAlert,
  getBudgetHistory,
  
  // State (for testing)
  budgetConfigs,
  activeBudgets,
  budgetHistory,
  budgetAlerts,
} from './budget';

export type {
  BudgetType,
  BudgetPeriod,
  TokenCount,
  CostBreakdown,
  BudgetConfig,
  BudgetUsage,
  BudgetTracking,
  ThresholdEvent,
  BudgetAlert,
  BudgetHistoryEntry,
  BudgetReport,
  AgentBudgetReport,
  DailyUsage,
} from './budget';

// Re-export DEFAULT_THRESHOLDS from thresholds (single source of truth)
export { DEFAULT_THRESHOLDS } from './thresholds';

// Cost calculation
export {
  // Cost calculation
  calculateCost,
  calculateCostFromTokens,
  estimateCost,
  
  // Model pricing
  MODEL_PRICING,
  getPricing,
  setPricing,
  removePricing,
  getCostPerThousandTokens,
  listPricing,
  
  // Cost tracking
  recordCost,
  getCostHistory,
  getAgentCostSummary,
  getTaskCostSummary,
  getProjectCostSummary,
  
  // Aggregation
  aggregateCostsByPeriod,
  aggregateCostsByModel,
  
  // Optimization
  generateOptimizationSuggestions,
  
  // State (for testing)
  costHistory,
  customPricing,
} from './cost';

export type {
  ModelPricing,
  CostEntry,
  CostSummary,
  CostHistoryQuery,
  CostOptimizationSuggestion,
} from './cost';

// Thresholds
export {
  // Threshold checking
  checkThresholds,
  checkThresholdsWithCooldown,
  
  // Action execution
  executeThresholdAction,
  
  // Block management
  isAgentBlocked,
  requestApproval,
  approveBlockedAgent,
  unblockAgent,
  getBlockedAgent,
  getAllBlockedAgents,
  
  // Audit
  getAuditLog,
  clearAuditLog,
  
  // State (for testing)
  thresholdStates,
  blockedAgents,
  auditLog,
} from './thresholds';

export type {
  ThresholdAction,
  ThresholdConfig,
  ThresholdCheckResult,
  ThresholdState,
  BlockedAgent,
} from './thresholds';
