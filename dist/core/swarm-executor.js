"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.swarmExecutor = exports.SwarmExecutor = void 0;
exports.executeSwarm = executeSwarm;
exports.getSwarmStatus = getSwarmStatus;
exports.getExecutionMetrics = getExecutionMetrics;
const events_1 = require("events");
const logger_1 = require("../utils/logger");
const budget_controller_1 = require("./budget-controller");
// ============================================================================
// SWARM EXECUTOR
// ============================================================================
class SwarmExecutor extends events_1.EventEmitter {
    constructor() {
        super();
        this.activeContexts = new Map();
        this.executionQueue = [];
        this.isProcessing = false;
        this.metrics = {
            swarmsCompleted: 0,
            swarmsFailed: 0,
            totalAgentsExecuted: 0,
            totalCost: 0,
            averageSwarmDuration: 0,
            successRate: 0,
        };
        this.config = {
            maxConcurrentSwarms: 10,
            maxAgentsPerSwarm: 20,
            executionTimeout: 30,
            retryFailedAgents: true,
            retryAttempts: 3,
            parallelismStrategy: 'parallel',
        };
    }
    // =========================================================================
    // PUBLIC METHODS
    // =========================================================================
    /**
     * Execute a swarm with the specified configuration
     */
    async executeSwarm(swarmId, agentIds, options) {
        // Merge options with defaults
        const mergedConfig = { ...this.config, ...options };
        // Check concurrent swarm limit
        if (this.activeContexts.size >= mergedConfig.maxConcurrentSwarms) {
            logger_1.logger.warn('swarm-executor', 'Max concurrent swarms reached, queuing');
            this.executionQueue.push(swarmId);
            return this.createPendingContext(swarmId, agentIds, mergedConfig);
        }
        // Create execution context
        const context = this.createExecutionContext(swarmId, agentIds, mergedConfig);
        this.activeContexts.set(swarmId, context);
        // Emit start event
        this.emit('swarm:starting', { swarmId, agentCount: agentIds.length });
        try {
            // Execute based on parallelism strategy
            await this.executeAccordingToStrategy(context, agentIds);
            // Mark as completed
            context.status = 'completed';
            this.metrics.swarmsCompleted++;
            this.updateSuccessRate();
            // Emit completion event
            this.emit('swarm:completed', {
                swarmId,
                duration: this.getDuration(context),
                cost: context.totalCost,
                agentResults: context.agentResults,
            });
            // Update budget
            budget_controller_1.budgetController.recordSpend(context.totalCost);
            this.metrics.totalCost += context.totalCost;
            // Cleanup
            setTimeout(() => this.activeContexts.delete(swarmId), 60000);
            return context;
        }
        catch (error) {
            context.status = 'failed';
            this.metrics.swarmsFailed++;
            this.updateSuccessRate();
            this.emit('swarm:failed', {
                swarmId,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error;
        }
    }
    /**
     * Cancel a running swarm
     */
    async cancelSwarm(swarmId) {
        const context = this.activeContexts.get(swarmId);
        if (!context) {
            logger_1.logger.warn('swarm-executor', 'Swarm not found for cancellation', { swarmId });
            return false;
        }
        context.status = 'cancelled';
        this.emit('swarm:cancelled', { swarmId });
        // Stop all agent executions
        for (const [agentId, result] of context.agentResults) {
            if (result.status === 'running' || result.status === 'pending') {
                result.status = 'cancelled';
            }
        }
        // Remove from active contexts
        this.activeContexts.delete(swarmId);
        // Process queue
        await this.processQueue();
        return true;
    }
    /**
     * Get status of active swarms
     */
    getActiveSwarms() {
        return Array.from(this.activeContexts.values()).filter((ctx) => ctx.status === 'running');
    }
    /**
     * Get execution metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Get queue status
     */
    getQueueStatus() {
        return {
            queued: this.executionQueue.length,
            processing: this.isProcessing,
        };
    }
    /**
     * Scale a running swarm (add/remove agents)
     */
    async scaleSwarm(swarmId, targetAgentCount) {
        const context = this.activeContexts.get(swarmId);
        if (!context || context.status !== 'running') {
            return false;
        }
        const currentCount = context.agentResults.size;
        if (targetAgentCount === currentCount)
            return true;
        if (targetAgentCount > currentCount) {
            // Scale up - would need to implement agent spawning
            logger_1.logger.info('swarm-executor', 'Scaling up swarm not yet implemented', {
                swarmId,
                target: targetAgentCount,
            });
        }
        else {
            // Scale down - cancel excess agents
            const agentIds = Array.from(context.agentResults.keys());
            const toRemove = agentIds.slice(targetAgentCount);
            for (const agentId of toRemove) {
                const result = context.agentResults.get(agentId);
                if (result && result.status !== 'completed') {
                    result.status = 'cancelled';
                }
            }
        }
        return true;
    }
    /**
     * Get execution context for a swarm
     */
    getContext(swarmId) {
        return this.activeContexts.get(swarmId);
    }
    // =========================================================================
    // PRIVATE METHODS
    // =========================================================================
    createExecutionContext(swarmId, agentIds, config) {
        const agentResults = new Map();
        for (const agentId of agentIds) {
            agentResults.set(agentId, {
                agentId,
                status: 'pending',
                cost: 0,
                retries: 0,
            });
        }
        return {
            swarmId,
            config,
            startTime: new Date(),
            status: 'pending',
            agentResults,
            totalCost: 0,
            progress: 0,
        };
    }
    createPendingContext(swarmId, agentIds, config) {
        return this.createExecutionContext(swarmId, agentIds, config);
    }
    async executeAccordingToStrategy(context, agentIds) {
        context.status = 'running';
        switch (this.config.parallelismStrategy) {
            case 'serial':
                await this.executeSerial(context, agentIds);
                break;
            case 'parallel':
                await this.executeParallel(context, agentIds);
                break;
            case 'hybrid':
                await this.executeHybrid(context, agentIds);
                break;
            default:
                await this.executeParallel(context, agentIds);
        }
    }
    async executeSerial(context, agentIds) {
        for (let i = 0; i < agentIds.length; i++) {
            const agentId = agentIds[i];
            const result = context.agentResults.get(agentId);
            if (!result)
                continue;
            try {
                result.status = 'running';
                result.startTime = new Date();
                // Execute agent (simulated - would integrate with actual agent runner)
                const executionResult = await this.executeAgent(agentId);
                result.status = executionResult.success ? 'completed' : 'failed';
                result.endTime = new Date();
                result.cost = executionResult.cost;
                result.output = executionResult.output;
                result.error = executionResult.error;
                if (executionResult.success) {
                    context.totalCost += executionResult.cost;
                }
                context.progress = ((i + 1) / agentIds.length) * 100;
                this.emit('agent:completed', { agentId, result });
            }
            catch (error) {
                await this.handleAgentFailure(context, agentId, error);
            }
        }
    }
    async executeParallel(context, agentIds) {
        const promises = agentIds.map((agentId) => this.executeAgentAsync(context, agentId));
        await Promise.allSettled(promises);
    }
    async executeHybrid(context, agentIds) {
        const batchSize = 5; // Process in batches of 5
        for (let i = 0; i < agentIds.length; i += batchSize) {
            const batch = agentIds.slice(i, i + batchSize);
            const promises = batch.map((agentId) => this.executeAgentAsync(context, agentId));
            await Promise.allSettled(promises);
        }
    }
    async executeAgentAsync(context, agentId) {
        const result = context.agentResults.get(agentId);
        if (!result)
            return;
        try {
            result.status = 'running';
            result.startTime = new Date();
            const executionResult = await this.executeAgent(agentId);
            result.status = executionResult.success ? 'completed' : 'failed';
            result.endTime = new Date();
            result.cost = executionResult.cost;
            result.output = executionResult.output;
            result.error = executionResult.error;
            if (executionResult.success) {
                context.totalCost += executionResult.cost;
            }
            this.metrics.totalAgentsExecuted++;
            this.emit('agent:completed', { agentId, result });
        }
        catch (error) {
            await this.handleAgentFailure(context, agentId, error);
        }
    }
    async executeAgent(agentId) {
        // Simulated execution - would integrate with actual agent runner
        // In real implementation, this would call the agent execution service
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 100));
        // Simulated cost (random for demo)
        const cost = Math.random() * 0.5;
        // 90% success rate for simulation
        const success = Math.random() > 0.1;
        return {
            success,
            cost,
            output: success ? `Agent ${agentId} completed successfully` : undefined,
            error: success ? undefined : `Agent ${agentId} failed`,
        };
    }
    async handleAgentFailure(context, agentId, error) {
        const result = context.agentResults.get(agentId);
        if (!result)
            return;
        result.error = error instanceof Error ? error.message : String(error);
        result.retries++;
        if (this.config.retryFailedAgents &&
            result.retries < this.config.retryAttempts) {
            result.status = 'retrying';
            this.emit('agent:retrying', { agentId, attempt: result.retries });
            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, 1000 * result.retries));
            await this.executeAgentAsync(context, agentId);
        }
        else {
            result.status = 'failed';
            this.emit('agent:failed', { agentId, error: result.error });
        }
    }
    async processQueue() {
        if (this.isProcessing || this.executionQueue.length === 0)
            return;
        this.isProcessing = true;
        while (this.executionQueue.length > 0) {
            const swarmId = this.executionQueue.shift();
            if (!swarmId)
                break;
            const context = this.activeContexts.get(swarmId);
            if (context) {
                context.status = 'pending';
                // Would re-trigger execution here
            }
        }
        this.isProcessing = false;
    }
    getDuration(context) {
        if (!context.startTime)
            return 0;
        const endTime = context.endTime || new Date();
        return Math.floor((endTime.getTime() - context.startTime.getTime()) / 1000);
    }
    updateSuccessRate() {
        const total = this.metrics.swarmsCompleted + this.metrics.swarmsFailed;
        if (total > 0) {
            this.metrics.successRate =
                this.metrics.swarmsCompleted / total;
        }
    }
}
exports.SwarmExecutor = SwarmExecutor;
// ============================================================================
// SINGLETON INSTANCE
// ============================================================================
exports.swarmExecutor = new SwarmExecutor();
// ============================================================================
// HELPER FUNCTIONS
// ============================================================================
/**
 * Quick swarm execution
 */
async function executeSwarm(swarmId, agentIds) {
    return exports.swarmExecutor.executeSwarm(swarmId, agentIds);
}
/**
 * Get swarm execution status
 */
function getSwarmStatus(swarmId) {
    return exports.swarmExecutor.getContext(swarmId);
}
/**
 * Get execution metrics
 */
function getExecutionMetrics() {
    return exports.swarmExecutor.getMetrics();
}
//# sourceMappingURL=swarm-executor.js.map