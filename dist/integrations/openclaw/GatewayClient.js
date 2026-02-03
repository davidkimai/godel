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
 *
 * Protocol: OpenClaw Gateway Protocol v3
 * Docs: https://docs.openclaw.ai/gateway/protocol
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
};
const GATEWAY_CLIENT_MODES = {
    WEBCHAT: 'webchat',
    CLI: 'cli',
    UI: 'ui',
    BACKEND: 'backend',
    NODE: 'node',
    PROBE: 'probe',
    TEST: 'test',
};
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
        this.currentChallenge = null;
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
            let connectTimeout;
            const cleanup = () => {
                clearTimeout(connectTimeout);
                this.off('authenticated', onAuthenticated);
                this.off('error', onError);
            };
            const onAuthenticated = () => {
                cleanup();
                resolve();
            };
            const onError = (error) => {
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
                reject(new types_1.ConnectionError(`Connection timeout after ${this.options.connectionTimeout}ms`));
            }, this.options.connectionTimeout);
            // Listen for authentication
            this.on('authenticated', onAuthenticated);
            this.on('error', onError);
            try {
                this.ws = new ws_1.default(wsUrl);
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
            }
            catch (error) {
                cleanup();
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
    // Authentication (OpenClaw Gateway Protocol v3)
    // ============================================================================
    /**
     * Handle connection open - wait for challenge and authenticate
     */
    async handleOpen() {
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
    async authenticate() {
        if (!this.config.token) {
            throw new types_1.GatewayError('AUTHENTICATION_ERROR', 'No token provided. Set OPENCLAW_GATEWAY_TOKEN environment variable.');
        }
        this.setState('authenticating');
        try {
            // Send connect request per Protocol v3
            const response = await this.request('connect', {
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
                    }
                    catch {
                        // Subscription failed - gateway may not support this method
                        // Continue without subscribing
                    }
                }
            }
            // Start heartbeat
            this.startHeartbeat(response.policy?.tickIntervalMs || 30000);
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
        // Also register with parent EventEmitter for internal events
        super.on(event, handler);
        // Also track in eventHandlers for custom event routing
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
        // Also remove from parent EventEmitter
        super.off(event, handler);
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
        // Handle connect.challenge for authentication
        if (event.event === 'connect.challenge') {
            this.currentChallenge = event.payload;
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
    startHeartbeat(intervalMs = 30000) {
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