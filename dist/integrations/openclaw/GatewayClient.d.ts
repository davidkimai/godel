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
 */
import { EventEmitter } from 'events';
import { GatewayConfig, GatewayClientOptions, ConnectionState, EventHandler, GatewayStats, SessionsListParams, SessionsSpawnParams, SessionsSpawnResponse, SessionsSendResponse, AgentEventPayload, ChatEventPayload, PresenceEventPayload, TickEventPayload, SessionInfo, Message } from './types';
export declare class GatewayClient extends EventEmitter {
    private ws;
    private config;
    private options;
    private state;
    private pendingRequests;
    private eventHandlers;
    private reconnectionState;
    private stats;
    private heartbeatInterval;
    private reconnectTimeout;
    private eventSeq;
    private requestIdCounter;
    private clientId;
    constructor(config?: Partial<GatewayConfig>, options?: Partial<GatewayClientOptions>);
    /**
     * Connect to the OpenClaw Gateway
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the Gateway
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected
     */
    get connected(): boolean;
    /**
     * Get current connection state
     */
    get connectionState(): ConnectionState;
    /**
     * Get connection statistics
     */
    get statistics(): GatewayStats;
    /**
     * Authenticate with the Gateway using token
     */
    authenticate(): Promise<void>;
    /**
     * Send a request to the Gateway
     */
    request<T>(method: string, params?: Record<string, unknown>): Promise<T>;
    /**
     * Send a request with automatic retry on connection error
     */
    requestWithReconnect<T>(method: string, params?: Record<string, unknown>): Promise<T>;
    /**
     * Subscribe to an event type
     */
    on(event: string, handler: EventHandler): this;
    /**
     * Unsubscribe from an event type
     */
    off(event: string, handler: EventHandler): this;
    /**
     * Subscribe to agent events
     */
    onAgentEvent(handler: (payload: AgentEventPayload) => void): this;
    /**
     * Subscribe to chat events
     */
    onChatEvent(handler: (payload: ChatEventPayload) => void): this;
    /**
     * Subscribe to presence events
     */
    onPresenceEvent(handler: (payload: PresenceEventPayload) => void): this;
    /**
     * Subscribe to tick events (heartbeat)
     */
    onTickEvent(handler: (payload: TickEventPayload) => void): this;
    /**
     * List all sessions
     */
    sessionsList(params?: SessionsListParams): Promise<SessionInfo[]>;
    /**
     * Spawn a new session
     */
    sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse>;
    /**
     * Send a message to a session
     */
    sessionsSend(sessionKey: string, message: string, attachments?: unknown[]): Promise<SessionsSendResponse>;
    /**
     * Get session history
     */
    sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]>;
    /**
     * Kill a session
     */
    sessionsKill(sessionKey: string): Promise<void>;
    /**
     * Subscribe to server-side events
     */
    private subscribeToEvent;
    /**
     * Unsubscribe from server-side events
     */
    unsubscribe(event: string): Promise<void>;
    private handleOpen;
    private handleMessage;
    private handleResponse;
    private handleEvent;
    private handleClose;
    private handleError;
    private reconnect;
    private scheduleReconnect;
    private clearReconnectTimeout;
    private startHeartbeat;
    private clearHeartbeat;
    private setState;
    private generateRequestId;
    private generateClientId;
}
/**
 * Create a new Gateway client with configuration
 */
export declare function createGatewayClient(config?: Partial<GatewayConfig>, options?: Partial<GatewayClientOptions>): GatewayClient;
/**
 * Connect to Gateway with default configuration
 */
export declare function connectToGateway(token?: string): Promise<GatewayClient>;
//# sourceMappingURL=GatewayClient.d.ts.map