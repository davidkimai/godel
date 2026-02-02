/**
 * Message Bus - SPEC_v2.md Section 2.4
 * Pub/sub message bus with topic patterns, in-memory + optional Redis backend,
 * and event filtering/routing.
 */

import { EventEmitter } from 'events';
import { MissionEvent, EventType } from '../events/types';

// Topic patterns:
// - agent.{id}.commands    # Control messages to agent
// - agent.{id}.events      # Status updates from agent
// - agent.{id}.logs        # Log output
// - swarm.{id}.broadcast   # All agents in swarm
// - task.{type}.updates    # Type-specific updates
// - system.alerts          # System-wide alerts

export type TopicPattern =
  | `agent.${string}.commands`
  | `agent.${string}.events`
  | `agent.${string}.logs`
  | `swarm.${string}.broadcast`
  | `task.${string}.updates`
  | 'system.alerts'
  | string; // Allow custom topics

export interface Message {
  id: string;
  topic: string;
  timestamp: Date;
  payload: MissionEvent | unknown;
  metadata?: {
    source?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    ttl?: number; // Time to live in ms
  };
}

export type MessageHandler = (message: Message) => void | Promise<void>;

export interface Subscription {
  id: string;
  topic: string;
  handler: MessageHandler;
  pattern?: RegExp; // For wildcard matching
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
export function patternToRegex(pattern: string): RegExp {
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
export function matchesPattern(topic: string, pattern: string): boolean {
  // Exact match
  if (topic === pattern) return true;

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
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate unique subscription ID
 */
export function generateSubscriptionId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * In-memory message store for persistence
 */
class MessageStore {
  private messages: Map<string, Message[]> = new Map();
  private maxSize: number = 10000;

  constructor(private config?: { maxSize?: number }) {
    if (config?.maxSize) {
      this.maxSize = config.maxSize;
    }
  }

  add(topic: string, message: Message): void {
    if (!this.messages.has(topic)) {
      this.messages.set(topic, []);
    }

    const topicMessages = this.messages.get(topic)!;
    topicMessages.push(message);

    // Trim if exceeding max size
    if (topicMessages.length > this.maxSize) {
      topicMessages.splice(0, topicMessages.length - this.maxSize);
    }
  }

  get(topic: string, limit: number = 100): Message[] {
    const messages = this.messages.get(topic) || [];
    return messages.slice(-limit);
  }

  getAll(limit: number = 100): Message[] {
    const allMessages: Message[] = [];
    for (const topicMessages of this.messages.values()) {
      allMessages.push(...topicMessages);
    }
    return allMessages
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
      .slice(-limit);
  }

  clear(topic?: string): void {
    if (topic) {
      this.messages.delete(topic);
    } else {
      this.messages.clear();
    }
  }
}

/**
 * MessageBus - Core pub/sub implementation
 */
export class MessageBus {
  private emitter: EventEmitter;
  private subscriptions: Map<string, Subscription> = new Map();
  private store?: MessageStore;
  private config: BusConfig;
  private isRedisEnabled: boolean = false;
  private metrics = {
    messagesPublished: 0,
    messagesDelivered: 0,
    subscriptionsCreated: 0,
    subscriptionsRemoved: 0,
  };

  constructor(config: BusConfig = {}) {
    this.config = config;
    this.emitter = new EventEmitter();
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
  publish(topic: string, payload: Message['payload'], metadata?: Message['metadata']): Message {
    const message: Message = {
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
  subscribe(
    topic: string | string[],
    handler: MessageHandler,
    filter?: MessageFilter
  ): Subscription | Subscription[] {
    if (Array.isArray(topic)) {
      return topic.map((t) => this.subscribeSingle(t, handler, filter));
    }
    return this.subscribeSingle(topic, handler, filter);
  }

  private subscribeSingle(
    topic: string,
    handler: MessageHandler,
    filter?: MessageFilter
  ): Subscription {
    const subscription: Subscription = {
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
  unsubscribe(subscription: Subscription | string): boolean {
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
  unsubscribeAll(subscriptions: (Subscription | string)[]): number {
    let count = 0;
    for (const sub of subscriptions) {
      if (this.unsubscribe(sub)) count++;
    }
    return count;
  }

  /**
   * Route a message to all matching subscribers
   */
  private routeMessage(message: Message): void {
    for (const subscription of this.subscriptions.values()) {
      if (this.shouldDeliver(message, subscription)) {
        this.deliver(message, subscription);
      }
    }
  }

  /**
   * Check if a message should be delivered to a subscription
   */
  private shouldDeliver(message: Message, subscription: Subscription): boolean {
    // Check topic match
    const topicMatches = subscription.pattern
      ? subscription.pattern.test(message.topic)
      : subscription.topic === message.topic;

    if (!topicMatches) return false;

    // Check filters
    if (subscription.filter) {
      const filter = subscription.filter;

      // Filter by event types
      if (filter.eventTypes && filter.eventTypes.length > 0) {
        const eventPayload = message.payload as MissionEvent;
        if (!eventPayload?.eventType || !filter.eventTypes.includes(eventPayload.eventType)) {
          return false;
        }
      }

      // Filter by source agent
      if (filter.sourceAgentId) {
        const eventPayload = message.payload as MissionEvent;
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
  private deliver(message: Message, subscription: Subscription): void {
    try {
      // Run async handlers without awaiting
      const result = subscription.handler(message);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error(`[MessageBus] Handler error for subscription ${subscription.id}:`, error);
        });
      }
      this.metrics.messagesDelivered++;
    } catch (error) {
      console.error(`[MessageBus] Handler error for subscription ${subscription.id}:`, error);
    }
  }

  /**
   * Check if a topic string contains wildcards
   */
  private isPattern(topic: string): boolean {
    return topic.includes('*') || topic.includes('#') || topic.includes('{');
  }

  /**
   * Get recent messages from a topic
   */
  getMessages(topic: string, limit?: number): Message[] {
    if (!this.store) {
      return [];
    }
    return this.store.get(topic, limit);
  }

  /**
   * Get all recent messages
   */
  getAllMessages(limit?: number): Message[] {
    if (!this.store) {
      return [];
    }
    return this.store.getAll(limit);
  }

  /**
   * Get subscription count
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  /**
   * Get metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
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
  clear(clearStore: boolean = false): void {
    this.subscriptions.clear();
    if (clearStore && this.store) {
      this.store.clear();
    }
  }

  /**
   * Create agent-specific topic names
   */
  static agentCommands(agentId: string): string {
    return `agent.${agentId}.commands`;
  }

  static agentEvents(agentId: string): string {
    return `agent.${agentId}.events`;
  }

  static agentLogs(agentId: string): string {
    return `agent.${agentId}.logs`;
  }

  /**
   * Create swarm-specific topic names
   */
  static swarmBroadcast(swarmId: string): string {
    return `swarm.${swarmId}.broadcast`;
  }

  /**
   * Create task-specific topic names
   */
  static taskUpdates(taskType: string): string {
    return `task.${taskType}.updates`;
  }

  /**
   * System topics
   */
  static get systemAlerts(): string {
    return 'system.alerts';
  }
}

/**
 * Singleton instance for shared use
 */
let globalBus: MessageBus | null = null;

export function getGlobalBus(config?: BusConfig): MessageBus {
  if (!globalBus) {
    globalBus = new MessageBus(config);
  }
  return globalBus;
}

export function resetGlobalBus(): void {
  globalBus = null;
}

/**
 * Agent topic helper - returns all topic names for an agent
 */
export function getAgentTopics(agentId: string): {
  commands: string;
  events: string;
  logs: string;
} {
  return {
    commands: MessageBus.agentCommands(agentId),
    events: MessageBus.agentEvents(agentId),
    logs: MessageBus.agentLogs(agentId),
  };
}

/**
 * Dashboard subscription helper - subscribes to all relevant topics
 */
export function subscribeDashboard(
  bus: MessageBus,
  handler: MessageHandler,
  options?: {
    agentIds?: string[];
    swarmIds?: string[];
    eventTypes?: EventType[];
    includeSystem?: boolean;
  }
): Subscription[] {
  const subscriptions: Subscription[] = [];
  const topics: string[] = [];

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
  const filter: MessageFilter | undefined = options?.eventTypes
    ? { eventTypes: options.eventTypes }
    : undefined;

  // Subscribe to all topics
  for (const topic of topics) {
    subscriptions.push(bus.subscribe(topic, handler, filter) as Subscription);
  }

  return subscriptions;
}

/**
 * Create a message for agent events
 */
export function createAgentMessage(
  agentId: string,
  payload: MissionEvent,
  metadata?: Message['metadata']
): Message {
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
export default MessageBus;
