/**
 * Swarm Model Resolver
 *
 * Provides cost-optimized model selection for Dash swarms.
 * Selects the best model based on task type, budget constraints, and provider availability.
 *
 * @module swarm-model-resolver
 */
import { Model, Api, KnownProvider, ThinkingLevel } from '@mariozechner/pi-ai';
export interface SwarmModelConfig {
    /** Task type for model selection */
    taskType: TaskType;
    /** Budget constraint in dollars (optional) */
    budgetLimit?: number;
    /** Preferred provider(s) - empty for auto-selection */
    preferredProviders?: KnownProvider[];
    /** Required capabilities */
    requiredCapabilities?: ModelCapability[];
    /** Thinking level preference */
    thinkingLevel?: ThinkingLevel;
    /** Whether to use cached models if available */
    useCache?: boolean;
    /** Custom cost weight (0-1, higher = more cost-conscious) */
    costWeight?: number;
    /** Custom quality weight (0-1, higher = prefer quality) */
    qualityWeight?: number;
    /** Maximum context window required */
    minContextWindow?: number;
}
export type TaskType = 'coding' | 'reasoning' | 'summarization' | 'chat' | 'analysis' | 'creative' | 'classification' | 'extraction' | 'planning' | 'review';
export type ModelCapability = 'text' | 'image' | 'thinking' | 'tools' | 'json' | 'streaming';
export interface ModelScore {
    model: Model<Api>;
    score: number;
    costScore: number;
    qualityScore: number;
    speedScore: number;
    reason: string;
}
export declare class SwarmModelResolver {
    private cache;
    private cacheExpiry;
    private readonly CACHE_TTL;
    /**
     * Get the best model for a given swarm task
     */
    resolveModel(config: SwarmModelConfig): Model<Api>;
    /**
     * Get multiple model options ranked by suitability
     */
    resolveModels(config: SwarmModelConfig, count?: number): Model<Api>[];
    /**
     * Get model for a specific provider
     */
    getModelForProvider(provider: KnownProvider, modelId: string): Model<Api>;
    /**
     * Get all available providers
     */
    getAvailableProviders(): KnownProvider[];
    /**
     * Get models for a specific task type
     */
    getModelsForTask(taskType: TaskType): Model<Api>[];
    /**
     * Clear the model cache
     */
    clearCache(): void;
    private scoreModels;
    private calculateScore;
    private hasCapability;
    private getMaxCost;
    private estimateCost;
    private estimateSpeedScore;
    private getCacheKey;
    private getFromCache;
    private setCache;
}
/**
 * Default singleton instance
 */
export declare const swarmModelResolver: SwarmModelResolver;
/**
 * Get the best model for a task type (convenience function)
 */
export declare function getSwarmModel(taskType: TaskType, options?: Omit<SwarmModelConfig, 'taskType'>): Model<Api>;
//# sourceMappingURL=swarm-model-resolver.d.ts.map