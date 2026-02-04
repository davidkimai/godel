/**
 * Express REST API Server for Dash v3
 * 
 * Production-ready API with authentication, rate limiting, and CORS.
 * Uses the centralized configuration system.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer, Server as HttpServer } from 'http';
import { logger } from '../utils';
import { SwarmRepository } from '../storage/repositories/SwarmRepository';
import { AgentRepository } from '../storage/repositories/AgentRepository';
import { EventRepository } from '../storage/repositories/EventRepository';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/ratelimit';
import { errorHandler } from './middleware/error';
import { validators } from './middleware/validation';
import { startWebSocketServer } from './websocket';
import { getConfig, type DashConfig } from '../config';

export interface ServerConfig {
  port: number;
  host: string;
  apiKey: string;
  corsOrigins: string[];
  rateLimit: number;
}

/**
 * Create server configuration from Dash config
 */
function createServerConfig(config: DashConfig): ServerConfig {
  return {
    port: config.server.port,
    host: config.server.host,
    apiKey: config.auth.apiKeys[0] || 'dash-api-key',
    corsOrigins: config.server.cors.origins,
    rateLimit: config.server.rateLimit,
  };
}

function getIdParam(req: Request): string {
  const id = req.params['id'];
  return Array.isArray(id) ? id[0] : (id || '');
}

export function createApp(serverConfig?: ServerConfig) {
  return async function(): Promise<express.Application> {
    // Load configuration if not provided
    let cfg: ServerConfig;
    if (serverConfig) {
      cfg = serverConfig;
    } else {
      const dashConfig = await getConfig();
      cfg = createServerConfig(dashConfig);
    }
    
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

    // Config endpoint (for debugging, requires auth)
    app.get('/config', async (_req: Request, res: Response) => {
      const dashConfig = await getConfig();
      // Return non-sensitive config values
      res.json({
        env: dashConfig.env,
        server: {
          port: dashConfig.server.port,
          host: dashConfig.server.host,
        },
        features: dashConfig.features,
        logging: {
          level: dashConfig.logging.level,
          format: dashConfig.logging.format,
        },
        metrics: {
          enabled: dashConfig.metrics.enabled,
        },
      });
    });

    // API Routes
    app.use('/api', createApiRoutes());

    // Error handling
    app.use(errorHandler);

    return app;
  };
}

function createApiRoutes() {
  const router = express.Router();
  const swarmRepo = new SwarmRepository();
  const agentRepo = new AgentRepository();
  const eventRepo = new EventRepository();

  // Swarm endpoints
  router.post('/swarm', validators.createSwarm, async (req: Request, res: Response) => {
    try {
      const { name, config } = req.body;
      const swarm = await swarmRepo.create({ name, config, status: 'active' });
      res.status(201).json(swarm);
    } catch (error) {
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

  router.post('/agents', validators.createAgent, async (req: Request, res: Response) => {
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
  router.post('/events', validators.createEvent, async (req: Request, res: Response) => {
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
      res.status(500).json({ error: 'Failed to create event: ' + (error as Error).message });
    }
  });

  return router;
}

export async function startServer(serverConfig?: Partial<ServerConfig>): Promise<HttpServer> {
  // Load configuration
  const dashConfig = await getConfig();
  const cfg = { ...createServerConfig(dashConfig), ...serverConfig };
  
  // Initialize database first
  const { getDb } = require('../storage/sqlite');
  await getDb({ dbPath: './dash.db' });
  
  const app = await createApp(cfg)();
  const server = createServer(app);

  // Start WebSocket server
  startWebSocketServer(server, cfg.apiKey);

  return new Promise((resolve) => {
    server.listen(cfg.port, cfg.host, () => {
      logger.info('api/server', 'Dash API server started', { 
        host: cfg.host, 
        port: cfg.port,
        websocket: `ws://${cfg.host}:${cfg.port}/events`,
        env: dashConfig.env
      });
      resolve(server);
    });
  });
}

// CLI entry point
if (require.main === module) {
  startServer().catch(console.error);
}
