"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GatewayClient = void 0;
exports.createGatewayClient = createGatewayClient;
exports.connectToGateway = connectToGateway;
const ws_1 = __importDefault(require("ws"));
const events_1 = require("events");
const types_1 = require("./types");
// ============================================================================
// Gateway Client Class
// ============================================================================
class GatewayClient extends events_1.EventEmitter {
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
        // Merge with defaults
        this.config = {
            ...types_1.DEFAULT_GATEWAY_CONFIG,
            ...config,
            // Allow token from environment variable
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
        // Reject all pending requests
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
     *
     * Per OpenClaw Gateway Protocol v1:
     * - For control clients (like dash CLI), use id 'node' and mode 'client'
     * - For extension clients, use id 'node' and mode 'extension'
     * - Per OpenClaw source, valid combinations:
     *   - {id: 'node', mode: 'client'} for CLI/tools
     *   - {id: 'node', mode: 'extension'} for extensions
     */
    async authenticate() {
        if (!this.config.token) {
            throw new types_1.GatewayError('AUTHENTICATION_ERROR', 'No token provided. Set OPENCLAW_GATEWAY_TOKEN environment variable.');
        }
        this.setState('authenticating');
        try {
            // Use 'connect' method as first request per OpenClaw Gateway protocol
            // Using node client format for CLI/control connection
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
            // Subscribe to default events
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
            // Set up timeout
            const timeout = setTimeout(() => {
                this.pendingRequests.delete(id);
                reject(new types_1.TimeoutError(`Request timeout: ${method}`));
            }, this.config.requestTimeout);
            // Store pending request
            this.pendingRequests.set(id, {
                id,
                method,
                resolve: resolve,
                reject,
                timeout,
                timestamp: Date.now(),
            });
            // Send request
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
    /**
     * Subscribe to an event type
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);
        return this;
    }
    /**
     * Unsubscribe from an event type
     */
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
    /**
     * Subscribe to agent events
     */
    onAgentEvent(handler) {
        return this.on('agent', handler);
    }
    /**
     * Subscribe to chat events
     */
    onChatEvent(handler) {
        return this.on('chat', handler);
    }
    /**
     * Subscribe to presence events
     */
    onPresenceEvent(handler) {
        return this.on('presence', handler);
    }
    /**
     * Subscribe to tick events (heartbeat)
     */
    onTickEvent(handler) {
        return this.on('tick', handler);
    }
    // ============================================================================
    // Session Management API
    // ============================================================================
    /**
     * List all sessions
     */
    async sessionsList(params) {
        const response = await this.requestWithReconnect('sessions_list', (params ?? {}));
        return response.sessions;
    }
    /**
     * Spawn a new session
     */
    async sessionsSpawn(params) {
        return await this.requestWithReconnect('sessions_spawn', (params ?? {}));
    }
    /**
     * Send a message to a session
     */
    async sessionsSend(sessionKey, message, attachments) {
        const params = {
            sessionKey,
            message,
            attachments,
        };
        return await this.requestWithReconnect('sessions_send', params);
    }
    /**
     * Get session history
     */
    async sessionsHistory(sessionKey, limit) {
        const params = {
            sessionKey,
            limit,
        };
        const response = await this.requestWithReconnect('sessions_history', params);
        return response.messages;
    }
    /**
     * Kill a session
     */
    async sessionsKill(sessionKey) {
        await this.requestWithReconnect('sessions_kill', { sessionKey });
    }
    // ============================================================================
    // Event Subscription API
    // ============================================================================
    /**
     * Subscribe to server-side events
     */
    async subscribeToEvent(event) {
        await this.request('subscribe', { event });
    }
    /**
     * Unsubscribe from server-side events
     */
    async unsubscribe(event) {
        await this.request('unsubscribe', { event });
    }
    // ============================================================================
    // WebSocket Event Handlers
    // ============================================================================
    handleOpen() {
        this.stats.connectedAt = new Date();
        this.reconnectionState = null;
        this.emit('connected');
        // Authenticate if token is available
        if (this.config.token) {
            this.authenticate().catch((error) => {
                this.emit('error', error);
            });
        }
        else {
            this.setState('connected');
        }
        // Start heartbeat
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
            // Response for unknown request (maybe timed out)
            return;
        }
        // Clear timeout
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
        // Emit specific event
        this.emit(event.event, event.payload, event);
        // Call registered handlers
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
        // Emit generic event
        this.emit('event', event);
    }
    handleClose(code, reason) {
        this.clearHeartbeat();
        this.setState('disconnected');
        this.stats.disconnectedAt = new Date();
        // Reject pending requests
        for (const [id, request] of this.pendingRequests) {
            clearTimeout(request.timeout);
            request.reject(new types_1.ConnectionError(`Connection closed: ${code} ${reason.toString()}`));
        }
        this.pendingRequests.clear();
        this.emit('disconnected', { code, reason: reason.toString() });
        // Auto-reconnect if enabled and not a clean close
        if (this.options.autoReconnect && code !== 1000) {
            this.scheduleReconnect();
        }
    }
    handleError(error) {
        this.stats.errors++;
        this.emit('error', error);
    }
    // ============================================================================
    // Reconnection Logic
    // ============================================================================
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
                // Schedule next attempt with exponential backoff
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
    // ============================================================================
    // Heartbeat
    // ============================================================================
    startHeartbeat() {
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
        }, this.options.heartbeatInterval);
    }
    clearHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
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
exports.GatewayClient = GatewayClient;
// ============================================================================
// Factory Functions
// ============================================================================
/**
 * Create a new Gateway client with configuration
 */
function createGatewayClient(config, options) {
    return new GatewayClient(config, options);
}
/**
 * Connect to Gateway with default configuration
 */
async function connectToGateway(token) {
    const client = new GatewayClient({
        token: token ?? process.env['OPENCLAW_GATEWAY_TOKEN'],
    }, {
        autoReconnect: true,
        subscriptions: ['agent', 'chat', 'presence', 'tick'],
    });
    await client.connect();
    return client;
}
//# sourceMappingURL=GatewayClient.js.map