/**
 * Cost Calculation Module
 *
 * Provides cost attribution to agents/tasks and cost calculation from token counts.
 * Tracks cost history and supports multiple model pricing configurations.
 */
export interface TokenCount {
    prompt: number;
    completion: number;
    total: number;
}
export interface CostBreakdown {
    prompt: number;
    completion: number;
    total: number;
}
export interface ModelPricing {
    promptPerThousand: number;
    completionPerThousand: number;
}
export interface CostEntry {
    id: string;
    timestamp: Date;
    agentId: string;
    taskId: string;
    projectId: string;
    model: string;
    tokens: TokenCount;
    cost: CostBreakdown;
    operation?: string;
    metadata?: Record<string, unknown>;
}
export interface CostSummary {
    agentId?: string;
    taskId?: string;
    projectId?: string;
    totalTokens: number;
    totalCost: number;
    entries: CostEntry[];
}
export interface CostHistoryQuery {
    agentId?: string;
    taskId?: string;
    projectId?: string;
    model?: string;
    since?: Date;
    until?: Date;
    limit?: number;
}
/**
 * Default pricing for supported models (per 1K tokens in USD)
 */
export declare const MODEL_PRICING: Record<string, ModelPricing>;
declare const customPricing: Map<string, ModelPricing>;
declare const costHistory: CostEntry[];
/**
 * Calculate cost from token counts for a specific model
 */
export declare function calculateCost(tokens: TokenCount, model: string): CostBreakdown;
/**
 * Calculate cost from raw token counts (prompt + completion)
 */
export declare function calculateCostFromTokens(promptTokens: number, completionTokens: number, model: string): CostBreakdown;
/**
 * Estimate cost for a planned operation
 */
export declare function estimateCost(estimatedPromptTokens: number, estimatedCompletionTokens: number, model: string): CostBreakdown;
/**
 * Get pricing for a model
 */
export declare function getPricing(model: string): ModelPricing | undefined;
/**
 * Set custom pricing for a model
 */
export declare function setPricing(model: string, pricing: ModelPricing): void;
/**
 * Remove custom pricing for a model (revert to default)
 */
export declare function removePricing(model: string): boolean;
/**
 * Get cost per thousand tokens for a model
 */
export declare function getCostPerThousandTokens(model: string): ModelPricing;
/**
 * List all available pricing configurations
 */
export declare function listPricing(): Record<string, ModelPricing>;
/**
 * Record a cost entry for attribution tracking
 */
export declare function recordCost(agentId: string, taskId: string, projectId: string, model: string, tokens: TokenCount, operation?: string, metadata?: Record<string, unknown>): CostEntry;
/**
 * Get cost history with optional filtering
 */
export declare function getCostHistory(query?: CostHistoryQuery): CostEntry[];
/**
 * Get cost summary for an agent
 */
export declare function getAgentCostSummary(agentId: string): CostSummary;
/**
 * Get cost summary for a task
 */
export declare function getTaskCostSummary(taskId: string): CostSummary;
/**
 * Get cost summary for a project
 */
export declare function getProjectCostSummary(projectId: string): CostSummary;
/**
 * Aggregate costs by time period
 */
export declare function aggregateCostsByPeriod(entries: CostEntry[], period: 'hour' | 'day' | 'week' | 'month'): Map<string, {
    tokens: number;
    cost: number;
    count: number;
}>;
/**
 * Aggregate costs by model
 */
export declare function aggregateCostsByModel(entries: CostEntry[]): Map<string, {
    tokens: number;
    cost: number;
    count: number;
}>;
export interface CostOptimizationSuggestion {
    type: 'model' | 'tokens' | 'caching' | 'batching';
    description: string;
    potentialSavings: number;
    action: string;
}
/**
 * Generate cost optimization suggestions based on usage patterns
 */
export declare function generateOptimizationSuggestions(entries: CostEntry[]): CostOptimizationSuggestion[];
export { costHistory, customPricing };
//# sourceMappingURL=cost.d.ts.map