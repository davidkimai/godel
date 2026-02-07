/**
 * Godel Predictive Budget - Cost Forecasting & Anomaly Detection
 * 
 * PRD Section 2.6: Predictive Budget
 * 
 * Features:
 * - Burn rate calculation
 * - Projected cost at current pace
 * - Anomaly detection for cost spikes
 * - Early warning alerts
 * - Cost optimization suggestions
 */

import { EventEmitter } from 'events';

export interface BudgetConfig {
  /** Total budget limit */
  totalBudget: number;
  /** Warning threshold (percentage, default: 75%) */
  warningThreshold: number;
  /** Critical threshold (percentage, default: 90%) */
  criticalThreshold: number;
  /** Forecast window in hours (default: 24) */
  forecastWindowHours: number;
  /** Anomaly detection sensitivity (0-1, default: 0.5) */
  anomalySensitivity: number;
  /** Cost per token for different models */
  modelCosts: ModelCostConfig;
}

export interface ModelCostConfig {
  /** Cost per 1M input tokens */
  perMillionInputTokens: number;
  /** Cost per 1M output tokens */
  perMillionOutputTokens: number;
  /** Default model pricing */
  defaultModel: string;
  /** Model-specific pricing override */
  modelPricing: Record<string, { inputPerMillion: number; outputPerMillion: number }>;
}

export interface BudgetMetrics {
  /** Total spent so far */
  totalSpent: number;
  /** Remaining budget */
  remaining: number;
  /** Current burn rate (cost per hour) */
  burnRatePerHour: number;
  /** Projected total cost at current pace */
  projectedTotal: number;
  /** Percentage of budget used */
  percentageUsed: number;
  /** Hours until budget depletion */
  hoursRemaining: number;
  /** Status: healthy | warning | critical */
  status: 'healthy' | 'warning' | 'critical';
}

export interface UsageSnapshot {
  timestamp: Date;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  model: string;
}

export interface AnomalyDetection {
  detected: boolean;
  type: 'spike' | 'drop' | 'sustained_high' | 'unusual_pattern';
  description: string;
  severity: 'low' | 'medium' | 'high';
  suggestedAction?: string;
}

export interface CostForecast {
  /** Projected cost at end of forecast window */
  projectedCost: number;
  /** Best case scenario */
  bestCase: number;
  /** Worst case scenario */
  worstCase: number;
  /** Confidence interval */
  confidence: number;
  /** Breakdown by model */
  byModel: Record<string, { cost: number; percentage: number }>;
}

export interface BudgetAlert {
  type: 'warning' | 'critical' | 'anomaly' | 'optimization';
  message: string;
  metric: string;
  value: number;
  threshold?: number;
  timestamp: Date;
}

export interface OptimizationSuggestion {
  id: string;
  category: 'model' | 'prompt' | 'frequency' | 'caching';
  priority: 'high' | 'medium' | 'low';
  description: string;
  estimatedSavings: number;
  implementation: string;
}

class PredictiveBudget extends EventEmitter {
  private config: BudgetConfig;
  private usageHistory: UsageSnapshot[] = [];
  private alerts: BudgetAlert[] = [];
  private startTime: Date;
  private initialBudget: number;
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: Partial<BudgetConfig> = {}) {
    super();

    this.config = {
      totalBudget: config.totalBudget || 100,
      warningThreshold: config.warningThreshold || 0.75,
      criticalThreshold: config.criticalThreshold || 0.90,
      forecastWindowHours: config.forecastWindowHours || 24,
      anomalySensitivity: config.anomalySensitivity || 0.5,
      modelCosts: config.modelCosts || {
        perMillionInputTokens: 0.01,
        perMillionOutputTokens: 0.03,
        defaultModel: 'gpt-4',
        modelPricing: {}
      }
    };

    this.startTime = new Date();
    this.initialBudget = this.config.totalBudget;
  }

  /**
   * Start budget monitoring
   */
  start(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkBudgetStatus();
    }, intervalMs);

    this.emit('started', { intervalMs });
  }

  /**
   * Stop budget monitoring
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.emit('stopped');
  }

  /**
   * Record usage
   */
  recordUsage(snapshot: Omit<UsageSnapshot, 'timestamp'>): void {
    const fullSnapshot: UsageSnapshot = {
      ...snapshot,
      timestamp: new Date()
    };

    this.usageHistory.push(fullSnapshot);

    // Calculate cost
    const cost = this.calculateCost(snapshot.inputTokens, snapshot.outputTokens, snapshot.model);
    const updatedSnapshot = { ...fullSnapshot, cost };
    const historyIndex = this.usageHistory.length - 1;
    this.usageHistory[historyIndex] = updatedSnapshot;

    // Check for anomalies
    this.detectAnomalies();

    // Check budget status
    this.checkBudgetStatus();

    this.emit('usage_recorded', updatedSnapshot);
  }

  /**
   * Get current budget metrics
   */
  getMetrics(): BudgetMetrics {
    const totalSpent = this.getTotalSpent();
    const remaining = this.config.totalBudget - totalSpent;
    const burnRate = this.calculateBurnRate();
    const percentageUsed = (totalSpent / this.config.totalBudget) * 100;
    const projectedTotal = this.calculateProjectedTotal();
    const hoursRemaining = burnRate > 0 ? remaining / burnRate : Infinity;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (percentageUsed >= this.config.criticalThreshold * 100) {
      status = 'critical';
    } else if (percentageUsed >= this.config.warningThreshold * 100) {
      status = 'warning';
    }

    return {
      totalSpent,
      remaining,
      burnRatePerHour: burnRate,
      projectedTotal,
      percentageUsed,
      hoursRemaining: hoursRemaining === Infinity ? -1 : hoursRemaining,
      status
    };
  }

  /**
   * Get cost forecast
   */
  getForecast(): CostForecast {
    const metrics = this.getMetrics();
    const hoursRemaining = metrics.hoursRemaining > 0 ? metrics.hoursRemaining : 0;
    const forecastHours = Math.min(this.config.forecastWindowHours, hoursRemaining);

    // Calculate projected cost
    const projectedCost = this.config.totalBudget * (forecastHours / Math.max(1, hoursRemaining));
    
    // Best case: 20% reduction in burn rate
    const bestCase = projectedCost * 0.8;
    
    // Worst case: 30% increase in burn rate
    const worstCase = projectedCost * 1.3;

    // Confidence based on history length
    const confidence = Math.min(0.95, 0.5 + (this.usageHistory.length * 0.02));

    // Breakdown by model
    const byModel = this.getCostByModel();

    return {
      projectedCost: Math.min(projectedCost, this.config.totalBudget),
      bestCase: Math.min(bestCase, this.config.totalBudget),
      worstCase: Math.min(worstCase, this.config.totalBudget),
      confidence,
      byModel
    };
  }

  /**
   * Detect anomalies in usage pattern
   */
  detectAnomalies(): AnomalyDetection | null {
    if (this.usageHistory.length < 3) {
      return null;
    }

    const recent = this.usageHistory.slice(-5);
    const costs = recent.map((s) => s.cost);
    const avg = costs.reduce((a, b) => a + b, 0) / costs.length;
    const stdDev = Math.sqrt(
      costs.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / costs.length
    );

    const latest = recent[recent.length - 1];
    const threshold = stdDev * (1 + this.config.anomalySensitivity);

    // Check for spike
    if (latest.cost > avg + threshold * 2) {
      const suggestion: AnomalyDetection = {
        detected: true,
        type: 'spike',
        description: `Cost spike detected: $${latest.cost.toFixed(4)} vs average $${avg.toFixed(4)}`,
        severity: latest.cost > avg + threshold * 4 ? 'high' : 'medium',
        suggestedAction: 'Review recent prompts for inefficiencies or unexpected model behavior'
      };
      this.addAlert('anomaly', suggestion.description, 'latestCost', latest.cost);
      return suggestion;
    }

    // Check for sustained high usage
    const highCount = costs.filter((c) => c > avg + threshold).length;
    if (highCount >= 3) {
      const suggestion: AnomalyDetection = {
        detected: true,
        type: 'sustained_high',
        description: `Sustained high cost detected for ${highCount} consecutive periods`,
        severity: 'medium',
        suggestedAction: 'Consider optimizing prompts or reducing request frequency'
      };
      this.addAlert('anomaly', suggestion.description, 'highCount', highCount);
      return suggestion;
    }

    // Check for unusual pattern (sudden drop)
    if (latest.cost < avg - threshold * 2 && recent.length >= 2) {
      const prev = recent[recent.length - 2];
      if (prev.cost > avg * 0.5) {
        const suggestion: AnomalyDetection = {
          detected: true,
          type: 'drop',
          description: `Sudden cost drop detected: $${prev.cost.toFixed(4)} → $${latest.cost.toFixed(4)}`,
          severity: 'low',
          suggestedAction: 'Verify this is expected behavior (e.g., reduced workload)'
        };
        this.addAlert('anomaly', suggestion.description, 'costDrop', latest.cost);
        return suggestion;
      }
    }

    return null;
  }

  /**
   * Get cost optimization suggestions
   */
  getOptimizations(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    const metrics = this.getMetrics();

    // Suggest model optimization if using expensive model
    const modelBreakdown = this.getCostByModel();
    const expensiveModels = Object.entries(modelBreakdown)
      .filter(([_, data]) => data.percentage > 30)
      .map(([model]) => model);

    if (expensiveModels.length > 0) {
      suggestions.push({
        id: 'model-opt-1',
        category: 'model',
        priority: 'high',
        description: `Consider using a lighter model for non-critical tasks. ${expensiveModels.join(', ')} account for >30% of costs.`,
        estimatedSavings: metrics.totalSpent * 0.15,
        implementation: 'Create model routing rules based on task complexity'
      });
    }

    // Suggest caching for repeated requests
    const recentRequests = this.usageHistory.slice(-20);
    const uniqueInputs = new Set(recentRequests.map((r) => r.inputTokens.toString()));
    if (uniqueInputs.size < recentRequests.length * 0.5) {
      suggestions.push({
        id: 'cache-1',
        category: 'caching',
        priority: 'medium',
        description: 'High repetition detected in recent requests. Consider implementing response caching.',
        estimatedSavings: metrics.totalSpent * 0.1,
        implementation: 'Add caching layer for identical or similar prompts'
      });
    }

    // Suggest prompt optimization for high token usage
    const avgTokens = recentRequests.reduce(
      (sum, r) => sum + r.inputTokens + r.outputTokens,
      0
    ) / recentRequests.length;

    if (avgTokens > 5000) {
      suggestions.push({
        id: 'prompt-1',
        category: 'prompt',
        priority: 'medium',
        description: `Average token usage per request is high (${Math.round(avgTokens)}). Consider prompt optimization.`,
        estimatedSavings: metrics.totalSpent * 0.08,
        implementation: 'Review and trim system prompts, use more concise instructions'
      });
    }

    // Suggest batching for frequent small requests
    const requestCount = recentRequests.length;
    const timeSpan = recentRequests.length > 0
      ? (recentRequests[recentRequests.length - 1].timestamp.getTime() -
         recentRequests[0].timestamp.getTime()) / 1000 / 60
      : 0;

    if (timeSpan > 0 && requestCount / timeSpan > 1) {
      suggestions.push({
        id: 'batch-1',
        category: 'frequency',
        priority: 'low',
        description: `High request frequency detected (${(requestCount / timeSpan).toFixed(1)} req/min). Consider batching.`,
        estimatedSavings: metrics.totalSpent * 0.05,
        implementation: 'Group related operations into batch requests'
      });
    }

    // Sort by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return suggestions;
  }

  /**
   * Get alerts
   */
  getAlerts(): BudgetAlert[] {
    return [...this.alerts];
  }

  /**
   * Clear alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Reset budget tracker
   */
  reset(): void {
    this.usageHistory = [];
    this.alerts = [];
    this.startTime = new Date();
    this.emit('reset');
  }

  /**
   * Calculate cost from token usage
   */
  calculateCost(
    inputTokens: number,
    outputTokens: number,
    model: string
  ): number {
    const modelPricing = this.config.modelCosts.modelPricing[model] || {
      inputPerMillion: this.config.modelCosts.perMillionInputTokens,
      outputPerMillion: this.config.modelCosts.perMillionOutputTokens
    };

    const inputCost = (inputTokens / 1000000) * modelPricing.inputPerMillion;
    const outputCost = (outputTokens / 1000000) * modelPricing.outputPerMillion;

    return inputCost + outputCost;
  }

  /**
   * Get total spent
   */
  private getTotalSpent(): number {
    return this.usageHistory.reduce((sum, s) => sum + s.cost, 0);
  }

  /**
   * Calculate burn rate (cost per hour)
   */
  private calculateBurnRate(): number {
    if (this.usageHistory.length < 2) return 0;

    const oldest = this.usageHistory[0];
    const newest = this.usageHistory[this.usageHistory.length - 1];

    const hoursElapsed = (newest.timestamp.getTime() - oldest.timestamp.getTime()) / (1000 * 60 * 60);
    const totalCost = this.getTotalSpent();

    if (hoursElapsed <= 0) return totalCost;
    return totalCost / hoursElapsed;
  }

  /**
   * Calculate projected total cost
   */
  private calculateProjectedTotal(): number {
    const burnRate = this.calculateBurnRate();
    const hoursElapsed = (Date.now() - this.startTime.getTime()) / (1000 * 60 * 60);
    const currentCost = this.getTotalSpent();

    // Project remaining hours at current burn rate
    const remainingHours = Math.min(this.config.forecastWindowHours, hoursElapsed * 2);
    return currentCost + (burnRate * remainingHours);
  }

  /**
   * Get cost breakdown by model
   */
  private getCostByModel(): Record<string, { cost: number; percentage: number }> {
    const byModel: Record<string, number> = {};

    this.usageHistory.forEach((s) => {
      byModel[s.model] = (byModel[s.model] || 0) + s.cost;
    });

    const total = this.getTotalSpent();
    const result: Record<string, { cost: number; percentage: number }> = {};

    Object.entries(byModel).forEach(([model, cost]) => {
      result[model] = {
        cost,
        percentage: total > 0 ? (cost / total) * 100 : 0
      };
    });

    return result;
  }

  /**
   * Check budget status and emit alerts
   */
  private checkBudgetStatus(): void {
    const metrics = this.getMetrics();

    // Warning alert
    if (metrics.status === 'warning' && !this.hasRecentAlert('warning')) {
      this.addAlert(
        'warning',
        `Budget usage at ${metrics.percentageUsed.toFixed(1)}%. Consider optimizing.`,
        'percentageUsed',
        metrics.percentageUsed,
        this.config.warningThreshold * 100
      );
    }

    // Critical alert
    if (metrics.status === 'critical' && !this.hasRecentAlert('critical')) {
      this.addAlert(
        'critical',
        `CRITICAL: Budget at ${metrics.percentageUsed.toFixed(1)}%. Immediate action required!`,
        'percentageUsed',
        metrics.percentageUsed,
        this.config.criticalThreshold * 100
      );
    }

    // Optimization alert
    if (metrics.percentageUsed > 50 && this.usageHistory.length > 10) {
      const optimizations = this.getOptimizations();
      if (optimizations.length > 0 && !this.hasRecentAlert('optimization')) {
        const topOpt = optimizations[0];
        this.addAlert(
          'optimization',
          `Cost optimization: ${topOpt.description}`,
          'suggestion',
          topOpt.estimatedSavings
        );
      }
    }
  }

  /**
   * Add alert
   */
  private addAlert(
    type: BudgetAlert['type'],
    message: string,
    metric: string,
    value: number,
    threshold?: number
  ): void {
    const alert: BudgetAlert = {
      type,
      message,
      metric,
      value,
      threshold,
      timestamp: new Date()
    };

    this.alerts.push(alert);
    this.emit('alert', alert);
  }

  /**
   * Check if recent alert exists
   */
  private hasRecentAlert(type: string): boolean {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    return this.alerts.some((a) => a.type === type && a.timestamp.getTime() > fiveMinutesAgo);
  }

  /**
   * Get usage history
   */
  getHistory(): UsageSnapshot[] {
    return [...this.usageHistory];
  }

  /**
   * Export budget report
   */
  generateReport(): {
    generatedAt: Date;
    period: { start: Date; end: Date };
    metrics: BudgetMetrics;
    forecast: CostForecast;
    anomalies: AnomalyDetection[];
    optimizations: OptimizationSuggestion[];
    alerts: BudgetAlert[];
    usageByModel: Record<string, { cost: number; percentage: number }>;
  } {
    const anomalies: AnomalyDetection[] = [];
    const anomaly = this.detectAnomalies();
    if (anomaly) anomalies.push(anomaly);

    return {
      generatedAt: new Date(),
      period: {
        start: this.startTime,
        end: new Date()
      },
      metrics: this.getMetrics(),
      forecast: this.getForecast(),
      anomalies,
      optimizations: this.getOptimizations(),
      alerts: this.getAlerts(),
      usageByModel: this.getCostByModel()
    };
  }
}

/**
 * Singleton instance
 */
let instance: PredictiveBudget | null = null;

export function getPredictiveBudget(): PredictiveBudget {
  if (!instance) {
    instance = new PredictiveBudget();
  }
  return instance;
}

export function createPredictiveBudget(config?: Partial<BudgetConfig>): PredictiveBudget {
  return new PredictiveBudget(config);
}
