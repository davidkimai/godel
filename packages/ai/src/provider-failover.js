"use strict";
/**
 * Provider Failover
 *
 * Automatic failover between LLM providers for high availability swarms.
 * Monitors provider health and switches to backup providers on failure.
 *
 * @module provider-failover
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.providerFailover = exports.ProviderFailoverError = exports.ProviderFailover = exports.FailoverStrategy = void 0;
const pi_ai_1 = require("@mariozechner/pi-ai");
// ============================================================================
// Types
// ============================================================================
var FailoverStrategy;
(function (FailoverStrategy) {
    /** Try primary, then fall back to next on failure */
    FailoverStrategy["SEQUENTIAL"] = "sequential";
    /** Try all providers in parallel, use first success */
    FailoverStrategy["PARALLEL"] = "parallel";
    /** Round-robin between providers */
    FailoverStrategy["ROUND_ROBIN"] = "round_robin";
    /** Use the provider with best recent performance */
    FailoverStrategy["BEST_PERFORMANCE"] = "best_performance";
    /** Use the cheapest available provider */
    FailoverStrategy["COST_OPTIMIZED"] = "cost_optimized";
})(FailoverStrategy || (exports.FailoverStrategy = FailoverStrategy = {}));
// ============================================================================
// Provider Failover Class
// ============================================================================
class ProviderFailover {
    constructor(config = {}) {
        this.healthData = new Map();
        this.attemptHistory = [];
        this.roundRobinIndex = 0;
        this.config = {
            primaryProvider: config.primaryProvider ?? 'anthropic',
            backupProviders: config.backupProviders ?? ['openai', 'google'],
            strategy: config.strategy ?? FailoverStrategy.SEQUENTIAL,
            maxRetriesPerProvider: config.maxRetriesPerProvider ?? 2,
            maxTotalRetries: config.maxTotalRetries ?? 6,
            retryDelayMs: config.retryDelayMs ?? 1000,
            providerTimeoutMs: config.providerTimeoutMs ?? 30000,
            trackHealth: config.trackHealth ?? true,
            healthCheckWindowMs: config.healthCheckWindowMs ?? 5 * 60 * 1000, // 5 min
            healthThreshold: config.healthThreshold ?? 0.8,
        };
        // Initialize health data for all providers
        this.initializeHealthData();
    }
    /**
     * Stream with automatic failover between providers
     */
    async streamWithFailover(model, context, options) {
        const attempts = [];
        const startTime = Date.now();
        // Get provider list based on strategy
        const providers = this.getProviderList();
        // Try each provider
        for (const provider of providers) {
            for (let retry = 0; retry < this.config.maxRetriesPerProvider; retry++) {
                const attemptStart = Date.now();
                try {
                    // Get model for this provider (or equivalent)
                    const providerModel = await this.getModelForProvider(provider, model);
                    // Attempt streaming
                    const s = (0, pi_ai_1.stream)(providerModel, context, {
                        ...options,
                        signal: this.createTimeoutSignal(this.config.providerTimeoutMs),
                    });
                    // Record successful attempt
                    const attempt = {
                        provider,
                        modelId: providerModel.id,
                        success: true,
                        latencyMs: Date.now() - attemptStart,
                        timestamp: new Date(),
                    };
                    attempts.push(attempt);
                    this.recordAttempt(attempt);
                    // Create result promise
                    const resultPromise = s.result().then(msg => ({
                        message: msg,
                        attempts,
                        successfulProvider: provider,
                        totalLatencyMs: Date.now() - startTime,
                    }));
                    return { stream: s, result: resultPromise };
                }
                catch (error) {
                    const attempt = {
                        provider,
                        modelId: model.id,
                        success: false,
                        latencyMs: Date.now() - attemptStart,
                        error: error instanceof Error ? error.message : String(error),
                        timestamp: new Date(),
                    };
                    attempts.push(attempt);
                    this.recordAttempt(attempt);
                    // Wait before retry
                    if (retry < this.config.maxRetriesPerProvider - 1) {
                        await this.delay(this.config.retryDelayMs * (retry + 1));
                    }
                }
            }
        }
        // All providers failed
        throw new ProviderFailoverError(`All providers failed after ${attempts.length} attempts`, attempts);
    }
    /**
     * Complete with automatic failover between providers
     */
    async completeWithFailover(model, context, options) {
        const attempts = [];
        const startTime = Date.now();
        // Get provider list based on strategy
        const providers = this.getProviderList();
        // Try each provider
        for (const provider of providers) {
            for (let retry = 0; retry < this.config.maxRetriesPerProvider; retry++) {
                const attemptStart = Date.now();
                try {
                    // Get model for this provider (or equivalent)
                    const providerModel = await this.getModelForProvider(provider, model);
                    // Attempt completion
                    const message = await (0, pi_ai_1.complete)(providerModel, context, {
                        ...options,
                        signal: this.createTimeoutSignal(this.config.providerTimeoutMs),
                    });
                    // Record successful attempt
                    const attempt = {
                        provider,
                        modelId: providerModel.id,
                        success: true,
                        latencyMs: Date.now() - attemptStart,
                        timestamp: new Date(),
                    };
                    attempts.push(attempt);
                    this.recordAttempt(attempt);
                    return {
                        message,
                        attempts,
                        successfulProvider: provider,
                        totalLatencyMs: Date.now() - startTime,
                    };
                }
                catch (error) {
                    const attempt = {
                        provider,
                        modelId: model.id,
                        success: false,
                        latencyMs: Date.now() - attemptStart,
                        error: error instanceof Error ? error.message : String(error),
                        timestamp: new Date(),
                    };
                    attempts.push(attempt);
                    this.recordAttempt(attempt);
                    // Wait before retry
                    if (retry < this.config.maxRetriesPerProvider - 1) {
                        await this.delay(this.config.retryDelayMs * (retry + 1));
                    }
                }
            }
        }
        // All providers failed
        throw new ProviderFailoverError(`All providers failed after ${attempts.length} attempts`, attempts);
    }
    /**
     * Get health status for all providers
     */
    getProviderHealth() {
        return Array.from(this.healthData.values());
    }
    /**
     * Get health for a specific provider
     */
    getHealth(provider) {
        return this.healthData.get(provider);
    }
    /**
     * Check if a provider is healthy
     */
    isHealthy(provider) {
        const health = this.healthData.get(provider);
        return health?.isHealthy ?? true; // Default to healthy if unknown
    }
    /**
     * Get the best performing provider
     */
    getBestProvider() {
        const healthy = this.getProviderHealth()
            .filter(h => h.isHealthy)
            .sort((a, b) => {
            // Sort by success rate, then by latency
            if (b.successRate !== a.successRate) {
                return b.successRate - a.successRate;
            }
            return a.avgLatencyMs - b.avgLatencyMs;
        });
        return healthy[0]?.provider ?? this.config.primaryProvider;
    }
    /**
     * Reset health data
     */
    resetHealth() {
        this.initializeHealthData();
        this.attemptHistory = [];
    }
    /**
     * Get recent attempt history
     */
    getAttemptHistory(limit = 100) {
        return this.attemptHistory.slice(-limit);
    }
    /**
     * Update configuration
     */
    updateConfig(config) {
        this.config = { ...this.config, ...config };
    }
    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------
    initializeHealthData() {
        const allProviders = [
            'anthropic',
            'openai',
            'google',
            'amazon-bedrock',
            'groq',
            'mistral',
            'openrouter',
            'azure-openai-responses',
        ];
        for (const provider of allProviders) {
            this.healthData.set(provider, {
                provider,
                isHealthy: true,
                successRate: 1.0,
                avgLatencyMs: 0,
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                consecutiveFailures: 0,
            });
        }
    }
    getProviderList() {
        const all = [
            this.config.primaryProvider,
            ...this.config.backupProviders,
        ];
        switch (this.config.strategy) {
            case FailoverStrategy.SEQUENTIAL:
                // Filter out unhealthy providers, but keep primary even if unhealthy
                return all.filter((p, i) => i === 0 || this.isHealthy(p));
            case FailoverStrategy.ROUND_ROBIN:
                // Rotate the list
                const rotated = [
                    ...all.slice(this.roundRobinIndex),
                    ...all.slice(0, this.roundRobinIndex),
                ];
                this.roundRobinIndex = (this.roundRobinIndex + 1) % all.length;
                return rotated.filter(p => this.isHealthy(p));
            case FailoverStrategy.BEST_PERFORMANCE:
                // Sort by performance
                return this.getProviderHealth()
                    .filter(h => h.isHealthy)
                    .sort((a, b) => b.successRate - a.successRate || a.avgLatencyMs - b.avgLatencyMs)
                    .map(h => h.provider);
            case FailoverStrategy.COST_OPTIMIZED:
                // Use configured order (assumed to be cost-ordered)
                return all.filter(p => this.isHealthy(p));
            default:
                return all;
        }
    }
    async getModelForProvider(provider, referenceModel) {
        // Try to find equivalent model in the target provider
        const { getModels } = await Promise.resolve().then(() => __importStar(require('@mariozechner/pi-ai')));
        const providerModels = getModels(provider);
        // Try exact match
        const exact = providerModels.find(m => m.id === referenceModel.id);
        if (exact)
            return exact;
        // Try to match by capability level
        // Map known models to capability tiers
        const tier = this.getModelTier(referenceModel.id);
        const equivalent = this.findEquivalentModel(providerModels, tier);
        if (equivalent)
            return equivalent;
        // Fall back to first available model
        if (providerModels.length > 0) {
            return providerModels[0];
        }
        throw new Error(`No models available for provider: ${provider}`);
    }
    getModelTier(modelId) {
        if (modelId.includes('opus') || modelId.includes('5.2') || modelId.includes('5.1-codex')) {
            return 'premium';
        }
        if (modelId.includes('sonnet') || modelId.includes('gpt-4') || modelId.includes('5')) {
            return 'standard';
        }
        return 'fast';
    }
    findEquivalentModel(models, tier) {
        const tierMap = {
            premium: ['opus', '5.2', '5.1-codex'],
            standard: ['sonnet', 'gpt-4', '5.1', '5'],
            fast: ['haiku', 'mini', 'nano', '3.5'],
        };
        const keywords = tierMap[tier];
        return models.find(m => keywords.some(k => m.id.includes(k)));
    }
    recordAttempt(attempt) {
        this.attemptHistory.push(attempt);
        // Keep only recent history
        const cutoff = Date.now() - this.config.healthCheckWindowMs;
        this.attemptHistory = this.attemptHistory.filter(a => a.timestamp.getTime() > cutoff);
        if (!this.config.trackHealth)
            return;
        // Update health data
        const health = this.healthData.get(attempt.provider);
        if (!health)
            return;
        health.totalRequests++;
        if (attempt.success) {
            health.successfulRequests++;
            health.consecutiveFailures = 0;
            health.lastSuccess = attempt.timestamp;
            // Update average latency
            if (health.avgLatencyMs === 0) {
                health.avgLatencyMs = attempt.latencyMs;
            }
            else {
                health.avgLatencyMs = (health.avgLatencyMs * 0.9) + (attempt.latencyMs * 0.1);
            }
        }
        else {
            health.failedRequests++;
            health.consecutiveFailures++;
            health.lastFailure = attempt.timestamp;
        }
        // Recalculate health status
        health.successRate = health.totalRequests > 0
            ? health.successfulRequests / health.totalRequests
            : 1.0;
        health.isHealthy =
            health.successRate >= this.config.healthThreshold &&
                health.consecutiveFailures < 3;
    }
    createTimeoutSignal(ms) {
        const controller = new AbortController();
        setTimeout(() => controller.abort(), ms);
        return controller.signal;
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.ProviderFailover = ProviderFailover;
// ============================================================================
// Custom Error Class
// ============================================================================
class ProviderFailoverError extends Error {
    constructor(message, attempts) {
        super(message);
        this.attempts = attempts;
        this.name = 'ProviderFailoverError';
    }
}
exports.ProviderFailoverError = ProviderFailoverError;
// ============================================================================
// Singleton Instance
// ============================================================================
exports.providerFailover = new ProviderFailover();
//# sourceMappingURL=provider-failover.js.map