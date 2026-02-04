/**
 * Scaling Module Index
 * 
 * Exports all scaling-related types and classes.
 */

// Types
export type {
  AutoScalerConfig,
  AutoScalerState,
  AutoScalerHealth,
  ScalingPolicy,
  ScaleUpPolicy,
  ScaleDownPolicy,
  ScalingThreshold,
  ScalingMetrics,
  ScalingDecision,
  ScalingEvent,
  ScalingAction,
  ScalingTrigger,
  ScalingMetric,
  PredictiveScalingConfig,
  ScalingSchedule,
  QueuePrediction,
  CostTrackingConfig,
  BudgetConfig,
  CostAlert,
  CostAlertLevel,
  IAutoScaler,
  IScalingDecisionRepository,
  ICostTrackingRepository,
  ScalingOperationResult,
} from './types';

// Main Auto-Scaler
export { AutoScaler, getGlobalAutoScaler, resetGlobalAutoScaler } from './auto-scaler';

// Policies
export {
  DEFAULT_SCALE_UP_POLICY,
  DEFAULT_SCALE_DOWN_POLICY,
  createDefaultScalingPolicy,
  createAggressiveScalingPolicy,
  createConservativeScalingPolicy,
  evaluateScalingPolicy,
  evaluateThreshold,
  evaluateScaleUpPolicy,
  evaluateScaleDownPolicy,
  calculateScaleUpIncrement,
  calculateScaleDownDecrement,
  getMetricValue,
} from './policies';

// Predictive Scaling
export {
  QueueGrowthTracker,
  makePredictiveDecision,
  parseCronExpression,
  isScheduleActive,
  getScheduledTargetAgents,
  createBusinessHoursSchedule,
  createAfterHoursSchedule,
  createWeekendSchedule,
  DEFAULT_PREDICTIVE_CONFIG,
} from './predictive';

// Cost Tracking
export {
  BudgetManager,
  calculateCost,
  calculateHourlyBurnRate,
  estimateBudgetExhaustion,
  getCostOptimizationRecommendations,
  DEFAULT_COST_CONFIG,
  DEFAULT_BUDGET_ALERT_THRESHOLD,
  DEFAULT_BUDGET_HARD_STOP_THRESHOLD,
} from './cost-tracker';
