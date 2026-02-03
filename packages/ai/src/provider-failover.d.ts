/**
 * Provider Failover
 *
 * Automatic failover between LLM providers for high availability swarms.
 * Monitors provider health and switches to backup providers on failure.
 *
 * @module provider-failover
 */
import { Model, Api, Context, StreamOptions, AssistantMessage, AssistantMessageEventStream, KnownProvider } from '@mariozechner/pi-ai';
export declare enum FailoverStrategy {
    /** Try primary, then fall back to next on failure */
    SEQUENTIAL = "sequential",
    /** Try all providers in parallel, use first success */
    PARALLEL = "parallel",
    /** Round-robin between providers */
    ROUND_ROBIN = "round_robin",
    /** Use the provider with best recent performance */
    BEST_PERFORMANCE = "best_performance",
    /** Use the cheapest available provider */
    COST_OPTIMIZED = "cost_optimized"
}
export interface FailoverConfig {
    /** Primary provider preference */
    primaryProvider?: KnownProvider;
    /** Backup providers in order of preference */
    backupProviders?: KnownProvider[];
    /** Failover strategy */
    strategy?: FailoverStrategy;
    /** Max retries per provider */
    maxRetriesPerProvider?: number;
    /** Max total retries across all providers */
    maxTotalRetries?: number;
    /** Delay between retries (ms) */
    retryDelayMs?: number;
    /** Timeout per provider request (ms) */
    providerTimeoutMs?: number;
    /** Whether to track provider health */
    trackHealth?: boolean;
    /** Health check window (ms) */
    healthCheckWindowMs?: number;
    /** Success rate threshold for healthy provider (0-1) */
    healthThreshold?: number;
}
export interface ProviderHealth {
    provider: KnownProvider;
    isHealthy: boolean;
    successRate: number;
    avgLatencyMs: number;
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    lastFailure?: Date;
    lastSuccess?: Date;
    consecutiveFailures: number;
}
export interface FailoverAttempt {
    provider: KnownProvider;
    modelId: string;
    success: boolean;
    latencyMs: number;
    error?: string;
    timestamp: Date;
}
export interface FailoverResult {
    message: AssistantMessage;
    attempts: FailoverAttempt[];
    successfulProvider: KnownProvider;
    totalLatencyMs: number;
}
export declare class ProviderFailover {
    private healthData;
    private attemptHistory;
    private roundRobinIndex;
    private config;
    constructor(config?: FailoverConfig);
    /**
     * Stream with automatic failover between providers
     */
    streamWithFailover(model: Model<Api>, context: Context, options?: StreamOptions): Promise<{
        stream: AssistantMessageEventStream;
        result: Promise<FailoverResult>;
    }>;
    /**
     * Complete with automatic failover between providers
     */
    completeWithFailover(model: Model<Api>, context: Context, options?: StreamOptions): Promise<FailoverResult>;
    /**
     * Get health status for all providers
     */
    getProviderHealth(): ProviderHealth[];
    /**
     * Get health for a specific provider
     */
    getHealth(provider: KnownProvider): ProviderHealth | undefined;
    /**
     * Check if a provider is healthy
     */
    isHealthy(provider: KnownProvider): boolean;
    /**
     * Get the best performing provider
     */
    getBestProvider(): KnownProvider;
    /**
     * Reset health data
     */
    resetHealth(): void;
    /**
     * Get recent attempt history
     */
    getAttemptHistory(limit?: number): FailoverAttempt[];
    /**
     * Update configuration
     */
    updateConfig(config: Partial<FailoverConfig>): void;
    private initializeHealthData;
    private getProviderList;
    private getModelForProvider;
    private getModelTier;
    private findEquivalentModel;
    private recordAttempt;
    private createTimeoutSignal;
    private delay;
}
export declare class ProviderFailoverError extends Error {
    readonly attempts: FailoverAttempt[];
    constructor(message: string, attempts: FailoverAttempt[]);
}
export declare const providerFailover: ProviderFailover;
//# sourceMappingURL=provider-failover.d.ts.map