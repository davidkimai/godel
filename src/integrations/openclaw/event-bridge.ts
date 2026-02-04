/**
 * OpenClaw Event Bridge
 * 
 * Real-time event streaming from Dash to OpenClaw.
 * Subscribes to Dash events, transforms them to OpenClaw format,
 * and forwards them to the configured webhook endpoint.
 * 
 * @module integrations/openclaw/event-bridge
 */

import { EventEmitter } from 'events';
import { getGlobalBus, type MessageBus, type Message, type Subscription } from '../../bus/index';
import { logger } from '../../utils/logger';
import {
  ApplicationError,
  DashErrorCode,
} from '../../errors';

// ============================================================================
// Types
// ============================================================================

export interface EventBridgeConfig {
  /** Dash MessageBus instance */
  messageBus?: MessageBus;
  /** OpenClaw webhook URL for event forwarding */
  webhookUrl: string;
  /** Event types to forward (empty = all) */
  filter?: string[];
  /** Authentication token for webhook */
  authToken?: string;
  /** Batch events before sending (ms, 0 = immediate) */
  batchInterval?: number;
  /** Maximum batch size */
  maxBatchSize?: number;
  /** Retry configuration */
  retryConfig?: {
    maxRetries: number;
    retryDelay: number;
  };
}

export interface BridgedEvent {
  /** Event source */
  source: 'dash';
  /** Event type */
  type: string;
  /** Event timestamp */
  timestamp: string;
  /** Event payload */
  data: Record<string, unknown>;
  /** Event metadata */
  metadata: {
    dashAgentId?: string;
    dashSwarmId?: string;
    topic?: string;
    [key: string]: unknown;
  };
}

export interface EventBridgeStats {
  eventsReceived: number;
  eventsForwarded: number;
  eventsFiltered: number;
  eventsFailed: number;
  batchesSent: number;
  lastEventTime?: Date;
  isRunning: boolean;
}

// ============================================================================
// OpenClaw Event Bridge
// ============================================================================

/**
 * OpenClaw Event Bridge
 * 
 * Bridges events between Dash and OpenClaw, enabling real-time
 * streaming of agent events, logs, and status updates.
 */
export class OpenClawEventBridge extends EventEmitter {
  private config: EventBridgeConfig;
  private messageBus: MessageBus;
  private subscriptions: Map<string, Subscription>;
  private eventBuffer: BridgedEvent[];
  private batchTimer: NodeJS.Timeout | null;
  private stats: EventBridgeStats;
  private isRunning: boolean;

  constructor(config: EventBridgeConfig) {
    super();
    
    this.config = {
      batchInterval: 0,
      maxBatchSize: 100,
      retryConfig: {
        maxRetries: 3,
        retryDelay: 1000,
      },
      ...config,
    };
    
    this.messageBus = config.messageBus || getGlobalBus();
    this.subscriptions = new Map();
    this.eventBuffer = [];
    this.batchTimer = null;
    this.isRunning = false;
    this.stats = {
      eventsReceived: 0,
      eventsForwarded: 0,
      eventsFiltered: 0,
      eventsFailed: 0,
      batchesSent: 0,
      isRunning: false,
    };

    logger.info('[OpenClawEventBridge] Initialized with config:', {
      webhookUrl: config.webhookUrl,
      filter: config.filter,
      batchInterval: this.config.batchInterval,
    });
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Start the event bridge
   * 
   * Subscribes to all relevant Dash events and begins forwarding
   * them to OpenClaw.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('[OpenClawEventBridge] Already running');
      return;
    }

    logger.info('[OpenClawEventBridge] Starting...');

    try {
      // Subscribe to agent events
      this.subscribeToTopic('agent.*.events');
      
      // Subscribe to swarm events
      this.subscribeToTopic('swarm.*.events');
      
      // Subscribe to system events
      this.subscribeToTopic('system.events');
      
      // Subscribe to all events (catch-all)
      const allSubscription = this.messageBus.subscribe('*', (message) => {
        this.handleDashEvent(message);
      });
      
      if (!Array.isArray(allSubscription)) {
        this.subscriptions.set('__all__', allSubscription);
      }

      this.isRunning = true;
      this.stats.isRunning = true;

      // Start batch timer if batching is enabled
      if (this.config.batchInterval && this.config.batchInterval > 0) {
        this.startBatchTimer();
      }

      logger.info('[OpenClawEventBridge] Started successfully');
      this.emit('started');
    } catch (error) {
      logger.error('[OpenClawEventBridge] Failed to start:', error);
      throw new ApplicationError(
        'Failed to start event bridge',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        { error: error instanceof Error ? error.message : String(error) }
      );
    }
  }

  /**
   * Stop the event bridge
   * 
   * Unsubscribes from all events and flushes any pending events.
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('[OpenClawEventBridge] Stopping...');

    // Stop batch timer
    this.stopBatchTimer();

    // Flush remaining events
    await this.flushBuffer();

    // Unsubscribe from all events
    for (const [name, subscription] of this.subscriptions) {
      try {
        this.messageBus.unsubscribe(subscription);
        logger.debug(`[OpenClawEventBridge] Unsubscribed from ${name}`);
      } catch (error) {
        logger.warn(`[OpenClawEventBridge] Error unsubscribing from ${name}:`, error);
      }
    }
    
    this.subscriptions.clear();

    this.isRunning = false;
    this.stats.isRunning = false;

    logger.info('[OpenClawEventBridge] Stopped');
    this.emit('stopped');
  }

  /**
   * Restart the event bridge
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  // ============================================================================
  // Subscription Management
  // ============================================================================

  /**
   * Subscribe to a specific topic pattern
   */
  subscribeToTopic(pattern: string): void {
    const subscription = this.messageBus.subscribe(pattern, (message) => {
      this.handleDashEvent(message);
    });

    if (!Array.isArray(subscription)) {
      this.subscriptions.set(pattern, subscription);
      logger.debug(`[OpenClawEventBridge] Subscribed to ${pattern}`);
    }
  }

  /**
   * Unsubscribe from a specific topic
   */
  unsubscribeFromTopic(pattern: string): void {
    const subscription = this.subscriptions.get(pattern);
    if (subscription) {
      this.messageBus.unsubscribe(subscription);
      this.subscriptions.delete(pattern);
      logger.debug(`[OpenClawEventBridge] Unsubscribed from ${pattern}`);
    }
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  /**
   * Handle an incoming Dash event
   */
  private handleDashEvent(message: Message): void {
    this.stats.eventsReceived++;
    this.stats.lastEventTime = new Date();

    // Transform event
    const event = this.transformEvent(message);

    // Check filter
    if (this.shouldFilter(event)) {
      this.stats.eventsFiltered++;
      return;
    }

    // Emit locally
    this.emit('event', event);

    // Forward based on batch configuration
    if (this.config.batchInterval && this.config.batchInterval > 0) {
      this.bufferEvent(event);
    } else {
      this.forwardImmediate(event);
    }
  }

  /**
   * Check if an event should be filtered out
   */
  private shouldFilter(event: BridgedEvent): boolean {
    if (!this.config.filter || this.config.filter.length === 0) {
      return false;
    }

    return !this.config.filter.includes(event.type);
  }

  /**
   * Transform Dash event to OpenClaw format
   */
  private transformEvent(message: Message): BridgedEvent {
    const payload = message.payload as Record<string, unknown> || {};
    
    // Extract agent/swarm IDs from topic
    const topicParts = message.topic.split('.');
    const dashAgentId = topicParts[0] === 'agent' ? topicParts[1] : undefined;
    const dashSwarmId = topicParts[0] === 'swarm' ? topicParts[1] : undefined;

    return {
      source: 'dash',
      type: (payload['eventType'] as string) || message.topic,
      timestamp: message.timestamp.toISOString(),
      data: payload,
      metadata: {
        dashAgentId,
        dashSwarmId,
        topic: message.topic,
        messageId: message.id,
        source: message.metadata?.source,
        priority: message.metadata?.priority,
      },
    };
  }

  // ============================================================================
  // Event Forwarding
  // ============================================================================

  /**
   * Forward a single event immediately
   */
  private async forwardImmediate(event: BridgedEvent): Promise<void> {
    try {
      await this.sendToWebhook([event]);
      this.stats.eventsForwarded++;
      this.emit('forwarded', event);
    } catch (error) {
      this.stats.eventsFailed++;
      logger.error('[OpenClawEventBridge] Failed to forward event:', error);
      this.emit('error', { event, error });
    }
  }

  /**
   * Buffer an event for batch sending
   */
  private bufferEvent(event: BridgedEvent): void {
    this.eventBuffer.push(event);

    // Flush if buffer is full
    if (this.eventBuffer.length >= (this.config.maxBatchSize || 100)) {
      this.flushBuffer();
    }
  }

  /**
   * Start the batch timer
   */
  private startBatchTimer(): void {
    if (this.batchTimer) {
      return;
    }

    this.batchTimer = setInterval(() => {
      this.flushBuffer();
    }, this.config.batchInterval);
  }

  /**
   * Stop the batch timer
   */
  private stopBatchTimer(): void {
    if (this.batchTimer) {
      clearInterval(this.batchTimer);
      this.batchTimer = null;
    }
  }

  /**
   * Flush the event buffer
   */
  private async flushBuffer(): Promise<void> {
    if (this.eventBuffer.length === 0) {
      return;
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    try {
      await this.sendToWebhook(events);
      this.stats.eventsForwarded += events.length;
      this.stats.batchesSent++;
      this.emit('batchForwarded', events);
    } catch (error) {
      this.stats.eventsFailed += events.length;
      logger.error('[OpenClawEventBridge] Failed to forward batch:', error);
      this.emit('error', { events, error });
    }
  }

  /**
   * Send events to the OpenClaw webhook
   */
  private async sendToWebhook(events: BridgedEvent[]): Promise<void> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Dash-Event': 'true',
      'X-Event-Count': String(events.length),
    };

    if (this.config.authToken) {
      headers['Authorization'] = `Bearer ${this.config.authToken}`;
    }

    const response = await fetch(this.config.webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        events,
        timestamp: new Date().toISOString(),
        source: 'dash',
      }),
    });

    if (!response.ok) {
      throw new Error(`Webhook returned ${response.status}: ${await response.text()}`);
    }
  }

  // ============================================================================
  // Agent-Specific Subscriptions
  // ============================================================================

  /**
   * Subscribe to events for a specific agent
   * 
   * Returns an unsubscribe function.
   */
  subscribeToAgent(agentId: string, callback: (event: BridgedEvent) => void): () => void {
    const handler = (event: BridgedEvent) => {
      if (event.metadata?.dashAgentId === agentId) {
        callback(event);
      }
    };

    this.on('event', handler);

    return () => {
      this.off('event', handler);
    };
  }

  /**
   * Subscribe to events for a specific swarm
   * 
   * Returns an unsubscribe function.
   */
  subscribeToSwarm(swarmId: string, callback: (event: BridgedEvent) => void): () => void {
    const handler = (event: BridgedEvent) => {
      if (event.metadata?.dashSwarmId === swarmId) {
        callback(event);
      }
    };

    this.on('event', handler);

    return () => {
      this.off('event', handler);
    };
  }

  /**
   * Subscribe to specific event types
   * 
   * Returns an unsubscribe function.
   */
  subscribeToEventTypes(types: string[], callback: (event: BridgedEvent) => void): () => void {
    const handler = (event: BridgedEvent) => {
      if (types.includes(event.type)) {
        callback(event);
      }
    };

    this.on('event', handler);

    return () => {
      this.off('event', handler);
    };
  }

  // ============================================================================
  // Stats and Health
  // ============================================================================

  /**
   * Get bridge statistics
   */
  getStats(): EventBridgeStats {
    return { ...this.stats };
  }

  /**
   * Get health status
   */
  getHealth(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    isRunning: boolean;
    subscriptionCount: number;
    bufferedEvents: number;
  } {
    const subscriptionCount = this.subscriptions.size;
    const bufferedEvents = this.eventBuffer.length;
    
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (!this.isRunning) {
      status = 'unhealthy';
    } else if (subscriptionCount === 0) {
      status = 'degraded';
    }

    return {
      status,
      isRunning: this.isRunning,
      subscriptionCount,
      bufferedEvents,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      eventsReceived: 0,
      eventsForwarded: 0,
      eventsFiltered: 0,
      eventsFailed: 0,
      batchesSent: 0,
      isRunning: this.isRunning,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalEventBridge: OpenClawEventBridge | null = null;

/**
 * Get or create the global event bridge instance
 */
export function getOpenClawEventBridge(config?: EventBridgeConfig): OpenClawEventBridge {
  if (!globalEventBridge && config) {
    globalEventBridge = new OpenClawEventBridge(config);
  }
  
  if (!globalEventBridge) {
    throw new ApplicationError(
      'OpenClawEventBridge not initialized. Provide config on first call.',
      DashErrorCode.INITIALIZATION_FAILED,
      500,
      {}
    );
  }
  
  return globalEventBridge;
}

/**
 * Reset the global event bridge instance (for testing)
 */
export function resetOpenClawEventBridge(): void {
  globalEventBridge = null;
}

/**
 * Check if event bridge is initialized
 */
export function isOpenClawEventBridgeInitialized(): boolean {
  return globalEventBridge !== null;
}

export default OpenClawEventBridge;
