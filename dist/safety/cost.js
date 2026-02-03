"use strict";
/**
 * Cost Calculation Module
 *
 * Provides cost attribution to agents/tasks and cost calculation from token counts.
 * Tracks cost history and supports multiple model pricing configurations.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.customPricing = exports.costHistory = exports.MODEL_PRICING = void 0;
exports.calculateCost = calculateCost;
exports.calculateCostFromTokens = calculateCostFromTokens;
exports.estimateCost = estimateCost;
exports.getPricing = getPricing;
exports.setPricing = setPricing;
exports.removePricing = removePricing;
exports.getCostPerThousandTokens = getCostPerThousandTokens;
exports.listPricing = listPricing;
exports.recordCost = recordCost;
exports.getCostHistory = getCostHistory;
exports.getAgentCostSummary = getAgentCostSummary;
exports.getTaskCostSummary = getTaskCostSummary;
exports.getProjectCostSummary = getProjectCostSummary;
exports.aggregateCostsByPeriod = aggregateCostsByPeriod;
exports.aggregateCostsByModel = aggregateCostsByModel;
exports.generateOptimizationSuggestions = generateOptimizationSuggestions;
const utils_1 = require("../utils");
// ============================================================================
// Model Pricing Configuration
// ============================================================================
/**
 * Default pricing for supported models (per 1K tokens in USD)
 */
exports.MODEL_PRICING = {
    // Anthropic models
    'claude-sonnet-4-5': {
        promptPerThousand: 0.003, // $3 per 1M
        completionPerThousand: 0.015, // $15 per 1M
    },
    'claude-3-5-sonnet': {
        promptPerThousand: 0.003,
        completionPerThousand: 0.015,
    },
    'claude-3-opus': {
        promptPerThousand: 0.015,
        completionPerThousand: 0.075,
    },
    'claude-3-haiku': {
        promptPerThousand: 0.00025,
        completionPerThousand: 0.00125,
    },
    // Moonshot models
    'moonshot/kimi-k2-5': {
        promptPerThousand: 0.001, // $1 per 1M
        completionPerThousand: 0.002, // $2 per 1M
    },
    'kimi-k2-5': {
        promptPerThousand: 0.001,
        completionPerThousand: 0.002,
    },
    // OpenAI models (for reference)
    'gpt-4': {
        promptPerThousand: 0.03,
        completionPerThousand: 0.06,
    },
    'gpt-4-turbo': {
        promptPerThousand: 0.01,
        completionPerThousand: 0.03,
    },
    'gpt-3.5-turbo': {
        promptPerThousand: 0.0005,
        completionPerThousand: 0.0015,
    },
    // Default fallback
    default: {
        promptPerThousand: 0.01,
        completionPerThousand: 0.03,
    },
};
// Custom pricing overrides
const customPricing = new Map();
exports.customPricing = customPricing;
// Cost history storage
const costHistory = [];
exports.costHistory = costHistory;
// ============================================================================
// Cost Calculation
// ============================================================================
/**
 * Calculate cost from token counts for a specific model
 */
function calculateCost(tokens, model) {
    const pricing = getPricing(model);
    if (!pricing) {
        utils_1.logger.warn(`Unknown model pricing: ${model}, using default pricing`);
    }
    const effectivePricing = pricing || exports.MODEL_PRICING['default'];
    const promptCost = (tokens.prompt / 1000) * effectivePricing.promptPerThousand;
    const completionCost = (tokens.completion / 1000) * effectivePricing.completionPerThousand;
    const totalCost = promptCost + completionCost;
    return {
        prompt: Math.round(promptCost * 10000) / 10000,
        completion: Math.round(completionCost * 10000) / 10000,
        total: Math.round(totalCost * 10000) / 10000,
    };
}
/**
 * Calculate cost from raw token counts (prompt + completion)
 */
function calculateCostFromTokens(promptTokens, completionTokens, model) {
    return calculateCost({
        prompt: promptTokens,
        completion: completionTokens,
        total: promptTokens + completionTokens,
    }, model);
}
/**
 * Estimate cost for a planned operation
 */
function estimateCost(estimatedPromptTokens, estimatedCompletionTokens, model) {
    return calculateCostFromTokens(estimatedPromptTokens, estimatedCompletionTokens, model);
}
// ============================================================================
// Model Pricing Management
// ============================================================================
/**
 * Get pricing for a model
 */
function getPricing(model) {
    // Check custom pricing first
    if (customPricing.has(model)) {
        return customPricing.get(model);
    }
    // Check standard pricing
    return exports.MODEL_PRICING[model];
}
/**
 * Set custom pricing for a model
 */
function setPricing(model, pricing) {
    customPricing.set(model, pricing);
    utils_1.logger.info(`Custom pricing set for model: ${model}`, { pricing });
}
/**
 * Remove custom pricing for a model (revert to default)
 */
function removePricing(model) {
    const existed = customPricing.has(model);
    customPricing.delete(model);
    return existed;
}
/**
 * Get cost per thousand tokens for a model
 */
function getCostPerThousandTokens(model) {
    return getPricing(model) || exports.MODEL_PRICING['default'];
}
/**
 * List all available pricing configurations
 */
function listPricing() {
    return {
        ...exports.MODEL_PRICING,
        ...Object.fromEntries(customPricing),
    };
}
// ============================================================================
// Cost Attribution
// ============================================================================
/**
 * Record a cost entry for attribution tracking
 */
function recordCost(agentId, taskId, projectId, model, tokens, operation, metadata) {
    const cost = calculateCost(tokens, model);
    const entry = {
        id: generateId(),
        timestamp: new Date(),
        agentId,
        taskId,
        projectId,
        model,
        tokens,
        cost,
        operation,
        metadata,
    };
    costHistory.push(entry);
    utils_1.logger.debug(`Cost recorded: ${entry.id}`, { agentId, taskId, cost: cost.total });
    return entry;
}
/**
 * Get cost history with optional filtering
 */
function getCostHistory(query = {}) {
    let results = [...costHistory];
    if (query.agentId) {
        results = results.filter((e) => e.agentId === query.agentId);
    }
    if (query.taskId) {
        results = results.filter((e) => e.taskId === query.taskId);
    }
    if (query.projectId) {
        results = results.filter((e) => e.projectId === query.projectId);
    }
    if (query.model) {
        results = results.filter((e) => e.model === query.model);
    }
    if (query.since) {
        results = results.filter((e) => e.timestamp >= query.since);
    }
    if (query.until) {
        results = results.filter((e) => e.timestamp <= query.until);
    }
    // Sort by timestamp descending
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    if (query.limit) {
        results = results.slice(0, query.limit);
    }
    return results;
}
/**
 * Get cost summary for an agent
 */
function getAgentCostSummary(agentId) {
    const entries = getCostHistory({ agentId });
    return summarizeCosts(entries, { agentId });
}
/**
 * Get cost summary for a task
 */
function getTaskCostSummary(taskId) {
    const entries = getCostHistory({ taskId });
    return summarizeCosts(entries, { taskId });
}
/**
 * Get cost summary for a project
 */
function getProjectCostSummary(projectId) {
    const entries = getCostHistory({ projectId });
    return summarizeCosts(entries, { projectId });
}
/**
 * Summarize costs from entries
 */
function summarizeCosts(entries, filters) {
    const totalTokens = entries.reduce((sum, e) => sum + e.tokens.total, 0);
    const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);
    return {
        ...filters,
        totalTokens,
        totalCost: Math.round(totalCost * 10000) / 10000,
        entries,
    };
}
// ============================================================================
// Cost Aggregation
// ============================================================================
/**
 * Aggregate costs by time period
 */
function aggregateCostsByPeriod(entries, period) {
    const aggregated = new Map();
    for (const entry of entries) {
        const key = getPeriodKey(entry.timestamp, period);
        const existing = aggregated.get(key);
        if (existing) {
            existing.tokens += entry.tokens.total;
            existing.cost += entry.cost.total;
            existing.count += 1;
        }
        else {
            aggregated.set(key, {
                tokens: entry.tokens.total,
                cost: entry.cost.total,
                count: 1,
            });
        }
    }
    return aggregated;
}
/**
 * Aggregate costs by model
 */
function aggregateCostsByModel(entries) {
    const aggregated = new Map();
    for (const entry of entries) {
        const existing = aggregated.get(entry.model);
        if (existing) {
            existing.tokens += entry.tokens.total;
            existing.cost += entry.cost.total;
            existing.count += 1;
        }
        else {
            aggregated.set(entry.model, {
                tokens: entry.tokens.total,
                cost: entry.cost.total,
                count: 1,
            });
        }
    }
    return aggregated;
}
/**
 * Get the period key for an entry
 */
function getPeriodKey(date, period) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    switch (period) {
        case 'hour':
            return `${year}-${month}-${day}T${hour}:00`;
        case 'day':
            return `${year}-${month}-${day}`;
        case 'week': {
            // Get ISO week number
            const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
            const dayNum = d.getUTCDay() || 7;
            d.setUTCDate(d.getUTCDate() + 4 - dayNum);
            const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
            const weekNum = String(Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)).padStart(2, '0');
            return `${year}-W${weekNum}`;
        }
        case 'month':
            return `${year}-${month}`;
        default:
            return `${year}-${month}-${day}`;
    }
}
/**
 * Generate cost optimization suggestions based on usage patterns
 */
function generateOptimizationSuggestions(entries) {
    const suggestions = [];
    // Analyze model usage
    const modelUsage = aggregateCostsByModel(entries);
    const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);
    // Check for expensive model usage
    const expensiveModels = ['claude-3-opus', 'gpt-4'];
    for (const [model, stats] of modelUsage) {
        if (expensiveModels.includes(model) && stats.cost > totalCost * 0.5) {
            suggestions.push({
                type: 'model',
                description: `High usage of expensive model ${model} ($${stats.cost.toFixed(2)})`,
                potentialSavings: 60,
                action: 'Consider using cheaper model for non-critical operations',
            });
        }
    }
    // Check for high token usage
    const avgTokens = entries.reduce((sum, e) => sum + e.tokens.total, 0) / entries.length;
    if (avgTokens > 50000) {
        suggestions.push({
            type: 'tokens',
            description: `High average token usage per request (${Math.round(avgTokens)} tokens)`,
            potentialSavings: 30,
            action: 'Reduce max tokens per response or optimize prompts',
        });
    }
    return suggestions;
}
// ============================================================================
// Helpers
// ============================================================================
function generateId() {
    return `cost_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}
//# sourceMappingURL=cost.js.map