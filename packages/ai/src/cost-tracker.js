"use strict";
/**
 * Cost Tracker
 *
 * Integrates LLM usage with Dash's budget system.
 * Tracks per-request costs and provides hooks for budget enforcement.
 *
 * @module cost-tracker
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.costTracker = exports.CostTracker = void 0;
const pi_ai_1 = require("@mariozechner/pi-ai");
// ============================================================================
// Cost Tracker Class
// ============================================================================
class CostTracker {
    constructor(options = {}) {
        this.entries = [];
        this.warningTriggered = false;
        this.stopTriggered = false;
        this.options = {
            budgetLimit: options.budgetLimit ?? Infinity,
            warningThreshold: options.warningThreshold ?? 0.75,
            stopThreshold: options.stopThreshold ?? 0.95,
            onCostIncurred: options.onCostIncurred ?? (() => { }),
            onWarning: options.onWarning ?? (() => { }),
            onStop: options.onStop ?? (() => { }),
            trackByProvider: options.trackByProvider ?? true,
            trackByModel: options.trackByModel ?? true,
            trackByTask: options.trackByTask ?? true,
            metadata: options.metadata ?? {},
        };
    }
    /**
     * Record a cost entry from model usage
     */
    async recordCost(model, usage, options) {
        // Calculate cost using pi-mono's calculator
        const cost = (0, pi_ai_1.calculateCost)(model, usage);
        const entry = {
            id: this.generateId(),
            timestamp: new Date(),
            provider: model.provider,
            modelId: model.id,
            modelName: model.name,
            usage: { ...usage },
            cost: { ...cost },
            taskId: options?.taskId,
            agentId: options?.agentId,
            swarmId: options?.swarmId,
            latencyMs: options?.latencyMs,
            metadata: { ...this.options.metadata, ...options?.metadata },
        };
        this.entries.push(entry);
        // Notify callback
        await this.options.onCostIncurred(entry);
        // Check thresholds
        await this.checkThresholds();
        return entry;
    }
    /**
     * Estimate cost before making a request
     */
    estimateCost(model, estimatedInputTokens, estimatedOutputTokens) {
        const estimatedUsage = {
            input: estimatedInputTokens,
            output: estimatedOutputTokens,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: estimatedInputTokens + estimatedOutputTokens,
            cost: {
                input: 0,
                output: 0,
                cacheRead: 0,
                cacheWrite: 0,
                total: 0,
            },
        };
        return (0, pi_ai_1.calculateCost)(model, estimatedUsage);
    }
    /**
     * Check if a request would exceed budget
     */
    wouldExceedBudget(model, estimatedInputTokens, estimatedOutputTokens) {
        const estimate = this.estimateCost(model, estimatedInputTokens, estimatedOutputTokens);
        const currentTotal = this.getTotalCost();
        const projectedTotal = currentTotal + estimate.total;
        return {
            wouldExceed: projectedTotal > this.options.budgetLimit,
            projectedTotal,
            remaining: this.options.budgetLimit - currentTotal,
        };
    }
    /**
     * Get current cost status
     */
    getStatus() {
        const totalCost = this.getTotalCost();
        const percentUsed = this.options.budgetLimit === Infinity
            ? 0
            : totalCost / this.options.budgetLimit;
        return {
            totalCost,
            budgetLimit: this.options.budgetLimit,
            percentUsed,
            remainingBudget: this.options.budgetLimit - totalCost,
            entryCount: this.entries.length,
            warningTriggered: this.warningTriggered,
            stopTriggered: this.stopTriggered,
        };
    }
    /**
     * Get total cost incurred
     */
    getTotalCost() {
        return this.entries.reduce((sum, e) => sum + e.cost.total, 0);
    }
    /**
     * Get costs by provider
     */
    getCostsByProvider() {
        if (!this.options.trackByProvider)
            return [];
        const byProvider = new Map();
        for (const entry of this.entries) {
            const list = byProvider.get(entry.provider) ?? [];
            list.push(entry);
            byProvider.set(entry.provider, list);
        }
        return Array.from(byProvider.entries()).map(([provider, entries]) => {
            const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);
            const totalTokens = entries.reduce((sum, e) => sum + e.usage.totalTokens, 0);
            return {
                provider,
                totalCost,
                requestCount: entries.length,
                avgCostPerRequest: totalCost / entries.length,
                totalTokens,
            };
        }).sort((a, b) => b.totalCost - a.totalCost);
    }
    /**
     * Get costs by model
     */
    getCostsByModel() {
        if (!this.options.trackByModel)
            return [];
        const byModel = new Map();
        for (const entry of this.entries) {
            const key = `${entry.provider}:${entry.modelId}`;
            const list = byModel.get(key) ?? [];
            list.push(entry);
            byModel.set(key, list);
        }
        return Array.from(byModel.entries()).map(([key, entries]) => {
            const first = entries[0];
            const totalCost = entries.reduce((sum, e) => sum + e.cost.total, 0);
            const totalTokens = entries.reduce((sum, e) => sum + e.usage.totalTokens, 0);
            return {
                modelId: first.modelId,
                modelName: first.modelName,
                provider: first.provider,
                totalCost,
                requestCount: entries.length,
                avgCostPerRequest: totalCost / entries.length,
                totalTokens,
            };
        }).sort((a, b) => b.totalCost - a.totalCost);
    }
    /**
     * Get costs for a specific task
     */
    getCostsForTask(taskId) {
        if (!this.options.trackByTask)
            return [];
        return this.entries.filter(e => e.taskId === taskId);
    }
    /**
     * Get costs for a specific agent
     */
    getCostsForAgent(agentId) {
        return this.entries.filter(e => e.agentId === agentId);
    }
    /**
     * Get costs for a specific swarm
     */
    getCostsForSwarm(swarmId) {
        return this.entries.filter(e => e.swarmId === swarmId);
    }
    /**
     * Get all entries
     */
    getEntries() {
        return [...this.entries];
    }
    /**
     * Get recent entries
     */
    getRecentEntries(limit = 100) {
        return this.entries.slice(-limit);
    }
    /**
     * Clear all entries
     */
    clear() {
        this.entries = [];
        this.warningTriggered = false;
        this.stopTriggered = false;
    }
    /**
     * Update budget limit
     */
    setBudgetLimit(limit) {
        this.options.budgetLimit = limit;
        this.warningTriggered = false;
        this.stopTriggered = false;
    }
    /**
     * Reset threshold triggers
     */
    resetThresholds() {
        this.warningTriggered = false;
        this.stopTriggered = false;
    }
    /**
     * Export cost report
     */
    exportReport() {
        const status = this.getStatus();
        const byProvider = this.getCostsByProvider();
        const byModel = this.getCostsByModel();
        return {
            generatedAt: new Date(),
            status,
            summary: {
                totalRequests: this.entries.length,
                totalCost: status.totalCost,
                avgCostPerRequest: status.totalCost / Math.max(1, this.entries.length),
                topProvider: byProvider[0]?.provider ?? 'N/A',
                topModel: byModel[0]?.modelName ?? 'N/A',
            },
            byProvider,
            byModel,
            recentEntries: this.getRecentEntries(50),
        };
    }
    // --------------------------------------------------------------------------
    // Private Methods
    // --------------------------------------------------------------------------
    async checkThresholds() {
        if (this.options.budgetLimit === Infinity)
            return;
        const status = this.getStatus();
        // Check warning threshold
        if (!this.warningTriggered && status.percentUsed >= this.options.warningThreshold) {
            this.warningTriggered = true;
            await this.options.onWarning(status);
        }
        // Check stop threshold
        if (!this.stopTriggered && status.percentUsed >= this.options.stopThreshold) {
            this.stopTriggered = true;
            await this.options.onStop(status);
        }
    }
    generateId() {
        return `cost_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.CostTracker = CostTracker;
// ============================================================================
// Singleton Instance
// ============================================================================
exports.costTracker = new CostTracker();
//# sourceMappingURL=cost-tracker.js.map