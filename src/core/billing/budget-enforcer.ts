/**
 * Agent_8: Budget Enforcer
 * Enforces budget limits: 80% alerts, 100% stop
 */

import { EventEmitter } from 'eventemitter3';
import CostTracker, { CostAlert } from './cost-tracker';

export interface BudgetConfig {
  agentId: string;
  monthlyBudget: number;
  alertThresholds: number[]; // Percentages (e.g., [50, 80, 95])
  hardStopAt: number; // Percentage to stop execution
  resetDay?: number; // Day of month to reset (1-31)
}

export interface BudgetStatus {
  agentId: string;
  budget: number;
  spent: number;
  remaining: number;
  percentage: number;
  status: 'healthy' | 'warning' | 'critical' | 'exceeded';
  lastAlert?: Date;
  nextReset?: Date;
}

export interface EnforcementAction {
  type: 'alert' | 'throttle' | 'block';
  agentId: string;
  reason: string;
  timestamp: Date;
  allowed: boolean;
}

export class BudgetEnforcer extends EventEmitter {
  private budgets: Map<string, BudgetConfig> = new Map();
  private costTracker: CostTracker;
  private lastAlerts: Map<string, number> = new Map();
  private blockedAgents: Set<string> = new Set();
  private alertCooldownMs: number = 3600000; // 1 hour between same alerts

  constructor(costTracker: CostTracker) {
    super();
    this.costTracker = costTracker;
    this.setupCostListener();
  }

  private setupCostListener(): void {
    this.costTracker.on('cost:recorded', (entry) => {
      this.checkBudget(entry.agentId);
    });
  }

  setBudget(config: BudgetConfig): void {
    // Sort thresholds ascending
    config.alertThresholds = [...config.alertThresholds].sort((a, b) => a - b);
    
    this.budgets.set(config.agentId, config);
    this.emit('budget:set', { agentId: config.agentId, budget: config.monthlyBudget });
    
    // Initial check
    this.checkBudget(config.agentId);
  }

  getBudget(agentId: string): BudgetConfig | undefined {
    return this.budgets.get(agentId);
  }

  removeBudget(agentId: string): boolean {
    const removed = this.budgets.delete(agentId);
    if (removed) {
      this.blockedAgents.delete(agentId);
      this.emit('budget:removed', { agentId });
    }
    return removed;
  }

  checkBudget(agentId: string): BudgetStatus {
    const config = this.budgets.get(agentId);
    if (!config) {
      return {
        agentId,
        budget: 0,
        spent: 0,
        remaining: 0,
        percentage: 0,
        status: 'healthy'
      };
    }

    const summary = this.costTracker.getAgentSummary(agentId);
    const spent = summary?.totalCost || 0;
    const remaining = config.monthlyBudget - spent;
    const percentage = config.monthlyBudget > 0 ? (spent / config.monthlyBudget) * 100 : 0;

    let status: BudgetStatus['status'] = 'healthy';
    
    if (percentage >= 100) {
      status = 'exceeded';
    } else if (percentage >= 80) {
      status = 'critical';
    } else if (percentage >= 50) {
      status = 'warning';
    }

    // Check if we should send alert
    const thresholdHit = config.alertThresholds.find(t => percentage >= t && !this.hasAlertedRecently(agentId, t));
    if (thresholdHit !== undefined) {
      this.sendAlert(agentId, thresholdHit, spent, config.monthlyBudget);
    }

    // Check if we should block
    if (percentage >= config.hardStopAt) {
      this.blockAgent(agentId, percentage);
    }

    const budgetStatus: BudgetStatus = {
      agentId,
      budget: config.monthlyBudget,
      spent,
      remaining,
      percentage,
      status,
      lastAlert: this.getLastAlertTime(agentId),
      nextReset: this.calculateNextReset(config)
    };

    this.emit('budget:status', budgetStatus);
    return budgetStatus;
  }

  canExecute(agentId: string): EnforcementAction {
    if (this.blockedAgents.has(agentId)) {
      const status = this.checkBudget(agentId);
      return {
        type: 'block',
        agentId,
        reason: `Budget exceeded: ${status.percentage.toFixed(1)}% of limit`,
        timestamp: new Date(),
        allowed: false
      };
    }

    const config = this.budgets.get(agentId);
    if (!config) {
      return {
        type: 'alert',
        agentId,
        reason: 'No budget configured',
        timestamp: new Date(),
        allowed: true
      };
    }

    const status = this.checkBudget(agentId);
    
    if (status.percentage >= 95) {
      return {
        type: 'throttle',
        agentId,
        reason: `Budget critical: ${status.percentage.toFixed(1)}% of limit`,
        timestamp: new Date(),
        allowed: true
      };
    }

    return {
      type: 'alert',
      agentId,
      reason: 'Within budget',
      timestamp: new Date(),
      allowed: true
    };
  }

  private hasAlertedRecently(agentId: string, threshold: number): boolean {
    const key = `${agentId}-${threshold}`;
    const lastAlert = this.lastAlerts.get(key);
    if (!lastAlert) return false;
    return Date.now() - lastAlert < this.alertCooldownMs;
  }

  private sendAlert(agentId: string, threshold: number, spent: number, budget: number): void {
    const key = `${agentId}-${threshold}`;
    this.lastAlerts.set(key, Date.now());

    const alert: CostAlert = {
      type: threshold >= 100 ? 'critical' : 'warning',
      agentId,
      message: `Budget threshold reached: ${threshold}% ($${spent.toFixed(2)} / $${budget.toFixed(2)})`,
      currentCost: spent,
      threshold: budget * (threshold / 100),
      timestamp: new Date()
    };

    this.emit('budget:alert', alert);
  }

  private getLastAlertTime(agentId: string): Date | undefined {
    let lastTime = 0;
    for (const [key, time] of this.lastAlerts) {
      if (key.startsWith(`${agentId}-`)) {
        lastTime = Math.max(lastTime, time);
      }
    }
    return lastTime > 0 ? new Date(lastTime) : undefined;
  }

  private blockAgent(agentId: string, percentage: number): void {
    if (!this.blockedAgents.has(agentId)) {
      this.blockedAgents.add(agentId);
      this.emit('budget:blocked', { agentId, percentage });
    }
  }

  unblockAgent(agentId: string): void {
    if (this.blockedAgents.has(agentId)) {
      this.blockedAgents.delete(agentId);
      this.emit('budget:unblocked', { agentId });
    }
  }

  isBlocked(agentId: string): boolean {
    return this.blockedAgents.has(agentId);
  }

  private calculateNextReset(config: BudgetConfig): Date {
    const now = new Date();
    const resetDay = config.resetDay || 1;
    
    let nextReset = new Date(now.getFullYear(), now.getMonth(), resetDay);
    if (nextReset <= now) {
      nextReset = new Date(now.getFullYear(), now.getMonth() + 1, resetDay);
    }
    
    return nextReset;
  }

  getAllStatuses(): BudgetStatus[] {
    return Array.from(this.budgets.keys()).map(agentId => this.checkBudget(agentId));
  }

  reset(agentId: string): void {
    // Clear alerts for this agent
    for (const key of this.lastAlerts.keys()) {
      if (key.startsWith(`${agentId}-`)) {
        this.lastAlerts.delete(key);
      }
    }
    
    this.blockedAgents.delete(agentId);
    this.emit('budget:reset', { agentId });
  }

  getSummary(): {
    totalBudgets: number;
    totalAllocated: number;
    totalSpent: number;
    blockedCount: number;
    criticalCount: number;
  } {
    const statuses = this.getAllStatuses();
    
    return {
      totalBudgets: statuses.length,
      totalAllocated: statuses.reduce((sum, s) => sum + s.budget, 0),
      totalSpent: statuses.reduce((sum, s) => sum + s.spent, 0),
      blockedCount: this.blockedAgents.size,
      criticalCount: statuses.filter(s => s.status === 'critical' || s.status === 'exceeded').length
    };
  }
}

export default BudgetEnforcer;
