/**
 * Scaling Policies
 * 
 * Default scaling policies and policy evaluation logic.
 * Implements threshold-based scaling decisions with cooldowns.
 */

import {
  ScalingPolicy,
  ScaleUpPolicy,
  ScaleDownPolicy,
  ScalingThreshold,
  ScalingMetrics,
  ScalingDecision,
  ScalingAction,
  ScalingTrigger,
  ScalingMetric,
} from './types';

// ============================================================================
// Default Policies
// ============================================================================

/**
 * Default scale up policy
 * - Scale up when queue > 10 pending tasks OR CPU > 70%
 * - Wait 30 seconds between scale ups
 * - Add up to 10 agents at a time
 */
export const DEFAULT_SCALE_UP_POLICY: ScaleUpPolicy = {
  thresholds: [
    { metric: 'queue_depth', value: 10, operator: 'gt', weight: 0.5 },
    { metric: 'agent_cpu_percent', value: 70, operator: 'gt', weight: 0.3 },
    { metric: 'agent_memory_percent', value: 80, operator: 'gt', weight: 0.2 },
  ],
  increment: 'auto',
  maxIncrement: 10,
  cooldownSeconds: 30,
  requireAllThresholds: false,
};

/**
 * Default scale down policy
 * - Scale down when queue < 3 pending tasks AND CPU < 30%
 * - Wait 5 minutes between scale downs
 * - Keep at least 5 agents
 */
export const DEFAULT_SCALE_DOWN_POLICY: ScaleDownPolicy = {
  thresholds: [
    { metric: 'queue_depth', value: 3, operator: 'lt', weight: 0.4 },
    { metric: 'agent_cpu_percent', value: 30, operator: 'lt', weight: 0.3 },
    { metric: 'agent_memory_percent', value: 40, operator: 'lt', weight: 0.3 },
  ],
  decrement: 'auto',
  minAgents: 5,
  cooldownSeconds: 300, // 5 minutes
  requireAllThresholds: true,
  gracefulShutdownSeconds: 60,
};

/**
 * Create a default scaling policy for a team
 */
export function createDefaultScalingPolicy(
  teamId: string,
  minAgents: number = 5,
  maxAgents: number = 50,
  overrides?: Partial<ScalingPolicy>
): ScalingPolicy {
  return {
    teamId,
    minAgents: Math.max(1, minAgents),
    maxAgents: Math.max(minAgents, maxAgents),
    scaleUp: { ...DEFAULT_SCALE_UP_POLICY },
    scaleDown: { ...DEFAULT_SCALE_DOWN_POLICY, minAgents },
    targets: {
      targetQueueDepth: 5,
      targetCpuUtilization: 50,
      targetMemoryUtilization: 60,
    },
    predictiveScaling: true,
    costAwareScaling: true,
    ...overrides,
  };
}

/**
 * Aggressive scaling policy for high-throughput scenarios
 */
export function createAggressiveScalingPolicy(
  teamId: string,
  minAgents: number = 10,
  maxAgents: number = 100
): ScalingPolicy {
  return {
    teamId,
    minAgents,
    maxAgents,
    scaleUp: {
      thresholds: [
        { metric: 'queue_depth', value: 5, operator: 'gt', weight: 0.6 },
        { metric: 'agent_cpu_percent', value: 60, operator: 'gt', weight: 0.4 },
      ],
      increment: 'auto',
      maxIncrement: 20,
      cooldownSeconds: 15,
      requireAllThresholds: false,
    },
    scaleDown: {
      thresholds: [
        { metric: 'queue_depth', value: 2, operator: 'lt', weight: 0.5 },
        { metric: 'agent_cpu_percent', value: 20, operator: 'lt', weight: 0.5 },
      ],
      decrement: 'auto',
      minAgents,
      cooldownSeconds: 180, // 3 minutes
      requireAllThresholds: true,
      gracefulShutdownSeconds: 30,
    },
    targets: {
      targetQueueDepth: 3,
      targetCpuUtilization: 50,
      targetMemoryUtilization: 60,
    },
    predictiveScaling: true,
    costAwareScaling: true,
  };
}

/**
 * Conservative scaling policy for cost-sensitive scenarios
 */
export function createConservativeScalingPolicy(
  teamId: string,
  minAgents: number = 3,
  maxAgents: number = 30
): ScalingPolicy {
  return {
    teamId,
    minAgents,
    maxAgents,
    scaleUp: {
      thresholds: [
        { metric: 'queue_depth', value: 20, operator: 'gt', weight: 0.5 },
        { metric: 'agent_cpu_percent', value: 80, operator: 'gt', weight: 0.5 },
      ],
      increment: 2,
      maxIncrement: 5,
      cooldownSeconds: 60,
      requireAllThresholds: true,
    },
    scaleDown: {
      thresholds: [
        { metric: 'queue_depth', value: 5, operator: 'lt', weight: 0.5 },
        { metric: 'agent_cpu_percent', value: 25, operator: 'lt', weight: 0.5 },
      ],
      decrement: 1,
      minAgents,
      cooldownSeconds: 600, // 10 minutes
      requireAllThresholds: true,
      gracefulShutdownSeconds: 120,
    },
    targets: {
      targetQueueDepth: 10,
      targetCpuUtilization: 60,
      targetMemoryUtilization: 70,
    },
    predictiveScaling: false,
    costAwareScaling: true,
  };
}

// ============================================================================
// Policy Evaluation
// ============================================================================

/**
 * Evaluate a single threshold against metrics
 */
export function evaluateThreshold(
  threshold: ScalingThreshold,
  metrics: ScalingMetrics
): { breached: boolean; value: number; threshold: number } {
  const value = getMetricValue(threshold.metric, metrics);
  const thresholdValue = threshold.value;
  let breached = false;

  switch (threshold.operator) {
    case 'gt':
      breached = value > thresholdValue;
      break;
    case 'gte':
      breached = value >= thresholdValue;
      break;
    case 'lt':
      breached = value < thresholdValue;
      break;
    case 'lte':
      breached = value <= thresholdValue;
      break;
    case 'eq':
      breached = value === thresholdValue;
      break;
  }

  return { breached, value, threshold: thresholdValue };
}

/**
 * Get the value of a specific metric from metrics snapshot
 */
export function getMetricValue(metric: ScalingMetric, metrics: ScalingMetrics): number {
  switch (metric) {
    case 'queue_depth':
      return metrics.queueDepth;
    case 'queue_growth_rate':
      return metrics.queueGrowthRate;
    case 'agent_cpu_percent':
      return metrics.avgCpuUtilization;
    case 'agent_memory_percent':
      return metrics.avgMemoryUtilization;
    case 'event_backlog_size':
      return metrics.eventBacklogSize;
    case 'agent_utilization':
      // Calculate utilization based on task completion rate
      return metrics.taskCompletionRate > 0 
        ? Math.min(100, (metrics.taskCompletionRate / metrics.currentAgentCount) * 100)
        : 0;
    case 'task_completion_rate':
      return metrics.taskCompletionRate;
    default:
      return 0;
  }
}

/**
 * Normalize legacy policy format to new format
 */
function normalizeLegacyPolicy(policy: ScalingPolicy): ScalingPolicy {
  // Check if it's already normalized
  if (policy.scaleUp?.thresholds && Array.isArray(policy.scaleUp.thresholds)) {
    return policy;
  }

  // Cast to check for legacy properties
  const legacy = policy as unknown as {
    queueDepthThresholds?: { scaleUp?: number; scaleDown?: number };
    cpuUtilizationThresholds?: { scaleUp?: number; scaleDown?: number };
    cooldownSeconds?: number;
    teamId?: string;
  };

  // Check if this is a legacy policy (has queueDepthThresholds, cpuUtilizationThresholds, or just cooldownSeconds without scaleUp)
  if (legacy.queueDepthThresholds || legacy.cpuUtilizationThresholds || 
      (legacy.cooldownSeconds && !policy.scaleUp)) {
    const teamId = legacy.teamId || (policy as ScalingPolicy).teamId || 'test-team';
    const minAgents = (policy as ScalingPolicy).minAgents ?? 1;
    const maxAgents = (policy as ScalingPolicy).maxAgents ?? 10;
    const cooldown = legacy.cooldownSeconds || 60;

    const scaleUpThresholds = [];
    if (legacy.queueDepthThresholds?.scaleUp !== undefined) {
      scaleUpThresholds.push({ metric: 'queue_depth' as const, value: legacy.queueDepthThresholds.scaleUp, operator: 'gt' as const, weight: 0.5 });
    }
    if (legacy.cpuUtilizationThresholds?.scaleUp !== undefined) {
      scaleUpThresholds.push({ metric: 'agent_cpu_percent' as const, value: legacy.cpuUtilizationThresholds.scaleUp, operator: 'gt' as const, weight: 0.3 });
    }
    if (scaleUpThresholds.length === 0) {
      scaleUpThresholds.push({ metric: 'queue_depth' as const, value: 5, operator: 'gt' as const, weight: 1.0 });
    }

    return {
      teamId,
      minAgents,
      maxAgents,
      scaleUp: { thresholds: scaleUpThresholds, increment: 'auto', maxIncrement: 5, cooldownSeconds: cooldown, requireAllThresholds: false },
      scaleDown: {
        thresholds: [
          { metric: 'queue_depth' as const, value: legacy.queueDepthThresholds?.scaleDown ?? 1, operator: 'lt' as const, weight: 0.5 },
          { metric: 'agent_cpu_percent' as const, value: legacy.cpuUtilizationThresholds?.scaleDown ?? 20, operator: 'lt' as const, weight: 0.3 },
        ],
        decrement: 'auto',
        minAgents,
        cooldownSeconds: cooldown * 2,
        requireAllThresholds: true,
      },
    };
  }

  return policy;
}

/**
 * Evaluate scale up policy
 */
export function evaluateScaleUpPolicy(
  policy: ScaleUpPolicy,
  metrics: ScalingMetrics,
  lastScaleUpAt?: Date
): { shouldScale: boolean; score: number; triggers: ScalingTrigger[]; reason: string } {
  // Handle missing policy (from legacy format)
  if (!policy || !policy.thresholds) {
    return { shouldScale: false, score: 0, triggers: [], reason: 'No scale up policy configured' };
  }

  const triggers: ScalingTrigger[] = [];
  let totalWeight = 0;
  let triggeredWeight = 0;

  // Check each threshold
  for (const threshold of policy.thresholds) {
    const { breached, value, threshold: thresholdValue } = evaluateThreshold(threshold, metrics);
    const weight = threshold.weight || 1 / policy.thresholds.length;
    totalWeight += weight;

    if (breached) {
      triggeredWeight += weight;
      triggers.push(getTriggerForMetric(threshold.metric));
    }
  }

  // Calculate score (0-1)
  const score = totalWeight > 0 ? triggeredWeight / totalWeight : 0;

  // Determine if we should scale
  const shouldScale = policy.requireAllThresholds
    ? score >= 1
    : score > 0;

  // Check cooldown
  const now = new Date();
  if (lastScaleUpAt && shouldScale) {
    const cooldownMs = policy.cooldownSeconds * 1000;
    if (now.getTime() - lastScaleUpAt.getTime() < cooldownMs) {
      return {
        shouldScale: false,
        score,
        triggers,
        reason: `Scale up cooldown active (${policy.cooldownSeconds}s)`,
      };
    }
  }

  const reason = shouldScale
    ? `Scale up triggered: ${triggers.join(', ')} (${Math.round(score * 100)}% confidence)`
    : triggers.length > 0
    ? `Scale up thresholds partially met but requireAllThresholds=${policy.requireAllThresholds}`
    : 'No scale up thresholds breached';

  return { shouldScale, score, triggers, reason };
}

/**
 * Evaluate scale down policy
 */
export function evaluateScaleDownPolicy(
  policy: ScaleDownPolicy,
  metrics: ScalingMetrics,
  lastScaleDownAt?: Date
): { shouldScale: boolean; score: number; triggers: ScalingTrigger[]; reason: string } {
  // Handle missing policy (from legacy format)
  if (!policy || !policy.thresholds) {
    return { shouldScale: false, score: 0, triggers: [], reason: 'No scale down policy configured' };
  }

  const triggers: ScalingTrigger[] = [];
  let totalWeight = 0;
  let triggeredWeight = 0;

  // Check minimum agents
  if (metrics.currentAgentCount <= (policy.minAgents ?? 1)) {
    return {
      shouldScale: false,
      score: 0,
      triggers: [],
      reason: `At minimum agent count (${policy.minAgents})`,
    };
  }

  // Check each threshold
  for (const threshold of policy.thresholds) {
    const { breached, value, threshold: thresholdValue } = evaluateThreshold(threshold, metrics);
    const weight = threshold.weight || 1 / policy.thresholds.length;
    totalWeight += weight;

    if (breached) {
      triggeredWeight += weight;
      triggers.push(getTriggerForMetric(threshold.metric));
    }
  }

  // Calculate score (0-1)
  const score = totalWeight > 0 ? triggeredWeight / totalWeight : 0;

  // Determine if we should scale
  const shouldScale = policy.requireAllThresholds
    ? score >= 1
    : score > 0;

  // Check cooldown
  const now = new Date();
  if (lastScaleDownAt && shouldScale) {
    const cooldownMs = policy.cooldownSeconds * 1000;
    if (now.getTime() - lastScaleDownAt.getTime() < cooldownMs) {
      return {
        shouldScale: false,
        score,
        triggers,
        reason: `Scale down cooldown active (${policy.cooldownSeconds}s)`,
      };
    }
  }

  const reason = shouldScale
    ? `Scale down triggered: ${triggers.join(', ')} (${Math.round(score * 100)}% confidence)`
    : triggers.length > 0
    ? `Scale down thresholds partially met but requireAllThresholds=${policy.requireAllThresholds}`
    : 'No scale down thresholds breached';

  return { shouldScale, score, triggers, reason };
}

/**
 * Get trigger type for a metric
 */
function getTriggerForMetric(metric: ScalingMetric): ScalingTrigger {
  switch (metric) {
    case 'queue_depth':
    case 'queue_growth_rate':
      return 'queue_depth';
    case 'agent_cpu_percent':
      return 'cpu_utilization';
    case 'agent_memory_percent':
      return 'memory_utilization';
    case 'event_backlog_size':
      return 'event_backlog';
    default:
      return 'queue_depth';
  }
}

/**
 * Calculate the number of agents to add
 */
export function calculateScaleUpIncrement(
  policy: ScaleUpPolicy,
  metrics: ScalingMetrics,
  currentCount: number,
  maxAgents: number
): number {
  let increment: number;

  if (typeof policy.increment === 'number') {
    increment = policy.increment;
  } else {
    // Auto-calculate based on queue depth
    const targetQueueDepth = 5; // Target 5 tasks per agent
    const targetAgents = Math.ceil(metrics.queueDepth / targetQueueDepth);
    increment = Math.max(1, targetAgents - currentCount);
  }

  // Apply max increment limit
  if (policy.maxIncrement) {
    increment = Math.min(increment, policy.maxIncrement);
  }

  // Don't exceed max agents
  const availableSlots = maxAgents - currentCount;
  increment = Math.min(increment, availableSlots);

  return Math.max(0, increment);
}

/**
 * Calculate the number of agents to remove
 */
export function calculateScaleDownDecrement(
  policy: ScaleDownPolicy,
  metrics: ScalingMetrics,
  currentCount: number
): number {
  let decrement: number;

  if (typeof policy.decrement === 'number') {
    decrement = policy.decrement;
  } else {
    // Auto-calculate based on queue depth
    const targetQueueDepth = 5; // Target 5 tasks per agent
    const targetAgents = Math.max(policy.minAgents, Math.ceil(metrics.queueDepth / targetQueueDepth));
    decrement = Math.max(0, currentCount - targetAgents);
  }

  // Don't go below minimum
  const minRemovable = currentCount - policy.minAgents;
  decrement = Math.min(decrement, minRemovable);

  return Math.max(0, decrement);
}

/**
 * Evaluate complete scaling policy and make a decision
 */
export function evaluateScalingPolicy(
  policy: ScalingPolicy,
  metrics: ScalingMetrics,
  lastScaleUpAt?: Date,
  lastScaleDownAt?: Date,
  budgetExceeded?: boolean
): ScalingDecision {
  // Normalize legacy policy formats
  policy = normalizeLegacyPolicy(policy);
  
  const timestamp = new Date();

  // Check budget constraint
  if (budgetExceeded) {
    // Force scale down if budget exceeded
    const decrement = calculateScaleDownDecrement(policy.scaleDown, metrics, metrics.currentAgentCount);
    const targetCount = Math.max(policy.minAgents, metrics.currentAgentCount - decrement);

    return {
      timestamp,
      teamId: policy.teamId,
      action: 'scale_down',
      targetAgentCount: targetCount,
      currentAgentCount: metrics.currentAgentCount,
      reason: 'Budget exceeded - forced scale down',
      triggers: ['budget'],
      metrics,
      confidence: 1.0,
    };
  }

  // Evaluate scale up
  const scaleUpResult = evaluateScaleUpPolicy(policy.scaleUp, metrics, lastScaleUpAt);
  
  // Evaluate scale down
  const scaleDownResult = evaluateScaleDownPolicy(policy.scaleDown, metrics, lastScaleDownAt);

  // Prioritize scale up over scale down
  let action: ScalingAction;
  let targetCount: number;
  let reason: string;
  let triggers: ScalingTrigger[];
  let confidence: number;

  if (scaleUpResult.shouldScale) {
    const increment = calculateScaleUpIncrement(
      policy.scaleUp,
      metrics,
      metrics.currentAgentCount,
      policy.maxAgents
    );
    
    if (increment > 0) {
      action = 'scale_up';
      targetCount = Math.min(policy.maxAgents, metrics.currentAgentCount + increment);
      reason = scaleUpResult.reason;
      triggers = scaleUpResult.triggers;
      confidence = scaleUpResult.score;
    } else {
      action = 'maintain';
      targetCount = metrics.currentAgentCount;
      reason = 'At maximum agent count';
      triggers = [];
      confidence = 0;
    }
  } else if (scaleDownResult.shouldScale) {
    const decrement = calculateScaleDownDecrement(policy.scaleDown, metrics, metrics.currentAgentCount);
    
    if (decrement > 0) {
      action = 'scale_down';
      targetCount = Math.max(policy.minAgents, metrics.currentAgentCount - decrement);
      reason = scaleDownResult.reason;
      triggers = scaleDownResult.triggers;
      confidence = scaleDownResult.score;
    } else {
      action = 'maintain';
      targetCount = metrics.currentAgentCount;
      reason = 'At minimum agent count';
      triggers = [];
      confidence = 0;
    }
  } else {
    action = 'maintain';
    targetCount = metrics.currentAgentCount;
    
    // Combine reasons
    const reasons: string[] = [];
    if (scaleUpResult.triggers.length > 0) {
      reasons.push(`Scale up: ${scaleUpResult.reason}`);
    }
    if (scaleDownResult.triggers.length > 0) {
      reasons.push(`Scale down: ${scaleDownResult.reason}`);
    }
    reason = reasons.length > 0 ? reasons.join('; ') : 'No scaling needed';
    triggers = [];
    confidence = 0;
  }

  return {
    timestamp,
    teamId: policy.teamId,
    action,
    targetAgentCount: targetCount,
    currentAgentCount: metrics.currentAgentCount,
    reason,
    triggers,
    metrics,
    confidence,
  };
}
