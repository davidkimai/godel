"use strict";
/**
 * Swarm LLM
 *
 * High-level API for using the unified LLM system in Dash swarms.
 * Combines model resolution, provider failover, and cost tracking.
 *
 * @module swarm-llm
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CostTracker = exports.ProviderFailoverError = exports.FailoverStrategy = exports.ProviderFailover = exports.SwarmModelResolver = void 0;
exports.getSwarmModel = getSwarmModel;
exports.streamWithFailover = streamWithFailover;
exports.completeWithFailover = completeWithFailover;
exports.createMultiProviderSwarm = createMultiProviderSwarm;
const pi_ai_1 = require("@mariozechner/pi-ai");
const swarm_model_resolver_1 = require("./swarm-model-resolver");
const provider_failover_1 = require("./provider-failover");
const cost_tracker_1 = require("./cost-tracker");
// ============================================================================
// High-Level API Functions
// ============================================================================
const modelResolver = new swarm_model_resolver_1.SwarmModelResolver();
const providerFailover = new provider_failover_1.ProviderFailover();
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
function getSwarmModel(taskType, options) {
    return (0, swarm_model_resolver_1.getSwarmModel)(taskType, options);
}
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
async function streamWithFailover(model, context, options) {
    const opts = normalizeOptions(options);
    const costTracker = opts.enableCostTracking
        ? new cost_tracker_1.CostTracker(opts.costTrackingOptions)
        : null;
    const startTime = Date.now();
    // Use failover if enabled
    if (opts.enableFailover) {
        const failover = new provider_failover_1.ProviderFailover(opts.failoverConfig);
        const { stream: s, result } = await failover.streamWithFailover(model, context, opts);
        // Wrap result to add cost tracking
        const wrappedResult = result.then(async (failoverResult) => {
            const latencyMs = Date.now() - startTime;
            // Record cost if tracking enabled
            if (costTracker) {
                await costTracker.recordCost(model, failoverResult.message.usage, {
                    taskId: opts.taskId,
                    agentId: opts.agentId,
                    swarmId: opts.swarmId,
                    latencyMs,
                    metadata: {
                        failoverAttempts: failoverResult.attempts.length,
                        successfulProvider: failoverResult.successfulProvider,
                    },
                });
            }
            return {
                message: failoverResult.message,
                attempts: failoverResult.attempts,
                successfulProvider: failoverResult.successfulProvider,
                totalLatencyMs: failoverResult.totalLatencyMs,
                costStatus: costTracker?.getStatus(),
            };
        });
        return { stream: s, result: wrappedResult };
    }
    // Direct streaming without failover
    const s = (0, pi_ai_1.stream)(model, context, opts);
    const wrappedResult = s.result().then(async (message) => {
        const latencyMs = Date.now() - startTime;
        if (costTracker) {
            await costTracker.recordCost(model, message.usage, {
                taskId: opts.taskId,
                agentId: opts.agentId,
                swarmId: opts.swarmId,
                latencyMs,
            });
        }
        return {
            message,
            attempts: [{
                    provider: model.provider,
                    modelId: model.id,
                    success: true,
                    latencyMs,
                    timestamp: new Date(),
                }],
            successfulProvider: model.provider,
            totalLatencyMs: latencyMs,
            costStatus: costTracker?.getStatus(),
        };
    });
    return { stream: s, result: wrappedResult };
}
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
async function completeWithFailover(model, context, options) {
    const { result } = await streamWithFailover(model, context, options);
    return result;
}
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
function createMultiProviderSwarm(config) {
    const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const agents = [];
    const providers = config.preferredProviders ?? ['anthropic', 'openai', 'google'];
    // Get models for each provider
    const providerModels = new Map();
    for (const provider of providers) {
        const models = modelResolver.getModelsForTask(config.taskType)
            .filter(m => m.provider === provider);
        if (models.length > 0) {
            providerModels.set(provider, models);
        }
    }
    // Filter to providers with available models
    const availableProviders = Array.from(providerModels.keys());
    if (availableProviders.length === 0) {
        throw new Error(`No providers available for task type: ${config.taskType}`);
    }
    // Distribute agents
    for (let i = 0; i < config.agentCount; i++) {
        let provider;
        switch (config.distributionStrategy) {
            case 'round_robin':
                provider = availableProviders[i % availableProviders.length];
                break;
            case 'weighted':
                provider = selectWeightedProvider(availableProviders, config.providerWeights);
                break;
            case 'performance_based':
                // Use the provider with best health
                provider = providerFailover.getBestProvider();
                break;
            default:
                provider = availableProviders[0];
        }
        const models = providerModels.get(provider);
        const model = models[0]; // Best model for the task
        agents.push({
            agentId: `${swarmId}_agent_${i + 1}`,
            model,
            provider,
            taskType: config.taskType,
            budgetLimit: config.budgetPerAgent,
            enableFailover: config.enableFailover ?? true,
        });
    }
    return { swarmId, agents };
}
// ============================================================================
// Helper Functions
// ============================================================================
function normalizeOptions(options) {
    return {
        ...options,
        taskType: options?.taskType ?? 'chat',
        enableFailover: options?.enableFailover ?? false,
        failoverConfig: options?.failoverConfig ?? {},
        enableCostTracking: options?.enableCostTracking ?? false,
        costTrackingOptions: options?.costTrackingOptions ?? {},
        taskId: options?.taskId,
        agentId: options?.agentId,
        swarmId: options?.swarmId,
    };
}
function selectWeightedProvider(providers, weights) {
    if (!weights) {
        return providers[Math.floor(Math.random() * providers.length)];
    }
    const totalWeight = providers.reduce((sum, p) => sum + (weights[p] ?? 1), 0);
    let random = Math.random() * totalWeight;
    for (const provider of providers) {
        random -= weights[provider] ?? 1;
        if (random <= 0) {
            return provider;
        }
    }
    return providers[providers.length - 1];
}
// ============================================================================
// Re-export for convenience
// ============================================================================
var swarm_model_resolver_2 = require("./swarm-model-resolver");
Object.defineProperty(exports, "SwarmModelResolver", { enumerable: true, get: function () { return swarm_model_resolver_2.SwarmModelResolver; } });
var provider_failover_2 = require("./provider-failover");
Object.defineProperty(exports, "ProviderFailover", { enumerable: true, get: function () { return provider_failover_2.ProviderFailover; } });
Object.defineProperty(exports, "FailoverStrategy", { enumerable: true, get: function () { return provider_failover_2.FailoverStrategy; } });
Object.defineProperty(exports, "ProviderFailoverError", { enumerable: true, get: function () { return provider_failover_2.ProviderFailoverError; } });
var cost_tracker_2 = require("./cost-tracker");
Object.defineProperty(exports, "CostTracker", { enumerable: true, get: function () { return cost_tracker_2.CostTracker; } });
//# sourceMappingURL=swarm-llm.js.map