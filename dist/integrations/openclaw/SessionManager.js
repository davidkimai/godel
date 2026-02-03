"use strict";
/**
 * OpenClaw Session Manager
 *
 * Manages OpenClaw sessions via the Gateway WebSocket API.
 * Wraps sessions_list, sessions_spawn, sessions_send, sessions_history, sessions_kill
 *
 * @module integrations/openclaw/SessionManager
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionManager = void 0;
exports.getGlobalSessionManager = getGlobalSessionManager;
exports.resetGlobalSessionManager = resetGlobalSessionManager;
const events_1 = require("events");
const ws_1 = __importDefault(require("ws"));
const logger_1 = require("../../utils/logger");
// ============================================================================
// Session Manager
// ============================================================================
class SessionManager extends events_1.EventEmitter {
    constructor(config, gatewayClient) {
        super();
        this.ws = null;
        this.gatewayClient = null;
        this.pendingRequests = new Map();
        this.requestIdCounter = 0;
        this.reconnectAttempts = 0;
        this.isConnecting = false;
        this.isShuttingDown = false;
        this.eventHandlers = new Map();
        // Session tracking for lifecycle management
        this.activeSessions = new Map();
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
        }
        else {
            this.useGatewayClient = false;
        }
    }
    setupGatewayClientHandlers() {
        if (!this.gatewayClient)
            return;
        // Forward events from GatewayClient
        this.gatewayClient.on('event', (event) => {
            const e = event;
            if (e.event) {
                this.emit('event', e);
                this.emit(e.event, e.payload);
            }
        });
        this.gatewayClient.on('session.spawned', (data) => {
            this.emit('session.spawned', data);
        });
        this.gatewayClient.on('session.sent', (data) => {
            this.emit('session.sent', data);
        });
        this.gatewayClient.on('session.killed', (data) => {
            this.emit('session.killed', data);
        });
        this.gatewayClient.on('connected', () => {
            this.emit('connected');
        });
        this.gatewayClient.on('disconnected', (data) => {
            this.emit('disconnected', data);
        });
        this.gatewayClient.on('error', ((error) => {
            this.emit('error', { message: error.message });
        }));
    }
    // ============================================================================
    // Connection Management
    // ============================================================================
    /**
     * Connect to the OpenClaw Gateway
     */
    async connect() {
        // If using GatewayClient, just ensure it's connected
        if (this.useGatewayClient && this.gatewayClient) {
            if (!this.gatewayClient.connected) {
                await this.gatewayClient.connect();
            }
            return;
        }
        // Otherwise, create our own WebSocket connection
        if (this.ws?.readyState === ws_1.default.OPEN) {
            logger_1.logger.debug('[SessionManager] Already connected');
            return;
        }
        if (this.isConnecting) {
            logger_1.logger.debug('[SessionManager] Connection in progress');
            return;
        }
        this.isConnecting = true;
        return new Promise((resolve, reject) => {
            const wsUrl = `ws://${this.config.host}:${this.config.port}`;
            logger_1.logger.info(`[SessionManager] Connecting to ${wsUrl}`);
            try {
                this.ws = new ws_1.default(wsUrl);
                const connectionTimeout = setTimeout(() => {
                    this.ws?.close();
                    this.isConnecting = false;
                    reject(new Error('Connection timeout'));
                }, 10000);
                this.ws.on('open', () => {
                    clearTimeout(connectionTimeout);
                    this.isConnecting = false;
                    this.reconnectAttempts = 0;
                    logger_1.logger.info('[SessionManager] Connected to OpenClaw Gateway');
                    this.emit('connected');
                    resolve();
                });
                this.ws.on('message', (data) => {
                    this.handleMessage(data.toString());
                });
                this.ws.on('error', (error) => {
                    clearTimeout(connectionTimeout);
                    this.isConnecting = false;
                    logger_1.logger.error('[SessionManager] WebSocket error', { message: error.message });
                    this.emit('error', { message: error.message, code: error.code });
                    reject(error);
                });
                this.ws.on('close', (code, reason) => {
                    this.isConnecting = false;
                    logger_1.logger.warn(`[SessionManager] Connection closed: ${code} ${reason.toString()}`);
                    this.emit('disconnected', { code, reason: reason.toString() });
                    if (!this.isShuttingDown) {
                        this.scheduleReconnect();
                    }
                });
            }
            catch (error) {
                this.isConnecting = false;
                reject(error);
            }
        });
    }
    /**
     * Disconnect from the Gateway
     */
    async disconnect() {
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
        logger_1.logger.info('[SessionManager] Disconnected');
        this.emit('disconnected', { code: 0, reason: 'manual' });
    }
    /**
     * Check if connected to Gateway
     */
    isConnected() {
        if (this.useGatewayClient && this.gatewayClient) {
            return this.gatewayClient.connected;
        }
        return this.ws?.readyState === ws_1.default.OPEN;
    }
    scheduleReconnect() {
        if (this.useGatewayClient)
            return; // Don't reconnect if using GatewayClient
        if (this.reconnectAttempts >= this.config.maxRetries) {
            logger_1.logger.error('[SessionManager] Max reconnection attempts reached');
            this.emit('maxRetriesReached');
            return;
        }
        this.reconnectAttempts++;
        const delay = this.config.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        logger_1.logger.info(`[SessionManager] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        setTimeout(() => {
            this.connect().catch((error) => {
                logger_1.logger.error('[SessionManager] Reconnection failed:', error.message);
            });
        }, delay);
    }
    // ============================================================================
    // Message Handling (only used when not using GatewayClient)
    // ============================================================================
    handleMessage(data) {
        try {
            const message = JSON.parse(data);
            if (message.type === 'res') {
                this.handleResponse(message);
            }
            else if (message.type === 'event') {
                this.handleEvent(message);
            }
        }
        catch (error) {
            logger_1.logger.error('[SessionManager] Failed to parse message', { error: error.message });
        }
    }
    handleResponse(response) {
        const pending = this.pendingRequests.get(response.id || '');
        if (!pending) {
            logger_1.logger.warn(`[SessionManager] Received response for unknown request: ${response.id}`);
            return;
        }
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(response.id || '');
        if (response.ok) {
            pending.resolve(response.payload);
        }
        else {
            const error = new Error(response.error?.message || 'Unknown error');
            error.code = response.error?.code || 'UNKNOWN_ERROR';
            pending.reject(error);
        }
    }
    handleEvent(event) {
        logger_1.logger.debug(`[SessionManager] Event received: ${event.event}`);
        // Emit for general listeners
        this.emit('event', event);
        this.emit(event.event, event.payload);
        // Call registered handlers
        const handlers = this.eventHandlers.get(event.event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(event.payload);
                }
                catch (error) {
                    logger_1.logger.error('[SessionManager] Event handler error', { error: error.message });
                }
            });
        }
        // Update session tracking based on events
        this.updateSessionFromEvent(event);
    }
    updateSessionFromEvent(event) {
        if (event.event === 'agent' && event.payload) {
            const payload = event.payload;
            if (payload.sessionKey) {
                const session = this.activeSessions.get(payload.sessionKey);
                if (session) {
                    if (payload.status) {
                        session.status = payload.status;
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
    async sendRequest(method, params, timeoutMs = 30000) {
        // If using GatewayClient, delegate to it
        if (this.useGatewayClient && this.gatewayClient) {
            return this.gatewayClient.request(method, params || {});
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
            this.pendingRequests.set(id, { resolve: resolve, reject, timeout });
            this.ws.send(JSON.stringify(request), (error) => {
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
    async sessionsList(params) {
        logger_1.logger.debug(`[SessionManager] sessions_list: ${JSON.stringify(params)}`);
        const response = await this.sendRequest('sessions_list', (params || {}));
        return response.sessions;
    }
    /**
     * Create new isolated session
     * Maps to: sessions_spawn
     */
    async sessionsSpawn(params) {
        logger_1.logger.info('[SessionManager] sessions_spawn', { model: params?.model });
        const response = await this.sendRequest('sessions_spawn', params || {});
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
    async sessionsSend(params) {
        logger_1.logger.debug('[SessionManager] sessions_send', { sessionKey: params.sessionKey });
        const response = await this.sendRequest('sessions_send', {
            sessionKey: params.sessionKey,
            message: params.message,
            attachments: params.attachments,
            replyTo: params.replyTo,
        });
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
    async sendMessage(sessionKey, message) {
        return this.sessionsSend({ sessionKey, message });
    }
    /**
     * Fetch transcript/history for a session
     * Maps to: sessions_history
     */
    async sessionsHistory(sessionKey, limit) {
        logger_1.logger.debug('[SessionManager] sessions_history', { sessionKey, limit });
        const response = await this.sendRequest('sessions_history', {
            sessionKey,
            limit,
        });
        return response.messages;
    }
    /**
     * Terminate a session
     * Maps to: sessions_kill
     */
    async sessionsKill(sessionKey) {
        logger_1.logger.info('[SessionManager] sessions_kill', { sessionKey });
        await this.sendRequest('sessions_kill', { sessionKey });
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
    getSession(sessionKey) {
        const session = this.activeSessions.get(sessionKey);
        if (!session)
            return undefined;
        return { ...session };
    }
    /**
     * Get all tracked sessions
     */
    getAllSessions() {
        return Array.from(this.activeSessions.values()).map(s => ({ ...s }));
    }
    /**
     * Get sessions by status
     */
    getSessionsByStatus(status) {
        return this.getAllSessions().filter(s => s.status === status);
    }
    /**
     * Wait for a session to reach a specific status
     */
    async waitForStatus(sessionKey, targetStatus, timeoutMs = 60000, pollIntervalMs = 1000) {
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
    cleanupSessions(olderThanMs = 3600000) {
        const now = Date.now();
        let cleaned = 0;
        for (const [key, session] of this.activeSessions) {
            if ((session.status === 'completed' || session.status === 'failed') &&
                now - session.lastActivity.getTime() > olderThanMs) {
                this.activeSessions.delete(key);
                cleaned++;
            }
        }
        logger_1.logger.info(`[SessionManager] Cleaned up ${cleaned} old sessions`);
        return cleaned;
    }
    // ============================================================================
    // Event Subscription
    // ============================================================================
    /**
     * Subscribe to Gateway events
     */
    onEvent(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, []);
        }
        this.eventHandlers.get(event).push(handler);
    }
    /**
     * Unsubscribe from Gateway events
     */
    offEvent(event, handler) {
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
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
exports.SessionManager = SessionManager;
// ============================================================================
// Singleton Instance
// ============================================================================
let globalSessionManager = null;
function getGlobalSessionManager(config, gatewayClient) {
    if (!globalSessionManager) {
        globalSessionManager = new SessionManager(config, gatewayClient);
    }
    return globalSessionManager;
}
function resetGlobalSessionManager() {
    globalSessionManager = null;
}
exports.default = SessionManager;
//# sourceMappingURL=SessionManager.js.map