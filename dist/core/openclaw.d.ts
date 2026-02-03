/**
 * OpenClaw Core Primitive
 *
 * OpenClaw is a core primitive of Dash, not an integration.
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
import { EventEmitter } from 'events';
import { MessageBus } from '../bus/index';
import { GatewayConfig, GatewayClientOptions, ConnectionState, EventHandler, GatewayStats, GatewayError, ConnectionError, TimeoutError, SessionsListParams, SessionsSpawnParams, SessionsSpawnResponse, SessionsSendResponse, AgentEventPayload, ChatEventPayload, PresenceEventPayload, TickEventPayload, SessionInfo, Message } from '../integrations/openclaw/types';
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
export type SessionEvent = {
    type: 'session.created';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.started';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.paused';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.resumed';
    sessionId: string;
    agentId: string;
} | {
    type: 'session.completed';
    sessionId: string;
    agentId: string;
    output?: string;
} | {
    type: 'session.failed';
    sessionId: string;
    agentId: string;
    error: string;
} | {
    type: 'session.killed';
    sessionId: string;
    agentId: string;
    force: boolean;
} | {
    type: 'token.usage';
    sessionId: string;
    agentId: string;
    tokens: number;
    cost: number;
};
/**
 * OpenClaw Tool Types
 * All tools available to agents through the core primitive
 */
export type OpenClawTool = 'read' | 'write' | 'edit' | 'exec' | 'process' | 'web_search' | 'web_fetch' | 'browser' | 'canvas' | 'nodes' | 'image' | 'supermemory_search' | 'supermemory_store' | 'supermemory_forget' | 'supermemory_profile' | 'sessions_list' | 'sessions_spawn' | 'sessions_send' | 'sessions_kill' | 'sessions_history' | 'tts' | 'message';
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
/**
 * OpenClaw Gateway Client
 * WebSocket client for connecting to the OpenClaw Gateway API.
 * This is the core transport layer for all OpenClaw operations.
 */
export declare class OpenClawGatewayClient extends EventEmitter {
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
     * Core primitive: Always connected when system is running
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
    on(event: string, handler: EventHandler): this;
    off(event: string, handler: EventHandler): this;
    onAgentEvent(handler: (payload: AgentEventPayload) => void): this;
    onChatEvent(handler: (payload: ChatEventPayload) => void): this;
    onPresenceEvent(handler: (payload: PresenceEventPayload) => void): this;
    onTickEvent(handler: (payload: TickEventPayload) => void): this;
    sessionsList(params?: SessionsListParams): Promise<SessionInfo[]>;
    sessionsSpawn(params?: SessionsSpawnParams): Promise<SessionsSpawnResponse>;
    sessionsSend(sessionKey: string, message: string, attachments?: unknown[]): Promise<SessionsSendResponse>;
    sessionsHistory(sessionKey: string, limit?: number): Promise<Message[]>;
    sessionsKill(sessionKey: string): Promise<void>;
    /**
     * Execute an OpenClaw tool directly
     * This is the core primitive that allows agents to use any OpenClaw tool
     */
    executeTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown>;
    /**
     * Read a file
     */
    readFile(path: string, options?: {
        offset?: number;
        limit?: number;
    }): Promise<string>;
    /**
     * Write a file
     */
    writeFile(path: string, content: string): Promise<void>;
    /**
     * Edit a file
     */
    editFile(path: string, oldText: string, newText: string): Promise<void>;
    /**
     * Execute a command
     */
    exec(command: string, options?: {
        workdir?: string;
        timeout?: number;
        env?: Record<string, string>;
    }): Promise<unknown>;
    /**
     * Search the web
     */
    webSearch(query: string, options?: {
        count?: number;
        country?: string;
    }): Promise<unknown>;
    /**
     * Fetch a web page
     */
    webFetch(url: string, options?: {
        extractMode?: 'markdown' | 'text';
        maxChars?: number;
    }): Promise<string>;
    /**
     * Browser automation
     */
    browser(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Canvas control
     */
    canvas(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Node control
     */
    nodes(action: string, params?: Record<string, unknown>): Promise<unknown>;
    private subscribeToEvent;
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
 * OpenClaw Core Primitive
 *
 * The main interface for OpenClaw integration as a core primitive.
 * Manages sessions, provides tool access to agents, and maintains Gateway connection.
 */
export declare class OpenClawCore extends EventEmitter {
    private gateway;
    private messageBus;
    private sessions;
    private agentSessionMap;
    private initialized;
    constructor(messageBus: MessageBus, gatewayConfig?: Partial<GatewayConfig>);
    /**
     * Initialize OpenClaw as a core primitive
     * Called during system startup, not lazily
     */
    initialize(): Promise<void>;
    /**
     * Connect to Gateway (idempotent)
     */
    connect(): Promise<void>;
    /**
     * Disconnect from Gateway
     */
    disconnect(): Promise<void>;
    /**
     * Check if initialized
     */
    get isInitialized(): boolean;
    /**
     * Check if connected to Gateway
     */
    get isConnected(): boolean;
    /**
     * Spawn an OpenClaw session for a Dash agent
     * Transparent session management - automatically mapped
     */
    spawnSession(options: SessionSpawnOptions): Promise<string>;
    /**
     * Kill a session by agent ID
     */
    killSession(agentId: string, force?: boolean): Promise<void>;
    /**
     * Get session ID for an agent
     */
    getSessionId(agentId: string): string | undefined;
    /**
     * Get agent ID for a session
     */
    getAgentId(sessionId: string): string | undefined;
    /**
     * Check if an agent has a session
     */
    hasSession(agentId: string): boolean;
    /**
     * Get session status
     */
    getSessionStatus(agentId: string): Promise<SessionStatus | null>;
    /**
     * List all active sessions
     */
    getActiveSessions(): Array<{
        agentId: string;
        sessionId: string;
    }>;
    /**
     * Use an OpenClaw tool
     * Core primitive: Agents can use any OpenClaw tool directly
     */
    useTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown>;
    /**
     * Read a file (convenience method)
     */
    read(path: string, options?: {
        offset?: number;
        limit?: number;
    }): Promise<string>;
    /**
     * Write a file (convenience method)
     */
    write(path: string, content: string): Promise<unknown>;
    /**
     * Edit a file (convenience method)
     */
    edit(path: string, oldText: string, newText: string): Promise<unknown>;
    /**
     * Execute a command (convenience method)
     */
    exec(command: string, options?: {
        workdir?: string;
        timeout?: number;
    }): Promise<unknown>;
    /**
     * Search the web (convenience method)
     */
    webSearch(query: string, options?: {
        count?: number;
    }): Promise<unknown>;
    /**
     * Fetch a web page (convenience method)
     */
    webFetch(url: string, options?: {
        maxChars?: number;
    }): Promise<unknown>;
    /**
     * Browser automation (convenience method)
     */
    browser(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Canvas control (convenience method)
     */
    canvas(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Node control (convenience method)
     */
    nodes(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Create a tool context for an agent
     * Returns an object with all tools bound to this OpenClaw instance
     */
    createAgentToolContext(agentId: string): AgentToolContext;
    private setupGatewayListeners;
    private handleAgentEvent;
    private assertInitialized;
}
/**
 * Tool context for an individual agent
 * Provides all OpenClaw tools bound to the agent's session
 */
export declare class AgentToolContext {
    private agentId;
    private openclaw;
    constructor(agentId: string, openclaw: OpenClawCore);
    /**
     * Use any OpenClaw tool
     */
    useTool(tool: OpenClawTool, params: Record<string, unknown>): Promise<unknown>;
    /**
     * Read a file
     */
    read(path: string, options?: {
        offset?: number;
        limit?: number;
    }): Promise<string>;
    /**
     * Write a file
     */
    write(path: string, content: string): Promise<unknown>;
    /**
     * Edit a file
     */
    edit(path: string, oldText: string, newText: string): Promise<unknown>;
    /**
     * Execute a command
     */
    exec(command: string, options?: {
        workdir?: string;
        timeout?: number;
    }): Promise<unknown>;
    /**
     * Search the web
     */
    webSearch(query: string, options?: {
        count?: number;
    }): Promise<unknown>;
    /**
     * Fetch a web page
     */
    webFetch(url: string, options?: {
        maxChars?: number;
    }): Promise<unknown>;
    /**
     * Browser automation
     */
    browser(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Canvas control
     */
    canvas(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Node control
     */
    nodes(action: string, params?: Record<string, unknown>): Promise<unknown>;
    /**
     * Spawn a subagent session
     */
    sessionsSpawn(task: string, options?: {
        model?: string;
        context?: Record<string, unknown>;
    }): Promise<string>;
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
     * List all sessions
     */
    sessionsList(): Promise<SessionInfo[]>;
    get agent_id(): string;
}
/**
 * Get or create the global OpenClaw core primitive instance
 */
export declare function getOpenClawCore(messageBus?: MessageBus, config?: Partial<GatewayConfig>): OpenClawCore;
/**
 * Reset the global OpenClaw core instance (for testing)
 */
export declare function resetOpenClawCore(): void;
/**
 * Check if OpenClaw core is initialized
 */
export declare function isOpenClawInitialized(): boolean;
/**
 * Check if OpenClaw is connected
 */
export declare function isOpenClawConnected(): boolean;
/**
 * Mock OpenClaw Client for testing without a real gateway
 */
export declare class MockOpenClawClient {
    private sessions;
    private sessionCounter;
    /**
     * Spawn a new session
     */
    sessionsSpawn(options: SessionSpawnOptions): Promise<{
        sessionId: string;
    }>;
    /**
     * Send a message to a session
     */
    sessionsSend(params: {
        sessionKey: string;
        message: string;
        attachments?: unknown[];
    }): Promise<{
        runId: string;
        status: string;
    }>;
    /**
     * Kill a session
     */
    sessionKill(sessionKey: string, force?: boolean): Promise<void>;
    /**
     * Get session status
     */
    sessionStatus(sessionKey: string): Promise<{
        sessionId: string;
        agentId: string;
        status: string;
        tokenUsage: {
            prompt: number;
            completion: number;
            total: number;
        };
    }>;
    /**
     * Get a session by ID
     */
    getSession(sessionId: string): OpenClawSession | undefined;
    /**
     * Get all sessions
     */
    getAllSessions(): OpenClawSession[];
    /**
     * Restore a session from persisted data
     */
    restoreSession(session: MockSession): void;
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
export declare class OpenClawIntegration {
}
export default OpenClawCore;
export type { GatewayConfig, GatewayClientOptions, ConnectionState, GatewayStats, SessionInfo, Message, SessionsSpawnResponse, SessionsSendResponse, };
export { GatewayError, ConnectionError, TimeoutError };
//# sourceMappingURL=openclaw.d.ts.map