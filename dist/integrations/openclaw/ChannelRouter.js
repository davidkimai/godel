"use strict";
/**
 * ChannelRouter.ts
 *
 * OpenClaw Channel Router
 * Routes tasks across multiple channels with fallback and aggregation
 * per OpenClaw Integration Spec section 3.3
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConflictResolver = exports.LatencyOptimizer = exports.ChannelFactory = exports.ChannelUtils = exports.ChannelRouter = exports.DEFAULT_ROUTER_CONFIG = void 0;
const ChannelConfig_1 = require("./ChannelConfig");
Object.defineProperty(exports, "ChannelUtils", { enumerable: true, get: function () { return ChannelConfig_1.ChannelUtils; } });
Object.defineProperty(exports, "ChannelFactory", { enumerable: true, get: function () { return ChannelConfig_1.ChannelFactory; } });
const ResponseAggregator_1 = require("./ResponseAggregator");
Object.defineProperty(exports, "LatencyOptimizer", { enumerable: true, get: function () { return ResponseAggregator_1.LatencyOptimizer; } });
Object.defineProperty(exports, "ConflictResolver", { enumerable: true, get: function () { return ResponseAggregator_1.ConflictResolver; } });
const events_1 = require("events");
exports.DEFAULT_ROUTER_CONFIG = {
    gatewayUrl: 'ws://127.0.0.1:18789',
    defaultTimeout: 5000,
    maxRetries: 3,
    retryDelay: 1000,
    enableAggregation: true,
    enableFallback: true,
    defaultStrategy: 'broadcast',
};
// ============================================================================
// CHANNEL ROUTER
// ============================================================================
class ChannelRouter extends events_1.EventEmitter {
    constructor(config = {}, gateway) {
        super();
        this.channels = new Map();
        this.rules = [];
        this.gateway = null;
        this.activeRoutes = new Map();
        this.requestQueue = [];
        this.processingQueue = false;
        this.config = { ...exports.DEFAULT_ROUTER_CONFIG, ...config };
        this.aggregator = new ResponseAggregator_1.ResponseAggregator({}, this.channels);
        this.gateway = gateway || null;
        // Initialize with predefined channels
        this.initializeDefaultChannels();
    }
    // ========================================================================
    // INITIALIZATION
    // ========================================================================
    initializeDefaultChannels() {
        // Add predefined channels
        for (const [key, factory] of Object.entries(ChannelConfig_1.PREDEFINED_CHANNELS)) {
            const channel = factory();
            this.channels.set(channel.id, channel);
        }
    }
    /**
     * Set the gateway client
     */
    setGateway(gateway) {
        this.gateway = gateway;
    }
    /**
     * Add a channel
     */
    addChannel(config) {
        this.channels.set(config.id, config);
        this.aggregator.updateChannelConfigs(this.channels);
        this.emit('channel:added', config);
    }
    /**
     * Remove a channel
     */
    removeChannel(channelId) {
        const deleted = this.channels.delete(channelId);
        if (deleted) {
            this.aggregator.updateChannelConfigs(this.channels);
            this.emit('channel:removed', channelId);
        }
        return deleted;
    }
    /**
     * Get a channel configuration
     */
    getChannel(channelId) {
        return this.channels.get(channelId);
    }
    /**
     * Get all channels
     */
    getAllChannels() {
        return Array.from(this.channels.values());
    }
    /**
     * Get channels by type
     */
    getChannelsByType(type) {
        return this.getAllChannels().filter(c => c.type === type);
    }
    /**
     * Get channels by priority
     */
    getChannelsByPriority(priority) {
        return this.getAllChannels().filter(c => c.priority === priority);
    }
    /**
     * Get healthy channels
     */
    getHealthyChannels() {
        return this.getAllChannels().filter(c => ChannelConfig_1.ChannelUtils.isHealthy(c));
    }
    // ========================================================================
    // ROUTING RULES
    // ========================================================================
    /**
     * Add a routing rule
     */
    addRule(rule) {
        this.rules.push(rule);
        this.rules.sort((a, b) => b.priority - a.priority);
    }
    /**
     * Remove a routing rule
     */
    removeRule(ruleId) {
        const index = this.rules.findIndex(r => r.id === ruleId);
        if (index >= 0) {
            this.rules.splice(index, 1);
            return true;
        }
        return false;
    }
    /**
     * Get all routing rules
     */
    getRules() {
        return [...this.rules];
    }
    /**
     * Match a request against routing rules
     */
    matchRules(request) {
        for (const rule of this.rules) {
            if (!rule.enabled)
                continue;
            if (this.matchesCondition(request, rule.condition)) {
                return rule;
            }
        }
        return null;
    }
    matchesCondition(request, condition) {
        // Check task pattern
        if (condition.taskPattern && !condition.taskPattern.test(request.task)) {
            return false;
        }
        // Check channel types
        if (condition.channelTypes) {
            const requestTypes = request.channelTypes || [];
            const hasMatchingType = condition.channelTypes.some(t => requestTypes.includes(t));
            if (!hasMatchingType)
                return false;
        }
        // Check priority
        if (condition.minPriority) {
            const priorityLevels = { low: 0, normal: 1, high: 2, critical: 3 };
            const requestLevel = priorityLevels[request.priority || 'normal'];
            const minLevel = priorityLevels[condition.minPriority];
            if (requestLevel < minLevel)
                return false;
        }
        // Check time window
        if (condition.timeWindow) {
            const hour = new Date().getHours();
            if (hour < condition.timeWindow.start || hour >= condition.timeWindow.end) {
                return false;
            }
        }
        return true;
    }
    // ========================================================================
    // ROUTING
    // ========================================================================
    /**
     * Route a task to channels
     */
    async route(request) {
        const startTime = Date.now();
        const channelResults = [];
        const errors = [];
        // Determine target channels
        const targetChannels = this.selectTargetChannels(request);
        if (targetChannels.length === 0) {
            return {
                requestId: request.id,
                success: false,
                channelResults: [],
                errors: [{
                        channelId: 'router',
                        error: 'No available channels for routing',
                        code: 'NO_CHANNELS',
                        retryable: false,
                    }],
                metrics: {
                    totalLatency: Date.now() - startTime,
                    channelsAttempted: 0,
                    channelsSucceeded: 0,
                    channelsFailed: 0,
                    fallbackUsed: false,
                },
            };
        }
        // Start aggregation
        let aggregation;
        if (this.config.enableAggregation) {
            aggregation = this.aggregator.startAggregation(request.id);
        }
        // Track active route
        const activeRoute = {
            request,
            channels: new Map(),
            startTime,
        };
        this.activeRoutes.set(request.id, activeRoute);
        // Route to each channel
        const routePromises = targetChannels.map(async (channelId) => {
            try {
                const result = await this.routeToChannel(request, channelId);
                channelResults.push(result);
                if (result.success && result.response && aggregation) {
                    this.aggregator.addResponse(request.id, result.response);
                }
                return result;
            }
            catch (error) {
                const errorResult = {
                    channelId,
                    success: false,
                    latency: Date.now() - startTime,
                    error: error instanceof Error ? error.message : String(error),
                };
                channelResults.push(errorResult);
                errors.push({
                    channelId,
                    error: errorResult.error || 'Unknown error',
                    code: 'ROUTE_ERROR',
                    retryable: true,
                });
                return errorResult;
            }
        });
        // Wait for responses with timeout
        const timeout = request.timeout || this.config.defaultTimeout;
        if (request.requireAll) {
            // Wait for all channels
            await Promise.all(routePromises);
        }
        else {
            // Wait for minimum responses or timeout
            const minResponses = request.minResponses || 1;
            await this.waitForMinResponses(routePromises, minResponses, timeout);
        }
        // Check if we need fallback
        const succeededCount = channelResults.filter(r => r.success).length;
        let fallbackUsed = false;
        if (succeededCount === 0 && this.config.enableFallback) {
            const fallbackResult = await this.executeFallback(request, channelResults);
            fallbackUsed = fallbackResult.success;
        }
        // Finalize aggregation
        if (aggregation && this.config.enableAggregation) {
            const pending = this.aggregator.getPending(request.id);
            if (pending) {
                // Force finalize
                this.aggregator.cancel(request.id);
            }
        }
        // Cleanup
        this.activeRoutes.delete(request.id);
        // Build result
        const totalLatency = Date.now() - startTime;
        const succeeded = channelResults.filter(r => r.success).length;
        // Update channel metrics
        for (const result of channelResults) {
            const channel = this.channels.get(result.channelId);
            if (channel) {
                ChannelConfig_1.ChannelUtils.updateMetrics(channel, result.success, result.latency);
            }
        }
        // Get final aggregation
        const finalAggregation = this.aggregator.getPending(request.id);
        if (finalAggregation) {
            this.aggregator.cancel(request.id);
        }
        return {
            requestId: request.id,
            success: succeeded > 0 || fallbackUsed,
            aggregatedResponse: finalAggregation || undefined,
            channelResults,
            errors,
            metrics: {
                totalLatency,
                channelsAttempted: targetChannels.length,
                channelsSucceeded: succeeded,
                channelsFailed: channelResults.length - succeeded,
                fallbackUsed,
            },
        };
    }
    /**
     * Route to a specific channel
     */
    async routeToChannel(request, channelId) {
        const channel = this.channels.get(channelId);
        if (!channel) {
            throw new Error(`Channel ${channelId} not found`);
        }
        const startTime = Date.now();
        // Check channel health
        if (!ChannelConfig_1.ChannelUtils.isHealthy(channel)) {
            return {
                channelId,
                success: false,
                latency: Date.now() - startTime,
                error: `Channel ${channelId} is not healthy (${channel.status})`,
            };
        }
        // Prepare message for channel
        const message = this.prepareMessageForChannel(request.task, channel);
        // Send via gateway
        if (!this.gateway) {
            throw new Error('Gateway not configured');
        }
        const sendResult = await this.gateway.send(channelId, message, {
            timeout: request.timeout,
            metadata: request.metadata,
        });
        const latency = Date.now() - startTime;
        if (!sendResult.success) {
            return {
                channelId,
                success: false,
                latency,
                error: sendResult.error || 'Send failed',
            };
        }
        // Create channel response
        const response = {
            channelId,
            channelType: channel.type,
            messageId: sendResult.messageId,
            content: sendResult.success ? 'Acknowledged' : 'Failed', // Placeholder
            timestamp: new Date(),
            latency,
            metadata: request.metadata || {},
        };
        return {
            channelId,
            success: true,
            messageId: sendResult.messageId,
            latency,
            response,
        };
    }
    /**
     * Select target channels for a request
     */
    selectTargetChannels(request) {
        // Check for specific channel request
        if (request.channels && request.channels.length > 0) {
            return request.channels.filter(id => {
                const channel = this.channels.get(id);
                return channel && ChannelConfig_1.ChannelUtils.isHealthy(channel);
            });
        }
        // Check for channel type filter
        if (request.channelTypes && request.channelTypes.length > 0) {
            return this.getAllChannels()
                .filter(c => request.channelTypes.includes(c.type))
                .filter(c => ChannelConfig_1.ChannelUtils.isHealthy(c))
                .map(c => c.id);
        }
        // Match against routing rules
        const rule = this.matchRules(request);
        if (rule) {
            return rule.action.targetChannels.filter(id => {
                const channel = this.channels.get(id);
                return channel && ChannelConfig_1.ChannelUtils.isHealthy(channel);
            });
        }
        // Default: use all healthy primary channels
        return this.getHealthyChannels()
            .filter(c => c.priority === 'primary')
            .map(c => c.id);
    }
    /**
     * Prepare message for channel constraints
     */
    prepareMessageForChannel(task, channel) {
        // Chunk if necessary
        if (task.length > channel.capabilities.maxMessageLength) {
            const chunks = ChannelConfig_1.ChannelUtils.chunkMessage(channel, task);
            return chunks[0]; // Return first chunk for now
        }
        // Format markdown
        return ChannelConfig_1.ChannelUtils.formatMarkdown(channel, task);
    }
    /**
     * Wait for minimum responses
     */
    async waitForMinResponses(promises, minCount, timeout) {
        return new Promise((resolve) => {
            let resolved = 0;
            const timer = setTimeout(resolve, timeout);
            for (const promise of promises) {
                promise.then(() => {
                    resolved++;
                    if (resolved >= minCount) {
                        clearTimeout(timer);
                        resolve();
                    }
                }).catch(() => {
                    // Count failures too
                    resolved++;
                    if (resolved >= minCount) {
                        clearTimeout(timer);
                        resolve();
                    }
                });
            }
        });
    }
    /**
     * Execute fallback routing
     */
    async executeFallback(request, primaryResults) {
        const failedChannels = new Set(primaryResults.filter(r => !r.success).map(r => r.channelId));
        // Get fallback channels
        const fallbackChannels = this.getHealthyChannels()
            .filter(c => !failedChannels.has(c.id))
            .filter(c => c.priority === 'fallback')
            .map(c => c.id);
        if (fallbackChannels.length === 0) {
            return { success: false, results: [] };
        }
        this.emit('routing:fallback', { request, fallbackChannels });
        const fallbackResults = [];
        for (const channelId of fallbackChannels) {
            try {
                const result = await this.routeToChannel(request, channelId);
                fallbackResults.push(result);
                if (result.success) {
                    return { success: true, results: fallbackResults };
                }
            }
            catch (error) {
                fallbackResults.push({
                    channelId,
                    success: false,
                    latency: 0,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return { success: false, results: fallbackResults };
    }
    // ========================================================================
    // QUEUE MANAGEMENT
    // ========================================================================
    /**
     * Queue a request for later processing
     */
    queueRequest(request) {
        this.requestQueue.push({
            request,
            attempts: 0,
            queuedAt: new Date(),
        });
        this.processQueue();
    }
    /**
     * Process the request queue
     */
    async processQueue() {
        if (this.processingQueue)
            return;
        this.processingQueue = true;
        while (this.requestQueue.length > 0) {
            const item = this.requestQueue.shift();
            try {
                await this.route(item.request);
            }
            catch (error) {
                this.emit('routing:error', { request: item.request, error });
                // Retry if attempts remaining
                if (item.attempts < this.config.maxRetries) {
                    item.attempts++;
                    this.requestQueue.push(item);
                }
            }
            // Small delay between requests
            await this.delay(this.config.retryDelay);
        }
        this.processingQueue = false;
    }
    // ========================================================================
    // UTILITY METHODS
    // ========================================================================
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get router statistics
     */
    getStats() {
        const channels = this.getAllChannels();
        return {
            totalChannels: channels.length,
            healthyChannels: channels.filter(c => ChannelConfig_1.ChannelUtils.isHealthy(c)).length,
            activeRoutes: this.activeRoutes.size,
            queuedRequests: this.requestQueue.length,
            rules: this.rules.length,
            channelBreakdown: {
                telegram: this.getChannelsByType('telegram').length,
                whatsapp: this.getChannelsByType('whatsapp').length,
                discord: this.getChannelsByType('discord').length,
                slack: this.getChannelsByType('slack').length,
                signal: this.getChannelsByType('signal').length,
                imessage: this.getChannelsByType('imessage').length,
                webchat: this.getChannelsByType('webchat').length,
                matrix: this.getChannelsByType('matrix').length,
                teams: this.getChannelsByType('teams').length,
                main: this.getChannelsByType('main').length,
            },
        };
    }
    /**
     * Update channel status
     */
    updateChannelStatus(channelId, status) {
        const channel = this.channels.get(channelId);
        if (channel) {
            channel.status = status;
            this.emit('channel:status', { channelId, status });
        }
    }
    /**
     * Get optimal channels for a task
     */
    getOptimalChannels(count, maxLatency) {
        const healthy = this.getHealthyChannels();
        if (maxLatency) {
            return ResponseAggregator_1.LatencyOptimizer.selectFastest(healthy, count, maxLatency);
        }
        // Rank by score
        return healthy
            .sort((a, b) => ChannelConfig_1.ChannelUtils.calculateScore(b) - ChannelConfig_1.ChannelUtils.calculateScore(a))
            .slice(0, count);
    }
}
exports.ChannelRouter = ChannelRouter;
//# sourceMappingURL=ChannelRouter.js.map