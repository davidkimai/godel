"use strict";
/**
 * WebSocket Server for Dash v3
 *
 * Real-time event streaming with authentication and topic subscriptions.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.wsEventBus = void 0;
exports.startWebSocketServer = startWebSocketServer;
exports.publishEvent = publishEvent;
exports.getConnectedClients = getConnectedClients;
const ws_1 = require("ws");
const events_1 = require("events");
// Event bus for internal communication
exports.wsEventBus = new events_1.EventEmitter();
const clients = new Map();
let wss = null;
function startWebSocketServer(server, apiKey) {
    wss = new ws_1.WebSocketServer({
        server,
        path: '/events'
    });
    wss.on('connection', (ws, req) => {
        // Extract token from query string
        const url = new URL(req.url || '', `http://${req.headers.host}`);
        const token = url.searchParams.get('token');
        const client = {
            ws,
            topics: new Set(),
            authenticated: token === apiKey,
            lastPing: Date.now()
        };
        clients.set(ws, client);
        if (!client.authenticated) {
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Authentication required. Provide ?token=API_KEY'
            }));
            ws.close(1008, 'Authentication required');
            return;
        }
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            message: 'Connected to Dash event stream'
        }));
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleMessage(ws, message);
            }
            catch {
                ws.send(JSON.stringify({
                    type: 'error',
                    message: 'Invalid JSON'
                }));
            }
        });
        ws.on('pong', () => {
            const c = clients.get(ws);
            if (c) {
                c.lastPing = Date.now();
            }
        });
        ws.on('close', () => {
            clients.delete(ws);
        });
    });
    // Heartbeat to detect disconnected clients
    const heartbeat = setInterval(() => {
        const now = Date.now();
        clients.forEach((client, ws) => {
            if (now - client.lastPing > 60000) {
                ws.terminate();
                clients.delete(ws);
                return;
            }
            ws.ping();
        });
    }, 30000);
    // Listen for internal events and broadcast
    exports.wsEventBus.on('event', (event) => {
        broadcast(event);
    });
    wss.on('close', () => {
        clearInterval(heartbeat);
    });
    return wss;
}
function handleMessage(ws, message) {
    const client = clients.get(ws);
    if (!client)
        return;
    switch (message.action) {
        case 'subscribe':
            if (message.topics) {
                message.topics.forEach(topic => client.topics.add(topic));
                ws.send(JSON.stringify({
                    type: 'subscribed',
                    topics: Array.from(client.topics)
                }));
            }
            break;
        case 'unsubscribe':
            if (message.topics) {
                message.topics.forEach(topic => client.topics.delete(topic));
            }
            break;
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;
        default:
            ws.send(JSON.stringify({
                type: 'error',
                message: `Unknown action: ${message.action}`
            }));
    }
}
function broadcast(event) {
    const message = JSON.stringify(event);
    clients.forEach((client) => {
        if (!client.authenticated)
            return;
        // Check if client is subscribed to this event's topic
        const topic = event.topic || '*';
        const isSubscribed = Array.from(client.topics).some(subscribedTopic => {
            return matchesTopic(topic, subscribedTopic);
        });
        if (isSubscribed || client.topics.has('*')) {
            client.ws.send(message);
        }
    });
}
function matchesTopic(eventTopic, subscribedTopic) {
    // Wildcard matching: * matches single segment, # matches any depth
    const eventParts = eventTopic.split('.');
    const subscribedParts = subscribedTopic.split('.');
    for (let i = 0; i < subscribedParts.length; i++) {
        const part = subscribedParts[i];
        if (part === '#')
            return true; // Multi-level wildcard
        if (part === '*')
            continue; // Single-level wildcard
        if (part !== eventParts[i])
            return false;
    }
    return eventParts.length === subscribedParts.length;
}
function publishEvent(event) {
    exports.wsEventBus.emit('event', event);
}
function getConnectedClients() {
    return clients.size;
}
//# sourceMappingURL=websocket.js.map