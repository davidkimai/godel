"use strict";
/**
 * Dash WebSocket Server
 * Real-time event streaming for dashboard updates
 *
 * Port: 7374 (W-E-B-S-O-C-K-E-T on T9)
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebSocketManager = void 0;
exports.getWebSocketManager = getWebSocketManager;
exports.startWebSocketServer = startWebSocketServer;
const ws_1 = require("ws");
const events_1 = require("events");
const utils_1 = require("../utils");
class WebSocketManager extends events_1.EventEmitter {
    constructor(options = {}) {
        super();
        this.wss = null;
        this.clients = new Map();
        this.heartbeatInterval = null;
        this.eventBus = null;
        this.maxClients = 50;
        this.serverPort = options.port || 7374;
        this.maxClients = options.maxClients || 50;
    }
    /**
     * Start the WebSocket server
     */
    async start() {
        if (this.wss) {
            throw new Error('WebSocket server already started');
        }
        // Initialize WebSocket server
        this.wss = new ws_1.WebSocketServer({
            port: this.serverPort,
            maxPayload: 1048576 // 1MB max message
        });
        // Setup connection handlers
        if (this.wss) {
            this.wss.on('connection', this.handleConnection.bind(this));
            this.wss.on('error', (error) => {
                utils_1.logger.error('events/websocket', 'WebSocket server error', { error: String(error) });
                this.emit('error', error);
            });
        }
        // Start heartbeat check
        this.startHeartbeat();
        // Connect to event bus for broadcasting
        this.connectToEventBus();
        utils_1.logger.info('events/websocket', 'WebSocket server started', { port: this.serverPort });
        this.emit('started', { port: this.serverPort });
    }
    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        if (this.clients.size >= this.maxClients) {
            ws.close(1013, 'Server at capacity');
            return;
        }
        // Generate client ID
        const clientId = this.generateClientId();
        // Parse subscriptions from URL query params
        const subscriptions = new Set();
        if (req.url) {
            const url = new URL(req.url, `http://localhost:${this.serverPort}`);
            const subs = url.searchParams.get('subscriptions');
            if (subs) {
                subs.split(',').forEach((sub) => subscriptions.add(sub.trim()));
            }
        }
        // Create client info
        const clientInfo = {
            id: clientId,
            ws,
            connectedAt: new Date(),
            subscriptions,
            isAlive: true
        };
        this.clients.set(clientId, clientInfo);
        // Send welcome message
        this.sendToClient(clientId, 'connected', {
            clientId,
            subscriptions: Array.from(subscriptions),
            serverTime: Date.now()
        });
        // Setup client event handlers
        ws.on('pong', () => this.handlePong(clientId));
        ws.on('message', (data) => this.handleMessage(clientId, data));
        ws.on('close', () => this.handleDisconnect(clientId));
        ws.on('error', (error) => {
            utils_1.logger.error('events/websocket', 'WebSocket client error', { clientId, error: String(error) });
        });
        // Emit connection event
        this.emit('client_connected', {
            clientId,
            clientCount: this.clients.size
        });
        utils_1.logger.info('events/websocket', 'Client connected', { clientId, totalClients: this.clients.size });
    }
    /**
     * Handle incoming message from client
     */
    handleMessage(clientId, data) {
        try {
            const message = JSON.parse(data.toString());
            const client = this.clients.get(clientId);
            if (!client)
                return;
            switch (message.type) {
                case 'subscribe':
                    this.handleSubscribe(clientId, message.topics);
                    break;
                case 'unsubscribe':
                    this.handleUnsubscribe(clientId, message.topics);
                    break;
                case 'ping':
                    this.sendToClient(clientId, 'pong', { timestamp: Date.now() });
                    break;
                default:
                    utils_1.logger.warn('events/websocket', 'Unknown message type', { clientId, type: message.type });
            }
        }
        catch (error) {
            utils_1.logger.error('events/websocket', 'Error handling message', { clientId, error: String(error) });
        }
    }
    /**
     * Handle client subscription
     */
    handleSubscribe(clientId, topics) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        topics.forEach((topic) => client.subscriptions.add(topic));
        this.sendToClient(clientId, 'subscribed', { topics });
    }
    /**
     * Handle client unsubscription
     */
    handleUnsubscribe(clientId, topics) {
        const client = this.clients.get(clientId);
        if (!client)
            return;
        topics.forEach((topic) => client.subscriptions.delete(topic));
        this.sendToClient(clientId, 'unsubscribed', { topics });
    }
    /**
     * Handle pong response (heartbeat)
     */
    handlePong(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            client.isAlive = true;
        }
    }
    /**
     * Handle client disconnect
     */
    handleDisconnect(clientId) {
        const client = this.clients.get(clientId);
        if (client) {
            this.clients.delete(clientId);
            this.emit('client_disconnected', {
                clientId,
                clientCount: this.clients.size,
                duration: Date.now() - client.connectedAt.getTime()
            });
            utils_1.logger.info('events/websocket', 'Client disconnected', { clientId, remainingClients: this.clients.size });
        }
    }
    /**
     * Start heartbeat interval
     */
    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            this.clients.forEach((client, clientId) => {
                if (!client.isAlive) {
                    client.ws.terminate();
                    this.clients.delete(clientId);
                    this.emit('client_timed_out', { clientId });
                    utils_1.logger.warn('events/websocket', 'Client timed out', { clientId });
                }
                else {
                    client.isAlive = false;
                    client.ws.ping();
                }
            });
        }, 30000); // 30 second heartbeat
    }
    /**
     * Connect to event bus for automatic broadcasting
     */
    connectToEventBus() {
        // EventBus integration - will be implemented when EventBus module is ready
        // try {
        //   this.eventBus = getEventBus();
        //   this.eventBus.on('*', (event: string, data: any) => {
        //     this.broadcast({ event, data });
        //   });
        //   console.log('Connected to event bus for automatic broadcasting');
        // } catch (error) {
        //   logger.warn('events/websocket', 'Could not connect to event bus', { error: String(error) });
        // }
        utils_1.logger.info('events/websocket', 'Event bus integration pending module implementation');
    }
    /**
     * Broadcast event to connected clients
     */
    broadcast(options) {
        const { event, data, filter } = options;
        const message = JSON.stringify({
            event,
            data,
            timestamp: Date.now()
        });
        let targetClients = Array.from(this.clients.values());
        // Apply subscription filter if specified
        if (filter) {
            targetClients = targetClients.filter(filter);
        }
        // Send to target clients
        let sentCount = 0;
        targetClients.forEach((client) => {
            if (client.ws.readyState === ws_1.WebSocket.OPEN) {
                client.ws.send(message);
                sentCount++;
            }
        });
        this.emit('broadcast', { event, clientCount: sentCount });
    }
    /**
     * Send message to specific client
     */
    sendToClient(clientId, event, data) {
        const client = this.clients.get(clientId);
        if (!client || client.ws.readyState !== ws_1.WebSocket.OPEN) {
            return false;
        }
        const message = JSON.stringify({ event, data, timestamp: Date.now() });
        client.ws.send(message);
        return true;
    }
    /**
     * Broadcast to specific topic subscribers
     */
    broadcastToTopic(topic, data) {
        const message = JSON.stringify({
            event: topic,
            data,
            timestamp: Date.now()
        });
        let sentCount = 0;
        this.clients.forEach((client) => {
            if (client.ws.readyState === ws_1.WebSocket.OPEN &&
                client.subscriptions.has(topic)) {
                client.ws.send(message);
                sentCount++;
            }
        });
        this.emit('broadcast_to_topic', { topic, clientCount: sentCount });
    }
    /**
     * Get current client count
     */
    getClientCount() {
        return this.clients.size;
    }
    /**
     * Get client info
     */
    getClientInfo(clientId) {
        return this.clients.get(clientId);
    }
    /**
     * Get all clients
     */
    getAllClients() {
        return Array.from(this.clients.values());
    }
    /**
     * Generate unique client ID
     */
    generateClientId() {
        return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Stop the WebSocket server
     */
    async stop() {
        // Stop heartbeat
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        // Close all client connections
        this.clients.forEach((client, clientId) => {
            client.ws.close(1001, 'Server shutting down');
        });
        this.clients.clear();
        // Close server
        if (this.wss) {
            await new Promise((resolve) => {
                this.wss.close(() => resolve());
            });
            this.wss = null;
        }
        utils_1.logger.info('events/websocket', 'WebSocket server stopped');
        this.emit('stopped');
    }
}
exports.WebSocketManager = WebSocketManager;
/**
 * Singleton instance
 */
let instance = null;
function getWebSocketManager() {
    if (!instance) {
        instance = new WebSocketManager();
    }
    return instance;
}
function startWebSocketServer(port) {
    const manager = new WebSocketManager({ port });
    return manager.start().then(() => manager);
}
//# sourceMappingURL=websocket.js.map