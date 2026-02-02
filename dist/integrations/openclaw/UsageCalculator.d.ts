/**
 * Usage Calculator for OpenClaw Agent Costs
 *
 * Calculates token costs, tool usage costs, and aggregates across agents.
 *
 * SPEC: OPENCLAW_INTEGRATION_SPEC.md Section 4.5
 */
export interface TokenBreakdown {
    input: number;
    output: number;
    total: number;
}
export interface ToolUsage {
    toolName: string;
    callCount: number;
    totalCost: number;
    avgDurationMs: number;
}
export interface UsageMetrics {
    totalSpent: number;
    agentBreakdown: Record<string, number>;
    toolBreakdown: Record<string, number>;
    tokenBreakdown: TokenBreakdown;
}
export interface ModelPricing {
    inputCostPer1M: number;
    outputCostPer1M: number;
    contextWindow: number;
}
export interface ToolCost {
    baseCost: number;
    perSecondCost?: number;
    dataTransferCost?: number;
}
export interface CostEstimate {
    minCost: number;
    maxCost: number;
    expectedCost: number;
    confidence: 'low' | 'medium' | 'high';
    breakdown: {
        tokens: number;
        tools: number;
        overhead: number;
    };
}
export declare const MODEL_PRICING: Record<string, ModelPricing>;
export declare const TOOL_COSTS: Record<string, ToolCost>;
export declare class UsageCalculator {
    private modelPricing;
    private toolCosts;
    private customPricing;
    constructor(customModelPricing?: Record<string, ModelPricing>, customToolCosts?: Record<string, ToolCost>);
    /**
     * Calculate cost for token usage
     */
    calculateTokenCost(modelId: string, inputTokens: number, outputTokens: number): number;
    /**
     * Calculate cost from session history data
     */
    calculateSessionCost(modelId: string, sessionHistory: Array<{
        tokens?: {
            input?: number;
            output?: number;
        };
    }>): number;
    /**
     * Estimate token count from text (rough approximation)
     */
    estimateTokenCount(text: string): number;
    /**
     * Estimate cost for a prompt before sending
     */
    estimatePromptCost(modelId: string, prompt: string, expectedResponseLength?: number): {
        input: number;
        output: number;
        total: number;
    };
    /**
     * Calculate cost for a tool call
     */
    calculateToolCost(toolName: string, options?: {
        durationMs?: number;
        dataTransferMB?: number;
        ttsCharacters?: number;
    }): number;
    /**
     * Calculate cost for multiple tool calls
     */
    calculateToolBatchCost(calls: Array<{
        toolName: string;
        durationMs?: number;
        dataTransferMB?: number;
    }>): {
        total: number;
        breakdown: Record<string, number>;
    };
    /**
     * Aggregate usage metrics across multiple agents
     */
    aggregateAgentUsage(agentUsages: Array<{
        agentId: string;
        modelId: string;
        inputTokens: number;
        outputTokens: number;
        toolCalls: Array<{
            toolName: string;
            durationMs?: number;
            dataTransferMB?: number;
        }>;
    }>): UsageMetrics;
    /**
     * Aggregate usage from session history data
     */
    aggregateSessionHistory(sessions: Array<{
        agentId: string;
        modelId: string;
        history: Array<{
            tokens?: {
                input?: number;
                output?: number;
            };
            tools?: Array<{
                name: string;
                durationMs?: number;
            }>;
        }>;
    }>): UsageMetrics;
    /**
     * Estimate total cost for a task before execution
     */
    estimateTaskCost(options: {
        modelId: string;
        expectedPrompts: number;
        avgPromptLength: number;
        avgResponseLength: number;
        expectedTools: Array<{
            toolName: string;
            expectedCalls: number;
            avgDurationMs?: number;
        }>;
    }): CostEstimate;
    /**
     * Get pricing for a model
     */
    getModelPricing(modelId: string): ModelPricing;
    /**
     * Get cost for a tool
     */
    getToolCost(toolName: string): ToolCost;
    /**
     * Update pricing for a model
     */
    setModelPricing(modelId: string, pricing: ModelPricing): void;
    /**
     * Update cost for a tool
     */
    setToolCost(toolName: string, cost: ToolCost): void;
    /**
     * Check if using custom pricing
     */
    isUsingCustomPricing(): boolean;
    /**
     * Format usage metrics as a readable report
     */
    formatReport(metrics: UsageMetrics): string;
    /**
     * Compare actual vs estimated costs
     */
    compareEstimateVsActual(estimate: CostEstimate, actual: number): {
        withinRange: boolean;
        variance: number;
        variancePercent: number;
        assessment: string;
    };
}
export declare function getUsageCalculator(): UsageCalculator;
export declare function resetUsageCalculator(): void;
//# sourceMappingURL=UsageCalculator.d.ts.map