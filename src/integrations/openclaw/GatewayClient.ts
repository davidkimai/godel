/**
 * OpenClaw Gateway Client
 *
 * WebSocket client for connecting to the OpenClaw Gateway API.
 * Features:
 * - WebSocket connection management with auto-reconnect
 * - Token authentication (OPENCLAW_GATEWAY_TOKEN)
 * - Request/response cycle with idempotency keys
 * - Event subscription (agent, chat, presence, tick)
 * - Connection state management
 *
 * Protocol: OpenClaw Gateway Protocol v3
 * Docs: https://docs.openclaw.ai/gateway/protocol
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  GatewayConfig,
  GatewayClientOptions,
  ConnectionState,
  Request,
  Response,
  Event,
  PendingRequest,
  EventHandler,
  GatewayStats,
  ReconnectionState,
  GatewayError,
  ConnectionError,
  TimeoutError,
  DEFAULT_GATEWAY_CONFIG,
  DEFAULT_GATEWAY_OPTIONS,
  SessionsListParams,
  SessionsListResponse,
  SessionsSpawnParams,
  SessionsSpawnResponse,
  SessionsSendParams,
  SessionsSendResponse,
  SessionsHistoryParams,
  SessionsHistoryResponse,
  AgentEventPayload,
  ChatEventPayload,
  PresenceEventPayload,
  TickEventPayload,
  SessionInfo,
  Message,
} from './types';

// ============================================================================
// Protocol Constants (from OpenClaw Gateway Protocol v3)
// ============================================================================

const PROTOCOL_VERSION = 3;

const GATEWAY_CLIENT_IDS = {
  WEBCHAT_UI: 'webchat-ui',
  CONTROL_UI: 'openclaw-control-ui',
  WEBCHAT: 'webchat',
  CLI: 'cli',
  GATEWAY_CLIENT: 'gateway-client',
  MACOS_APP: 'openclaw-macos',
  IOS_APP: 'openclaw-ios',
  ANDROID_APP: 'openclaw-android',
  NODE_HOST: 'node-host',
  TEST: 'test',
  FINGERPRINT: 'fingerprint',
  PROBE: 'openclaw-probe',
} as const;

const GATEWAY_CLIENT_MODES = {
  WEBCHAT: 'webchat',
  CLI: 'cli',
  UI: 'ui',
  BACKEND: 'backend',
  NODE: 'node',
  PROBE: 'probe',
  TEST: 'test',
} as const;

// ============================================================================
// Gateway Client Class
// ============================================================================

export class GatewayClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private options: GatewayClientOptions;
  private state: ConnectionState = 'disconnected';
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private eventHandlers: Map<string, Set<EventHandler>> = new Map();
  private reconnectionState: ReconnectionState | null = null;
  private stats: GatewayStats;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private eventSeq = 0;
  private requestIdCounter = 0;
  private clientId: string;
  private currentChallenge: { nonce: string; ts: number } | null = null;

  constructor(
    config: Partial<GatewayConfig> = {},
    options: Partial<GatewayClientOptions> = {}
  ) {
    super();

    // Merge with defaults
    this.config = {
      ...DEFAULT_GATEWAY_CONFIG,
      ...config,
      // Allow token from environment variable
      token: config.token ?? process.env['OPENCLAW_GATEWAY_TOKEN'],
    };

    this.options = {
      ...DEFAULT_GATEWAY_OPTIONS,
      ...options,
    };

    this.stats = {
      reconnections: 0,
      requestsSent: 0,
      responsesReceived: 0,
      eventsReceived: 0,
      errors: 0,
    };

    this.clientId = this.generateClientId();
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to the OpenClaw Gateway
   */
  async connect(): Promise<void> {
    if (this.state === 'connected' || this.state === 'authenticating' || this.state === 'authenticated') {
      return;
    }

    if (this.state === 'connecting') {
      throw new ConnectionError('Connection already in progress');
    }

    this.setState('connecting');

    const wsUrl = `ws://${this.config.host}:${this.config.port}`;

    return new Promise((resolve, reject) => {
      let connectTimeout: NodeJS.Timeout;
      
      const cleanup = () => {
        clearTimeout(connectTimeout);
        this.off('authenticated', onAuthenticated);
        this.off('error', onError as EventHandler);
      };
      
      const onAuthenticated = () => {
        cleanup();
        resolve();
      };
      
      const onError = (error: Error) => {
        if (this.state !== 'authenticated') {
          cleanup();
          reject(error);
        }
      };
      
      // Set up authentication timeout
      connectTimeout = setTimeout(() => {
        cleanup();
        this.ws?.terminate();
        this.setState('error');
        reject(new ConnectionError(`Connection timeout after ${this.options.connectionTimeout}ms`));
      }, this.options.connectionTimeout);
      
      // Listen for authentication
      this.on('authenticated', onAuthenticated);
      this.on('error', onError as EventHandler);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.once('open', () => {
          this.handleOpen();
        });

        this.ws.once('error', (error) => {
          this.handleError(error);
          // Don't reject here - the onError handler will handle it
        });

        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('close', (code, reason) => this.handleClose(code, reason));
        this.ws.on('error', (error) => this.handleError(error));

      } catch (error) {
        cleanup();
        this.setState('error');
        reject(new ConnectionError(`Failed to create WebSocket: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  /**
   * Disconnect from the Gateway
   */
  async disconnect(): Promise<void> {
    this.clearHeartbeat();
    this.clearReconnectTimeout();

    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new ConnectionError('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close(1000, 'Client disconnect');
      }
      this.ws.removeAllListeners();
      this.ws = null;
    }

    this.setState('disconnected');
    this.stats.disconnectedAt = new Date();
  }

  /**
   * Check if connected
   */
  get connected(): boolean {
    return this.state === 'authenticated' && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get current connection state
   */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Get connection statistics
   */
  get statistics(): GatewayStats {
    return { ...this.stats };
  }

  // ============================================================================
  // Authentication (OpenClaw Gateway Protocol v3)
  // ============================================================================

  /**
   * Handle connection open - wait for challenge and authenticate
   */
  private async handleOpen(): Promise<void> {
    this.stats.connectedAt = new Date();
    this.reconnectionState = null;
    this.emit('connected');

    // Wait for connect.challenge event before authenticating
    // This will be handled by handleMessage
  }

  /**
   * Authenticate with the Gateway using token
   *
   * Per OpenClaw Gateway Protocol v3:
   * - Wait for connect.challenge event
   * - Send connect request with client info and auth token
   * - For local connections, device identity is optional
   */
  private async authenticate(): Promise<void> {
    if (!this.config.token) {
      throw new GatewayError('AUTHENTICATION_ERROR', 'No token provided. Set OPENCLAW_GATEWAY_TOKEN environment variable.');
    }

    this.setState('authenticating');

    try {
      // Send connect request per Protocol v3
      const response = await this.request<{
        type: string;
        protocol: number;
        server: { version: string; host: string; connId: string };
        features: { methods: string[]; events: string[] };
        snapshot: unknown;
        policy: { tickIntervalMs: number };
      }>('connect', {
        minProtocol: PROTOCOL_VERSION,
        maxProtocol: PROTOCOL_VERSION,
        client: {
          id: GATEWAY_CLIENT_IDS.CLI,
          mode: GATEWAY_CLIENT_MODES.CLI,
          platform: process.platform === 'darwin' ? 'macos' : process.platform,
          version: '2.0.0',
        },
        role: 'operator',
        scopes: ['operator.read', 'operator.write', 'operator.admin'],
        caps: [],
        commands: [],
        permissions: {},
        auth: {
          token: this.config.token,
        },
        locale: 'en-US',
        userAgent: 'dash-cli/2.0.0',
      });

      this.setState('authenticated');
      this.emit('authenticated', response);

      // Subscribe to default events (non-blocking - gateway may not support subscribe method)
      if (this.options.subscriptions) {
        for (const event of this.options.subscriptions) {
          try {
            await this.subscribeToEvent(event);
          } catch {
            // Subscription failed - gateway may not support this method
            // Continue without subscribing
          }
        }
      }

      // Start heartbeat
      this.startHeartbeat(response.policy?.tickIntervalMs || 30000);

    } catch (error) {
      this.setState('error');
      throw new GatewayError('AUTHENTICATION_ERROR', 'Authentication failed', error);
    }
  }

  // ============================================================================
  // Request/Response Cycle
  // ============================================================================

  /**
   * Send a request to the Gateway
   */
  async request<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      if (this.options.autoReconnect) {
        await this.connect();
      } else {
        throw new ConnectionError('Not connected to Gateway');
      }
    }

    const id = this.generateRequestId();
    const request: Request = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      // Set up timeout
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(`Request timeout: ${method}`));
      }, this.config.requestTimeout);

      // Store pending request
      this.pendingRequests.set(id, {
        id,
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        timestamp: Date.now(),
      });

      // Send request
      try {
        this.ws!.send(JSON.stringify(request));
        this.stats.requestsSent++;
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(new GatewayError('REQUEST_ERROR', `Failed to send request: ${error instanceof Error ? error.message : String(error)}`));
      }
    });
  }

  /**
   * Send a request with automatic retry on connection error
   */
  async requestWithReconnect<T>(
    method: string,
    params: Record<string, unknown> = {}
  ): Promise<T> {
    try {
      return await this.request<T>(method, params);
    } catch (error) {
      if (error instanceof ConnectionError && this.options.autoReconnect) {
        await this.reconnect();
        return await this.request<T>(method, params);
      }
      throw error;
    }
  }

  // ============================================================================
  // Event Subscription
  // ============================================================================

  /**
   * Subscribe to an event type
   */
  on(event: string, handler: EventHandler): this {
    // Also register with parent EventEmitter for internal events
    super.on(event, handler as (...args: unknown[]) => void);
    
    // Also track in eventHandlers for custom event routing
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  /**
   * Unsubscribe from an event type
   */
  off(event: string, handler: EventHandler): this {
    // Also remove from parent EventEmitter
    super.off(event, handler as (...args: unknown[]) => void);
    
    // Also remove from eventHandlers
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
    return this;
  }

  /**
   * Subscribe to agent events
   */
  onAgentEvent(handler: (payload: AgentEventPayload) => void): this {
    return this.on('agent', handler as EventHandler);
  }

  /**
   * Subscribe to chat events
   */
  onChatEvent(handler: (payload: ChatEventPayload) => void): this {
    return this.on('chat', handler as EventHandler);
  }

  /**
   * Subscribe to presence events
   */
  onPresenceEvent(handler: (payload: PresenceEventPayload) => void): this {
    return this.on('presence', handler as EventHandler);
  }

  /**
   * Subscribe to tick events (heartbeat)
   */
  onTickEvent(handler: (payload: TickEventPayload) => void): this {
    return this.on('tick', handler as EventHandler);
  }

  // ============================================================================
  // Session Management API
  // ============================================================================

  /**
   * List all sessions
   */
  async sessionsList(params?: SessionsListParams): Promise<SessionInfo[]> {
    const response = await this.requestWithReconnect<SessionsListResponse>('sessions_list', (params ?? {}) as Record<string, unknown>);
    return response.sessions;
  }

  /**
   * Spawn a new session
   */
  async sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse> {
    return await this.requestWithReconnect<SessionsSpawnResponse>('sessions_spawn', (params ?? {}) as Record<string, unknown>);
  }

  /**
   * Send a message to a session
   */
  async sessionsSend(sessionKey: string, message: string, attachments?: unknown[]): Promise<SessionsSendResponse> {
    const params = {
      sessionKey,
      message,
      attachments,
    };
    return await this.requestWithReconnect<SessionsSendResponse>('sessions_send', params as Record<string, unknown>);
  }

  /**
   * Get session history
   */
  async sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]> {
    const params = {
      sessionKey,
      limit,
    };
    const response = await this.requestWithReconnect<SessionsHistoryResponse>('sessions_history', params as Record<string, unknown>);
    return response.messages;
  }

  /**
   * Kill a session
   */
  async sessionsKill(sessionKey: string): Promise<void> {
    await this.requestWithReconnect<void>('sessions_kill', { sessionKey });
  }

  // ============================================================================
  // Event Subscription API
  // ============================================================================

  /**
   * Subscribe to server-side events
   */
  private async subscribeToEvent(event: string): Promise<void> {
    await this.request('subscribe', { event });
  }

  /**
   * Unsubscribe from server-side events
   */
  async unsubscribe(event: string): Promise<void> {
    await this.request('unsubscribe', { event });
  }

  // ============================================================================
  // WebSocket Event Handlers
  // ============================================================================

  private handleMessage(data: WebSocket.Data): void {
    try {
      const message = JSON.parse(data.toString()) as Response | Event;

      if (message.type === 'res') {
        this.handleResponse(message as Response);
      } else if (message.type === 'event') {
        this.handleEvent(message as Event);
      }
    } catch (error) {
      this.stats.errors++;
      this.emit('error', new GatewayError('INTERNAL_ERROR', 'Failed to parse message', error));
    }
  }

  private handleResponse(response: Response): void {
    this.stats.responsesReceived++;

    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      // Response for unknown request (maybe timed out)
      return;
    }

    // Clear timeout
    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    if (response.ok) {
      pending.resolve(response.payload);
    } else {
      const error = new GatewayError(
        (response.error?.code as any) ?? 'INTERNAL_ERROR',
        response.error?.message ?? 'Unknown error',
        response.error?.details
      );
      pending.reject(error);
    }
  }

  private handleEvent(event: Event): void {
    this.stats.eventsReceived++;
    this.eventSeq = event.seq ?? this.eventSeq + 1;

    // Handle connect.challenge for authentication
    if (event.event === 'connect.challenge') {
      this.currentChallenge = event.payload as { nonce: string; ts: number };
      this.authenticate().catch((error) => {
        this.emit('error', error);
      });
      return;
    }

    // Emit specific event
    this.emit(event.event, event.payload, event);

    // Call registered handlers
    const handlers = this.eventHandlers.get(event.event);
    if (handlers) {
      handlers.forEach((handler) => {
        try {
          handler(event.payload, event);
        } catch (error) {
          this.emit('error', error);
        }
      });
    }

    // Emit generic event
    this.emit('event', event);
  }

  private handleClose(code: number, reason: Buffer): void {
    this.clearHeartbeat();
    this.setState('disconnected');
    this.stats.disconnectedAt = new Date();

    // Reject pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new ConnectionError(`Connection closed: ${code} ${reason.toString()}`));
    }
    this.pendingRequests.clear();

    this.emit('disconnected', { code, reason: reason.toString() });

    // Auto-reconnect if enabled and not a clean close
    if (this.options.autoReconnect && code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    this.stats.errors++;
    this.emit('error', error);
  }

  // ============================================================================
  // Reconnection Logic
  // ============================================================================

  private async reconnect(): Promise<void> {
    if (this.state === 'reconnecting') {
      return;
    }

    this.setState('reconnecting');
    this.stats.reconnections++;

    await this.disconnect();
    await this.connect();
  }

  private scheduleReconnect(): void {
    if (!this.reconnectionState) {
      this.reconnectionState = {
        attempt: 0,
        lastAttempt: Date.now(),
        nextDelay: this.config.reconnectDelay,
        maxRetries: this.config.maxRetries,
      };
    }

    const state = this.reconnectionState;

    if (state.attempt >= state.maxRetries) {
      this.emit('error', new ConnectionError(`Max reconnection attempts (${state.maxRetries}) exceeded`));
      return;
    }

    state.attempt++;
    state.lastAttempt = Date.now();

    this.clearReconnectTimeout();

    this.reconnectTimeout = setTimeout(() => {
      this.reconnect().catch((error) => {
        this.emit('error', error);
        // Schedule next attempt with exponential backoff
        state.nextDelay = Math.min(state.nextDelay * 2, 30000);
        this.scheduleReconnect();
      });
    }, state.nextDelay);
  }

  private clearReconnectTimeout(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
  }

  // ============================================================================
  // Heartbeat
  // ============================================================================

  private startHeartbeat(intervalMs: number = 30000): void {
    this.clearHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.request('ping', {}).then(() => {
          this.stats.lastPing = Date.now();
        }).catch(() => {
          // Ping failed, connection might be dead
          this.ws?.terminate();
        });
      }
    }, intervalMs);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private setState(state: ConnectionState): void {
    const oldState = this.state;
    this.state = state;
    if (oldState !== state) {
      this.emit('stateChange', state, oldState);
    }
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private generateClientId(): string {
    return `dash_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new Gateway client with configuration
 */
export function createGatewayClient(
  config?: Partial<GatewayConfig>,
  options?: Partial<GatewayClientOptions>
): GatewayClient {
  return new GatewayClient(config, options);
}

/**
 * Connect to Gateway with default configuration
 */
export async function connectToGateway(
  token?: string
): Promise<GatewayClient> {
  const client = new GatewayClient({
    token: token ?? process.env['OPENCLAW_GATEWAY_TOKEN'],
  }, {
    autoReconnect: true,
    subscriptions: ['agent', 'chat', 'presence', 'tick'],
  });

  await client.connect();
  return client;
}
