/**
 * OpenClaw Core Primitive
 * 
 * OpenClaw is a core primitive of Godel, not an integration.
 * It provides:
 * - Direct tool execution for all agents
 * - Automatic session management
 * - WebSocket connection to OpenClaw Gateway
 * - Transparent agent-to-session mapping
 * 
 * Architecture:
 * - Initialized at system startup (not lazily)
 * - Always connected to Gateway when running
 * - Available to all agents automatically
 * - Agents can use tools via useOpenClawTool()
 * 
 * @module core/openclaw
 */

import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { AgentStatus } from '../models/agent';
import { MessageBus } from '../bus/index';
import {
  ApplicationError,
  NotFoundError,
  DashErrorCode,
  assertExists,
  safeExecute,
} from '../errors';
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
} from '../integrations/openclaw/types';

// ============================================================================
// Core Primitive Types
// ============================================================================

export interface OpenClawSession {
  sessionId: string;
  agentId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'killed';
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  pausedAt?: Date;
  resumedAt?: Date;
  lastError?: string;
  metadata: Record<string, unknown>;
}

export interface SessionSpawnOptions {
  agentId: string;
  model?: string;
  task: string;
  context?: Record<string, unknown>;
  maxTokens?: number;
  timeout?: number;
}

export interface SessionStatus {
  sessionId: string;
  agentId: string;
  status: OpenClawSession['status'];
  runtime: number;
  tokenUsage: {
    prompt: number;
    completion: number;
    total: number;
  };
  cost: number;
}

export interface OpenClawCoreOptions {
  gatewayUrls?: string[];
  maxConcurrentSessions?: number;
  perGatewayMaxConcurrentSessions?: number;
  autoStartGateway?: boolean;
  gatewayStartCommand?: string;
  gatewayStartupTimeoutMs?: number;
  gatewayStartupProbeIntervalMs?: number;
}

export type SessionEvent = 
  | { type: 'session.created'; sessionId: string; agentId: string }
  | { type: 'session.started'; sessionId: string; agentId: string }
  | { type: 'session.paused'; sessionId: string; agentId: string }
  | { type: 'session.resumed'; sessionId: string; agentId: string }
  | { type: 'session.completed'; sessionId: string; agentId: string; output?: string }
  | { type: 'session.failed'; sessionId: string; agentId: string; error: string }
  | { type: 'session.killed'; sessionId: string; agentId: string; force: boolean }
  | { type: 'token.usage'; sessionId: string; agentId: string; tokens: number; cost: number };

/**
 * OpenClaw Tool Types
 * All tools available to agents through the core primitive
 */
export type OpenClawTool = 
  | 'read'
  | 'write'
  | 'edit'
  | 'exec'
  | 'process'
  | 'web_search'
  | 'web_fetch'
  | 'browser'
  | 'canvas'
  | 'nodes'
  | 'image'
  | 'supermemory_search'
  | 'supermemory_store'
  | 'supermemory_forget'
  | 'supermemory_profile'
  | 'sessions_list'
  | 'sessions_spawn'
  | 'sessions_send'
  | 'sessions_kill'
  | 'sessions_history'
  | 'tts'
  | 'message';

export interface ToolCallOptions {
  tool: OpenClawTool;
  params: Record<string, unknown>;
  timeout?: number;
}

export interface ToolCallResult {
  success: boolean;
  data?: unknown;
  error?: string;
  duration: number;
}

// ============================================================================
// Gateway Client (Core Primitive Implementation)
// ============================================================================

/**
 * OpenClaw Gateway Client
 * WebSocket client for connecting to the OpenClaw Gateway API.
 * This is the core transport layer for all OpenClaw operations.
 */
export class OpenClawGatewayClient extends EventEmitter {
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
  private authenticationPromise: Promise<void> | null = null;
  private eventSeq = 0;
  private requestIdCounter = 0;
  private clientId: string;

  constructor(
    config: Partial<GatewayConfig> = {},
    options: Partial<GatewayClientOptions> = {}
  ) {
    super();

    this.config = {
      ...DEFAULT_GATEWAY_CONFIG,
      ...config,
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
   * Core primitive: Always connected when system is running
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
      const timeout = setTimeout(() => {
        this.ws?.terminate();
        this.setState('error');
        reject(new ConnectionError(`Connection timeout after ${this.options.connectionTimeout}ms`));
      }, this.options.connectionTimeout);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.once('open', () => {
          clearTimeout(timeout);
          this.handleOpen();
          resolve();
        });

        this.ws.once('error', (error) => {
          clearTimeout(timeout);
          this.handleError(error);
          reject(new ConnectionError(`WebSocket error: ${error.message}`));
        });

        this.ws.on('message', (data) => this.handleMessage(data));
        this.ws.on('close', (code, reason) => this.handleClose(code, reason));
        this.ws.on('error', (error) => this.handleError(error));

      } catch (error) {
        clearTimeout(timeout);
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
  // Authentication
  // ============================================================================

  /**
   * Authenticate with the Gateway using token
   */
  async authenticate(): Promise<void> {
    if (this.state === 'authenticated') {
      return;
    }
    if (this.authenticationPromise) {
      await this.authenticationPromise;
      return;
    }

    this.authenticationPromise = this.performAuthentication();
    try {
      await this.authenticationPromise;
    } finally {
      this.authenticationPromise = null;
    }
  }

  private async performAuthentication(): Promise<void> {
    this.setState('authenticating');
    const connectParams: Record<string, unknown> = {
      client: {
        id: 'node',
        mode: 'client',
        platform: 'node',
        version: '2.0.0',
      },
      minProtocol: 1,
      maxProtocol: 1,
    };
    if (this.config.token) {
      connectParams['auth'] = { token: this.config.token };
    }

    const originalRequestTimeout = this.config.requestTimeout;
    this.config.requestTimeout = Math.min(this.config.requestTimeout, this.options.connectionTimeout);

    try {
      await this.request('connect', connectParams);

      this.setState('authenticated');
      this.emit('authenticated');

      if (this.options.subscriptions) {
        for (const event of this.options.subscriptions) {
          this.subscribeToEvent(event).catch((error) => {
            logger.warn('[OpenClawGatewayClient] Failed to subscribe to event', {
              event,
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }
      }

    } catch (error) {
      this.setState('error');
      throw new GatewayError(
        this.config.token ? 'AUTHENTICATION_ERROR' : 'CONNECTION_ERROR',
        this.config.token ? 'Authentication failed' : 'Gateway handshake failed',
        error
      );
    } finally {
      this.config.requestTimeout = originalRequestTimeout;
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

    if (method !== 'connect' && this.state !== 'authenticated') {
      await this.authenticate();
    }

    const id = this.generateRequestId();
    const request: Request = {
      type: 'req',
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new TimeoutError(`Request timeout: ${method}`));
      }, this.config.requestTimeout);

      this.pendingRequests.set(id, {
        id,
        method,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        timestamp: Date.now(),
      });

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

  on(event: string, handler: EventHandler): this {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
    return this;
  }

  off(event: string, handler: EventHandler): this {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.eventHandlers.delete(event);
      }
    }
    return this;
  }

  onAgentEvent(handler: (payload: AgentEventPayload) => void): this {
    return this.on('agent', handler as EventHandler);
  }

  onChatEvent(handler: (payload: ChatEventPayload) => void): this {
    return this.on('chat', handler as EventHandler);
  }

  onPresenceEvent(handler: (payload: PresenceEventPayload) => void): this {
    return this.on('presence', handler as EventHandler);
  }

  onTickEvent(handler: (payload: TickEventPayload) => void): this {
    return this.on('tick', handler as EventHandler);
  }

  // ============================================================================
  // Session Management API
  // ============================================================================

  async sessionsList(params?: SessionsListParams): Promise<SessionInfo[]> {
    const response = await this.requestWithReconnect<SessionsListResponse>('sessions_list', (params ?? {}) as Record<string, unknown>);
    return response.sessions;
  }

  async sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse> {
    const response = await this.requestWithReconnect<Record<string, unknown>>(
      'sessions_spawn',
      (params ?? {}) as Record<string, unknown>
    );
    return this.normalizeSpawnResponse(response);
  }

  async sessionsSend(sessionKey: string, message: string, attachments?: unknown[]): Promise<SessionsSendResponse> {
    const params = { sessionKey, message, attachments };
    return await this.requestWithReconnect<SessionsSendResponse>('sessions_send', params as Record<string, unknown>);
  }

  async sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]> {
    const params = { sessionKey, limit };
    const response = await this.requestWithReconnect<SessionsHistoryResponse>('sessions_history', params as Record<string, unknown>);
    return response.messages;
  }

  async sessionsKill(sessionKey: string): Promise<void> {
    await this.requestWithReconnect<void>('sessions_kill', { sessionKey });
  }

  // ============================================================================
  // Tool Execution API (Core Primitive)
  // ============================================================================

  /**
   * Execute an OpenClaw tool directly
   * This is the core primitive that allows agents to use any OpenClaw tool
   */
  async executeTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown> {
    const method = `tool_${tool}`;
    return this.requestWithReconnect(method, params);
  }

  /**
   * Read a file
   */
  async readFile(path: string, options?: { offset?: number; limit?: number }): Promise<string> {
    const result = await this.executeTool('read', { path, ...options });
    return String(result);
  }

  /**
   * Write a file
   */
  async writeFile(path: string, content: string): Promise<void> {
    await this.executeTool('write', { path, content });
  }

  /**
   * Edit a file
   */
  async editFile(path: string, oldText: string, newText: string): Promise<void> {
    await this.executeTool('edit', { path, oldText, newText });
  }

  /**
   * Execute a command
   */
  async exec(command: string, options?: { workdir?: string; timeout?: number; env?: Record<string, string> }): Promise<unknown> {
    return this.executeTool('exec', { command, ...options });
  }

  /**
   * Search the web
   */
  async webSearch(query: string, options?: { count?: number; country?: string }): Promise<unknown> {
    return this.executeTool('web_search', { query, ...options });
  }

  /**
   * Fetch a web page
   */
  async webFetch(url: string, options?: { extractMode?: 'markdown' | 'text'; maxChars?: number }): Promise<string> {
    return this.executeTool('web_fetch', { url, ...options }) as Promise<string>;
  }

  /**
   * Browser automation
   */
  async browser(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.executeTool('browser', { action, ...params });
  }

  /**
   * Canvas control
   */
  async canvas(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.executeTool('canvas', { action, ...params });
  }

  /**
   * Node control
   */
  async nodes(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.executeTool('nodes', { action, ...params });
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private normalizeSpawnResponse(response: Record<string, unknown>): SessionsSpawnResponse {
    const sessionKeyCandidate =
      (typeof response['sessionKey'] === 'string' && response['sessionKey'])
      || (typeof response['childSessionKey'] === 'string' && response['childSessionKey'])
      || (typeof response['sessionId'] === 'string' && response['sessionId']);

    if (!sessionKeyCandidate) {
      throw new GatewayError('INVALID_RESPONSE', 'sessions_spawn response missing session key', response);
    }

    const sessionId =
      (typeof response['sessionId'] === 'string' && response['sessionId'])
      || sessionKeyCandidate;

    return {
      ...(response as SessionsSpawnResponse),
      sessionKey: sessionKeyCandidate,
      sessionId,
      childSessionKey:
        (typeof response['childSessionKey'] === 'string' && response['childSessionKey'])
        || sessionKeyCandidate,
    };
  }

  private async subscribeToEvent(event: string): Promise<void> {
    await this.request('subscribe', { event });
  }

  private handleOpen(): void {
    this.stats.connectedAt = new Date();
    this.reconnectionState = null;
    this.emit('connected');
    this.setState('connected');

    this.startHeartbeat();
  }

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
      return;
    }

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

    this.emit(event.event, event.payload, event);

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

    this.emit('event', event);
  }

  private handleClose(code: number, reason: Buffer): void {
    this.clearHeartbeat();
    this.setState('disconnected');
    this.stats.disconnectedAt = new Date();

    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeout);
      request.reject(new ConnectionError(`Connection closed: ${code} ${reason.toString()}`));
    }
    this.pendingRequests.clear();

    this.emit('disconnected', { code, reason: reason.toString() });

    if (this.options.autoReconnect && code !== 1000) {
      this.scheduleReconnect();
    }
  }

  private handleError(error: Error): void {
    this.stats.errors++;
    this.emit('error', error);
  }

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

  private startHeartbeat(): void {
    this.clearHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.request('ping', {}).then(() => {
          this.stats.lastPing = Date.now();
        }).catch(() => {
          this.ws?.terminate();
        });
      }
    }, this.options.heartbeatInterval);
  }

  private clearHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

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
// OpenClaw Core Primitive
// ============================================================================

/**
 * OpenClaw Core Primitive
 * 
 * The main interface for OpenClaw integration as a core primitive.
 * Manages sessions, provides tool access to agents, and maintains Gateway connection.
 */
export class OpenClawCore extends EventEmitter {
  private gateway: OpenClawGatewayClient;
  private gatewayPool: Array<{
    id: string;
    client: OpenClawGatewayClient;
    config: GatewayConfig;
    activeSessions: number;
  }> = [];
  private messageBus: MessageBus;
  private sessions: Map<string, OpenClawSession> = new Map();
  private agentSessionMap: Map<string, string> = new Map();
  private sessionGatewayMap: Map<string, string> = new Map();
  private initialized = false;
  private maxConcurrentSessions: number;
  private perGatewayMaxConcurrentSessions: number;
  private autoStartGateway: boolean;
  private gatewayStartCommand?: string;
  private gatewayStartupTimeoutMs: number;
  private gatewayStartupProbeIntervalMs: number;
  private gatewayProcess: ChildProcess | null = null;

  constructor(
    messageBus: MessageBus,
    gatewayConfig?: Partial<GatewayConfig>,
    options: Partial<OpenClawCoreOptions> = {}
  ) {
    super();
    this.messageBus = messageBus;
    const resolvedOptions = this.resolveCoreOptions(options);
    this.maxConcurrentSessions = resolvedOptions.maxConcurrentSessions;
    this.perGatewayMaxConcurrentSessions = resolvedOptions.perGatewayMaxConcurrentSessions;
    this.autoStartGateway = resolvedOptions.autoStartGateway;
    this.gatewayStartCommand = resolvedOptions.gatewayStartCommand;
    this.gatewayStartupTimeoutMs = resolvedOptions.gatewayStartupTimeoutMs;
    this.gatewayStartupProbeIntervalMs = resolvedOptions.gatewayStartupProbeIntervalMs;

    const gatewayConfigs = this.resolveGatewayConfigs(gatewayConfig, resolvedOptions.gatewayUrls);
    this.gatewayPool = gatewayConfigs.map((cfg, index) => ({
      id: `gateway-${index + 1}`,
      config: cfg,
      activeSessions: 0,
      client: new OpenClawGatewayClient(cfg, {
        autoReconnect: true,
        subscriptions: ['agent', 'chat', 'presence', 'tick'],
      }),
    }));

    this.gateway = this.gatewayPool[0]!.client;
    for (const gatewayEntry of this.gatewayPool) {
      this.setupGatewayListeners(gatewayEntry.id, gatewayEntry.client);
    }
  }

  // ============================================================================
  // Initialization (Core Primitive)
  // ============================================================================

  /**
   * Initialize OpenClaw as a core primitive
   * Called during system startup, not lazily
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('[OpenClawCore] Initializing OpenClaw core primitive...', {
      gateways: this.gatewayPool.map((entry) => `${entry.config.host}:${entry.config.port}`),
      maxConcurrentSessions: this.maxConcurrentSessions,
      perGatewayMaxConcurrentSessions: this.perGatewayMaxConcurrentSessions,
      autoStartGateway: this.autoStartGateway,
    });

    try {
      let connectedGateways = await this.connectGatewayPool();

      if (connectedGateways === 0 && this.autoStartGateway) {
        logger.warn('[OpenClawCore] No gateway available. Attempting to start OpenClaw daemon process.');
        this.startGatewayProcess();
        connectedGateways = await this.waitForGatewayConnectivity();
      }

      if (connectedGateways === 0) {
        throw new ConnectionError('No OpenClaw gateway instances are reachable');
      }

      this.initialized = true;
      logger.info('[OpenClawCore] OpenClaw core primitive initialized and connected', {
        connectedGateways,
      });
      this.emit('initialized');
    } catch (error) {
      logger.error('[OpenClawCore] Failed to initialize OpenClaw:', error as string | Record<string, unknown>);
      throw new ApplicationError(
        'Failed to initialize OpenClaw core primitive',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        { error: error instanceof Error ? error.message : String(error) } as Record<string, unknown>,
        false
      );
    }
  }

  /**
   * Connect to Gateway (idempotent)
   */
  async connect(): Promise<void> {
    const connectedGateways = await this.connectGatewayPool();
    if (connectedGateways === 0) {
      throw new ConnectionError('No OpenClaw gateway instances are connected');
    }
  }

  /**
   * Disconnect from Gateway
   */
  async disconnect(): Promise<void> {
    await Promise.allSettled(this.gatewayPool.map((entry) => entry.client.disconnect()));
    this.initialized = false;
  }

  /**
   * Check if initialized
   */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Check if connected to Gateway
   */
  get isConnected(): boolean {
    return this.gatewayPool.some((entry) => {
      const state = entry.client.connectionState;
      return state === 'connected' || state === 'authenticated' || entry.client.connected;
    });
  }

  // ============================================================================
  // Session Management (Transparent)
  // ============================================================================

  /**
   * Spawn an OpenClaw session for a Godel agent
   * Transparent session management - automatically mapped
   */
  async spawnSession(options: SessionSpawnOptions): Promise<string> {
    this.assertInitialized();

    const activeSessionCount = this.getActiveSessionCount();
    if (activeSessionCount >= this.maxConcurrentSessions) {
      throw new ApplicationError(
        `OpenClaw concurrency limit reached (${this.maxConcurrentSessions})`,
        DashErrorCode.SESSION_SPAWN_FAILED,
        429,
        {
          activeSessions: activeSessionCount,
          maxConcurrentSessions: this.maxConcurrentSessions,
          agentId: options.agentId,
        },
        true
      );
    }

    const gatewayEntry = await this.selectGatewayForSpawn();

    const skills = Array.isArray(options.context?.['skills'])
      ? options.context?.['skills'] as string[]
      : undefined;
    const spawnParams: SessionsSpawnParams = {
      task: options.task,
      model: options.model,
      label: typeof options.context?.['label'] === 'string' ? options.context['label'] as string : undefined,
      runTimeoutSeconds:
        typeof options.timeout === 'number' && options.timeout > 0
          ? Math.ceil(options.timeout / 1000)
          : undefined,
      skills,
      thinking: typeof options.context?.['thinking'] === 'string' ? options.context['thinking'] as string : undefined,
      workspace: typeof options.context?.['workspace'] === 'string' ? options.context['workspace'] as string : undefined,
      systemPrompt:
        typeof options.context?.['systemPrompt'] === 'string'
          ? options.context['systemPrompt'] as string
          : undefined,
    };

    let response: SessionsSpawnResponse;
    try {
      response = await gatewayEntry.client.sessionsSpawn(spawnParams);
    } catch (error) {
      const errorCode = error instanceof GatewayError ? String(error.code) : '';
      const errorMessage = error instanceof Error ? error.message.toLowerCase() : '';
      const shouldRetryLegacy =
        error instanceof GatewayError
        && (
          errorCode === 'INVALID_REQUEST'
          || (errorCode === 'REQUEST_ERROR'
            && (errorMessage.includes('task') || errorMessage.includes('systemprompt')))
        );

      if (!shouldRetryLegacy) {
        throw error;
      }

      logger.warn('[OpenClawCore] sessions_spawn rejected modern payload; retrying legacy payload', {
        agentId: options.agentId,
        gateway: gatewayEntry.id,
        error: errorMessage || errorCode,
      });

      const legacyPayload: Record<string, unknown> = {
        model: options.model,
        systemPrompt: options.task,
        skills: skills ?? [],
      };

      if (spawnParams.thinking) legacyPayload['thinking'] = spawnParams.thinking;
      if (spawnParams.workspace) legacyPayload['workspace'] = spawnParams.workspace;
      if (spawnParams.runTimeoutSeconds) legacyPayload['runTimeoutSeconds'] = spawnParams.runTimeoutSeconds;

      response = await gatewayEntry.client.sessionsSpawn(legacyPayload as unknown as SessionsSpawnParams);
    }

    const sessionKey = response.sessionKey
      ?? response.childSessionKey
      ?? response.sessionId;

    if (!sessionKey) {
      throw new GatewayError('INVALID_RESPONSE', 'sessions_spawn did not return a usable session key', response);
    }

    const session: OpenClawSession = {
      sessionId: sessionKey,
      agentId: options.agentId,
      status: 'running',
      createdAt: new Date(),
      startedAt: new Date(),
      metadata: {
        model: options.model,
        task: options.task,
        maxTokens: options.maxTokens,
        timeout: options.timeout,
        ...options.context,
      },
    };

    this.sessions.set(sessionKey, session);
    this.agentSessionMap.set(options.agentId, sessionKey);
    this.sessionGatewayMap.set(sessionKey, gatewayEntry.id);
    gatewayEntry.activeSessions++;

    logger.info(`[OpenClawCore] Session ${sessionKey} spawned for agent ${options.agentId}`, {
      gateway: gatewayEntry.id,
      gatewayAddress: `${gatewayEntry.config.host}:${gatewayEntry.config.port}`,
      gatewayActiveSessions: gatewayEntry.activeSessions,
      globalActiveSessions: this.getActiveSessionCount(),
    });

    this.emit('session.spawned', {
      agentId: options.agentId,
      sessionId: sessionKey,
      model: options.model,
      gateway: gatewayEntry.id,
    });

    return sessionKey;
  }

  /**
   * Kill a session by agent ID
   */
  async killSession(agentId: string, force = false): Promise<void> {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      logger.warn(`[OpenClawCore] No session found for agent ${agentId}`);
      return;
    }

    const gatewayEntry = this.getGatewayForSession(sessionId) ?? this.gatewayPool[0];
    await gatewayEntry.client.sessionsKill(sessionId);

    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'killed';
      session.completedAt = new Date();
    }

    this.releaseGatewayCapacity(sessionId);

    this.emit('session.killed', { agentId, sessionId, force });
  }

  /**
   * Get session ID for an agent
   */
  getSessionId(agentId: string): string | undefined {
    return this.agentSessionMap.get(agentId);
  }

  /**
   * Get agent ID for a session
   */
  getAgentId(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    return session?.agentId;
  }

  /**
   * Check if an agent has a session
   */
  hasSession(agentId: string): boolean {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      return false;
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }
    return session.status !== 'completed' && session.status !== 'failed' && session.status !== 'killed';
  }

  /**
   * Get session status
   */
  async getSessionStatus(agentId: string): Promise<SessionStatus | null> {
    const sessionId = this.agentSessionMap.get(agentId);
    if (!sessionId) {
      return null;
    }

    // Return local cached status for now
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    return {
      sessionId,
      agentId,
      status: session.status,
      runtime: session.startedAt ? Date.now() - session.startedAt.getTime() : 0,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      cost: 0,
    };
  }

  /**
   * List all active sessions
   */
  getActiveSessions(): Array<{ agentId: string; sessionId: string }> {
    return Array.from(this.agentSessionMap.entries())
      .filter(([, sessionId]) => {
        const session = this.sessions.get(sessionId);
        return session && (session.status === 'pending' || session.status === 'running' || session.status === 'paused');
      })
      .map(([agentId, sessionId]) => ({ agentId, sessionId }));
  }

  async sendSessionMessage(sessionKey: string, message: string, attachments?: unknown[]): Promise<SessionsSendResponse> {
    this.assertInitialized();
    const gatewayEntry = this.getGatewayForSession(sessionKey) ?? this.gatewayPool[0];
    return gatewayEntry.client.sessionsSend(sessionKey, message, attachments);
  }

  async getSessionHistory(sessionKey: string, limit?: number): Promise<Message[]> {
    this.assertInitialized();
    const gatewayEntry = this.getGatewayForSession(sessionKey) ?? this.gatewayPool[0];
    return gatewayEntry.client.sessionsHistory(sessionKey, limit);
  }

  async killSessionBySessionKey(sessionKey: string): Promise<void> {
    this.assertInitialized();
    const gatewayEntry = this.getGatewayForSession(sessionKey) ?? this.gatewayPool[0];
    await gatewayEntry.client.sessionsKill(sessionKey);
    this.releaseGatewayCapacity(sessionKey);
  }

  async listSessions(): Promise<SessionInfo[]> {
    this.assertInitialized();
    const sessionLists = await Promise.allSettled(
      this.gatewayPool.map((entry) => entry.client.sessionsList())
    );
    return sessionLists.flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
  }

  // ============================================================================
  // Tool Access (Core Primitive)
  // ============================================================================

  /**
   * Use an OpenClaw tool
   * Core primitive: Agents can use any OpenClaw tool directly
   */
  async useTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown> {
    this.assertInitialized();
    const gatewayEntry = this.selectGatewayForTool();
    return gatewayEntry.client.executeTool(tool, params);
  }

  /**
   * Read a file (convenience method)
   */
  async read(path: string, options?: { offset?: number; limit?: number }): Promise<string> {
    const result = await this.useTool('read', { path, ...options });
    return String(result);
  }

  /**
   * Write a file (convenience method)
   */
  async write(path: string, content: string): Promise<unknown> {
    return this.useTool('write', { path, content });
  }

  /**
   * Edit a file (convenience method)
   */
  async edit(path: string, oldText: string, newText: string): Promise<unknown> {
    return this.useTool('edit', { path, oldText, newText });
  }

  /**
   * Execute a command (convenience method)
   */
  async exec(command: string, options?: { workdir?: string; timeout?: number }): Promise<unknown> {
    return this.useTool('exec', { command, ...options });
  }

  /**
   * Search the web (convenience method)
   */
  async webSearch(query: string, options?: { count?: number }): Promise<unknown> {
    return this.useTool('web_search', { query, ...options });
  }

  /**
   * Fetch a web page (convenience method)
   */
  async webFetch(url: string, options?: { maxChars?: number }): Promise<unknown> {
    return this.useTool('web_fetch', { url, ...options });
  }

  /**
   * Browser automation (convenience method)
   */
  async browser(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.useTool('browser', { action, ...params });
  }

  /**
   * Canvas control (convenience method)
   */
  async canvas(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.useTool('canvas', { action, ...params });
  }

  /**
   * Node control (convenience method)
   */
  async nodes(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.useTool('nodes', { action, ...params });
  }

  // ============================================================================
  // Agent Tool Access (Core Primitive)
  // ============================================================================

  /**
   * Create a tool context for an agent
   * Returns an object with all tools bound to this OpenClaw instance
   */
  createAgentToolContext(agentId: string): AgentToolContext {
    return new AgentToolContext(agentId, this);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private setupGatewayListeners(gatewayId: string, gatewayClient: OpenClawGatewayClient): void {
    gatewayClient.on('connected', () => {
      this.emit('connected', { gateway: gatewayId });
    });

    gatewayClient.on('disconnected', () => {
      this.emit('disconnected', { gateway: gatewayId });
    });

    gatewayClient.on('error', (error) => {
      this.emit('error', error);
    });

    gatewayClient.on('agent', (payload: unknown) => {
      this.handleAgentEvent(payload as AgentEventPayload);
    });
  }

  private resolveCoreOptions(options: Partial<OpenClawCoreOptions>): Required<OpenClawCoreOptions> {
    const gatewayUrlsFromEnv = process.env['OPENCLAW_GATEWAY_URLS']
      ?.split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    const singleGatewayUrl = process.env['OPENCLAW_GATEWAY_URL'];

    const gatewayUrls = options.gatewayUrls
      ?? gatewayUrlsFromEnv
      ?? (singleGatewayUrl ? [singleGatewayUrl] : []);

    const parsePositiveNumber = (value: unknown, fallback: number): number => {
      const parsed = Number(value);
      return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    };

    return {
      gatewayUrls,
      maxConcurrentSessions: parsePositiveNumber(
        options.maxConcurrentSessions ?? process.env['OPENCLAW_MAX_CONCURRENT_SESSIONS'],
        50
      ),
      perGatewayMaxConcurrentSessions: parsePositiveNumber(
        options.perGatewayMaxConcurrentSessions
        ?? process.env['OPENCLAW_PER_GATEWAY_MAX_CONCURRENT_SESSIONS'],
        25
      ),
      autoStartGateway:
        options.autoStartGateway
        ?? (process.env['OPENCLAW_AUTO_START_GATEWAY'] || '').toLowerCase() === 'true',
      gatewayStartCommand: options.gatewayStartCommand ?? process.env['OPENCLAW_GATEWAY_START_COMMAND'] ?? '',
      gatewayStartupTimeoutMs: parsePositiveNumber(
        options.gatewayStartupTimeoutMs
        ?? process.env['OPENCLAW_GATEWAY_STARTUP_TIMEOUT_MS'],
        30000
      ),
      gatewayStartupProbeIntervalMs: parsePositiveNumber(
        options.gatewayStartupProbeIntervalMs
        ?? process.env['OPENCLAW_GATEWAY_STARTUP_PROBE_INTERVAL_MS'],
        1000
      ),
    };
  }

  private resolveGatewayConfigs(
    gatewayConfig?: Partial<GatewayConfig>,
    gatewayUrls: string[] = []
  ): GatewayConfig[] {
    const parsedConfigs = gatewayUrls
      .map((url) => this.parseGatewayUrl(url))
      .filter((value): value is Partial<GatewayConfig> => value !== null);

    if (gatewayConfig && (gatewayConfig.host || gatewayConfig.port)) {
      parsedConfigs.unshift(gatewayConfig);
    } else if (parsedConfigs.length === 0) {
      parsedConfigs.push(gatewayConfig || {});
    }

    const configs = parsedConfigs.map((cfg) => ({
      ...DEFAULT_GATEWAY_CONFIG,
      ...cfg,
      token: cfg.token ?? process.env['OPENCLAW_GATEWAY_TOKEN'],
    }));

    return configs.filter((cfg, index, arr) => {
      return arr.findIndex((candidate) => candidate.host === cfg.host && candidate.port === cfg.port) === index;
    });
  }

  private parseGatewayUrl(url: string): Partial<GatewayConfig> | null {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') {
        return null;
      }
      return {
        host: parsed.hostname,
        port: parsed.port ? Number(parsed.port) : (parsed.protocol === 'wss:' ? 443 : 80),
      };
    } catch {
      logger.warn(`[OpenClawCore] Invalid gateway URL ignored: ${url}`);
      return null;
    }
  }

  private async connectGatewayPool(): Promise<number> {
    const results = await Promise.allSettled(
      this.gatewayPool.map(async (gatewayEntry) => {
        const state = gatewayEntry.client.connectionState;
        if (state !== 'connected' && state !== 'authenticated') {
          await gatewayEntry.client.connect();
        }
        if (gatewayEntry.client.connectionState !== 'authenticated') {
          await gatewayEntry.client.authenticate();
        }
        return true;
      })
    );

    return results.reduce((count, result, index) => {
      if (result.status === 'fulfilled') {
        return count + 1;
      }
      const gatewayEntry = this.gatewayPool[index];
      logger.warn('[OpenClawCore] Gateway connection failed', {
        gateway: gatewayEntry?.id,
        host: gatewayEntry?.config.host,
        port: gatewayEntry?.config.port,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
      return count;
    }, 0);
  }

  private async waitForGatewayConnectivity(): Promise<number> {
    const timeoutAt = Date.now() + this.gatewayStartupTimeoutMs;
    while (Date.now() < timeoutAt) {
      const connectedGateways = await this.connectGatewayPool();
      if (connectedGateways > 0) {
        return connectedGateways;
      }
      await new Promise((resolve) => setTimeout(resolve, this.gatewayStartupProbeIntervalMs));
    }
    return 0;
  }

  private startGatewayProcess(): void {
    if (this.gatewayProcess) {
      return;
    }

    const command = this.resolveGatewayStartCommand();
    if (!command) {
      logger.warn('[OpenClawCore] Auto-start requested but no OpenClaw gateway command is available.');
      return;
    }

    const [binary, ...args] = command;
    const child = spawn(binary, args, {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    this.gatewayProcess = child;
    logger.info('[OpenClawCore] Started OpenClaw gateway process', { command: [binary, ...args].join(' ') });
  }

  private resolveGatewayStartCommand(): string[] | null {
    if (this.gatewayStartCommand && this.gatewayStartCommand.trim().length > 0) {
      return this.gatewayStartCommand.trim().split(/\s+/);
    }

    const candidates: string[][] = [
      ['openclaws', 'gateway', 'start'],
      ['openclaw', 'gateway', 'start'],
      ['openclawd', 'start'],
      ['openclawd'],
    ];

    for (const command of candidates) {
      const probe = spawnSync('which', [command[0]], { encoding: 'utf8' });
      if (probe.status === 0) {
        return command;
      }
    }

    return null;
  }

  private getGatewayForSession(sessionKey: string): {
    id: string;
    client: OpenClawGatewayClient;
    config: GatewayConfig;
    activeSessions: number;
  } | undefined {
    const gatewayId = this.sessionGatewayMap.get(sessionKey);
    if (!gatewayId) {
      return undefined;
    }
    return this.gatewayPool.find((entry) => entry.id === gatewayId);
  }

  private async selectGatewayForSpawn(): Promise<{
    id: string;
    client: OpenClawGatewayClient;
    config: GatewayConfig;
    activeSessions: number;
  }> {
    const sorted = [...this.gatewayPool].sort((a, b) => a.activeSessions - b.activeSessions);
    for (const gatewayEntry of sorted) {
      if (gatewayEntry.activeSessions >= this.perGatewayMaxConcurrentSessions) {
        continue;
      }

      const state = gatewayEntry.client.connectionState;
      if (state !== 'connected' && state !== 'authenticated') {
        try {
          await gatewayEntry.client.connect();
        } catch {
          continue;
        }
      }

      return gatewayEntry;
    }

    throw new ApplicationError(
      'No OpenClaw gateway capacity available',
      DashErrorCode.SESSION_SPAWN_FAILED,
      429,
      {
        perGatewayMaxConcurrentSessions: this.perGatewayMaxConcurrentSessions,
        gateways: this.gatewayPool.map((entry) => ({
          id: entry.id,
          activeSessions: entry.activeSessions,
        })),
      },
      true
    );
  }

  private selectGatewayForTool(): {
    id: string;
    client: OpenClawGatewayClient;
    config: GatewayConfig;
    activeSessions: number;
  } {
    const connected = this.gatewayPool.find((entry) => {
      const state = entry.client.connectionState;
      return state === 'connected' || state === 'authenticated';
    });
    return connected || this.gatewayPool[0]!;
  }

  private getActiveSessionCount(): number {
    return Array.from(this.sessions.values()).filter((session) => {
      return session.status === 'pending' || session.status === 'running' || session.status === 'paused';
    }).length;
  }

  private releaseGatewayCapacity(sessionKey: string): void {
    const gatewayEntry = this.getGatewayForSession(sessionKey);
    if (gatewayEntry) {
      gatewayEntry.activeSessions = Math.max(0, gatewayEntry.activeSessions - 1);
    }
    this.sessionGatewayMap.delete(sessionKey);
  }

  private isTerminalSessionStatus(status?: string): boolean {
    const normalized = String(status || '').toLowerCase();
    return normalized === 'completed'
      || normalized === 'failed'
      || normalized === 'killed'
      || normalized === 'done'
      || normalized === 'error'
      || normalized === 'cancelled';
  }

  private handleAgentEvent(payload: AgentEventPayload): void {
    const agentId = this.getAgentId(payload.sessionKey);
    if (!agentId) {
      return;
    }

    this.messageBus.publish(
      MessageBus.agentEvents(agentId),
      {
        eventType: `openclaw.${payload.status}`,
        source: { agentId, sessionId: payload.sessionKey },
        payload,
        timestamp: new Date(),
      },
      { source: 'openclaw', priority: 'high' }
    );

    if (this.isTerminalSessionStatus(payload.status)) {
      this.releaseGatewayCapacity(payload.sessionKey);
      const session = this.sessions.get(payload.sessionKey);
      if (session) {
        session.status = payload.status === 'failed' || payload.status === 'error' ? 'failed' : 'completed';
        session.completedAt = new Date();
      }
    }

    this.emit('agent.event', { agentId, ...payload });
  }

  private assertInitialized(): void {
    if (!this.initialized) {
      throw new ApplicationError(
        'OpenClaw core primitive not initialized. Call initialize() first.',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        {},
        false
      );
    }
  }
}

// ============================================================================
// Agent Tool Context
// ============================================================================

/**
 * Tool context for an individual agent
 * Provides all OpenClaw tools bound to the agent's session
 */
export class AgentToolContext {
  constructor(
    private agentId: string,
    private openclaw: OpenClawCore
  ) {}

  /**
   * Use any OpenClaw tool
   */
  async useTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown> {
    return this.openclaw.useTool(tool, params);
  }

  /**
   * Read a file
   */
  async read(path: string, options?: { offset?: number; limit?: number }): Promise<string> {
    return this.openclaw.read(path, options);
  }

  /**
   * Write a file
   */
  async write(path: string, content: string): Promise<unknown> {
    return this.openclaw.write(path, content);
  }

  /**
   * Edit a file
   */
  async edit(path: string, oldText: string, newText: string): Promise<unknown> {
    return this.openclaw.edit(path, oldText, newText);
  }

  /**
   * Execute a command
   */
  async exec(command: string, options?: { workdir?: string; timeout?: number }): Promise<unknown> {
    return this.openclaw.exec(command, options);
  }

  /**
   * Search the web
   */
  async webSearch(query: string, options?: { count?: number }): Promise<unknown> {
    return this.openclaw.webSearch(query, options);
  }

  /**
   * Fetch a web page
   */
  async webFetch(url: string, options?: { maxChars?: number }): Promise<unknown> {
    return this.openclaw.webFetch(url, options);
  }

  /**
   * Browser automation
   */
  async browser(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.openclaw.browser(action, params);
  }

  /**
   * Canvas control
   */
  async canvas(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.openclaw.canvas(action, params);
  }

  /**
   * Node control
   */
  async nodes(action: string, params?: Record<string, unknown>): Promise<unknown> {
    return this.openclaw.nodes(action, params);
  }

  /**
   * Spawn a subagent session
   */
  async sessionsSpawn(task: string, options?: { model?: string; context?: Record<string, unknown> }): Promise<string> {
    return this.openclaw.spawnSession({
      agentId: this.agentId,
      task,
      ...options,
    });
  }

  /**
   * Send a message to a session
   */
  async sessionsSend(sessionKey: string, message: string, attachments?: unknown[]): Promise<SessionsSendResponse> {
    return this.openclaw.sendSessionMessage(sessionKey, message, attachments);
  }

  /**
   * Get session history
   */
  async sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]> {
    return this.openclaw.getSessionHistory(sessionKey, limit);
  }

  /**
   * Kill a session
   */
  async sessionsKill(sessionKey: string): Promise<void> {
    return this.openclaw.killSessionBySessionKey(sessionKey);
  }

  /**
   * List all sessions
   */
  async sessionsList(): Promise<SessionInfo[]> {
    return this.openclaw.listSessions();
  }

  get agent_id(): string {
    return this.agentId;
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalOpenClawCore: OpenClawCore | null = null;

/**
 * Get or create the global OpenClaw core primitive instance
 */
export function getOpenClawCore(
  messageBus?: MessageBus,
  config?: Partial<GatewayConfig>,
  options: Partial<OpenClawCoreOptions> = {}
): OpenClawCore {
  if (!globalOpenClawCore) {
    if (!messageBus) {
      throw new ApplicationError(
        'OpenClawCore requires MessageBus on first initialization',
        DashErrorCode.INITIALIZATION_FAILED,
        500,
        {},
        false
      );
    }
    globalOpenClawCore = new OpenClawCore(messageBus, config, options);
  }
  return globalOpenClawCore;
}

/**
 * Reset the global OpenClaw core instance (for testing)
 */
export function resetOpenClawCore(): void {
  globalOpenClawCore = null;
}

/**
 * Check if OpenClaw core is initialized
 */
export function isOpenClawInitialized(): boolean {
  return globalOpenClawCore?.isInitialized ?? false;
}

/**
 * Check if OpenClaw is connected
 */
export function isOpenClawConnected(): boolean {
  return globalOpenClawCore?.isConnected ?? false;
}

// ============================================================================
// Mock OpenClaw Client (for testing)
// ============================================================================

/**
 * Mock OpenClaw Client for testing without a real gateway
 */
export class MockOpenClawClient {
  private sessions: Map<string, MockSession> = new Map();
  private sessionCounter = 0;

  /**
   * Spawn a new session
   */
  async sessionsSpawn(options: SessionSpawnOptions): Promise<{ sessionId: string }> {
    const sessionId = `openclaw-session-${Date.now()}-${++this.sessionCounter}`;
    const session: MockSession = {
      sessionId,
      agentId: options.agentId,
      status: 'pending',
      createdAt: new Date(),
      model: options.model ?? 'kimi-k2.5',
      task: options.task,
      metadata: options.context ?? {},
    };
    
    this.sessions.set(sessionId, session);
    logger.info(`[OpenClaw] Session spawned: ${sessionId} for agent ${options.agentId}`);
    
    // Auto-start after a short delay
    setTimeout(() => {
      const s = this.sessions.get(sessionId);
      if (s && s.status === 'pending') {
        s.status = 'running';
        s.startedAt = new Date();
      }
    }, 50);
    
    return { sessionId };
  }

  /**
   * Send a message to a session
   */
  async sessionsSend(params: { sessionKey: string; message: string; attachments?: unknown[] }): Promise<{ runId: string; status: string }> {
    const session = this.sessions.get(params.sessionKey);
    if (!session) {
      throw new Error('Session not found');
    }
    
    logger.info(`[OpenClaw] Message sent to session ${params.sessionKey}: ${params.message.substring(0, 20)}...`);
    
    return {
      runId: `run_${params.sessionKey}_${Date.now()}`,
      status: 'running',
    };
  }

  /**
   * Kill a session
   */
  async sessionKill(sessionKey: string, force?: boolean): Promise<void> {
    const session = this.sessions.get(sessionKey);
    if (session) {
      session.status = 'killed';
      session.completedAt = new Date();
      logger.info(`[OpenClaw] Session killed: ${sessionKey} (force=${force ?? false})`);
    }
  }

  /**
   * Get session status
   */
  async sessionStatus(sessionKey: string): Promise<{
    sessionId: string;
    agentId: string;
    status: string;
    tokenUsage: { prompt: number; completion: number; total: number };
  }> {
    const session = this.sessions.get(sessionKey);
    if (!session) {
      throw new Error('Session not found');
    }
    
    return {
      sessionId: sessionKey,
      agentId: session.agentId,
      status: session.status,
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
    };
  }

  /**
   * Get a session by ID
   */
  getSession(sessionId: string): OpenClawSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    return {
      sessionId: session.sessionId,
      agentId: session.agentId,
      status: session.status,
      createdAt: session.createdAt instanceof Date ? session.createdAt : new Date(session.createdAt),
      startedAt: session.startedAt instanceof Date ? session.startedAt : session.startedAt ? new Date(session.startedAt) : undefined,
      completedAt: session.completedAt instanceof Date ? session.completedAt : session.completedAt ? new Date(session.completedAt) : undefined,
      metadata: {
        model: session.model,
        task: session.task,
        ...session.metadata,
      },
    };
  }

  /**
   * Get all sessions
   */
  getAllSessions(): OpenClawSession[] {
    return Array.from(this.sessions.values()).map(s => ({
      sessionId: s.sessionId,
      agentId: s.agentId,
      status: s.status,
      createdAt: s.createdAt instanceof Date ? s.createdAt : new Date(s.createdAt),
      startedAt: s.startedAt instanceof Date ? s.startedAt : s.startedAt ? new Date(s.startedAt) : undefined,
      completedAt: s.completedAt instanceof Date ? s.completedAt : s.completedAt ? new Date(s.completedAt) : undefined,
      metadata: {
        model: s.model,
        task: s.task,
        ...s.metadata,
      },
    }));
  }

  /**
   * Restore a session from persisted data
   */
  restoreSession(session: MockSession): void {
    this.sessions.set(session.sessionId, session);
  }
}

interface MockSession {
  sessionId: string;
  agentId: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'killed';
  createdAt: Date | string;
  startedAt?: Date | string;
  completedAt?: Date | string;
  model?: string;
  task?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Placeholder for OpenClawIntegration (used in tests)
 * @deprecated Use OpenClawCore instead
 */
export class OpenClawIntegration {
  // Placeholder class - actual implementation uses OpenClawCore
}

// ============================================================================
// Exports
// ============================================================================

export default OpenClawCore;

// Re-export types from Gateway for convenience
export type {
  GatewayConfig,
  GatewayClientOptions,
  ConnectionState,
  GatewayStats,
  SessionInfo,
  Message,
  SessionsSpawnResponse,
  SessionsSendResponse,
};

// Re-export errors
export { GatewayError, ConnectionError, TimeoutError };
