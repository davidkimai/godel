/**
 * Cost Tracker
 *
 * Integrates LLM usage with Dash's budget system.
 * Tracks per-request costs and provides hooks for budget enforcement.
 *
 * @module cost-tracker
 */
import { Model, Api, Usage } from '@mariozechner/pi-ai';
export interface CostTrackingOptions {
    /** Budget limit in dollars */
    budgetLimit?: number;
    /** Warning threshold (0-1) */
    warningThreshold?: number;
    /** Hard stop threshold (0-1) */
    stopThreshold?: number;
    /** Callback when cost is incurred */
    onCostIncurred?: (cost: CostEntry) => void | Promise<void>;
    /** Callback when warning threshold is reached */
    onWarning?: (status: CostStatus) => void | Promise<void>;
    /** Callback when stop threshold is reached */
    onStop?: (status: CostStatus) => void | Promise<void>;
    /** Whether to track per-provider costs */
    trackByProvider?: boolean;
    /** Whether to track per-model costs */
    trackByModel?: boolean;
    /** Whether to track per-task costs */
    trackByTask?: boolean;
    /** Custom metadata to attach to cost entries */
    metadata?: Record<string, unknown>;
}
export interface CostEntry {
    id: string;
    timestamp: Date;
    provider: string;
    modelId: string;
    modelName: string;
    usage: Usage;
    cost: Usage['cost'];
    taskId?: string;
    agentId?: string;
    swarmId?: string;
    latencyMs?: number;
    metadata?: Record<string, unknown>;
}
export interface CostStatus {
    totalCost: number;
    budgetLimit: number;
    percentUsed: number;
    remainingBudget: number;
    entryCount: number;
    warningTriggered: boolean;
    stopTriggered: boolean;
}
export interface ProviderCostSummary {
    provider: string;
    totalCost: number;
    requestCount: number;
    avgCostPerRequest: number;
    totalTokens: number;
}
export interface ModelCostSummary {
    modelId: string;
    modelName: string;
    provider: string;
    totalCost: number;
    requestCount: number;
    avgCostPerRequest: number;
    totalTokens: number;
}
export declare class CostTracker {
    private entries;
    private options;
    private warningTriggered;
    private stopTriggered;
    constructor(options?: CostTrackingOptions);
    /**
     * Record a cost entry from model usage
     */
    recordCost(model: Model<Api>, usage: Usage, options?: {
        taskId?: string;
        agentId?: string;
        swarmId?: string;
        latencyMs?: number;
        metadata?: Record<string, unknown>;
    }): Promise<CostEntry>;
    /**
     * Estimate cost before making a request
     */
    estimateCost(model: Model<Api>, estimatedInputTokens: number, estimatedOutputTokens: number): Usage['cost'];
    /**
     * Check if a request would exceed budget
     */
    wouldExceedBudget(model: Model<Api>, estimatedInputTokens: number, estimatedOutputTokens: number): {
        wouldExceed: boolean;
        projectedTotal: number;
        remaining: number;
    };
    /**
     * Get current cost status
     */
    getStatus(): CostStatus;
    /**
     * Get total cost incurred
     */
    getTotalCost(): number;
    /**
     * Get costs by provider
     */
    getCostsByProvider(): ProviderCostSummary[];
    /**
     * Get costs by model
     */
    getCostsByModel(): ModelCostSummary[];
    /**
     * Get costs for a specific task
     */
    getCostsForTask(taskId: string): CostEntry[];
    /**
     * Get costs for a specific agent
     */
    getCostsForAgent(agentId: string): CostEntry[];
    /**
     * Get costs for a specific swarm
     */
    getCostsForSwarm(swarmId: string): CostEntry[];
    /**
     * Get all entries
     */
    getEntries(): CostEntry[];
    /**
     * Get recent entries
     */
    getRecentEntries(limit?: number): CostEntry[];
    /**
     * Clear all entries
     */
    clear(): void;
    /**
     * Update budget limit
     */
    setBudgetLimit(limit: number): void;
    /**
     * Reset threshold triggers
     */
    resetThresholds(): void;
    /**
     * Export cost report
     */
    exportReport(): CostReport;
    private checkThresholds;
    private generateId;
}
export interface CostReport {
    generatedAt: Date;
    status: CostStatus;
    summary: {
        totalRequests: number;
        totalCost: number;
        avgCostPerRequest: number;
        topProvider: string;
        topModel: string;
    };
    byProvider: ProviderCostSummary[];
    byModel: ModelCostSummary[];
    recentEntries: CostEntry[];
}
export declare const costTracker: CostTracker;
//# sourceMappingURL=cost-tracker.d.ts.map