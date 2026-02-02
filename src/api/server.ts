/**
 * Express REST API Server for Dash v3
 * 
 * Production-ready API with authentication, rate limiting, and CORS.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer, Server as HttpServer } from 'http';
import { SwarmRepository } from '../storage/repositories/SwarmRepository';
import { AgentRepository } from '../storage/repositories/AgentRepository';
import { EventRepository } from '../storage/repositories/EventRepository';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/ratelimit';
import { errorHandler } from './middleware/error';
import { startWebSocketServer } from './websocket';

export interface ServerConfig {
  port: number;
  host: string;
  apiKey: string;
  corsOrigins: string[];
  rateLimit: number;
}

const DEFAULT_CONFIG: ServerConfig = {
  port: 7373,
  host: 'localhost',
  apiKey: process.env['DASH_API_KEY'] || 'dash-api-key',
  corsOrigins: parseCorsOrigins(process.env['DASH_CORS_ORIGINS']),
  rateLimit: parseInt(process.env['DASH_RATE_LIMIT'] || '100', 10)
};

function parseCorsOrigins(envValue: string | undefined): string[] {
  if (!envValue) {
    return ['http://localhost:3000'];
  }
  // Split by comma and trim whitespace
  return envValue.split(',').map(origin => origin.trim());
}

function getIdParam(req: Request): string {
  const id = req.params['id'];
  return Array.isArray(id) ? id[0] : (id || '');
}

export function createApp(config: Partial<ServerConfig> = {}) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const app = express();

  // Security middleware (disabled for now)
  // app.use(helmet());
  app.use(cors({
    origin: cfg.corsOrigins,
    credentials: true
  }));
  
  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Rate limiting
  app.use(rateLimitMiddleware(cfg.rateLimit));

  // Authentication
  app.use(authMiddleware(cfg.apiKey));

  // Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', version: '3.0.0' });
  });

  // API Routes
  app.use('/api', createApiRoutes());

  // Error handling
  app.use(errorHandler);

  return app;
}

function createApiRoutes() {
  const router = express.Router();
  const swarmRepo = new SwarmRepository();
  const agentRepo = new AgentRepository();
  const eventRepo = new EventRepository();

  // Swarm endpoints
  router.post('/swarm', async (req: Request, res: Response) => {
    try {
      const { name, config } = req.body;
      console.log('Creating swarm:', { name, config, body: req.body });
      const swarm = await swarmRepo.create({ name, config, status: 'running' });
      res.status(201).json(swarm);
    } catch (error) {
      console.error('Swarm creation error:', error);
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/swarm/:id', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);
      const swarm = await swarmRepo.findById(id);
      if (!swarm) {
        res.status(404).json({ error: 'Swarm not found' });
        return;
      }
      res.json(swarm);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.delete('/swarm/:id', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);
      await swarmRepo.delete(id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Agent endpoints
  router.get('/agents', async (_req: Request, res: Response) => {
    try {
      const agents = await agentRepo.list();
      res.json(agents);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/agents', async (req: Request, res: Response) => {
    try {
      const agent = await agentRepo.create(req.body);
      res.status(201).json(agent);
    } catch (error) {
      res.status(400).json({ error: (error as Error).message });
    }
  });

  router.get('/agents/:id', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);
      const agent = await agentRepo.findById(id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json(agent);
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  router.post('/agents/:id/kill', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);
      await agentRepo.updateStatus(id, 'failed');
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: (error as Error).message });
    }
  });

  // Event endpoints (SSE)
  router.get('/events', async (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const sendEvent = (data: unknown) => {
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
  router.post('/events', async (req: Request, res: Response) => {
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
    } catch (error) {
      console.error('Event creation error:', error);
      res.status(500).json({ error: 'Failed to create event: ' + (error as Error).message });
    }
  });

  return router;
}

export async function startServer(config: Partial<ServerConfig> = {}): Promise<HttpServer> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Initialize database first
  const { getDb } = require('../storage/sqlite');
  await getDb({ dbPath: './dash.db' });
  
  const app = createApp(cfg);
  const server = createServer(app);

  // Start WebSocket server
  startWebSocketServer(server, cfg.apiKey);

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
