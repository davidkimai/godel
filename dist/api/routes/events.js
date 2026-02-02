"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupWebSocketEvents = setupWebSocketEvents;
const express_1 = require("express");
const EventRepository_1 = require("../../storage/repositories/EventRepository");
const router = (0, express_1.Router)();
// GET /api/events - List events
router.get('/', async (req, res) => {
    try {
        const repo = new EventRepository_1.EventRepository();
        const { agentId, swarmId, type, severity, since, limit = '100', } = req.query;
        const filters = {};
        if (agentId)
            filters.agentId = agentId;
        if (swarmId)
            filters.swarmId = swarmId;
        if (type)
            filters.types = [type];
        if (severity)
            filters.severity = severity;
        if (since)
            filters.since = new Date(since);
        const events = await repo.findByFilter(filters, {
            limit: parseInt(limit, 10),
        });
        res.json({ events });
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});
// POST /api/events - Create a new event
router.post('/', async (req, res) => {
    try {
        const repo = new EventRepository_1.EventRepository();
        const { eventType, payload, timestamp } = req.body;
        const event = await repo.create({
            type: eventType,
            source: 'api',
            payload: JSON.stringify(payload || {}),
            agent_id: payload?.agentId,
            swarm_id: payload?.swarmId
        });
        res.status(201).json(event);
    }
    catch (error) {
        res.status(500).json({ error: 'Failed to create event' });
    }
});
// GET /api/events/stream - SSE endpoint
router.get('/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    // Send initial connection message
    res.write('data: {"type":"connected"}\n\n');
    // Keep connection alive
    const keepAlive = setInterval(() => {
        res.write(':keepalive\n\n');
    }, 30000);
    // Clean up on close
    req.on('close', () => {
        clearInterval(keepAlive);
    });
});
// WebSocket handler setup
function setupWebSocketEvents(wss) {
    wss.on('connection', (ws, req) => {
        console.log('WebSocket client connected for events');
        // Send welcome message
        ws.send(JSON.stringify({
            type: 'connected',
            timestamp: new Date().toISOString(),
        }));
        // Handle subscriptions
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                if (message.action === 'subscribe') {
                    // Client wants to subscribe to specific events
                    console.log('Client subscribed to:', message.events);
                }
            }
            catch {
                // Invalid message, ignore
            }
        });
        ws.on('close', () => {
            console.log('WebSocket client disconnected');
        });
        ws.on('error', (error) => {
            console.error('WebSocket error:', error);
        });
    });
}
exports.default = router;
//# sourceMappingURL=events.js.map