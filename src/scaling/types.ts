/**
 * Auto-Scaling Types
 * 
 * Type definitions for the auto-scaling engine including scaling policies,
 * metrics, thresholds, and configuration.
 */

import type { EventEmitter } from 'events';

// ============================================================================
// Core Scaling Types
// ============================================================================

/**
 * Scaling action types
 */
export type ScalingAction = 'scale_up' | 'scale_down' | 'maintain' | 'emergency_stop';

/**
 * Scaling trigger sources
 */
export type ScalingTrigger = 
  | 'queue_depth' 
  | 'cpu_utilization' 
  | 'memory_utilization' 
  | 'event_backlog'
  | 'schedule'
  | 'prediction'
  | 'budget';

/**
 * Scaling metric types
 */
export type ScalingMetric = 
  | 'queue_depth'
  | 'queue_growth_rate'
  | 'agent_cpu_percent'
  | 'agent_memory_percent'
  | 'event_backlog_size'
  | 'agent_utilization'
  | 'task_completion_rate';

// ============================================================================
// Scaling Policy Types
// ============================================================================

/**
 * Scaling threshold configuration
 */
export interface ScalingThreshold {
  /** Metric name */
  metric: ScalingMetric;
  /** Threshold value */
  value: number;
  /** Comparison operator */
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq';
  /** Duration the threshold must be breached (seconds) */
  durationSeconds?: number;
  /** Weight for multi-threshold decisions (0-1) */
  weight?: number;
}

/**
 * Scale up policy
 */
export interface ScaleUpPolicy {
  /** Thresholds that trigger scale up */
  thresholds: ScalingThreshold[];
  /** Number of agents to add */
  increment: number | 'auto';
  /** Maximum agents per scale up operation */
  maxIncrement?: number;
  /** Cooldown period after scaling (seconds) */
  cooldownSeconds: number;
  /** Require multiple thresholds to trigger */
  requireAllThresholds?: boolean;
}

/**
 * Scale down policy
 */
export interface ScaleDownPolicy {
  /** Thresholds that trigger scale down */
  thresholds: ScalingThreshold[];
  /** Number of agents to remove */
  decrement: number | 'auto';
  /** Minimum agents to keep */
  minAgents: number;
  /** Cooldown period after scaling (seconds) */
  cooldownSeconds: number;
  /** Require multiple thresholds to trigger */
  requireAllThresholds?: boolean;
  /** Graceful shutdown timeout (seconds) */
  gracefulShutdownSeconds?: number;
}

/**
 * Complete scaling policy for a swarm
 */
export interface ScalingPolicy {
  /** Swarm ID this policy applies to */
  swarmId: string;
  /** Minimum agent count */
  minAgents: number;
  /** Maximum agent count */
  maxAgents: number;
  /** Scale up configuration */
  scaleUp: ScaleUpPolicy;
  /** Scale down configuration */
  scaleDown: ScaleDownPolicy;
  /** Target metric values (for auto-tuning) */
  targets?: {
    targetQueueDepth?: number;
    targetCpuUtilization?: number;
    targetMemoryUtilization?: number;
  };
  /** Enable predictive scaling */
  predictiveScaling?: boolean;
  /** Enable cost-aware scaling */
  costAwareScaling?: boolean;
}

// ============================================================================
// Predictive Scaling Types
// ============================================================================

/**
 * Cron schedule for time-based scaling
 */
export interface ScalingSchedule {
  /** Schedule ID */
  id: string;
  /** Cron expression */
  cron: string;
  /** Target agent count */
  targetAgents: number;
  /** Description */
  description?: string;
  /** Timezone */
  timezone?: string;
  /** Enable this schedule */
  enabled: boolean;
}

/**
 * Queue growth prediction
 */
export interface QueuePrediction {
  /** Predicted queue depth */
  predictedDepth: number;
  /** Confidence level (0-1) */
  confidence: number;
  /** Prediction timestamp */
  timestamp: Date;
  /** Time horizon (seconds) */
  horizonSeconds: number;
  /** Recommended action */
  recommendation: 'scale_up' | 'scale_down' | 'maintain';
  /** Recommended agent count */
  recommendedAgents?: number;
}

/**
 * Predictive scaling configuration
 */
export interface PredictiveScalingConfig {
  /** Enable queue growth rate detection */
  enableQueuePrediction: boolean;
  /** Enable time-based scaling */
  enableScheduleScaling: boolean;
  /** Prediction window (seconds) */
  predictionWindowSeconds: number;
  /** Pre-warm configuration */
  preWarm?: {
    /** Enable pre-warming */
    enabled: boolean;
    /** Minutes before busy period to pre-warm */
    leadTimeMinutes: number;
    /** Number of agents to pre-warm */
    agentCount: number;
  };
  /** Schedules for time-based scaling */
  schedules?: ScalingSchedule[];
}

// ============================================================================
// Cost-Aware Scaling Types
// ============================================================================

/**
 * Cost tracking configuration
 */
export interface CostTrackingConfig {
  /** Cost per agent per hour (USD) */
  costPerAgentHour: number;
  /** Additional overhead cost per hour */
  overheadCostPerHour?: number;
  /** Currency */
  currency: 'USD' | 'EUR' | 'GBP';
  /** Track by agent type */
  trackByAgentType?: boolean;
}

/**
 * Budget configuration for cost-aware scaling
 */
export interface BudgetConfig {
  /** Budget ID */
  id: string;
  /** Swarm ID */
  swarmId: string;
  /** Total budget allocated (USD) */
  totalBudget: number;
  /** Budget period (hourly, daily, weekly, monthly) */
  period: 'hourly' | 'daily' | 'weekly' | 'monthly';
  /** Alert threshold (0-1, percentage of budget) */
  alertThreshold: number;
  /** Hard stop threshold (0-1, percentage of budget) */
  hardStopThreshold: number;
  /** Reset time for the budget period */
  resetHour?: number;
  /** Reset day of week (0-6, Sunday-Saturday) for weekly */
  resetDayOfWeek?: number;
  /** Reset day of month (1-31) for monthly */
  resetDayOfMonth?: number;
  /** Currency */
  currency?: 'USD' | 'EUR' | 'GBP';
}

/**
 * Cost alert levels
 */
export type CostAlertLevel = 'info' | 'warning' | 'critical' | 'exceeded';

/**
 * Cost alert
 */
export interface CostAlert {
  /** Alert ID */
  id: string;
  /** Swarm ID */
  swarmId: string;
  /** Alert level */
  level: CostAlertLevel;
  /** Current cost */
  currentCost: number;
  /** Budget limit */
  budgetLimit: number;
  /** Percentage used */
  percentageUsed: number;
  /** Timestamp */
  timestamp: Date;
  /** Message */
  message: string;
  /** Whether scaling was blocked */
  scalingBlocked?: boolean;
}

// ============================================================================
// Metrics Types
// ============================================================================

/**
 * Current metrics snapshot
 */
export interface ScalingMetrics {
  /** Timestamp */
  timestamp: Date;
  /** Swarm ID */
  swarmId: string;
  /** Current agent count */
  currentAgentCount: number;
  /** Queue depth */
  queueDepth: number;
  /** Queue growth rate (tasks/minute) */
  queueGrowthRate: number;
  /** Average agent CPU utilization */
  avgCpuUtilization: number;
  /** Average agent memory utilization */
  avgMemoryUtilization: number;
  /** Event backlog size */
  eventBacklogSize: number;
  /** Task completion rate (tasks/minute) */
  taskCompletionRate: number;
  /** Average task latency (seconds) */
  avgTaskLatency: number;
  /** Current cost (USD) */
  currentCost: number;
  /** Budget utilization (0-1) */
  budgetUtilization: number;
}

/**
 * Metric history entry
 */
export interface MetricHistoryEntry {
  /** Timestamp */
  timestamp: Date;
  /** Metric value */
  value: number;
  /** Metric type */
  metric: ScalingMetric;
}

// ============================================================================
// Scaling Decision Types
// ============================================================================

/**
 * Scaling decision result
 */
export interface ScalingDecision {
  /** Decision timestamp */
  timestamp: Date;
  /** Swarm ID */
  swarmId: string;
  /** Recommended action */
  action: ScalingAction;
  /** Target agent count */
  targetAgentCount: number;
  /** Current agent count */
  currentAgentCount: number;
  /** Reason for decision */
  reason: string;
  /** Trigger sources */
  triggers: ScalingTrigger[];
  /** Metrics at decision time */
  metrics: ScalingMetrics;
  /** Confidence level (0-1) */
  confidence: number;
  /** Whether decision was executed */
  executed?: boolean;
  /** Execution timestamp */
  executedAt?: Date;
  /** Execution result */
  executionResult?: 'success' | 'failure' | 'blocked';
  /** Block reason (if blocked) */
  blockReason?: string;
}

/**
 * Scaling event for event bus
 */
export interface ScalingEvent {
  /** Event ID */
  id: string;
  /** Event type */
  type: 'scaling.decision' | 'scaling.executed' | 'scaling.blocked' | 'scaling.error' | 'cost.alert';
  /** Timestamp */
  timestamp: Date;
  /** Swarm ID */
  swarmId: string;
  /** Event payload */
  payload: ScalingDecision | CostAlert | { error: string; details?: unknown };
}

// ============================================================================
// Auto-Scaler Configuration
// ============================================================================

/**
 * Auto-scaler configuration
 */
export interface AutoScalerConfig {
  /** Evaluation interval (seconds) */
  evaluationIntervalSeconds: number;
  /** Default scaling policy */
  defaultPolicy?: Partial<ScalingPolicy>;
  /** Predictive scaling config */
  predictive?: PredictiveScalingConfig;
  /** Cost tracking config */
  costTracking?: CostTrackingConfig;
  /** Redis URL for metrics */
  redisUrl?: string;
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum scaling operations per hour */
  maxScalingOperationsPerHour?: number;
}

/**
 * Auto-scaler state
 */
export interface AutoScalerState {
  /** Whether auto-scaler is running */
  isRunning: boolean;
  /** Last evaluation timestamp */
  lastEvaluationAt?: Date;
  /** Last scaling operation timestamp */
  lastScalingAt?: Date;
  /** Scaling operation count (for rate limiting) */
  scalingOperationCount: number;
  /** Scaling operation count reset time */
  scalingCountResetAt: Date;
  /** Active policies */
  activePolicies: Map<string, ScalingPolicy>;
  /** Recent decisions */
  recentDecisions: ScalingDecision[];
  /** Metric history */
  metricHistory: Map<string, MetricHistoryEntry[]>;
}

// ============================================================================
// Repository Types
// ============================================================================

/**
 * Scaling decision repository interface
 */
export interface IScalingDecisionRepository {
  /** Save a scaling decision */
  save(decision: ScalingDecision): Promise<void>;
  /** Get decisions for a swarm */
  getBySwarmId(swarmId: string, limit?: number): Promise<ScalingDecision[]>;
  /** Get recent decisions */
  getRecent(since: Date): Promise<ScalingDecision[]>;
}

/**
 * Cost tracking repository interface
 */
export interface ICostTrackingRepository {
  /** Record cost snapshot */
  recordCost(swarmId: string, cost: number, agentCount: number): Promise<void>;
  /** Get cost history */
  getCostHistory(swarmId: string, since: Date): Promise<{ timestamp: Date; cost: number; agentCount: number }[]>;
  /** Get current period cost */
  getCurrentPeriodCost(swarmId: string, period: BudgetConfig['period']): Promise<number>;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Scaling operation result
 */
export interface ScalingOperationResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Previous agent count */
  previousCount: number;
  /** New agent count */
  newCount: number;
  /** Operation timestamp */
  timestamp: Date;
  /** Error message (if failed) */
  error?: string;
  /** Duration of operation (ms) */
  durationMs?: number;
}

/**
 * Health status for auto-scaler
 */
export interface AutoScalerHealth {
  /** Overall status */
  status: 'healthy' | 'degraded' | 'unhealthy';
  /** Whether Redis is connected */
  redisConnected: boolean;
  /** Whether metrics collection is working */
  metricsHealthy: boolean;
  /** Last evaluation time */
  lastEvaluationAt?: Date;
  /** Evaluation lag (seconds) */
  evaluationLagSeconds?: number;
  /** Active policies count */
  activePoliciesCount: number;
  /** Recent errors */
  recentErrors: string[];
}

export interface IAutoScaler extends EventEmitter {
  start(): Promise<void>;
  stop(): Promise<void>;
  registerPolicy(policy: ScalingPolicy): void;
  unregisterPolicy(swarmId: string): void;
  getDecisionHistory(swarmId: string): ScalingDecision[];
  getHealth(): AutoScalerHealth;
}
