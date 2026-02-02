"use strict";
/**
 * Express REST API Server for Dash v3
 *
 * Production-ready API with authentication, rate limiting, and CORS.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
exports.startServer = startServer;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const http_1 = require("http");
const SwarmRepository_1 = require("../storage/repositories/SwarmRepository");
const AgentRepository_1 = require("../storage/repositories/AgentRepository");
const EventRepository_1 = require("../storage/repositories/EventRepository");
const auth_1 = require("./middleware/auth");
const ratelimit_1 = require("./middleware/ratelimit");
const error_1 = require("./middleware/error");
const websocket_1 = require("./websocket");
const DEFAULT_CONFIG = {
    port: 7373,
    host: 'localhost',
    apiKey: process.env['DASH_API_KEY'] || 'dash-api-key',
    corsOrigins: ['http://localhost:3000'],
    rateLimit: 100
};
function getIdParam(req) {
    const id = req.params['id'];
    return Array.isArray(id) ? id[0] : (id || '');
}
function createApp(config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const app = (0, express_1.default)();
    // Security middleware (disabled for now)
    // app.use(helmet());
    app.use((0, cors_1.default)({
        origin: cfg.corsOrigins,
        credentials: true
    }));
    // Body parsing
    app.use(express_1.default.json({ limit: '10mb' }));
    app.use(express_1.default.urlencoded({ extended: true }));
    // Rate limiting
    app.use((0, ratelimit_1.rateLimitMiddleware)(cfg.rateLimit));
    // Authentication
    app.use((0, auth_1.authMiddleware)(cfg.apiKey));
    // Health check (no auth required)
    app.get('/health', (_req, res) => {
        res.json({ status: 'ok', version: '3.0.0' });
    });
    // API Routes
    app.use('/api', createApiRoutes());
    // Error handling
    app.use(error_1.errorHandler);
    return app;
}
function createApiRoutes() {
    const router = express_1.default.Router();
    const swarmRepo = new SwarmRepository_1.SwarmRepository();
    const agentRepo = new AgentRepository_1.AgentRepository();
    const eventRepo = new EventRepository_1.EventRepository();
    // Swarm endpoints
    router.post('/swarm', async (req, res) => {
        try {
            const { name, config } = req.body;
            console.log('Creating swarm:', { name, config, body: req.body });
            const swarm = await swarmRepo.create({ name, config, status: 'running' });
            res.status(201).json(swarm);
        }
        catch (error) {
            console.error('Swarm creation error:', error);
            res.status(400).json({ error: error.message });
        }
    });
    router.get('/swarm/:id', async (req, res) => {
        try {
            const id = getIdParam(req);
            const swarm = await swarmRepo.findById(id);
            if (!swarm) {
                res.status(404).json({ error: 'Swarm not found' });
                return;
            }
            res.json(swarm);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.delete('/swarm/:id', async (req, res) => {
        try {
            const id = getIdParam(req);
            await swarmRepo.delete(id);
            res.status(204).send();
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // Agent endpoints
    router.get('/agents', async (_req, res) => {
        try {
            const agents = await agentRepo.list();
            res.json(agents);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.post('/agents', async (req, res) => {
        try {
            const agent = await agentRepo.create(req.body);
            res.status(201).json(agent);
        }
        catch (error) {
            res.status(400).json({ error: error.message });
        }
    });
    router.get('/agents/:id', async (req, res) => {
        try {
            const id = getIdParam(req);
            const agent = await agentRepo.findById(id);
            if (!agent) {
                res.status(404).json({ error: 'Agent not found' });
                return;
            }
            res.json(agent);
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    router.post('/agents/:id/kill', async (req, res) => {
        try {
            const id = getIdParam(req);
            await agentRepo.updateStatus(id, 'failed');
            res.json({ success: true });
        }
        catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
    // Event endpoints (SSE)
    router.get('/events', async (_req, res) => {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        const sendEvent = (data) => {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        };
        // Send initial events
        const events = await eventRepo.list({ limit: 10 });
        events.forEach(event => sendEvent(event));
        // Keep connection alive
        const heartbeat = setInterval(() => {
            res.write(':heartbeat\n\n');
        }, 30000);
        res.on('close', () => {
            clearInterval(heartbeat);
        });
    });
    // POST /events - Create a new event
    router.post('/events', async (req, res) => {
        try {
            const { eventType, payload } = req.body;
            const event = await eventRepo.create({
                type: eventType,
                source: 'self-improvement',
                payload: JSON.stringify(payload || {}),
                agent_id: payload?.agentId,
                swarm_id: payload?.swarmId
            });
            res.status(201).json(event);
        }
        catch (error) {
            console.error('Event creation error:', error);
            res.status(500).json({ error: 'Failed to create event: ' + error.message });
        }
    });
    return router;
}
async function startServer(config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    // Initialize database first
    const { getDb } = require('../storage/sqlite');
    await getDb({ dbPath: './dash.db' });
    const app = createApp(cfg);
    const server = (0, http_1.createServer)(app);
    // Start WebSocket server
    (0, websocket_1.startWebSocketServer)(server, cfg.apiKey);
    return new Promise((resolve) => {
        server.listen(cfg.port, cfg.host, () => {
            console.log(`Dash API server running on http://${cfg.host}:${cfg.port}`);
            console.log(`WebSocket server running on ws://${cfg.host}:${cfg.port}/events`);
            resolve(server);
        });
    });
}
// CLI entry point
if (require.main === module) {
    startServer().catch(console.error);
}
//# sourceMappingURL=server.js.map