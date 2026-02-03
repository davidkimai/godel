/**
 * OpenClaw Session Manager
 *
 * Manages OpenClaw sessions via the Gateway WebSocket API.
 * Wraps sessions_list, sessions_spawn, sessions_send, sessions_history, sessions_kill
 *
 * @module integrations/openclaw/SessionManager
 */

import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { logger } from '../../utils/logger';
import { GatewayClient } from './GatewayClient';

// ============================================================================
// Types - Based on OPENCLAW_INTEGRATION_SPEC.md Section 4.2
// ============================================================================

export interface GatewayConfig {
  host: string;
  port: number;
  token?: string;
  reconnectDelay: number;
  maxRetries: number;
}

export interface SessionInfo {
  key: string;
  id: string;
  model: string;
  provider: string;
  updatedAt: string;
  inputTokens: number;
  outputTokens: number;
  status: 'active' | 'idle' | 'stale';
}

export interface SessionsListParams {
  activeMinutes?: number;
  kinds?: string[];
}

export interface SessionsListResponse {
  sessions: SessionInfo[];
}

export interface SessionsSpawnParams {
  model?: string;
  thinking?: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  verbose?: boolean;
  workspace?: string;
  skills?: string[];
  systemPrompt?: string;
  sandbox?: {
    mode: 'non-main' | 'docker';
    allowedTools?: string[];
    deniedTools?: string[];
  };
}

export interface SessionsSpawnResponse {
  sessionKey: string;
  sessionId: string;
}

export interface SessionsSendParams {
  sessionKey: string;
  message: string;
  attachments?: Attachment[];
  replyTo?: string;
}

export interface SessionsSendResponse {
  runId: string;
  status: 'accepted';
}

export interface Attachment {
  type: string;
  data: string;
  filename?: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  runId?: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

export interface SessionsHistoryResponse {
  messages: Message[];
  sessionKey: string;
}

// ============================================================================
// Session Manager
// ============================================================================

export class SessionManager extends EventEmitter {
  private ws: WebSocket | null = null;
  private config: GatewayConfig;
  private gatewayClient: GatewayClient | null = null;
  private useGatewayClient: boolean;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestIdCounter = 0;
  private reconnectAttempts = 0;
  private isConnecting = false;
  private isShuttingDown = false;
  private eventHandlers: Map<string, Array<(payload: unknown) => void>> = new Map();

  // Session tracking for lifecycle management
  private activeSessions: Map<string, {
    sessionKey: string;
    sessionId: string;
    spawnedAt: Date;
    lastActivity: Date;
    status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed';
    runId?: string;
  }> = new Map();

  constructor(config?: Partial<GatewayConfig>, gatewayClient?: GatewayClient) {
    super();
    
    this.config = {
      host: config?.host || process.env['OPENCLAW_GATEWAY_HOST'] || '127.0.0.1',
      port: config?.port || parseInt(process.env['OPENCLAW_GATEWAY_PORT'] || '18789', 10),
      token: config?.token || process.env['OPENCLAW_GATEWAY_TOKEN'],
      reconnectDelay: config?.reconnectDelay || 1000,
      maxRetries: config?.maxRetries || 10,
    };

    // If a GatewayClient is provided, use it instead of creating our own connection
    if (gatewayClient) {
      this.gatewayClient = gatewayClient;
      this.useGatewayClient = true;
      this.setupGatewayClientHandlers();
    } else {
      this.useGatewayClient = false;
    }
  }

  private setupGatewayClientHandlers(): void {
    if (!this.gatewayClient) return;

    // Forward events from GatewayClient
    this.gatewayClient.on('event', (event: unknown) => {
      const e = event as { event?: string; payload?: unknown };
      if (e.event) {
        this.emit('event', e);
        this.emit(e.event, e.payload);
      }
    });

    this.gatewayClient.on('session.spawned', (data: unknown) => {
      this.emit('session.spawned', data);
    });

    this.gatewayClient.on('session.sent', (data: unknown) => {
      this.emit('session.sent', data);
    });

    this.gatewayClient.on('session.killed', (data: unknown) => {
      this.emit('session.killed', data);
    });

    this.gatewayClient.on('connected', () => {
      this.emit('connected');
    });

    this.gatewayClient.on('disconnected', (data: unknown) => {
      this.emit('disconnected', data);
    });

    this.gatewayClient.on('error', (error: Error) => {
      this.emit('error', { message: error.message });
    });
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Connect to the OpenClaw Gateway
   */
  async connect(): Promise<void> {
    // If using GatewayClient, just ensure it's connected
    if (this.useGatewayClient && this.gatewayClient) {
      if (!this.gatewayClient.connected) {
        await this.gatewayClient.connect();
      }
      return;
    }

    // Otherwise, create our own WebSocket connection
    if (this.ws?.readyState === WebSocket.OPEN) {
      logger.debug('[SessionManager] Already connected');
      return;
    }

    if (this.isConnecting) {
      logger.debug('[SessionManager] Connection in progress');
      return;
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      const wsUrl = `ws://${this.config.host}:${this.config.port}`;
      logger.info(`[SessionManager] Connecting to ${wsUrl}`);

      try {
        this.ws = new WebSocket(wsUrl);

        const connectionTimeout = setTimeout(() => {
          this.ws?.close();
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }, 10000);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          logger.info('[SessionManager] Connected to OpenClaw Gateway');
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('error', (error: Error) => {
          clearTimeout(connectionTimeout);
          this.isConnecting = false;
          logger.error('[SessionManager] WebSocket error', { message: error.message });
          this.emit('error', { message: error.message, code: (error as Error & { code?: string }).code });
          reject(error);
        });

        this.ws.on('close', (code: number, reason: Buffer) => {
          this.isConnecting = false;
          logger.warn(`[SessionManager] Connection closed: ${code} ${reason.toString()}`);
          this.emit('disconnected', { code, reason: reason.toString() });
          
          if (!this.isShuttingDown) {
            this.scheduleReconnect();
          }
        });
      } catch (error) {
        this.isConnecting = false;
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the Gateway
   */
  async disconnect(): Promise<void> {
    this.isShuttingDown = true;

    // If using GatewayClient, we don't disconnect it (it's shared)
    if (this.useGatewayClient) {
      return;
    }
    
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Connection closed'));
    }
    this.pendingRequests.clear();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    logger.info('[SessionManager] Disconnected');
    this.emit('disconnected', { code: 0, reason: 'manual' });
  }

  /**
   * Check if connected to Gateway
   */
  isConnected(): boolean {
    if (this.useGatewayClient && this.gatewayClient) {
      return this.gatewayClient.connected;
    }
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.useGatewayClient) return; // Don't reconnect if using GatewayClient

    if (this.reconnectAttempts >= this.config.maxRetries) {
      logger.error('[SessionManager] Max reconnection attempts reached');
      this.emit('maxRetriesReached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    logger.info(`[SessionManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    
    setTimeout(() => {
      this.connect().catch((error) => {
        logger.error('[SessionManager] Reconnection failed:', error.message);
      });
    }, delay);
  }

  // ============================================================================
  // Message Handling (only used when not using GatewayClient)
  // ============================================================================

  private handleMessage(data: string): void {
    try {
      const message = JSON.parse(data) as { type: string; id?: string; ok?: boolean; payload?: unknown; error?: { code: string; message: string } };

      if (message.type === 'res') {
        this.handleResponse(message);
      } else if (message.type === 'event') {
        this.handleEvent(message as unknown as { event: string; payload: unknown });
      }
    } catch (error) {
      logger.error('[SessionManager] Failed to parse message', { error: (error as Error).message });
    }
  }

  private handleResponse(response: { id?: string; ok?: boolean; payload?: unknown; error?: { code: string; message: string } }): void {
    const pending = this.pendingRequests.get(response.id || '');
    if (!pending) {
      logger.warn(`[SessionManager] Received response for unknown request: ${response.id}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id || '');

    if (response.ok) {
      pending.resolve(response.payload);
    } else {
      const error = new Error(response.error?.message || 'Unknown error');
      (error as Error & { code: string }).code = response.error?.code || 'UNKNOWN_ERROR';
      pending.reject(error);
    }
  }

  private handleEvent(event: { event: string; payload: unknown }): void {
    logger.debug(`[SessionManager] Event received: ${event.event}`);
    
    // Emit for general listeners
    this.emit('event', event);
    this.emit(event.event, event.payload);

    // Call registered handlers
    const handlers = this.eventHandlers.get(event.event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event.payload);
        } catch (error) {
          logger.error('[SessionManager] Event handler error', { error: (error as Error).message });
        }
      });
    }

    // Update session tracking based on events
    this.updateSessionFromEvent(event);
  }

  private updateSessionFromEvent(event: { event: string; payload: unknown }): void {
    if (event.event === 'agent' && event.payload) {
      const payload = event.payload as { sessionKey?: string; status?: string; runId?: string };
      if (payload.sessionKey) {
        const session = this.activeSessions.get(payload.sessionKey);
        if (session) {
          if (payload.status) {
            session.status = payload.status as typeof session.status;
            session.lastActivity = new Date();
          }
          if (payload.runId) {
            session.runId = payload.runId;
          }
        }
      }
    }
  }

  // ============================================================================
  // Core Request Method
  // ============================================================================

  private async sendRequest<T>(
    method: string,
    params: Record<string, unknown> | undefined,
    timeoutMs = 30000
  ): Promise<T> {
    // If using GatewayClient, delegate to it
    if (this.useGatewayClient && this.gatewayClient) {
      return this.gatewayClient.request<T>(method, params || {});
    }

    // Otherwise, use our own WebSocket
    if (!this.isConnected()) {
      throw new Error('Not connected to Gateway');
    }

    const id = `${Date.now()}-${++this.requestIdCounter}`;
    const request = { type: 'req', id, method, params };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });

      this.ws!.send(JSON.stringify(request), (error) => {
        if (error) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  }

  // ============================================================================
  // Session Management API
  // ============================================================================

  /**
   * List all active sessions with metadata
   * Maps to: sessions_list
   */
  async sessionsList(params?: SessionsListParams): Promise<SessionInfo[]> {
    logger.debug(`[SessionManager] sessions_list: ${JSON.stringify(params)}`);
    const response = await this.sendRequest<SessionsListResponse>('sessions_list', (params || {}) as Record<string, unknown>);
    return response.sessions;
  }

  /**
   * Create new isolated session
   * Maps to: sessions_spawn
   */
  async sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse> {
    logger.info('[SessionManager] sessions_spawn', { model: params?.model });
    
    const response = await this.sendRequest<SessionsSpawnResponse>('sessions_spawn', params as Record<string, unknown> || {});
    
    // Track the new session
    this.activeSessions.set(response.sessionKey, {
      sessionKey: response.sessionKey,
      sessionId: response.sessionId,
      spawnedAt: new Date(),
      lastActivity: new Date(),
      status: 'spawning',
    });

    this.emit('session.spawned', response);
    
    return response;
  }

  /**
   * Send message to session
   * Maps to: sessions_send
   */
  async sessionsSend(params: SessionsSendParams): Promise<SessionsSendResponse> {
    logger.debug('[SessionManager] sessions_send', { sessionKey: params.sessionKey });
    
    const response = await this.sendRequest<SessionsSendResponse>('sessions_send', {
      sessionKey: params.sessionKey,
      message: params.message,
      attachments: params.attachments as unknown as Record<string, unknown>[],
      replyTo: params.replyTo,
    } as Record<string, unknown>);

    // Update session tracking
    const session = this.activeSessions.get(params.sessionKey);
    if (session) {
      session.status = 'running';
      session.runId = response.runId;
      session.lastActivity = new Date();
    }

    this.emit('session.sent', { sessionKey: params.sessionKey, runId: response.runId });
    
    return response;
  }

  /**
   * Send a simple message to a session (convenience method)
   */
  async sendMessage(sessionKey: string, message: string): Promise<SessionsSendResponse> {
    return this.sessionsSend({ sessionKey, message });
  }

  /**
   * Fetch transcript/history for a session
   * Maps to: sessions_history
   */
  async sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]> {
    logger.debug('[SessionManager] sessions_history', { sessionKey, limit });
    
    const response = await this.sendRequest<SessionsHistoryResponse>('sessions_history', {
      sessionKey,
      limit,
    } as Record<string, unknown>);

    return response.messages;
  }

  /**
   * Terminate a session
   * Maps to: sessions_kill
   */
  async sessionsKill(sessionKey: string): Promise<void> {
    logger.info('[SessionManager] sessions_kill', { sessionKey });
    
    await this.sendRequest<void>('sessions_kill', { sessionKey });

    // Update session tracking
    const session = this.activeSessions.get(sessionKey);
    if (session) {
      session.status = 'completed';
      session.lastActivity = new Date();
    }

    this.emit('session.killed', { sessionKey });
  }

  // ============================================================================
  // Session Lifecycle Management
  // ============================================================================

  /**
   * Get tracked session info
   */
  getSession(sessionKey: string): {
    sessionKey: string;
    sessionId: string;
    spawnedAt: Date;
    lastActivity: Date;
    status: string;
    runId?: string;
  } | undefined {
    const session = this.activeSessions.get(sessionKey);
    if (!session) return undefined;
    return { ...session };
  }

  /**
   * Get all tracked sessions
   */
  getAllSessions(): Array<{
    sessionKey: string;
    sessionId: string;
    spawnedAt: Date;
    lastActivity: Date;
    status: string;
    runId?: string;
  }> {
    return Array.from(this.activeSessions.values()).map(s => ({ ...s }));
  }

  /**
   * Get sessions by status
   */
  getSessionsByStatus(status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed'): ReturnType<typeof this.getAllSessions> {
    return this.getAllSessions().filter(s => s.status === status);
  }

  /**
   * Wait for a session to reach a specific status
   */
  async waitForStatus(
    sessionKey: string,
    targetStatus: 'idle' | 'running' | 'completed',
    timeoutMs = 60000,
    pollIntervalMs = 1000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const session = this.activeSessions.get(sessionKey);
      if (!session) {
        throw new Error(`Session ${sessionKey} not found`);
      }

      if (session.status === targetStatus) {
        return true;
      }

      if (session.status === 'failed') {
        throw new Error(`Session ${sessionKey} failed`);
      }

      await this.sleep(pollIntervalMs);
    }

    throw new Error(`Timeout waiting for session ${sessionKey} to reach ${targetStatus}`);
  }

  /**
   * Cleanup completed/failed sessions from tracking
   */
  cleanupSessions(olderThanMs = 3600000): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, session] of this.activeSessions) {
      if ((session.status === 'completed' || session.status === 'failed') &&
          now - session.lastActivity.getTime() > olderThanMs) {
        this.activeSessions.delete(key);
        cleaned++;
      }
    }

    logger.info(`[SessionManager] Cleaned up ${cleaned} old sessions`);
    return cleaned;
  }

  // ============================================================================
  // Event Subscription
  // ============================================================================

  /**
   * Subscribe to Gateway events
   */
  onEvent(event: string, handler: (payload: unknown) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  /**
   * Unsubscribe from Gateway events
   */
  offEvent(event: string, handler: (payload: unknown) => void): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalSessionManager: SessionManager | null = null;

export function getGlobalSessionManager(config?: Partial<GatewayConfig>, gatewayClient?: GatewayClient): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager(config, gatewayClient);
  }
  return globalSessionManager;
}

export function resetGlobalSessionManager(): void {
  globalSessionManager = null;
}

export default SessionManager;
