/**
 * @dash/client SDK - Events Resource
 * 
 * Resource class for managing Dash events - system events, logs, and real-time subscriptions.
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { DashClient } from '../client';
import {
  Event,
  EventFilter,
  EventSubscription,
  EventListResponse,
} from '../types';
import { NotFoundError, ValidationError, DashError } from '../errors';

/**
 * Callback function type for event subscriptions
 */
export type EventCallback = (event: Event) => void;

/**
 * Resource for managing Dash events.
 * Provides methods to list, filter events and subscribe to real-time event streams.
 * 
 * @example
 * ```typescript
 * const client = new DashClient({ apiUrl, apiKey });
 * 
 * // List recent events
 * const events = await client.events.list({
 *   severities: ['error', 'critical'],
 *   startTime: new Date(Date.now() - 86400000).toISOString(),
 * });
 * 
 * // Subscribe to real-time events
 * const subscription = await client.events.subscribe({
 *   types: ['agent.crashed', 'task.failed'],
 * }, (event) => {
 *   console.log('Critical event:', event.title);
 * });
 * 
 * // Unsubscribe when done
 * await client.events.unsubscribe(subscription.id);
 * ```
 */
export class EventsResource extends EventEmitter {
  private readonly client: DashClient;
  private readonly basePath = '/events';
  private readonly subscriptions: Map<string, WebSocket> = new Map();

  constructor(client: DashClient) {
    super();
    this.client = client;
  }

  /**
   * List events with filtering and pagination
   * 
   * @param filter - Event filter criteria
   * @param pagination - Pagination parameters
   * @returns Paginated list of events
   * 
   * @example
   * ```typescript
   * // List all events (paginated)
   * const events = await client.events.list();
   * 
   * // Filter by severity
   * const criticalEvents = await client.events.list({
   *   severities: ['error', 'critical'],
   * });
   * 
   * // Filter by type and time range
   * const recentAgentEvents = await client.events.list({
   *   types: ['agent.spawned', 'agent.crashed', 'agent.stopped'],
   *   startTime: new Date(Date.now() - 3600000).toISOString(),
   *   endTime: new Date().toISOString(),
   * });
   * 
   * // Filter by source
   * const swarmEvents = await client.events.list({
   *   sourceType: 'swarm',
   *   sourceId: 'swarm-123',
   * });
   * ```
   */
  async list(
    filter?: EventFilter,
    pagination?: { page?: number; limit?: number; cursor?: string }
  ): Promise<EventListResponse> {
    const query: Record<string, unknown> = {};

    if (filter?.types?.length) query.types = filter.types.join(',');
    if (filter?.severities?.length) query.severities = filter.severities.join(',');
    if (filter?.sourceType) query.source_type = filter.sourceType;
    if (filter?.sourceId) query.source_id = filter.sourceId;
    if (filter?.startTime) query.start_time = filter.startTime;
    if (filter?.endTime) query.end_time = filter.endTime;
    if (filter?.acknowledged !== undefined) query.acknowledged = filter.acknowledged;
    if (filter?.organizationId) query.organization_id = filter.organizationId;
    if (filter?.query) query.q = filter.query;

    if (pagination?.page) query.page = pagination.page;
    if (pagination?.limit) query.limit = pagination.limit;
    if (pagination?.cursor) query.cursor = pagination.cursor;

    return this.client.get<EventListResponse>(this.basePath, query);
  }

  /**
   * Get a single event by ID
   * 
   * @param eventId - The event ID
   * @returns The event
   * @throws {NotFoundError} If the event doesn't exist
   * 
   * @example
   * ```typescript
   * const event = await client.events.get('evt-123');
   * console.log(`Event: ${event.title} (${event.severity})`);
   * console.log(`Source: ${event.sourceType} / ${event.sourceId}`);
   * ```
   */
  async get(eventId: string): Promise<Event> {
    if (!eventId || eventId.trim().length === 0) {
      throw new ValidationError('Event ID is required', {
        validationErrors: [{ field: 'eventId', message: 'Event ID is required', code: 'required' }],
      });
    }

    try {
      return await this.client.get<Event>(`${this.basePath}/${eventId}`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Event not found: ${eventId}`, {
          resourceType: 'event',
          resourceId: eventId,
        });
      }
      throw error;
    }
  }

  /**
   * Acknowledge an event
   * 
   * @param eventId - The event ID to acknowledge
   * @returns The acknowledged event
   * @throws {NotFoundError} If the event doesn't exist
   * 
   * @example
   * ```typescript
   * const event = await client.events.acknowledge('evt-123');
   * console.log(`Event acknowledged at: ${event.acknowledgedAt}`);
   * ```
   */
  async acknowledge(eventId: string): Promise<Event> {
    if (!eventId || eventId.trim().length === 0) {
      throw new ValidationError('Event ID is required', {
        validationErrors: [{ field: 'eventId', message: 'Event ID is required', code: 'required' }],
      });
    }

    try {
      return await this.client.post<Event>(`${this.basePath}/${eventId}/acknowledge`, {});
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Event not found: ${eventId}`, {
          resourceType: 'event',
          resourceId: eventId,
        });
      }
      throw error;
    }
  }

  /**
   * Subscribe to real-time events via WebSocket
   * 
   * @param filter - Event filter criteria
   * @param callback - Function to call when events are received
   * @returns EventSubscription object with subscription details
   * @throws {DashError} If WebSocket connection fails
   * 
   * @example
   * ```typescript
   * // Subscribe to all agent events
   * const sub = await client.events.subscribe({
   *   sourceType: 'agent',
   * }, (event) => {
   *   console.log(`Agent ${event.sourceId}: ${event.title}`);
   * });
   * 
   * // Subscribe to critical errors only
   * const errorSub = await client.events.subscribe({
   *   severities: ['error', 'critical'],
   * }, (event) => {
   *   console.error('CRITICAL:', event.title, event.description);
   *   // Send alert to pager duty, etc.
   * });
   * 
   * // Subscribe to specific swarm events
   * const swarmSub = await client.events.subscribe({
   *   types: ['swarm.scaled', 'swarm.error'],
   *   sourceId: 'my-swarm',
   * }, (event) => {
   *   handleSwarmEvent(event);
   * });
   * ```
   */
  async subscribe(
    filter: EventFilter,
    callback: EventCallback
  ): Promise<EventSubscription> {
    const config = this.client.getConfig();
    
    // Convert HTTP URL to WebSocket URL
    const wsUrl = config.apiUrl
      .replace(/^http/, 'ws')
      .replace(/^https/, 'wss');
    
    // Build WebSocket connection URL with filter params
    const params = new URLSearchParams();
    params.append('api_key', config.apiKey);
    
    if (filter.types?.length) {
      params.append('types', filter.types.join(','));
    }
    if (filter.severities?.length) {
      params.append('severities', filter.severities.join(','));
    }
    if (filter.sourceType) {
      params.append('source_type', filter.sourceType);
    }
    if (filter.sourceId) {
      params.append('source_id', filter.sourceId);
    }

    const wsUrlWithParams = `${wsUrl}/${config.apiVersion}/events/stream?${params.toString()}`;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrlWithParams);
      const subscriptionId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      ws.on('open', () => {
        this.subscriptions.set(subscriptionId, ws);
        
        const subscription: EventSubscription = {
          id: subscriptionId,
          name: `Subscription ${subscriptionId}`,
          filter,
          createdAt: new Date().toISOString(),
          active: true,
        };

        resolve(subscription);
      });

      ws.on('message', (data: WebSocket.Data) => {
        try {
          const event: Event = JSON.parse(data.toString());
          callback(event);
          this.emit('event', event);
        } catch (error) {
          this.emit('error', new DashError('Failed to parse event data', { cause: error as Error }));
        }
      });

      ws.on('error', (error) => {
        this.subscriptions.delete(subscriptionId);
        this.emit('error', error);
        reject(new DashError('WebSocket connection failed', { cause: error }));
      });

      ws.on('close', () => {
        this.subscriptions.delete(subscriptionId);
        this.emit('close', { subscriptionId });
      });
    });
  }

  /**
   * Unsubscribe from real-time events
   * 
   * @param subscriptionId - The subscription ID to unsubscribe
   * @returns True if successfully unsubscribed
   * @throws {NotFoundError} If the subscription doesn't exist
   * 
   * @example
   * ```typescript
   * // Unsubscribe by ID
   * await client.events.unsubscribe('sub-123');
   * 
   * // Unsubscribe using subscription object
   * const sub = await client.events.subscribe(filter, callback);
   * // ... later
   * await client.events.unsubscribe(sub.id);
   * ```
   */
  async unsubscribe(subscriptionId: string): Promise<boolean> {
    const ws = this.subscriptions.get(subscriptionId);
    
    if (!ws) {
      throw new NotFoundError(`Subscription not found: ${subscriptionId}`, {
        resourceType: 'subscription',
        resourceId: subscriptionId,
      });
    }

    return new Promise((resolve) => {
      ws.on('close', () => {
        this.subscriptions.delete(subscriptionId);
        resolve(true);
      });

      // Close with normal closure code
      ws.close(1000, 'Unsubscribed by client');

      // Fallback: force close after timeout
      setTimeout(() => {
        if (this.subscriptions.has(subscriptionId)) {
          ws.terminate();
          this.subscriptions.delete(subscriptionId);
          resolve(true);
        }
      }, 5000);
    });
  }

  /**
   * Get all active subscriptions
   * 
   * @returns Array of active subscription IDs
   * 
   * @example
   * ```typescript
   * const activeSubs = client.events.getActiveSubscriptions();
   * console.log(`Active subscriptions: ${activeSubs.length}`);
   * ```
   */
  getActiveSubscriptions(): string[] {
    return Array.from(this.subscriptions.keys());
  }

  /**
   * Create a webhook subscription for events
   * 
   * @param filter - Event filter criteria
   * @param webhookUrl - URL to send events to
   * @param options - Additional options
   * @returns Created subscription
   * @throws {ValidationError} If webhookUrl is invalid
   * 
   * @example
   * ```typescript
   * const sub = await client.events.createWebhook({
   *   types: ['task.completed', 'task.failed'],
   *   severities: ['info', 'warn', 'error'],
   * }, 'https://my-app.com/webhooks/dash-events');
   * 
   * console.log(`Webhook created: ${sub.id}`);
   * ```
   */
  async createWebhook(
    filter: EventFilter,
    webhookUrl: string,
    options?: { includePayload?: boolean; name?: string }
  ): Promise<EventSubscription> {
    // Validate webhook URL
    try {
      new URL(webhookUrl);
    } catch {
      throw new ValidationError('Invalid webhook URL', {
        validationErrors: [{ field: 'webhookUrl', message: 'Invalid URL format', code: 'invalid' }],
      });
    }

    const body: Record<string, unknown> = {
      filter,
      webhook_url: webhookUrl,
    };

    if (options?.includePayload !== undefined) {
      body.include_payload = options.includePayload;
    }
    if (options?.name) {
      body.name = options.name;
    }

    return this.client.post<EventSubscription>(`${this.basePath}/subscriptions`, body);
  }

  /**
   * Delete a webhook subscription
   * 
   * @param subscriptionId - The subscription ID to delete
   * @throws {NotFoundError} If the subscription doesn't exist
   * 
   * @example
   * ```typescript
   * await client.events.deleteWebhook('sub-123');
   * ```
   */
  async deleteWebhook(subscriptionId: string): Promise<void> {
    if (!subscriptionId || subscriptionId.trim().length === 0) {
      throw new ValidationError('Subscription ID is required', {
        validationErrors: [{ field: 'subscriptionId', message: 'Subscription ID is required', code: 'required' }],
      });
    }

    try {
      await this.client.delete<void>(`${this.basePath}/subscriptions/${subscriptionId}`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Webhook subscription not found: ${subscriptionId}`, {
          resourceType: 'subscription',
          resourceId: subscriptionId,
        });
      }
      throw error;
    }
  }

  /**
   * List all webhook subscriptions
   * 
   * @returns Array of webhook subscriptions
   * 
   * @example
   * ```typescript
   * const subs = await client.events.listWebhooks();
   * subs.forEach(sub => {
   *   console.log(`${sub.name}: ${sub.webhookUrl}`);
   * });
   * ```
   */
  async listWebhooks(): Promise<EventSubscription[]> {
    const response = await this.client.get<{ subscriptions: EventSubscription[] }>(`${this.basePath}/subscriptions`);
    return response.subscriptions;
  }

  /**
   * Close all active WebSocket connections
   * Call this when shutting down your application
   * 
   * @example
   * ```typescript
   * process.on('SIGTERM', async () => {
   *   await client.events.closeAll();
   *   await client.close();
   * });
   * ```
   */
  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.subscriptions.entries()).map(
      async ([, ws]) => {
        return new Promise<void>((resolve) => {
          ws.on('close', resolve);
          ws.close(1000, 'Client shutting down');
          setTimeout(() => {
            ws.terminate();
            resolve();
          }, 1000);
        });
      }
    );

    await Promise.all(closePromises);
    this.subscriptions.clear();
  }
}
