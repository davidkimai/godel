/**
 * OpenClaw Session Manager
 *
 * Manages OpenClaw sessions via the Gateway WebSocket API.
 * Wraps sessions_list, sessions_spawn, sessions_send, sessions_history, sessions_kill
 *
 * @module integrations/openclaw/SessionManager
 */
import { EventEmitter } from 'events';
import { GatewayClient } from './GatewayClient';
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
export declare class SessionManager extends EventEmitter {
    private ws;
    private config;
    private gatewayClient;
    private useGatewayClient;
    private pendingRequests;
    private requestIdCounter;
    private reconnectAttempts;
    private isConnecting;
    private isShuttingDown;
    private eventHandlers;
    private activeSessions;
    constructor(config?: Partial<GatewayConfig>, gatewayClient?: GatewayClient);
    private setupGatewayClientHandlers;
    /**
     * Connect to the OpenClaw Gateway
     */
    connect(): Promise<void>;
    /**
     * Disconnect from the Gateway
     */
    disconnect(): Promise<void>;
    /**
     * Check if connected to Gateway
     */
    isConnected(): boolean;
    private scheduleReconnect;
    private handleMessage;
    private handleResponse;
    private handleEvent;
    private updateSessionFromEvent;
    private sendRequest;
    /**
     * List all active sessions with metadata
     * Maps to: sessions_list
     */
    sessionsList(params?: SessionsListParams): Promise<SessionInfo[]>;
    /**
     * Create new isolated session
     * Maps to: sessions_spawn
     */
    sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse>;
    /**
     * Send message to session
     * Maps to: sessions_send
     */
    sessionsSend(params: SessionsSendParams): Promise<SessionsSendResponse>;
    /**
     * Send a simple message to a session (convenience method)
     */
    sendMessage(sessionKey: string, message: string): Promise<SessionsSendResponse>;
    /**
     * Fetch transcript/history for a session
     * Maps to: sessions_history
     */
    sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]>;
    /**
     * Terminate a session
     * Maps to: sessions_kill
     */
    sessionsKill(sessionKey: string): Promise<void>;
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
    } | undefined;
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
    }>;
    /**
     * Get sessions by status
     */
    getSessionsByStatus(status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed'): ReturnType<typeof this.getAllSessions>;
    /**
     * Wait for a session to reach a specific status
     */
    waitForStatus(sessionKey: string, targetStatus: 'idle' | 'running' | 'completed', timeoutMs?: number, pollIntervalMs?: number): Promise<boolean>;
    /**
     * Cleanup completed/failed sessions from tracking
     */
    cleanupSessions(olderThanMs?: number): number;
    /**
     * Subscribe to Gateway events
     */
    onEvent(event: string, handler: (payload: unknown) => void): void;
    /**
     * Unsubscribe from Gateway events
     */
    offEvent(event: string, handler: (payload: unknown) => void): void;
    private sleep;
}
export declare function getGlobalSessionManager(config?: Partial<GatewayConfig>, gatewayClient?: GatewayClient): SessionManager;
export declare function resetGlobalSessionManager(): void;
export default SessionManager;
//# sourceMappingURL=SessionManager.d.ts.map