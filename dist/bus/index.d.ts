/**
 * Message Bus - SPEC_v2.md Section 2.4
 * Pub/sub message bus with topic patterns, in-memory + optional Redis backend,
 * and event filtering/routing.
 */
import { MissionEvent, EventType } from '../events/types';
export type TopicPattern = `agent.${string}.commands` | `agent.${string}.events` | `agent.${string}.logs` | `swarm.${string}.broadcast` | `task.${string}.updates` | 'system.alerts' | string;
export interface Message {
    id: string;
    topic: string;
    timestamp: Date;
    payload: MissionEvent | unknown;
    metadata?: {
        source?: string;
        priority?: 'low' | 'medium' | 'high' | 'critical';
        ttl?: number;
    };
}
export type MessageHandler = (message: Message) => void | Promise<void>;
export interface Subscription {
    id: string;
    topic: string;
    handler: MessageHandler;
    pattern?: RegExp;
    filter?: MessageFilter;
}
export interface MessageFilter {
    eventTypes?: EventType[];
    sourceAgentId?: string;
    minPriority?: 'low' | 'medium' | 'high' | 'critical';
    custom?: (message: Message) => boolean;
}
export interface BusConfig {
    redis?: {
        host: string;
        port: number;
        password?: string;
        db?: number;
    };
    maxListeners?: number;
    enablePersistence?: boolean;
    defaultMessageTTL?: number;
}
/**
 * Converts a topic pattern with wildcards to a RegExp
 * Supports:
 * - {id} - Single segment wildcard (matches any non-dot characters)
 * - * - Single segment wildcard (same as {id})
 * - # - Multi-segment wildcard (matches everything including dots)
 * - agent.*.events - matches agent.123.events, agent.abc.events
 * - swarm.# - matches swarm.123.broadcast, swarm.abc.anything.here
 */
export declare function patternToRegex(pattern: string): RegExp;
/**
 * Check if a topic matches a pattern
 */
export declare function matchesPattern(topic: string, pattern: string): boolean;
/**
 * Generate unique message ID
 */
export declare function generateMessageId(): string;
/**
 * Generate unique subscription ID
 */
export declare function generateSubscriptionId(): string;
/**
 * MessageBus - Core pub/sub implementation
 */
export declare class MessageBus {
    private emitter;
    private subscriptions;
    private store?;
    private config;
    private isRedisEnabled;
    private metrics;
    constructor(config?: BusConfig);
    /**
     * Publish a message to a topic
     */
    publish(topic: string, payload: Message['payload'], metadata?: Message['metadata']): Message;
    /**
     * Subscribe to a topic with optional pattern matching and filtering
     */
    subscribe(topic: string | string[], handler: MessageHandler, filter?: MessageFilter): Subscription | Subscription[];
    private subscribeSingle;
    /**
     * Unsubscribe from a topic
     */
    unsubscribe(subscription: Subscription | string): boolean;
    /**
     * Unsubscribe multiple subscriptions
     */
    unsubscribeAll(subscriptions: (Subscription | string)[]): number;
    /**
     * Route a message to all matching subscribers
     */
    private routeMessage;
    /**
     * Check if a message should be delivered to a subscription
     */
    private shouldDeliver;
    /**
     * Deliver a message to a subscriber
     */
    private deliver;
    /**
     * Check if a topic string contains wildcards
     */
    private isPattern;
    /**
     * Get recent messages from a topic
     */
    getMessages(topic: string, limit?: number): Message[];
    /**
     * Get all recent messages
     */
    getAllMessages(limit?: number): Message[];
    /**
     * Get subscription count
     */
    getSubscriptionCount(): number;
    /**
     * Get metrics
     */
    getMetrics(): typeof this.metrics;
    /**
     * Reset metrics
     */
    resetMetrics(): void;
    /**
     * Clear all subscriptions and optionally the message store
     */
    clear(clearStore?: boolean): void;
    /**
     * Create agent-specific topic names
     */
    static agentCommands(agentId: string): string;
    static agentEvents(agentId: string): string;
    static agentLogs(agentId: string): string;
    /**
     * Create swarm-specific topic names
     */
    static swarmBroadcast(swarmId: string): string;
    /**
     * Create task-specific topic names
     */
    static taskUpdates(taskType: string): string;
    /**
     * System topics
     */
    static get systemAlerts(): string;
}
export declare function getGlobalBus(config?: BusConfig): MessageBus;
export declare function resetGlobalBus(): void;
/**
 * Agent topic helper - returns all topic names for an agent
 */
export declare function getAgentTopics(agentId: string): {
    commands: string;
    events: string;
    logs: string;
};
/**
 * Dashboard subscription helper - subscribes to all relevant topics
 */
export declare function subscribeDashboard(bus: MessageBus, handler: MessageHandler, options?: {
    agentIds?: string[];
    swarmIds?: string[];
    eventTypes?: EventType[];
    includeSystem?: boolean;
}): Subscription[];
/**
 * Create a message for agent events
 */
export declare function createAgentMessage(agentId: string, payload: MissionEvent, metadata?: Message['metadata']): Message;
export default MessageBus;
//# sourceMappingURL=index.d.ts.map