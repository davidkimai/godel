/**
 * Predictive Scaling
 * 
 * Time-based scaling, queue growth rate detection, and pre-warming capabilities.
 */

import {
  PredictiveScalingConfig,
  ScalingSchedule,
  QueuePrediction,
  ScalingDecision,
  ScalingMetrics,
  ScalingAction,
} from './types';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_PREDICTIVE_CONFIG: PredictiveScalingConfig = {
  enableQueuePrediction: true,
  enableScheduleScaling: true,
  predictionWindowSeconds: 300, // 5 minutes
  preWarm: {
    enabled: true,
    leadTimeMinutes: 10,
    agentCount: 10,
  },
  schedules: [],
};

// ============================================================================
// Queue Growth Prediction
// ============================================================================

/**
 * Queue growth history entry
 */
interface QueueHistoryEntry {
  timestamp: Date;
  queueDepth: number;
  taskCompletionRate: number;
}

/**
 * Track queue history for prediction
 */
export class QueueGrowthTracker {
  private history: QueueHistoryEntry[] = [];
  private maxHistorySize: number = 100;
  private historyWindowMs: number = 600000; // 10 minutes

  /**
   * Record a metrics snapshot
   */
  record(metrics: ScalingMetrics): void {
    const entry: QueueHistoryEntry = {
      timestamp: new Date(),
      queueDepth: metrics.queueDepth,
      taskCompletionRate: metrics.taskCompletionRate,
    };

    this.history.push(entry);
    this.pruneHistory();
  }

  /**
   * Get queue growth rate (tasks per minute)
   */
  getGrowthRate(): number {
    if (this.history.length < 2) {
      return 0;
    }

    const recent = this.history.slice(-10); // Last 10 samples
    const oldest = recent[0];
    const newest = recent[recent.length - 1];
    
    const timeDiffMinutes = (newest.timestamp.getTime() - oldest.timestamp.getTime()) / 60000;
    
    if (timeDiffMinutes < 0.5) {
      return 0; // Not enough time passed
    }

    const queueDiff = newest.queueDepth - oldest.queueDepth;
    const growthRate = queueDiff / timeDiffMinutes;

    return growthRate;
  }

  /**
   * Predict queue depth at a future time
   */
  predictQueueDepth(horizonSeconds: number): QueuePrediction {
    const growthRatePerSecond = this.getGrowthRate() / 60;
    const currentDepth = this.getCurrentQueueDepth();
    
    const predictedGrowth = growthRatePerSecond * horizonSeconds;
    const predictedDepth = Math.max(0, currentDepth + predictedGrowth);
    
    // Calculate confidence based on history size and consistency
    const confidence = this.calculateConfidence();
    
    // Determine recommendation
    let recommendation: 'scale_up' | 'scale_down' | 'maintain' = 'maintain';
    let recommendedAgents: number | undefined;

    if (growthRatePerSecond > 0.5) {
      recommendation = 'scale_up';
      // Recommend agents based on predicted queue
      recommendedAgents = Math.ceil(predictedDepth / 5); // 5 tasks per agent
    } else if (growthRatePerSecond < -0.5 && currentDepth < 5) {
      recommendation = 'scale_down';
    }

    return {
      predictedDepth: Math.round(predictedDepth),
      confidence,
      timestamp: new Date(),
      horizonSeconds,
      recommendation,
      recommendedAgents,
    };
  }

  /**
   * Check if pre-warming is needed
   */
  shouldPreWarm(leadTimeMinutes: number): { needed: boolean; reason?: string } {
    const prediction = this.predictQueueDepth(leadTimeMinutes * 60);
    
    if (prediction.confidence < 0.5) {
      return { needed: false, reason: 'Low prediction confidence' };
    }

    if (prediction.recommendation === 'scale_up' && prediction.predictedDepth > 20) {
      return {
        needed: true,
        reason: `Predicted queue depth ${prediction.predictedDepth} in ${leadTimeMinutes} minutes`,
      };
    }

    return { needed: false };
  }

  /**
   * Get current queue depth
   */
  private getCurrentQueueDepth(): number {
    if (this.history.length === 0) {
      return 0;
    }
    return this.history[this.history.length - 1].queueDepth;
  }

  /**
   * Calculate prediction confidence (0-1)
   */
  private calculateConfidence(): number {
    if (this.history.length < 5) {
      return 0.3; // Low confidence with limited data
    }

    if (this.history.length < 20) {
      return 0.6; // Medium confidence
    }

    // Check variance in growth rates
    const rates: number[] = [];
    for (let i = 1; i < this.history.length; i++) {
      const timeDiff = (this.history[i].timestamp.getTime() - this.history[i - 1].timestamp.getTime()) / 60000;
      if (timeDiff > 0) {
        const queueDiff = this.history[i].queueDepth - this.history[i - 1].queueDepth;
        rates.push(queueDiff / timeDiff);
      }
    }

    if (rates.length < 2) {
      return 0.5;
    }

    // Calculate variance
    const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
    const variance = rates.reduce((sum, rate) => sum + Math.pow(rate - mean, 2), 0) / rates.length;
    const stdDev = Math.sqrt(variance);

    // Lower variance = higher confidence
    const confidence = Math.max(0, Math.min(1, 1 - (stdDev / Math.abs(mean + 1))));
    
    return Math.max(0.4, confidence); // Minimum 40% confidence
  }

  /**
   * Remove old history entries
   */
  private pruneHistory(): void {
    const cutoff = new Date(Date.now() - this.historyWindowMs);
    
    // Remove entries older than window
    this.history = this.history.filter(entry => entry.timestamp > cutoff);
    
    // Keep max size
    if (this.history.length > this.maxHistorySize) {
      this.history = this.history.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get history for debugging
   */
  getHistory(): QueueHistoryEntry[] {
    return [...this.history];
  }

  /**
   * Clear history
   */
  clear(): void {
    this.history = [];
  }
}

// ============================================================================
// Time-Based Scaling
// ============================================================================

/**
 * Parse cron expression (simplified - supports basic patterns)
 * Supports: * * * * * (minute hour day month weekday)
 * Or: @hourly, @daily, @weekly
 */
export function parseCronExpression(cron: string): { nextRun: Date; isDue: boolean } {
  const now = new Date();
  
  // Handle special expressions
  if (cron === '@hourly') {
    const next = new Date(now);
    next.setHours(next.getHours() + 1);
    next.setMinutes(0);
    next.setSeconds(0);
    return { nextRun: next, isDue: now.getMinutes() === 0 };
  }
  
  if (cron === '@daily') {
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(0);
    next.setMinutes(0);
    next.setSeconds(0);
    const isDue = now.getHours() === 0 && now.getMinutes() === 0;
    return { nextRun: next, isDue };
  }
  
  if (cron === '@weekly') {
    const next = new Date(now);
    next.setDate(next.getDate() + (7 - next.getDay()));
    next.setHours(0);
    next.setMinutes(0);
    next.setSeconds(0);
    const isDue = now.getDay() === 0 && now.getHours() === 0 && now.getMinutes() === 0;
    return { nextRun: next, isDue };
  }

  // Parse standard cron: minute hour day month weekday
  const parts = cron.split(' ');
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression: ${cron}`);
  }

  const [minute, hour, day, month, weekday] = parts;
  
  // Check if due now (simplified - exact match only)
  const isDue = 
    (minute === '*' || parseInt(minute) === now.getMinutes()) &&
    (hour === '*' || parseInt(hour) === now.getHours()) &&
    (day === '*' || parseInt(day) === now.getDate()) &&
    (month === '*' || parseInt(month) === now.getMonth() + 1) &&
    (weekday === '*' || parseInt(weekday) === now.getDay());

  // Calculate next run (simplified)
  const nextRun = new Date(now);
  nextRun.setMinutes(parseInt(minute) || 0);
  if (nextRun <= now) {
    nextRun.setHours(nextRun.getHours() + 1);
  }

  return { nextRun, isDue };
}

/**
 * Check if a schedule is currently active
 */
export function isScheduleActive(schedule: ScalingSchedule): boolean {
  if (!schedule.enabled) {
    return false;
  }

  try {
    const { isDue } = parseCronExpression(schedule.cron);
    return isDue;
  } catch {
    return false;
  }
}

/**
 * Get the target agent count from active schedules
 */
export function getScheduledTargetAgents(schedules: ScalingSchedule[]): number | null {
  for (const schedule of schedules) {
    if (isScheduleActive(schedule)) {
      return schedule.targetAgents;
    }
  }
  return null;
}

// ============================================================================
// Predictive Scaling Decision
// ============================================================================

/**
 * Make a predictive scaling decision
 */
export function makePredictiveDecision(
  config: PredictiveScalingConfig,
  metrics: ScalingMetrics,
  queueTracker: QueueGrowthTracker,
  minAgents: number,
  maxAgents: number
): ScalingDecision | null {
  const timestamp = new Date();

  // Check time-based schedules first
  if (config.enableScheduleScaling && config.schedules && config.schedules.length > 0) {
    const scheduledTarget = getScheduledTargetAgents(config.schedules);
    
    if (scheduledTarget !== null) {
      const action: ScalingAction = scheduledTarget > metrics.currentAgentCount
        ? 'scale_up'
        : scheduledTarget < metrics.currentAgentCount
        ? 'scale_down'
        : 'maintain';

      if (action !== 'maintain') {
        return {
          timestamp,
          teamId: metrics.teamId,
          action,
          targetAgentCount: Math.max(minAgents, Math.min(maxAgents, scheduledTarget)),
          currentAgentCount: metrics.currentAgentCount,
          reason: 'Time-based schedule triggered',
          triggers: ['schedule'],
          metrics,
          confidence: 1.0,
        };
      }
    }
  }

  // Check queue prediction
  if (config.enableQueuePrediction) {
    const prediction = queueTracker.predictQueueDepth(config.predictionWindowSeconds);
    
    if (prediction.confidence >= 0.6) {
      if (prediction.recommendation === 'scale_up' && prediction.recommendedAgents) {
        const targetCount = Math.max(minAgents, Math.min(maxAgents, prediction.recommendedAgents));
        
        if (targetCount > metrics.currentAgentCount) {
          return {
            timestamp,
            teamId: metrics.teamId,
            action: 'scale_up',
            targetAgentCount: targetCount,
            currentAgentCount: metrics.currentAgentCount,
            reason: `Predicted queue depth ${prediction.predictedDepth} in ${config.predictionWindowSeconds / 60} minutes`,
            triggers: ['prediction'],
            metrics,
            confidence: prediction.confidence,
          };
        }
      } else if (prediction.recommendation === 'scale_down' && metrics.currentAgentCount > minAgents) {
        const targetCount = Math.max(minAgents, Math.ceil(metrics.currentAgentCount * 0.8));
        
        return {
          timestamp,
          teamId: metrics.teamId,
          action: 'scale_down',
          targetAgentCount: targetCount,
          currentAgentCount: metrics.currentAgentCount,
          reason: `Predicted queue depth ${prediction.predictedDepth} in ${config.predictionWindowSeconds / 60} minutes`,
          triggers: ['prediction'],
          metrics,
          confidence: prediction.confidence,
        };
      }
    }
  }

  // Check pre-warming
  if (config.preWarm?.enabled) {
    const preWarmCheck = queueTracker.shouldPreWarm(config.preWarm.leadTimeMinutes);
    
    if (preWarmCheck.needed) {
      const targetCount = Math.max(minAgents, Math.min(maxAgents, config.preWarm.agentCount));
      
      if (targetCount > metrics.currentAgentCount) {
        return {
          timestamp,
          teamId: metrics.teamId,
          action: 'scale_up',
          targetAgentCount: targetCount,
          currentAgentCount: metrics.currentAgentCount,
          reason: `Pre-warming: ${preWarmCheck.reason}`,
          triggers: ['prediction'],
          metrics,
          confidence: 0.7,
        };
      }
    }
  }

  return null;
}

// ============================================================================
// Common Schedules
// ============================================================================

/**
 * Create business hours schedule (9 AM - 6 PM weekdays)
 */
export function createBusinessHoursSchedule(
  id: string,
  targetAgents: number,
  timezone: string = 'America/New_York'
): ScalingSchedule {
  return {
    id,
    cron: '0 9 * * 1-5', // 9 AM Monday-Friday
    targetAgents,
    description: 'Business hours start - scale up',
    timezone,
    enabled: true,
  };
}

/**
 * Create after-hours schedule
 */
export function createAfterHoursSchedule(
  id: string,
  targetAgents: number,
  timezone: string = 'America/New_York'
): ScalingSchedule {
  return {
    id,
    cron: '0 18 * * 1-5', // 6 PM Monday-Friday
    targetAgents,
    description: 'After hours - scale down',
    timezone,
    enabled: true,
  };
}

/**
 * Create weekend schedule
 */
export function createWeekendSchedule(
  id: string,
  targetAgents: number,
  timezone: string = 'America/New_York'
): ScalingSchedule {
  return {
    id,
    cron: '0 0 * * 0,6', // Midnight Saturday and Sunday
    targetAgents,
    description: 'Weekend - minimum agents',
    timezone,
    enabled: true,
  };
}
