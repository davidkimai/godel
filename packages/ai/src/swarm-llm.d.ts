/**
 * Swarm LLM
 *
 * High-level API for using the unified LLM system in Dash swarms.
 * Combines model resolution, provider failover, and cost tracking.
 *
 * @module swarm-llm
 */
import { Model, Api, Context, StreamOptions, AssistantMessage, AssistantMessageEventStream, KnownProvider } from '@mariozechner/pi-ai';
import { SwarmModelConfig, TaskType } from './swarm-model-resolver';
import { FailoverConfig } from './provider-failover';
import { CostTrackingOptions } from './cost-tracker';
export interface SwarmStreamOptions extends StreamOptions {
    /** Task type for model selection */
    taskType?: TaskType;
    /** Enable provider failover */
    enableFailover?: boolean;
    /** Failover configuration */
    failoverConfig?: Partial<FailoverConfig>;
    /** Enable cost tracking */
    enableCostTracking?: boolean;
    /** Cost tracking configuration */
    costTrackingOptions?: CostTrackingOptions;
    /** Task ID for cost tracking */
    taskId?: string;
    /** Agent ID for cost tracking */
    agentId?: string;
    /** Swarm ID for cost tracking */
    swarmId?: string;
}
export interface SwarmCompleteOptions extends SwarmStreamOptions {
    /** Timeout for the complete operation */
    timeoutMs?: number;
}
export interface MultiProviderSwarmConfig {
    /** Number of agents */
    agentCount: number;
    /** Task type for all agents */
    taskType: TaskType;
    /** Provider distribution strategy */
    distributionStrategy: 'round_robin' | 'weighted' | 'performance_based';
    /** Provider weights (for weighted strategy) */
    providerWeights?: Record<KnownProvider, number>;
    /** Preferred providers */
    preferredProviders?: KnownProvider[];
    /** Budget per agent */
    budgetPerAgent?: number;
    /** Enable failover for all agents */
    enableFailover?: boolean;
}
export interface SwarmAgentConfig {
    agentId: string;
    model: Model<Api>;
    provider: KnownProvider;
    taskType: TaskType;
    budgetLimit?: number;
    enableFailover: boolean;
}
/**
 * Get a model optimized for swarm tasks
 *
 * Example:
 * ```typescript
 * const model = getSwarmModel('coding', {
 *   preferredProviders: ['anthropic', 'openai'],
 *   budgetLimit: 0.01
 * });
 * ```
 */
export declare function getSwarmModel(taskType: TaskType, options?: Omit<SwarmModelConfig, 'taskType'>): Model<Api>;
/**
 * Stream with automatic failover and cost tracking
 *
 * Example:
 * ```typescript
 * const { stream, result } = await streamWithFailover(
 *   model,
 *   context,
 *   {
 *     taskType: 'coding',
 *     enableFailover: true,
 *     enableCostTracking: true,
 *     agentId: 'agent-1',
 *     swarmId: 'swarm-1'
 *   }
 * );
 *
 * for await (const event of stream) {
 *   // Handle events
 * }
 *
 * const { message, attempts, successfulProvider } = await result;
 * ```
 */
export declare function streamWithFailover(model: Model<Api>, context: Context, options?: SwarmStreamOptions): Promise<{
    stream: AssistantMessageEventStream;
    result: Promise<SwarmLLMResult>;
}>;
/**
 * Complete with automatic failover and cost tracking
 *
 * Example:
 * ```typescript
 * const result = await completeWithFailover(
 *   model,
 *   context,
 *   {
 *     taskType: 'coding',
 *     enableFailover: true,
 *     timeoutMs: 30000
 *   }
 * );
 * ```
 */
export declare function completeWithFailover(model: Model<Api>, context: Context, options?: SwarmCompleteOptions): Promise<SwarmLLMResult>;
/**
 * Create a multi-provider swarm configuration
 *
 * Distributes agents across multiple providers for redundancy and load balancing.
 *
 * Example:
 * ```typescript
 * const swarm = createMultiProviderSwarm({
 *   agentCount: 6,
 *   taskType: 'coding',
 *   distributionStrategy: 'round_robin',
 *   preferredProviders: ['anthropic', 'openai', 'google'],
 *   enableFailover: true
 * });
 *
 * // swarm.agents will have 2 agents on Anthropic, 2 on OpenAI, 2 on Google
 * ```
 */
export declare function createMultiProviderSwarm(config: MultiProviderSwarmConfig): {
    swarmId: string;
    agents: SwarmAgentConfig[];
};
export interface SwarmLLMResult {
    message: AssistantMessage;
    attempts: Array<{
        provider: KnownProvider;
        modelId: string;
        success: boolean;
        latencyMs: number;
        error?: string;
        timestamp: Date;
    }>;
    successfulProvider: KnownProvider;
    totalLatencyMs: number;
    costStatus?: {
        totalCost: number;
        budgetLimit: number;
        percentUsed: number;
        remainingBudget: number;
        entryCount: number;
        warningTriggered: boolean;
        stopTriggered: boolean;
    };
}
export { SwarmModelResolver, TaskType, SwarmModelConfig, } from './swarm-model-resolver';
export { ProviderFailover, FailoverStrategy, FailoverConfig, FailoverResult, ProviderFailoverError, } from './provider-failover';
export { CostTracker, CostTrackingOptions, CostEntry, CostStatus, CostReport, } from './cost-tracker';
//# sourceMappingURL=swarm-llm.d.ts.map