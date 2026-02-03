"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TimeoutError = exports.ConnectionError = exports.GatewayError = exports.OpenClawIntegration = exports.MockOpenClawClient = exports.AgentToolContext = exports.OpenClawCore = exports.OpenClawGatewayClient = void 0;
exports.getOpenClawCore = getOpenClawCore;
exports.resetOpenClawCore = resetOpenClawCore;
exports.isOpenClawInitialized = isOpenClawInitialized;
exports.isOpenClawConnected = isOpenClawConnected;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const index_1 = require("../bus/index");
const logger_1 = require("../utils/logger");
const errors_1 = require("../errors");
const types_1 = require("../integrations/openclaw/types");
Object.defineProperty(exports, "GatewayError", { enumerable: true, get: function () { return types_1.GatewayError; } });
Object.defineProperty(exports, "ConnectionError", { enumerable: true, get: function () { return types_1.ConnectionError; } });
Object.defineProperty(exports, "TimeoutError", { enumerable: true, get: function () { return types_1.TimeoutError; } });
// ============================================================================
// Gateway Client (Core Primitive Implementation)
// ============================================================================
/**
 * OpenClaw Gateway Client
 * WebSocket client for connecting to the OpenClaw Gateway API.
 * This is the core transport layer for all OpenClaw operations.
 */
class OpenClawGatewayClient extends events_1.EventEmitter {
    constructor(config = {}, options = {}) {
        super();
        this.ws = null;
        this.state = 'disconnected';
        this.pendingRequests = new Map();
        this.eventHandlers = new Map();
        this.reconnectionState = null;
        this.heartbeatInterval = null;
        this.reconnectTimeout = null;
        this.eventSeq = 0;
        this.requestIdCounter = 0;
        this.config = {
            ...types_1.DEFAULT_GATEWAY_CONFIG,
            ...config,
            token: config.token ?? process.env['OPENCLAW_GATEWAY_TOKEN'],
        };
        this.options = {
            ...types_1.DEFAULT_GATEWAY_OPTIONS,
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
    async connect() {
        if (this.state === 'connected' || this.state === 'authenticating' || this.state === 'authenticated') {
            return;
        }
        if (this.state === 'connecting') {
            throw new types_1.ConnectionError('Connection already in progress');
        }
        this.setState('connecting');
        const wsUrl = `ws://${this.config.host}:${this.config.port}`;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.ws?.terminate();
                this.setState('error');
                reject(new types_1.ConnectionError(`Connection timeout after ${this.options.connectionTimeout}ms`));
            }, this.options.connectionTimeout);
            try {
                this.ws = new ws_1.default(wsUrl);
                this.ws.once('open', () => {
                    clearTimeout(timeout);
                    this.handleOpen();
                    resolve();
                });
                this.ws.once('error', (error) => {
                    clearTimeout(timeout);
                    this.handleError(error);
                    reject(new types_1.ConnectionError(`WebSocket error: ${error.message}`));
                });
                this.ws.on('message', (data) => this.handleMessage(data));
                this.ws.on('close', (code, reason) => this.handleClose(code, reason));
                this.ws.on('error', (error) => this.handleError(error));
            }
            catch (error) {
                clearTimeout(timeout);
                this.setState('error');
                reject(new types_1.ConnectionError(`Failed to create WebSocket: ${error instanceof Error ? error.message : String(error)}`));
            }
        });
    }
    /**
     * Disconnect from the Gateway
     */
    async disconnect() {
        this.clearHeartbeat();
        this.clearReconnectTimeout();
        for (const [id, request] of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new types_1.ConnectionError('Connection closed'));
        }
        this.pendingRequests.clear();
        if (this.ws) {
            if (this.ws.readyState === ws_1.default.OPEN) {
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
    get connected() {
        return this.state === 'authenticated' && this.ws?.readyState === ws_1.default.OPEN;
    }
    /**
     * Get current connection state
     */
    get connectionState() {
        return this.state;
    }
    /**
     * Get connection statistics
     */
    get statistics() {
        return { ...this.stats };
    }
    // ============================================================================
    // Authentication
    // ============================================================================
    /**
     * Authenticate with the Gateway using token
     */
    async authenticate() {
        if (!this.config.token) {
            throw new types_1.GatewayError('AUTHENTICATION_ERROR', 'No token provided. Set OPENCLAW_GATEWAY_TOKEN environment variable.');
        }
        this.setState('authenticating');
        try {
            await this.request('connect', {
                auth: {
                    token: this.config.token,
                },
                client: {
                    id: 'node',
                    mode: 'client',
                    platform: 'node',
                    version: '2.0.0',
                },
                minProtocol: 1,
                maxProtocol: 1,
            });
            this.setState('authenticated');
            this.emit('authenticated');
            if (this.options.subscriptions) {
                for (const event of this.options.subscriptions) {
                    await this.subscribeToEvent(event);
                }
            }
        }
        catch (error) {
            this.setState('error');
            throw new types_1.GatewayError('AUTHENTICATION_ERROR', 'Authentication failed', error);
        }
    }
    // ============================================================================
    // Request/Response Cycle
    // ============================================================================
    /**
     * Send a request to the Gateway
     */
    async request(method, params = {}) {
        if (!this.ws || this.ws.readyState !== ws_1.default.OPEN) {
            if (this.options.autoReconnect) {
                await this.connect();
            }
            else {
                throw new types_1.ConnectionError('Not connected to Gateway');
            }
        }
        const id = this.generateRequestId();
        const request = {
            type: 'req',
            id,
            method,
            params,
        };
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new types_1.TimeoutError(`Request timeout: ${method}`));
            }, this.config.requestTimeout);
            this.pendingRequests.set(id, {
                id,
                method,
                resolve: resolve,
                reject,
                timeout,
                timestamp: Date.now(),
            });
            try {
                this.ws.send(JSON.stringify(request));
                this.stats.requestsSent++;
            }
            catch (error) {
                clearTimeout(timeout);
                this.pendingRequests.delete(id);
                reject(new types_1.GatewayError('REQUEST_ERROR', `Failed to send request: ${error instanceof Error ? error.message : String(error)}`));
            }
        });
    }
    /**
     * Send a request with automatic retry on connection error
     */
    async requestWithReconnect(method, params = {}) {
        try {
            return await this.request(method, params);
        }
        catch (error) {
            if (error instanceof types_1.ConnectionError && this.options.autoReconnect) {
                await this.reconnect();
                return await this.request(method, params);
            }
            throw error;
        }
    }
    // ============================================================================
    // Event Subscription
    // ============================================================================
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
        return this;
    }
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
            if (handlers.size === 0) {
                this.eventHandlers.delete(event);
            }
        }
        return this;
    }
    onAgentEvent(handler) {
        return this.on('agent', handler);
    }
    onChatEvent(handler) {
        return this.on('chat', handler);
    }
    onPresenceEvent(handler) {
        return this.on('presence', handler);
    }
    onTickEvent(handler) {
        return this.on('tick', handler);
    }
    // ============================================================================
    // Session Management API
    // ============================================================================
    async sessionsList(params) {
        const response = await this.requestWithReconnect('sessions_list', (params ?? {}));
        return response.sessions;
    }
    async sessionsSpawn(params) {
        return await this.requestWithReconnect('sessions_spawn', (params ?? {}));
    }
    async sessionsSend(sessionKey, message, attachments) {
        const params = { sessionKey, message, attachments };
        return await this.requestWithReconnect('sessions_send', params);
    }
    async sessionsHistory(sessionKey, limit) {
        const params = { sessionKey, limit };
        const response = await this.requestWithReconnect('sessions_history', params);
        return response.messages;
    }
    async sessionsKill(sessionKey) {
        await this.requestWithReconnect('sessions_kill', { sessionKey });
    }
    // ============================================================================
    // Tool Execution API (Core Primitive)
    // ============================================================================
    /**
     * Execute an OpenClaw tool directly
     * This is the core primitive that allows agents to use any OpenClaw tool
     */
    async executeTool(tool, params) {
        const method = `tool_${tool}`;
        return this.requestWithReconnect(method, params);
    }
    /**
     * Read a file
     */
    async readFile(path, options) {
        const result = await this.executeTool('read', { path, ...options });
        return String(result);
    }
    /**
     * Write a file
     */
    async writeFile(path, content) {
        await this.executeTool('write', { path, content });
    }
    /**
     * Edit a file
     */
    async editFile(path, oldText, newText) {
        await this.executeTool('edit', { path, oldText, newText });
    }
    /**
     * Execute a command
     */
    async exec(command, options) {
        return this.executeTool('exec', { command, ...options });
    }
    /**
     * Search the web
     */
    async webSearch(query, options) {
        return this.executeTool('web_search', { query, ...options });
    }
    /**
     * Fetch a web page
     */
    async webFetch(url, options) {
        return this.executeTool('web_fetch', { url, ...options });
    }
    /**
     * Browser automation
     */
    async browser(action, params) {
        return this.executeTool('browser', { action, ...params });
    }
    /**
     * Canvas control
     */
    async canvas(action, params) {
        return this.executeTool('canvas', { action, ...params });
    }
    /**
     * Node control
     */
    async nodes(action, params) {
        return this.executeTool('nodes', { action, ...params });
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    async subscribeToEvent(event) {
        await this.request('subscribe', { event });
    }
    handleOpen() {
        this.stats.connectedAt = new Date();
        this.reconnectionState = null;
        this.emit('connected');
        if (this.config.token) {
            this.authenticate().catch((error) => {
                this.emit('error', error);
            });
        }
        else {
            this.setState('connected');
        }
        this.startHeartbeat();
    }
    handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            if (message.type === 'res') {
                this.handleResponse(message);
            }
            else if (message.type === 'event') {
                this.handleEvent(message);
            }
        }
        catch (error) {
            this.stats.errors++;
            this.emit('error', new types_1.GatewayError('INTERNAL_ERROR', 'Failed to parse message', error));
        }
    }
    handleResponse(response) {
        this.stats.responsesReceived++;
        const pending = this.pendingRequests.get(response.id);
        if (!pending) {
            return;
        }
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id);
        if (response.ok) {
            pending.resolve(response.payload);
        }
        else {
            const error = new types_1.GatewayError(response.error?.code ?? 'INTERNAL_ERROR', response.error?.message ?? 'Unknown error', response.error?.details);
            pending.reject(error);
        }
    }
    handleEvent(event) {
        this.stats.eventsReceived++;
        this.eventSeq = event.seq ?? this.eventSeq + 1;
        this.emit(event.event, event.payload, event);
        const handlers = this.eventHandlers.get(event.event);
        if (handlers) {
            handlers.forEach((handler) => {
                try {
                    handler(event.payload, event);
                }
                catch (error) {
                    this.emit('error', error);
                }
            });
        }
        this.emit('event', event);
    }
    handleClose(code, reason) {
        this.clearHeartbeat();
        this.setState('disconnected');
        this.stats.disconnectedAt = new Date();
        for (const [id, request] of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new types_1.ConnectionError(`Connection closed: ${code} ${reason.toString()}`));
        }
        this.pendingRequests.clear();
        this.emit('disconnected', { code, reason: reason.toString() });
        if (this.options.autoReconnect && code !== 1000) {
            this.scheduleReconnect();
        }
    }
    handleError(error) {
        this.stats.errors++;
        this.emit('error', error);
    }
    async reconnect() {
        if (this.state === 'reconnecting') {
            return;
        }
        this.setState('reconnecting');
        this.stats.reconnections++;
        await this.disconnect();
        await this.connect();
    }
    scheduleReconnect() {
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
            this.emit('error', new types_1.ConnectionError(`Max reconnection attempts (${state.maxRetries}) exceeded`));
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
    clearReconnectTimeout() {
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
    }
    startHeartbeat() {
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
    clearHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    setState(state) {
        const oldState = this.state;
        this.state = state;
        if (oldState !== state) {
            this.emit('stateChange', state, oldState);
        }
    }
    generateRequestId() {
        return `req_${++this.requestIdCounter}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
    generateClientId() {
        return `dash_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
}
exports.OpenClawGatewayClient = OpenClawGatewayClient;
// ============================================================================
// OpenClaw Core Primitive
// ============================================================================
/**
 * OpenClaw Core Primitive
 *
 * The main interface for OpenClaw integration as a core primitive.
 * Manages sessions, provides tool access to agents, and maintains Gateway connection.
 */
class OpenClawCore extends events_1.EventEmitter {
    constructor(messageBus, gatewayConfig) {
        super();
        this.sessions = new Map();
        this.agentSessionMap = new Map();
        this.initialized = false;
        this.messageBus = messageBus;
        this.gateway = new OpenClawGatewayClient(gatewayConfig, {
            autoReconnect: true,
            subscriptions: ['agent', 'chat', 'presence', 'tick'],
        });
        this.setupGatewayListeners();
    }
    // ============================================================================
    // Initialization (Core Primitive)
    // ============================================================================
    /**
     * Initialize OpenClaw as a core primitive
     * Called during system startup, not lazily
     */
    async initialize() {
        if (this.initialized) {
            return;
        }
        logger_1.logger.info('[OpenClawCore] Initializing OpenClaw core primitive...');
        try {
            await this.gateway.connect();
            this.initialized = true;
            logger_1.logger.info('[OpenClawCore] OpenClaw core primitive initialized and connected');
            this.emit('initialized');
        }
        catch (error) {
            logger_1.logger.error('[OpenClawCore] Failed to initialize OpenClaw:', error);
            throw new errors_1.ApplicationError('Failed to initialize OpenClaw core primitive', errors_1.DashErrorCode.INITIALIZATION_FAILED, 500, { error: error instanceof Error ? error.message : String(error) }, false);
        }
    }
    /**
     * Connect to Gateway (idempotent)
     */
    async connect() {
        if (!this.gateway.connected) {
            await this.gateway.connect();
        }
    }
    /**
     * Disconnect from Gateway
     */
    async disconnect() {
        await this.gateway.disconnect();
        this.initialized = false;
    }
    /**
     * Check if initialized
     */
    get isInitialized() {
        return this.initialized;
    }
    /**
     * Check if connected to Gateway
     */
    get isConnected() {
        return this.gateway.connected;
    }
    // ============================================================================
    // Session Management (Transparent)
    // ============================================================================
    /**
     * Spawn an OpenClaw session for a Dash agent
     * Transparent session management - automatically mapped
     */
    async spawnSession(options) {
        this.assertInitialized();
        const response = await this.gateway.sessionsSpawn({
            model: options.model,
            skills: options.context?.['skills'] || [],
            systemPrompt: options.task,
        });
        const session = {
            sessionId: response.sessionKey,
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
        this.sessions.set(response.sessionKey, session);
        this.agentSessionMap.set(options.agentId, response.sessionKey);
        logger_1.logger.info(`[OpenClawCore] Session ${response.sessionKey} spawned for agent ${options.agentId}`);
        this.emit('session.spawned', {
            agentId: options.agentId,
            sessionId: response.sessionKey,
            model: options.model,
        });
        return response.sessionKey;
    }
    /**
     * Kill a session by agent ID
     */
    async killSession(agentId, force = false) {
        const sessionId = this.agentSessionMap.get(agentId);
        if (!sessionId) {
            logger_1.logger.warn(`[OpenClawCore] No session found for agent ${agentId}`);
            return;
        }
        await this.gateway.sessionsKill(sessionId);
        const session = this.sessions.get(sessionId);
        if (session) {
            session.status = 'killed';
            session.completedAt = new Date();
        }
        this.emit('session.killed', { agentId, sessionId, force });
    }
    /**
     * Get session ID for an agent
     */
    getSessionId(agentId) {
        return this.agentSessionMap.get(agentId);
    }
    /**
     * Get agent ID for a session
     */
    getAgentId(sessionId) {
        const session = this.sessions.get(sessionId);
        return session?.agentId;
    }
    /**
     * Check if an agent has a session
     */
    hasSession(agentId) {
        return this.agentSessionMap.has(agentId);
    }
    /**
     * Get session status
     */
    async getSessionStatus(agentId) {
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
    getActiveSessions() {
        return Array.from(this.agentSessionMap.entries()).map(([agentId, sessionId]) => ({
            agentId,
            sessionId,
        }));
    }
    // ============================================================================
    // Tool Access (Core Primitive)
    // ============================================================================
    /**
     * Use an OpenClaw tool
     * Core primitive: Agents can use any OpenClaw tool directly
     */
    async useTool(tool, params) {
        this.assertInitialized();
        return this.gateway.executeTool(tool, params);
    }
    /**
     * Read a file (convenience method)
     */
    async read(path, options) {
        const result = await this.useTool('read', { path, ...options });
        return String(result);
    }
    /**
     * Write a file (convenience method)
     */
    async write(path, content) {
        return this.useTool('write', { path, content });
    }
    /**
     * Edit a file (convenience method)
     */
    async edit(path, oldText, newText) {
        return this.useTool('edit', { path, oldText, newText });
    }
    /**
     * Execute a command (convenience method)
     */
    async exec(command, options) {
        return this.useTool('exec', { command, ...options });
    }
    /**
     * Search the web (convenience method)
     */
    async webSearch(query, options) {
        return this.useTool('web_search', { query, ...options });
    }
    /**
     * Fetch a web page (convenience method)
     */
    async webFetch(url, options) {
        return this.useTool('web_fetch', { url, ...options });
    }
    /**
     * Browser automation (convenience method)
     */
    async browser(action, params) {
        return this.useTool('browser', { action, ...params });
    }
    /**
     * Canvas control (convenience method)
     */
    async canvas(action, params) {
        return this.useTool('canvas', { action, ...params });
    }
    /**
     * Node control (convenience method)
     */
    async nodes(action, params) {
        return this.useTool('nodes', { action, ...params });
    }
    // ============================================================================
    // Agent Tool Access (Core Primitive)
    // ============================================================================
    /**
     * Create a tool context for an agent
     * Returns an object with all tools bound to this OpenClaw instance
     */
    createAgentToolContext(agentId) {
        return new AgentToolContext(agentId, this);
    }
    // ============================================================================
    // Private Methods
    // ============================================================================
    setupGatewayListeners() {
        this.gateway.on('connected', () => {
            this.emit('connected');
        });
        this.gateway.on('disconnected', () => {
            this.emit('disconnected');
        });
        this.gateway.on('error', (error) => {
            this.emit('error', error);
        });
        this.gateway.on('agent', (payload) => {
            this.handleAgentEvent(payload);
        });
    }
    handleAgentEvent(payload) {
        const agentId = this.getAgentId(payload.sessionKey);
        if (!agentId) {
            return;
        }
        this.messageBus.publish(index_1.MessageBus.agentEvents(agentId), {
            eventType: `openclaw.${payload.status}`,
            source: { agentId, sessionId: payload.sessionKey },
            payload,
            timestamp: new Date(),
        }, { source: 'openclaw', priority: 'high' });
        this.emit('agent.event', { agentId, ...payload });
    }
    assertInitialized() {
        if (!this.initialized) {
            throw new errors_1.ApplicationError('OpenClaw core primitive not initialized. Call initialize() first.', errors_1.DashErrorCode.INITIALIZATION_FAILED, 500, {}, false);
        }
    }
}
exports.OpenClawCore = OpenClawCore;
// ============================================================================
// Agent Tool Context
// ============================================================================
/**
 * Tool context for an individual agent
 * Provides all OpenClaw tools bound to the agent's session
 */
class AgentToolContext {
    constructor(agentId, openclaw) {
        this.agentId = agentId;
        this.openclaw = openclaw;
    }
    /**
     * Use any OpenClaw tool
     */
    async useTool(tool, params) {
        return this.openclaw.useTool(tool, params);
    }
    /**
     * Read a file
     */
    async read(path, options) {
        return this.openclaw.read(path, options);
    }
    /**
     * Write a file
     */
    async write(path, content) {
        return this.openclaw.write(path, content);
    }
    /**
     * Edit a file
     */
    async edit(path, oldText, newText) {
        return this.openclaw.edit(path, oldText, newText);
    }
    /**
     * Execute a command
     */
    async exec(command, options) {
        return this.openclaw.exec(command, options);
    }
    /**
     * Search the web
     */
    async webSearch(query, options) {
        return this.openclaw.webSearch(query, options);
    }
    /**
     * Fetch a web page
     */
    async webFetch(url, options) {
        return this.openclaw.webFetch(url, options);
    }
    /**
     * Browser automation
     */
    async browser(action, params) {
        return this.openclaw.browser(action, params);
    }
    /**
     * Canvas control
     */
    async canvas(action, params) {
        return this.openclaw.canvas(action, params);
    }
    /**
     * Node control
     */
    async nodes(action, params) {
        return this.openclaw.nodes(action, params);
    }
    /**
     * Spawn a subagent session
     */
    async sessionsSpawn(task, options) {
        return this.openclaw.spawnSession({
            agentId: this.agentId,
            task,
            ...options,
        });
    }
    /**
     * Send a message to a session
     */
    async sessionsSend(sessionKey, message, attachments) {
        return this.openclaw['gateway'].sessionsSend(sessionKey, message, attachments);
    }
    /**
     * Get session history
     */
    async sessionsHistory(sessionKey, limit) {
        return this.openclaw['gateway'].sessionsHistory(sessionKey, limit);
    }
    /**
     * Kill a session
     */
    async sessionsKill(sessionKey) {
        return this.openclaw['gateway'].sessionsKill(sessionKey);
    }
    /**
     * List all sessions
     */
    async sessionsList() {
        return this.openclaw['gateway'].sessionsList();
    }
    get agent_id() {
        return this.agentId;
    }
}
exports.AgentToolContext = AgentToolContext;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalOpenClawCore = null;
/**
 * Get or create the global OpenClaw core primitive instance
 */
function getOpenClawCore(messageBus, config) {
    if (!globalOpenClawCore) {
        if (!messageBus) {
            throw new errors_1.ApplicationError('OpenClawCore requires MessageBus on first initialization', errors_1.DashErrorCode.INITIALIZATION_FAILED, 500, {}, false);
        }
        globalOpenClawCore = new OpenClawCore(messageBus, config);
    }
    return globalOpenClawCore;
}
/**
 * Reset the global OpenClaw core instance (for testing)
 */
function resetOpenClawCore() {
    globalOpenClawCore = null;
}
/**
 * Check if OpenClaw core is initialized
 */
function isOpenClawInitialized() {
    return globalOpenClawCore?.isInitialized ?? false;
}
/**
 * Check if OpenClaw is connected
 */
function isOpenClawConnected() {
    return globalOpenClawCore?.isConnected ?? false;
}
// ============================================================================
// Mock OpenClaw Client (for testing)
// ============================================================================
/**
 * Mock OpenClaw Client for testing without a real gateway
 */
class MockOpenClawClient {
    constructor() {
        this.sessions = new Map();
        this.sessionCounter = 0;
    }
    /**
     * Spawn a new session
     */
    async sessionsSpawn(options) {
        const sessionId = `openclaw-session-${Date.now()}-${++this.sessionCounter}`;
        const session = {
            sessionId,
            agentId: options.agentId,
            status: 'pending',
            createdAt: new Date(),
            model: options.model ?? 'kimi-k2.5',
            task: options.task,
            metadata: options.context ?? {},
        };
        this.sessions.set(sessionId, session);
        logger_1.logger.info(`[OpenClaw] Session spawned: ${sessionId} for agent ${options.agentId}`);
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
    async sessionsSend(params) {
        const session = this.sessions.get(params.sessionKey);
        if (!session) {
            throw new Error('Session not found');
        }
        logger_1.logger.info(`[OpenClaw] Message sent to session ${params.sessionKey}: ${params.message.substring(0, 20)}...`);
        return {
            runId: `run_${params.sessionKey}_${Date.now()}`,
            status: 'running',
        };
    }
    /**
     * Kill a session
     */
    async sessionKill(sessionKey, force) {
        const session = this.sessions.get(sessionKey);
        if (session) {
            session.status = 'killed';
            session.completedAt = new Date();
            logger_1.logger.info(`[OpenClaw] Session killed: ${sessionKey} (force=${force ?? false})`);
        }
    }
    /**
     * Get session status
     */
    async sessionStatus(sessionKey) {
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
    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session)
            return undefined;
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
    getAllSessions() {
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
    restoreSession(session) {
        this.sessions.set(session.sessionId, session);
    }
}
exports.MockOpenClawClient = MockOpenClawClient;
/**
 * Placeholder for OpenClawIntegration (used in tests)
 * @deprecated Use OpenClawCore instead
 */
class OpenClawIntegration {
}
exports.OpenClawIntegration = OpenClawIntegration;
// ============================================================================
// Exports
// ============================================================================
exports.default = OpenClawCore;
//# sourceMappingURL=openclaw.js.map