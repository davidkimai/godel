/**
 * Cost Tracker
 * 
 * Budget limit enforcement, cost per agent tracking, and alerting.
 */

import {
  CostTrackingConfig,
  BudgetConfig,
  CostAlert,
  CostAlertLevel,
  ScalingMetrics,
} from './types';

// ============================================================================
// Default Configuration
// ============================================================================

export const DEFAULT_COST_CONFIG: CostTrackingConfig = {
  costPerAgentHour: 0.5, // $0.50 per agent per hour (default)
  overheadCostPerHour: 0.1, // $0.10 overhead per hour
  currency: 'USD',
  trackByAgentType: false,
};

export const DEFAULT_BUDGET_ALERT_THRESHOLD = 0.75; // 75%
export const DEFAULT_BUDGET_HARD_STOP_THRESHOLD = 0.95; // 95%

// ============================================================================
// Cost Calculator
// ============================================================================

/**
 * Calculate cost for a given number of agents over a time period
 */
export function calculateCost(
  agentCount: number,
  durationHours: number,
  config: CostTrackingConfig
): number {
  const agentCost = agentCount * config.costPerAgentHour * durationHours;
  const overheadCost = (config.overheadCostPerHour || 0) * durationHours;
  return agentCost + overheadCost;
}

/**
 * Calculate hourly burn rate
 */
export function calculateHourlyBurnRate(
  agentCount: number,
  config: CostTrackingConfig
): number {
  return agentCount * config.costPerAgentHour + (config.overheadCostPerHour || 0);
}

/**
 * Estimate time remaining until budget exhaustion
 */
export function estimateBudgetExhaustion(
  currentCost: number,
  budgetLimit: number,
  agentCount: number,
  config: CostTrackingConfig
): { hoursRemaining: number | null; willExhaust: boolean } {
  const remaining = budgetLimit - currentCost;
  
  if (remaining <= 0) {
    return { hoursRemaining: 0, willExhaust: true };
  }

  const burnRate = calculateHourlyBurnRate(agentCount, config);
  
  if (burnRate <= 0) {
    return { hoursRemaining: null, willExhaust: false };
  }

  const hoursRemaining = remaining / burnRate;
  
  return {
    hoursRemaining,
    willExhaust: hoursRemaining < 24, // Warn if less than 24 hours
  };
}

// ============================================================================
// Budget Manager
// ============================================================================

/**
 * Budget state tracking
 */
interface BudgetState {
  currentCost: number;
  lastAlertLevel: CostAlertLevel | null;
  lastAlertAt: Date | null;
  periodStart: Date;
}

export class BudgetManager {
  private budgets: Map<string, BudgetConfig> = new Map();
  private budgetStates: Map<string, BudgetState> = new Map();
  private costConfig: CostTrackingConfig;
  private alertCallbacks: Array<(alert: CostAlert) => void> = [];

  constructor(costConfig: CostTrackingConfig = DEFAULT_COST_CONFIG) {
    this.costConfig = costConfig;
  }

  /**
   * Register a budget
   */
  registerBudget(config: BudgetConfig): void {
    this.budgets.set(config.swarmId, config);
    this.budgetStates.set(config.swarmId, {
      currentCost: 0,
      lastAlertLevel: null,
      lastAlertAt: null,
      periodStart: this.calculatePeriodStart(config),
    });
  }

  /**
   * Unregister a budget
   */
  unregisterBudget(swarmId: string): void {
    this.budgets.delete(swarmId);
    this.budgetStates.delete(swarmId);
  }

  /**
   * Update current cost for a swarm
   */
  updateCost(swarmId: string, currentCost: number): CostAlert | null {
    const state = this.budgetStates.get(swarmId);
    const budget = this.budgets.get(swarmId);
    
    if (!state || !budget) {
      return null;
    }

    state.currentCost = currentCost;

    // Check if period needs reset
    const periodEnd = this.calculatePeriodEnd(budget, state.periodStart);
    if (new Date() >= periodEnd) {
      state.periodStart = new Date();
      state.currentCost = 0;
      state.lastAlertLevel = null;
    }

    // Check alert thresholds
    return this.checkAlertThresholds(swarmId, currentCost, budget, state);
  }

  /**
   * Check if budget is exceeded
   */
  isBudgetExceeded(swarmId: string): boolean {
    const state = this.budgetStates.get(swarmId);
    const budget = this.budgets.get(swarmId);
    
    if (!state || !budget) {
      return false;
    }

    const percentageUsed = state.currentCost / budget.totalBudget;
    return percentageUsed >= budget.hardStopThreshold;
  }

  /**
   * Check if scaling should be blocked due to budget
   */
  shouldBlockScaling(swarmId: string, proposedAgentCount: number, durationHours: number = 1): {
    blocked: boolean;
    reason?: string;
    projectedCost: number;
  } {
    const state = this.budgetStates.get(swarmId);
    const budget = this.budgets.get(swarmId);
    
    if (!state || !budget) {
      return { blocked: false, projectedCost: state?.currentCost || 0 };
    }

    const projectedAdditionalCost = calculateCost(proposedAgentCount, durationHours, this.costConfig);
    const projectedTotal = state.currentCost + projectedAdditionalCost;
    const percentageUsed = projectedTotal / budget.totalBudget;

    if (percentageUsed >= budget.hardStopThreshold) {
      return {
        blocked: true,
        reason: `Projected cost $${projectedTotal.toFixed(2)} would exceed hard stop threshold (${(budget.hardStopThreshold * 100).toFixed(0)}%)`,
        projectedCost: projectedTotal,
      };
    }

    return {
      blocked: false,
      projectedCost: projectedTotal,
    };
  }

  /**
   * Get budget utilization percentage
   */
  getBudgetUtilization(swarmId: string): number {
    const state = this.budgetStates.get(swarmId);
    const budget = this.budgets.get(swarmId);
    
    if (!state || !budget || budget.totalBudget === 0) {
      return 0;
    }

    return state.currentCost / budget.totalBudget;
  }

  /**
   * Get budget summary
   */
  getBudgetSummary(swarmId: string): {
    totalBudget: number;
    currentCost: number;
    remaining: number;
    percentageUsed: number;
    percentageRemaining: number;
    alertThreshold: number;
    hardStopThreshold: number;
    period: BudgetConfig['period'];
    periodStart: Date;
    periodEnd: Date;
  } | null {
    const state = this.budgetStates.get(swarmId);
    const budget = this.budgets.get(swarmId);
    
    if (!state || !budget) {
      return null;
    }

    const percentageUsed = budget.totalBudget > 0 ? (state.currentCost / budget.totalBudget) * 100 : 0;
    const remaining = Math.max(0, budget.totalBudget - state.currentCost);

    return {
      totalBudget: budget.totalBudget,
      currentCost: state.currentCost,
      remaining,
      percentageUsed,
      percentageRemaining: 100 - percentageUsed,
      alertThreshold: budget.alertThreshold * 100,
      hardStopThreshold: budget.hardStopThreshold * 100,
      period: budget.period,
      periodStart: state.periodStart,
      periodEnd: this.calculatePeriodEnd(budget, state.periodStart),
    };
  }

  /**
   * Register alert callback
   */
  onAlert(callback: (alert: CostAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Remove alert callback
   */
  offAlert(callback: (alert: CostAlert) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  /**
   * Get all registered budgets
   */
  getBudgets(): Array<{ config: BudgetConfig; state: BudgetState }> {
    return Array.from(this.budgets.entries()).map(([swarmId, config]) => ({
      config,
      state: this.budgetStates.get(swarmId)!,
    }));
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculatePeriodStart(budget: BudgetConfig): Date {
    const now = new Date();
    const start = new Date(now);

    switch (budget.period) {
      case 'hourly':
        start.setMinutes(0, 0, 0);
        break;
      case 'daily':
        start.setHours(budget.resetHour || 0, 0, 0, 0);
        if (start > now) {
          start.setDate(start.getDate() - 1);
        }
        break;
      case 'weekly':
        const resetDay = budget.resetDayOfWeek || 0; // Sunday
        const dayDiff = start.getDay() - resetDay;
        if (dayDiff < 0 || (dayDiff === 0 && start.getHours() < (budget.resetHour || 0))) {
          start.setDate(start.getDate() - (dayDiff + 7));
        } else {
          start.setDate(start.getDate() - dayDiff);
        }
        start.setHours(budget.resetHour || 0, 0, 0, 0);
        break;
      case 'monthly':
        start.setDate(budget.resetDayOfMonth || 1);
        start.setHours(budget.resetHour || 0, 0, 0, 0);
        if (start > now) {
          start.setMonth(start.getMonth() - 1);
        }
        break;
    }

    return start;
  }

  private calculatePeriodEnd(budget: BudgetConfig, periodStart: Date): Date {
    const end = new Date(periodStart);

    switch (budget.period) {
      case 'hourly':
        end.setHours(end.getHours() + 1);
        break;
      case 'daily':
        end.setDate(end.getDate() + 1);
        break;
      case 'weekly':
        end.setDate(end.getDate() + 7);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
    }

    return end;
  }

  private checkAlertThresholds(
    swarmId: string,
    currentCost: number,
    budget: BudgetConfig,
    state: BudgetState
  ): CostAlert | null {
    const percentageUsed = currentCost / budget.totalBudget;
    let alertLevel: CostAlertLevel | null = null;

    if (percentageUsed >= 1.0) {
      alertLevel = 'exceeded';
    } else if (percentageUsed >= budget.hardStopThreshold) {
      alertLevel = 'critical';
    } else if (percentageUsed >= budget.alertThreshold) {
      alertLevel = 'warning';
    } else if (percentageUsed >= budget.alertThreshold * 0.8) {
      alertLevel = 'info';
    }

    // Don't repeat the same alert level within 1 hour
    if (alertLevel) {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 3600000);
      
      if (state.lastAlertLevel === alertLevel && state.lastAlertAt && state.lastAlertAt > oneHourAgo) {
        return null;
      }

      state.lastAlertLevel = alertLevel;
      state.lastAlertAt = now;

      const message = this.generateAlertMessage(alertLevel, percentageUsed, budget, currentCost);

      const alert: CostAlert = {
        id: `alert-${Date.now()}-${swarmId}`,
        swarmId,
        level: alertLevel,
        currentCost,
        budgetLimit: budget.totalBudget,
        percentageUsed: percentageUsed * 100,
        timestamp: now,
        message,
        scalingBlocked: alertLevel === 'exceeded' || alertLevel === 'critical',
      };

      // Notify callbacks
      this.alertCallbacks.forEach(cb => {
        try {
          cb(alert);
        } catch {
          // Ignore callback errors
        }
      });

      return alert;
    }

    return null;
  }

  private generateAlertMessage(
    level: CostAlertLevel,
    percentageUsed: number,
    budget: BudgetConfig,
    currentCost: number
  ): string {
    const percentage = (percentageUsed * 100).toFixed(1);
    const currency = this.costConfig.currency;

    switch (level) {
      case 'exceeded':
        return `Budget EXCEEDED: ${percentage}% ($${currentCost.toFixed(2)} / $${budget.totalBudget.toFixed(2)} ${currency}). Scaling operations blocked.`;
      case 'critical':
        return `Budget CRITICAL: ${percentage}% ($${currentCost.toFixed(2)} / $${budget.totalBudget.toFixed(2)} ${currency}). Approaching hard stop threshold.`;
      case 'warning':
        return `Budget WARNING: ${percentage}% ($${currentCost.toFixed(2)} / $${budget.totalBudget.toFixed(2)} ${currency}). Consider scaling down.`;
      case 'info':
        return `Budget INFO: ${percentage}% ($${currentCost.toFixed(2)} / $${budget.totalBudget.toFixed(2)} ${currency}).`;
      default:
        return `Budget status: ${percentage}% ($${currentCost.toFixed(2)} / $${budget.totalBudget.toFixed(2)} ${currency}).`;
    }
  }
}

// ============================================================================
// Cost Optimization Recommendations
// ============================================================================

/**
 * Get cost optimization recommendations
 */
export function getCostOptimizationRecommendations(
  metrics: ScalingMetrics,
  budgetUtilization: number,
  costConfig: CostTrackingConfig
): Array<{
  type: 'scale_down' | 'right_size' | 'schedule';
  priority: 'high' | 'medium' | 'low';
  description: string;
  potentialSavings: number;
}> {
  const recommendations: Array<{
    type: 'scale_down' | 'right_size' | 'schedule';
    priority: 'high' | 'medium' | 'low';
    description: string;
    potentialSavings: number;
  }> = [];

  // High priority: scale down if utilization is low
  if (metrics.avgCpuUtilization < 30 && metrics.queueDepth < 3) {
    const excessAgents = Math.floor(metrics.currentAgentCount * 0.3);
    const savings = calculateCost(excessAgents, 24, costConfig); // Daily savings
    
    recommendations.push({
      type: 'scale_down',
      priority: budgetUtilization > 0.8 ? 'high' : 'medium',
      description: `Low utilization detected (${metrics.avgCpuUtilization.toFixed(1)}% CPU, ${metrics.queueDepth} queued). Scale down by ~${excessAgents} agents.`,
      potentialSavings: savings,
    });
  }

  // Medium priority: right-size if completion rate is much higher than needed
  const targetCompletionRate = metrics.queueDepth * 2; // Process queue 2x faster than incoming
  if (metrics.taskCompletionRate > targetCompletionRate * 1.5) {
    const optimalAgents = Math.ceil(targetCompletionRate / 5); // 5 tasks/agent estimate
    const reduction = metrics.currentAgentCount - optimalAgents;
    const savings = calculateCost(Math.max(0, reduction), 24, costConfig);
    
    recommendations.push({
      type: 'right_size',
      priority: 'medium',
      description: `Over-provisioned: completion rate ${metrics.taskCompletionRate.toFixed(1)}/min vs needed ${targetCompletionRate.toFixed(1)}/min. Consider ${optimalAgents} agents.`,
      potentialSavings: savings,
    });
  }

  // Low priority: schedule-based optimization
  if (budgetUtilization > 0.7) {
    recommendations.push({
      type: 'schedule',
      priority: 'low',
      description: 'Consider implementing time-based scaling for off-peak hours.',
      potentialSavings: calculateCost(metrics.currentAgentCount, 8, costConfig) * 0.3, // 30% savings for 8 hours
    });
  }

  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}
