"use strict";
/**
 * Message Bus - SPEC_v2.md Section 2.4
 * Pub/sub message bus with topic patterns, in-memory + optional Redis backend,
 * and event filtering/routing.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageBus = void 0;
exports.patternToRegex = patternToRegex;
exports.matchesPattern = matchesPattern;
exports.generateMessageId = generateMessageId;
exports.generateSubscriptionId = generateSubscriptionId;
exports.getGlobalBus = getGlobalBus;
exports.resetGlobalBus = resetGlobalBus;
exports.getAgentTopics = getAgentTopics;
exports.subscribeDashboard = subscribeDashboard;
exports.createAgentMessage = createAgentMessage;
const events_1 = require("events");
/**
 * Converts a topic pattern with wildcards to a RegExp
 * Supports:
 * - {id} - Single segment wildcard (matches any non-dot characters)
 * - * - Single segment wildcard (same as {id})
 * - # - Multi-segment wildcard (matches everything including dots)
 * - agent.*.events - matches agent.123.events, agent.abc.events
 * - swarm.# - matches swarm.123.broadcast, swarm.abc.anything.here
 */
function patternToRegex(pattern) {
    // Escape special regex characters except our wildcards
    let regex = pattern
        .replace(/[.+^$()|[\]\\]/g, '\\$&') // Escape special chars (excluding {} for now)
        .replace(/\{[^}]+\}/g, '([^\\.]+)') // {id} -> capture single segment
        .replace(/(?<!\\)\*/g, '([^\\.]+)') // * -> single segment wildcard
        .replace(/#/g, '(.*)'); // # -> multi-segment wildcard
    return new RegExp(`^${regex}$`);
}
/**
 * Check if a topic matches a pattern
 */
function matchesPattern(topic, pattern) {
    // Exact match
    if (topic === pattern)
        return true;
    // Check for wildcard patterns
    if (pattern.includes('*') || pattern.includes('#') || pattern.includes('{')) {
        const regex = patternToRegex(pattern);
        return regex.test(topic);
    }
    return false;
}
/**
 * Generate unique message ID
 */
function generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * Generate unique subscription ID
 */
function generateSubscriptionId() {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
/**
 * In-memory message store for persistence
 */
class MessageStore {
    constructor(config) {
        this.config = config;
        this.messages = new Map();
        this.maxSize = 10000;
        if (config?.maxSize) {
            this.maxSize = config.maxSize;
        }
    }
    add(topic, message) {
        if (!this.messages.has(topic)) {
            this.messages.set(topic, []);
        }
        const topicMessages = this.messages.get(topic);
        topicMessages.push(message);
        // Trim if exceeding max size
        if (topicMessages.length > this.maxSize) {
            topicMessages.splice(0, topicMessages.length - this.maxSize);
        }
    }
    get(topic, limit = 100) {
        const messages = this.messages.get(topic) || [];
        return messages.slice(-limit);
    }
    getAll(limit = 100) {
        const allMessages = [];
        for (const topicMessages of this.messages.values()) {
            allMessages.push(...topicMessages);
        }
        return allMessages
            .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
            .slice(-limit);
    }
    clear(topic) {
        if (topic) {
            this.messages.delete(topic);
        }
        else {
            this.messages.clear();
        }
    }
}
/**
 * MessageBus - Core pub/sub implementation
 */
class MessageBus {
    constructor(config = {}) {
        this.subscriptions = new Map();
        this.isRedisEnabled = false;
        this.metrics = {
            messagesPublished: 0,
            messagesDelivered: 0,
            subscriptionsCreated: 0,
            subscriptionsRemoved: 0,
        };
        this.config = config;
        this.emitter = new events_1.EventEmitter();
        this.emitter.setMaxListeners(config.maxListeners || 1000);
        if (config.enablePersistence) {
            this.store = new MessageStore();
        }
        // TODO: Initialize Redis if configured
        if (config.redis) {
            this.isRedisEnabled = true;
            // Redis initialization would go here
        }
    }
    /**
     * Publish a message to a topic
     */
    publish(topic, payload, metadata) {
        const message = {
            id: generateMessageId(),
            topic,
            timestamp: new Date(),
            payload,
            metadata,
        };
        // Store message if persistence enabled
        if (this.store) {
            this.store.add(topic, message);
        }
        // Deliver to matching subscribers
        this.routeMessage(message);
        this.metrics.messagesPublished++;
        return message;
    }
    /**
     * Subscribe to a topic with optional pattern matching and filtering
     */
    subscribe(topic, handler, filter) {
        if (Array.isArray(topic)) {
            return topic.map((t) => this.subscribeSingle(t, handler, filter));
        }
        return this.subscribeSingle(topic, handler, filter);
    }
    subscribeSingle(topic, handler, filter) {
        const subscription = {
            id: generateSubscriptionId(),
            topic,
            handler,
            pattern: this.isPattern(topic) ? patternToRegex(topic) : undefined,
            filter,
        };
        this.subscriptions.set(subscription.id, subscription);
        this.metrics.subscriptionsCreated++;
        return subscription;
    }
    /**
     * Unsubscribe from a topic
     */
    unsubscribe(subscription) {
        const id = typeof subscription === 'string' ? subscription : subscription.id;
        const existed = this.subscriptions.delete(id);
        if (existed) {
            this.metrics.subscriptionsRemoved++;
        }
        return existed;
    }
    /**
     * Unsubscribe multiple subscriptions
     */
    unsubscribeAll(subscriptions) {
        let count = 0;
        for (const sub of subscriptions) {
            if (this.unsubscribe(sub))
                count++;
        }
        return count;
    }
    /**
     * Route a message to all matching subscribers
     */
    routeMessage(message) {
        for (const subscription of this.subscriptions.values()) {
            if (this.shouldDeliver(message, subscription)) {
                this.deliver(message, subscription);
            }
        }
    }
    /**
     * Check if a message should be delivered to a subscription
     */
    shouldDeliver(message, subscription) {
        // Check topic match
        const topicMatches = subscription.pattern
            ? subscription.pattern.test(message.topic)
            : subscription.topic === message.topic;
        if (!topicMatches)
            return false;
        // Check filters
        if (subscription.filter) {
            const filter = subscription.filter;
            // Filter by event types
            if (filter.eventTypes && filter.eventTypes.length > 0) {
                const eventPayload = message.payload;
                if (!eventPayload?.eventType || !filter.eventTypes.includes(eventPayload.eventType)) {
                    return false;
                }
            }
            // Filter by source agent
            if (filter.sourceAgentId) {
                const eventPayload = message.payload;
                if (eventPayload?.source?.agentId !== filter.sourceAgentId) {
                    return false;
                }
            }
            // Filter by priority
            if (filter.minPriority) {
                const priorityOrder = { low: 0, medium: 1, high: 2, critical: 3 };
                const messagePriority = priorityOrder[message.metadata?.priority || 'low'];
                const minPriority = priorityOrder[filter.minPriority];
                if (messagePriority < minPriority) {
                    return false;
                }
            }
            // Custom filter
            if (filter.custom && !filter.custom(message)) {
                return false;
            }
        }
        return true;
    }
    /**
     * Deliver a message to a subscriber
     */
    deliver(message, subscription) {
        try {
            // Run async handlers without awaiting
            const result = subscription.handler(message);
            if (result instanceof Promise) {
                result.catch((error) => {
                    console.error(`[MessageBus] Handler error for subscription ${subscription.id}:`, error);
                });
            }
            this.metrics.messagesDelivered++;
        }
        catch (error) {
            console.error(`[MessageBus] Handler error for subscription ${subscription.id}:`, error);
        }
    }
    /**
     * Check if a topic string contains wildcards
     */
    isPattern(topic) {
        return topic.includes('*') || topic.includes('#') || topic.includes('{');
    }
    /**
     * Get recent messages from a topic
     */
    getMessages(topic, limit) {
        if (!this.store) {
            return [];
        }
        return this.store.get(topic, limit);
    }
    /**
     * Get all recent messages
     */
    getAllMessages(limit) {
        if (!this.store) {
            return [];
        }
        return this.store.getAll(limit);
    }
    /**
     * Get subscription count
     */
    getSubscriptionCount() {
        return this.subscriptions.size;
    }
    /**
     * Get metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }
    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            messagesPublished: 0,
            messagesDelivered: 0,
            subscriptionsCreated: 0,
            subscriptionsRemoved: 0,
        };
    }
    /**
     * Clear all subscriptions and optionally the message store
     */
    clear(clearStore = false) {
        this.subscriptions.clear();
        if (clearStore && this.store) {
            this.store.clear();
        }
    }
    /**
     * Create agent-specific topic names
     */
    static agentCommands(agentId) {
        return `agent.${agentId}.commands`;
    }
    static agentEvents(agentId) {
        return `agent.${agentId}.events`;
    }
    static agentLogs(agentId) {
        return `agent.${agentId}.logs`;
    }
    /**
     * Create swarm-specific topic names
     */
    static swarmBroadcast(swarmId) {
        return `swarm.${swarmId}.broadcast`;
    }
    /**
     * Create task-specific topic names
     */
    static taskUpdates(taskType) {
        return `task.${taskType}.updates`;
    }
    /**
     * System topics
     */
    static get systemAlerts() {
        return 'system.alerts';
    }
}
exports.MessageBus = MessageBus;
/**
 * Singleton instance for shared use
 */
let globalBus = null;
function getGlobalBus(config) {
    if (!globalBus) {
        globalBus = new MessageBus(config);
    }
    return globalBus;
}
function resetGlobalBus() {
    globalBus = null;
}
/**
 * Agent topic helper - returns all topic names for an agent
 */
function getAgentTopics(agentId) {
    return {
        commands: MessageBus.agentCommands(agentId),
        events: MessageBus.agentEvents(agentId),
        logs: MessageBus.agentLogs(agentId),
    };
}
/**
 * Dashboard subscription helper - subscribes to all relevant topics
 */
function subscribeDashboard(bus, handler, options) {
    const subscriptions = [];
    const topics = [];
    // Subscribe to specific agents
    if (options?.agentIds) {
        for (const agentId of options.agentIds) {
            topics.push(`agent.${agentId}.events`);
            topics.push(`agent.${agentId}.logs`);
        }
    }
    // Subscribe to specific swarms
    if (options?.swarmIds) {
        for (const swarmId of options.swarmIds) {
            topics.push(`swarm.${swarmId}.broadcast`);
        }
    }
    // Subscribe to all agent events and logs with wildcards
    if (!options?.agentIds) {
        topics.push('agent.*.events');
        topics.push('agent.*.logs');
    }
    // Subscribe to all swarm broadcasts
    if (!options?.swarmIds) {
        topics.push('swarm.*.broadcast');
    }
    // Subscribe to system alerts
    if (options?.includeSystem !== false) {
        topics.push('system.alerts');
    }
    // Create filter if event types specified
    const filter = options?.eventTypes
        ? { eventTypes: options.eventTypes }
        : undefined;
    // Subscribe to all topics
    for (const topic of topics) {
        subscriptions.push(bus.subscribe(topic, handler, filter));
    }
    return subscriptions;
}
/**
 * Create a message for agent events
 */
function createAgentMessage(agentId, payload, metadata) {
    return {
        id: generateMessageId(),
        topic: MessageBus.agentEvents(agentId),
        timestamp: new Date(),
        payload,
        metadata: {
            source: agentId,
            ...metadata,
        },
    };
}
// Export default
exports.default = MessageBus;
//# sourceMappingURL=index.js.map