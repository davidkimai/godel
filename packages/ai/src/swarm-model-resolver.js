"use strict";
/**
 * Swarm Model Resolver
 *
 * Provides cost-optimized model selection for Dash swarms.
 * Selects the best model based on task type, budget constraints, and provider availability.
 *
 * @module swarm-model-resolver
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.swarmModelResolver = exports.SwarmModelResolver = void 0;
exports.getSwarmModel = getSwarmModel;
const pi_ai_1 = require("@mariozechner/pi-ai");
// ============================================================================
// Task-Specific Model Preferences
// ============================================================================
/**
 * Task-specific model preferences
 * Maps task types to preferred models (in order of preference)
 */
const TASK_MODEL_PREFERENCES = {
    coding: [
        'gpt-5.1-codex', // Best for coding
        'claude-sonnet-4-20250514',
        'gpt-4.1',
        'claude-haiku-4-20250514',
    ],
    reasoning: [
        'claude-opus-4-20250514', // Best reasoning
        'gpt-5.2',
        'claude-sonnet-4-20250514',
        'gpt-4.1',
    ],
    summarization: [
        'claude-haiku-4-20250514', // Fast, cheap
        'gpt-4.1-mini',
        'claude-sonnet-4-20250514',
    ],
    chat: [
        'claude-sonnet-4-20250514', // Good balance
        'gpt-4.1',
        'claude-haiku-4-20250514',
    ],
    analysis: [
        'claude-sonnet-4-20250514',
        'gpt-4.1',
        'claude-opus-4-20250514',
    ],
    creative: [
        'claude-sonnet-4-20250514',
        'gpt-4.1',
        'gpt-5.1-codex',
    ],
    classification: [
        'claude-haiku-4-20250514', // Fast, cheap
        'gpt-4.1-mini',
        'claude-sonnet-4-20250514',
    ],
    extraction: [
        'claude-sonnet-4-20250514',
        'gpt-4.1',
        'claude-haiku-4-20250514',
    ],
    planning: [
        'claude-opus-4-20250514', // Best for complex planning
        'gpt-5.2',
        'claude-sonnet-4-20250514',
    ],
    review: [
        'claude-sonnet-4-20250514',
        'gpt-5.1-codex',
        'gpt-4.1',
    ],
};
/**
 * Cost tier multipliers (relative to base cost)
 */
const COST_TIERS = {
    premium: 3.0, // Opus, GPT-5 series
    standard: 1.0, // Sonnet, GPT-4 series
    economy: 0.3, // Haiku, GPT-3.5 series
    mini: 0.1, // Mini models
};
/**
 * Quality scores (subjective, based on typical performance)
 */
const QUALITY_SCORES = {
    'claude-opus-4-20250514': 0.95,
    'gpt-5.2': 0.95,
    'gpt-5.1-codex': 0.93,
    'claude-sonnet-4-20250514': 0.88,
    'gpt-4.1': 0.88,
    'claude-haiku-4-20250514': 0.75,
    'gpt-4.1-mini': 0.78,
    'gpt-4.1-nano': 0.70,
};
// Default quality for unknown models
const DEFAULT_QUALITY = 0.80;
// ============================================================================
// Swarm Model Resolver Class
// ============================================================================
class SwarmModelResolver {
    constructor() {
        this.cache = new Map();
        this.cacheExpiry = new Map();
        this.CACHE_TTL = 5 * 60 * 1000; // 5 minutes
    }
    /**
     * Get the best model for a given swarm task
     */
    resolveModel(config) {
        const cacheKey = this.getCacheKey(config);
        // Check cache
        if (config.useCache !== false) {
            const cached = this.getFromCache(cacheKey);
            if (cached) {
                return cached.model;
            }
        }
        // Score all available models
        const scored = this.scoreModels(config);
        if (scored.length === 0) {
            throw new Error(`No models found for task type "${config.taskType}" with given constraints`);
        }
        // Sort by score (descending)
        scored.sort((a, b) => b.score - a.score);
        // Cache and return best model
        const best = scored[0];
        this.setCache(cacheKey, best);
        return best.model;
    }
    /**
     * Get multiple model options ranked by suitability
     */
    resolveModels(config, count = 3) {
        const scored = this.scoreModels(config);
        scored.sort((a, b) => b.score - a.score);
        return scored.slice(0, count).map(s => s.model);
    }
    /**
     * Get model for a specific provider
     */
    getModelForProvider(provider, modelId) {
        return (0, pi_ai_1.getModel)(provider, modelId);
    }
    /**
     * Get all available providers
     */
    getAvailableProviders() {
        return (0, pi_ai_1.getProviders)();
    }
    /**
     * Get models for a specific task type
     */
    getModelsForTask(taskType) {
        const preferences = TASK_MODEL_PREFERENCES[taskType] || [];
        const models = [];
        for (const provider of (0, pi_ai_1.getProviders)()) {
            for (const model of (0, pi_ai_1.getModels)(provider)) {
                if (preferences.includes(model.id)) {
                    models.push(model);
                }
            }
        }
        // Sort by preference order
        return models.sort((a, b) => {
            const idxA = preferences.indexOf(a.id);
            const idxB = preferences.indexOf(b.id);
            return idxA - idxB;
        });
    }
    /**
     * Clear the model cache
     */
    clearCache() {
        this.cache.clear();
        this.cacheExpiry.clear();
    }
    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------
    scoreModels(config) {
        const scores = [];
        const preferences = TASK_MODEL_PREFERENCES[config.taskType] || [];
        // Get providers to consider
        const providers = config.preferredProviders?.length
            ? config.preferredProviders
            : (0, pi_ai_1.getProviders)();
        for (const provider of providers) {
            for (const model of (0, pi_ai_1.getModels)(provider)) {
                const score = this.calculateScore(model, config, preferences);
                if (score.score > 0) {
                    scores.push(score);
                }
            }
        }
        return scores;
    }
    calculateScore(model, config, preferences) {
        const costWeight = config.costWeight ?? 0.5;
        const qualityWeight = config.qualityWeight ?? 0.5;
        // Check required capabilities
        if (config.requiredCapabilities) {
            for (const cap of config.requiredCapabilities) {
                if (!this.hasCapability(model, cap)) {
                    return {
                        model,
                        score: 0,
                        costScore: 0,
                        qualityScore: 0,
                        speedScore: 0,
                        reason: `Missing capability: ${cap}`
                    };
                }
            }
        }
        // Check minimum context window
        if (config.minContextWindow && model.contextWindow < config.minContextWindow) {
            return {
                model,
                score: 0,
                costScore: 0,
                qualityScore: 0,
                speedScore: 0,
                reason: `Context window too small: ${model.contextWindow} < ${config.minContextWindow}`
            };
        }
        // Calculate cost score (inverse - lower is better)
        const maxCost = this.getMaxCost();
        const normalizedCost = (model.cost.input + model.cost.output) / maxCost;
        const costScore = Math.max(0, 1 - normalizedCost);
        // Calculate quality score
        const qualityScore = QUALITY_SCORES[model.id] ?? DEFAULT_QUALITY;
        // Calculate preference bonus
        const prefIndex = preferences.indexOf(model.id);
        const preferenceBonus = prefIndex >= 0
            ? 1 - (prefIndex / preferences.length) * 0.3 // Up to 0.3 bonus
            : 0;
        // Calculate speed score (based on model tier)
        const speedScore = this.estimateSpeedScore(model);
        // Combine scores
        const combinedScore = (costScore * costWeight) +
            (qualityScore * qualityWeight) +
            (preferenceBonus * 0.2) +
            (speedScore * 0.1);
        // Check budget constraint
        if (config.budgetLimit !== undefined) {
            const estimatedCost = this.estimateCost(model);
            if (estimatedCost > config.budgetLimit) {
                return {
                    model,
                    score: combinedScore * 0.5, // Penalize but don't exclude
                    costScore,
                    qualityScore,
                    speedScore,
                    reason: `Over budget: ~$${estimatedCost.toFixed(4)} > $${config.budgetLimit}`
                };
            }
        }
        return {
            model,
            score: combinedScore,
            costScore,
            qualityScore,
            speedScore,
            reason: prefIndex >= 0
                ? `Ranked #${prefIndex + 1} for ${config.taskType}`
                : 'General purpose model'
        };
    }
    hasCapability(model, capability) {
        switch (capability) {
            case 'text':
                return model.input.includes('text');
            case 'image':
                return model.input.includes('image');
            case 'thinking':
                return model.reasoning;
            case 'tools':
                // Most modern models support tools
                return true;
            case 'json':
                // Most modern models support JSON
                return true;
            case 'streaming':
                // All supported models support streaming
                return true;
            default:
                return false;
        }
    }
    getMaxCost() {
        // Approximate max cost per million tokens
        return 50; // $50 per million tokens (Opus range)
    }
    estimateCost(model) {
        // Estimate cost for a typical request (4K input, 1K output)
        const inputCost = (model.cost.input / 1000000) * 4000;
        const outputCost = (model.cost.output / 1000000) * 1000;
        return inputCost + outputCost;
    }
    estimateSpeedScore(model) {
        // Estimate speed based on model characteristics
        // Faster models = higher score
        if (model.id.includes('haiku') || model.id.includes('mini') || model.id.includes('nano')) {
            return 1.0;
        }
        if (model.id.includes('sonnet') || model.id.includes('gpt-4')) {
            return 0.7;
        }
        if (model.id.includes('opus') || model.id.includes('5.2')) {
            return 0.4;
        }
        return 0.6; // Default
    }
    getCacheKey(config) {
        return JSON.stringify({
            taskType: config.taskType,
            budgetLimit: config.budgetLimit,
            preferredProviders: config.preferredProviders?.sort(),
            requiredCapabilities: config.requiredCapabilities?.sort(),
            thinkingLevel: config.thinkingLevel,
            minContextWindow: config.minContextWindow,
        });
    }
    getFromCache(key) {
        const expiry = this.cacheExpiry.get(key);
        if (expiry && Date.now() > expiry) {
            this.cache.delete(key);
            this.cacheExpiry.delete(key);
            return null;
        }
        return this.cache.get(key) ?? null;
    }
    setCache(key, score) {
        this.cache.set(key, score);
        this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
    }
}
exports.SwarmModelResolver = SwarmModelResolver;
// ============================================================================
// Convenience Functions
// ============================================================================
/**
 * Default singleton instance
 */
exports.swarmModelResolver = new SwarmModelResolver();
/**
 * Get the best model for a task type (convenience function)
 */
function getSwarmModel(taskType, options) {
    return exports.swarmModelResolver.resolveModel({
        taskType,
        ...options,
    });
}
//# sourceMappingURL=swarm-model-resolver.js.map