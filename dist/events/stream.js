"use strict";
/**
 * Event Stream - WebSocket server for real-time event streaming
 * Handles client connections, filtering, and event broadcasting
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventStream = void 0;
exports.stream = stream;
const ws_1 = require("ws");
const emitter_1 = require("./emitter");
const logger_1 = require("../utils/logger");
class EventStream {
    constructor(emitter) {
        this.wss = null;
        this.connections = new Map();
        this.unsubscribeCallback = null;
        this.server = null;
        this.emitter = emitter || new emitter_1.EventEmitter();
    }
    /**
     * Start WebSocket server
     */
    start(server) {
        return new Promise((resolve, reject) => {
            this.server = server;
            this.wss = new ws_1.Server({ server, path: '/events/stream' });
            this.wss.on('listening', () => {
                logger_1.logger.info(`Event stream server started on /events/stream`);
                this.subscribeToEvents();
                resolve();
            });
            this.wss.on('error', (error) => {
                logger_1.logger.error('WebSocket server error:', { error });
                reject(error);
            });
            this.wss.on('connection', (ws, req) => {
                this.handleConnection(ws, req);
            });
        });
    }
    /**
     * Stop WebSocket server
     */
    stop() {
        return new Promise((resolve) => {
            // Close all connections
            for (const connection of this.connections.values()) {
                this.closeConnection(connection.id, 1000, 'Server shutting down');
            }
            // Unsubscribe from emitter
            if (this.unsubscribeCallback) {
                this.unsubscribeCallback();
                this.unsubscribeCallback = null;
            }
            // Close WebSocket server
            if (this.wss) {
                this.wss.close(() => {
                    this.wss = null;
                    resolve();
                });
            }
            else {
                resolve();
            }
        });
    }
    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws, req) {
        const connectionId = this.generateConnectionId();
        const connection = {
            id: connectionId,
            ws,
            filters: [],
            connectedAt: new Date(),
        };
        // Parse query parameters for initial filter
        const url = new URL(req.url || '/', 'http://localhost');
        const eventTypes = url.searchParams.get('types');
        const agentIds = url.searchParams.get('agents');
        const taskIds = url.searchParams.get('tasks');
        if (eventTypes) {
            connection.filters.push({
                eventTypes: eventTypes.split(','),
            });
        }
        if (agentIds) {
            connection.filters.push({ agentIds: agentIds.split(',') });
        }
        if (taskIds) {
            connection.filters.push({ taskIds: taskIds.split(',') });
        }
        this.connections.set(connectionId, connection);
        // Send connection acknowledgment
        this.sendToConnection(connection, {
            type: 'connected',
            connectionId,
            timestamp: new Date(),
        });
        // Handle messages from client
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(connectionId, message);
            }
            catch (error) {
                logger_1.logger.error('Error parsing WebSocket message:', { error });
                this.sendToConnection(connection, {
                    type: 'error',
                    message: 'Invalid JSON',
                });
            }
        });
        // Handle connection close
        ws.on('close', () => {
            this.connections.delete(connectionId);
            logger_1.logger.info(`Connection ${connectionId} closed. Active connections: ${this.connections.size}`);
        });
        // Handle errors
        ws.on('error', (error) => {
            logger_1.logger.error(`WebSocket error for connection ${connectionId}:`, { error });
        });
        logger_1.logger.info(`New connection: ${connectionId}. Active connections: ${this.connections.size}`);
    }
    /**
     * Handle message from client
     */
    handleMessage(connectionId, message) {
        const connection = this.connections.get(connectionId);
        if (!connection)
            return;
        switch (message['type']) {
            case 'subscribe':
                this.handleSubscribe(connection, message);
                break;
            case 'unsubscribe':
                this.handleUnsubscribe(connection, message);
                break;
            case 'ping':
                this.sendToConnection(connection, { type: 'pong', timestamp: new Date() });
                break;
            case 'setFilter':
                this.handleSetFilter(connection, message);
                break;
            case 'clearFilter':
                this.handleClearFilter(connection);
                break;
            default:
                this.sendToConnection(connection, {
                    type: 'error',
                    message: `Unknown message type: ${message['type']}`,
                });
        }
    }
    /**
     * Handle subscribe request
     */
    handleSubscribe(connection, message) {
        try {
            const filter = message.filter;
            connection.filters.push(filter);
            this.sendToConnection(connection, {
                type: 'subscribed',
                filter,
                timestamp: new Date(),
            });
        }
        catch (error) {
            this.sendToConnection(connection, {
                type: 'error',
                message: 'Invalid filter format',
            });
        }
    }
    /**
     * Handle unsubscribe request
     */
    handleUnsubscribe(connection, message) {
        const filter = message.filter;
        const index = connection.filters.findIndex((f) => this.filtersEqual(f, filter));
        if (index !== -1) {
            connection.filters.splice(index, 1);
            this.sendToConnection(connection, {
                type: 'unsubscribed',
                filter,
                timestamp: new Date(),
            });
        }
    }
    /**
     * Handle set filter request
     */
    handleSetFilter(connection, message) {
        try {
            connection.filters = [message.filter];
            this.sendToConnection(connection, {
                type: 'filterSet',
                filter: message.filter,
                timestamp: new Date(),
            });
        }
        catch (error) {
            this.sendToConnection(connection, {
                type: 'error',
                message: 'Invalid filter format',
            });
        }
    }
    /**
     * Handle clear filter request
     */
    handleClearFilter(connection) {
        connection.filters = [];
        this.sendToConnection(connection, {
            type: 'filterCleared',
            timestamp: new Date(),
        });
    }
    /**
     * Subscribe to events from emitter
     */
    subscribeToEvents() {
        this.unsubscribeCallback = this.emitter.subscribeAll((event) => {
            this.broadcastEvent(event);
        });
    }
    /**
     * Broadcast event to all matching connections
     */
    broadcastEvent(event) {
        for (const connection of this.connections.values()) {
            if (this.matchesFilters(event, connection.filters)) {
                this.sendToConnection(connection, {
                    type: 'event',
                    event,
                });
            }
        }
    }
    /**
     * Check if event matches connection filters
     */
    matchesFilters(event, filters) {
        if (filters.length === 0) {
            return true; // No filters means receive all
        }
        return filters.some((filter) => {
            // Check event types
            if (filter.eventTypes && filter.eventTypes.length > 0) {
                if (!filter.eventTypes.includes(event.eventType)) {
                    return false;
                }
            }
            // Check agent IDs
            if (filter.agentIds && filter.agentIds.length > 0) {
                const eventAgentId = event.source.agentId;
                if (!eventAgentId || !filter.agentIds.includes(eventAgentId)) {
                    return false;
                }
            }
            // Check task IDs
            if (filter.taskIds && filter.taskIds.length > 0) {
                const eventTaskId = event.source.taskId;
                if (!eventTaskId || !filter.taskIds.includes(eventTaskId)) {
                    return false;
                }
            }
            // Check time range
            if (filter.since && event.timestamp < filter.since) {
                return false;
            }
            if (filter.until && event.timestamp > filter.until) {
                return false;
            }
            return true;
        });
    }
    /**
     * Send message to connection
     */
    sendToConnection(connection, data) {
        if (connection.ws.readyState === ws_1.WebSocket.OPEN) {
            connection.ws.send(JSON.stringify(data));
        }
    }
    /**
     * Close connection
     */
    closeConnection(connectionId, code, reason) {
        const connection = this.connections.get(connectionId);
        if (connection && connection.ws.readyState === ws_1.WebSocket.OPEN) {
            connection.ws.close(code, reason);
        }
        this.connections.delete(connectionId);
    }
    /**
     * Generate unique connection ID
     */
    generateConnectionId() {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    /**
     * Compare filters for equality
     */
    filtersEqual(a, b) {
        return (JSON.stringify(a.eventTypes) === JSON.stringify(b.eventTypes) &&
            JSON.stringify(a.agentIds) === JSON.stringify(b.agentIds) &&
            JSON.stringify(a.taskIds) === JSON.stringify(b.taskIds) &&
            a.since?.getTime() === b.since?.getTime() &&
            a.until?.getTime() === b.until?.getTime());
    }
    /**
     * Get connection statistics
     */
    getStats() {
        return {
            totalConnections: this.connections.size,
            connections: Array.from(this.connections.values()).map((c) => ({
                id: c.id,
                filters: c.filters.length,
                connectedAt: c.connectedAt,
            })),
        };
    }
    /**
     * Broadcast to all connections (for system messages)
     */
    broadcast(data) {
        for (const connection of this.connections.values()) {
            this.sendToConnection(connection, data);
        }
    }
}
exports.EventStream = EventStream;
// Streaming function for CLI/API use
async function stream(emitter, filter, onEvent) {
    const events = [];
    const unsubscribe = emitter.subscribeFiltered(filter || {}, (event) => {
        events.push(event);
        if (onEvent) {
            onEvent(event);
        }
    });
    return {
        unsubscribe,
        events,
    };
}
//# sourceMappingURL=stream.js.map