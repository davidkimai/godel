/**
 * Dash Predictive Budget - Cost Forecasting & Anomaly Detection
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
    modelPricing: Record<string, {
        inputPerMillion: number;
        outputPerMillion: number;
    }>;
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
    byModel: Record<string, {
        cost: number;
        percentage: number;
    }>;
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
declare class PredictiveBudget extends EventEmitter {
    private config;
    private usageHistory;
    private alerts;
    private startTime;
    private initialBudget;
    private checkInterval;
    constructor(config?: Partial<BudgetConfig>);
    /**
     * Start budget monitoring
     */
    start(intervalMs?: number): void;
    /**
     * Stop budget monitoring
     */
    stop(): void;
    /**
     * Record usage
     */
    recordUsage(snapshot: Omit<UsageSnapshot, 'timestamp'>): void;
    /**
     * Get current budget metrics
     */
    getMetrics(): BudgetMetrics;
    /**
     * Get cost forecast
     */
    getForecast(): CostForecast;
    /**
     * Detect anomalies in usage pattern
     */
    detectAnomalies(): AnomalyDetection | null;
    /**
     * Get cost optimization suggestions
     */
    getOptimizations(): OptimizationSuggestion[];
    /**
     * Get alerts
     */
    getAlerts(): BudgetAlert[];
    /**
     * Clear alerts
     */
    clearAlerts(): void;
    /**
     * Reset budget tracker
     */
    reset(): void;
    /**
     * Calculate cost from token usage
     */
    calculateCost(inputTokens: number, outputTokens: number, model: string): number;
    /**
     * Get total spent
     */
    private getTotalSpent;
    /**
     * Calculate burn rate (cost per hour)
     */
    private calculateBurnRate;
    /**
     * Calculate projected total cost
     */
    private calculateProjectedTotal;
    /**
     * Get cost breakdown by model
     */
    private getCostByModel;
    /**
     * Check budget status and emit alerts
     */
    private checkBudgetStatus;
    /**
     * Add alert
     */
    private addAlert;
    /**
     * Check if recent alert exists
     */
    private hasRecentAlert;
    /**
     * Get usage history
     */
    getHistory(): UsageSnapshot[];
    /**
     * Export budget report
     */
    generateReport(): {
        generatedAt: Date;
        period: {
            start: Date;
            end: Date;
        };
        metrics: BudgetMetrics;
        forecast: CostForecast;
        anomalies: AnomalyDetection[];
        optimizations: OptimizationSuggestion[];
        alerts: BudgetAlert[];
        usageByModel: Record<string, {
            cost: number;
            percentage: number;
        }>;
    };
}
export declare function getPredictiveBudget(): PredictiveBudget;
export declare function createPredictiveBudget(config?: Partial<BudgetConfig>): PredictiveBudget;
export {};
//# sourceMappingURL=predictive-budget.d.ts.map