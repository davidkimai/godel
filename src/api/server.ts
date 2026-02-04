/**
 * Express REST API Server for Dash v3
 *
 * Production-ready API with authentication, rate limiting, and CORS.
 * Uses the centralized configuration system.
 * SECURITY: Includes Helmet, CSRF protection, secure cookies, and sanitized errors.
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createServer, Server as HttpServer } from 'http';
import { logger } from '../utils';
import { SwarmRepository } from '../storage/repositories/SwarmRepository';
import { AgentRepository } from '../storage/repositories/AgentRepository';
import { EventRepository } from '../storage/repositories/EventRepository';
import { authMiddleware, generateApiKey } from './middleware/auth';
import { rateLimitMiddleware, authRateLimitMiddleware, smartRateLimitMiddleware } from './middleware/ratelimit';
import { errorHandler, APIError, asyncHandler } from './middleware/error';
import { applySecurityHeaders, getCorsConfig } from './middleware/security';
import { validators } from './middleware/validation';
import { startWebSocketServer } from './websocket';
import { getConfig, type DashConfig } from '../config';

export interface ServerConfig {
  port: number;
  host: string;
  apiKey: string;
  corsOrigins: string[];
  rateLimit: number;
  sessionSecret: string;
}

/**
 * Create server configuration from Dash config
 */
function createServerConfig(config: DashConfig): ServerConfig {
  // Generate secure API key if default is weak
  let apiKey = config.auth.apiKeys[0];
  if (!apiKey || apiKey === 'dash-api-key') {
    apiKey = generateApiKey('default');
    logger.warn('api/server', 'Generated secure API key - update your .env file', {
      key: apiKey.slice(0, 20) + '...'
    });
  }

  return {
    port: config.server.port,
    host: config.server.host,
    apiKey: apiKey,
    corsOrigins: config.server.cors.origins,
    rateLimit: config.server.rateLimit,
    sessionSecret: process.env.SESSION_SECRET || generateApiKey('session'),
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

    // SECURITY: Apply security headers with Helmet
    applySecurityHeaders(app);

    // SECURITY: Parse cookies for session handling
    app.use(cookieParser(cfg.sessionSecret));

    // SECURITY: CORS with credentials support for cookies
    app.use(cors(getCorsConfig()));

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // SECURITY: Smart rate limiting (stricter for auth endpoints)
    app.use(smartRateLimitMiddleware({
      defaultLimit: cfg.rateLimit || 1000,
    }));

    // Authentication (after rate limiting)
    app.use(authMiddleware(cfg.apiKey));

    // Health check (no auth required)
    app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', version: '3.0.0' });
    });

    // SECURITY: Auth endpoints with stricter rate limiting
    app.use('/api/auth', authRateLimitMiddleware());
    setupAuthRoutes(app, cfg);

    // API Routes
    app.use('/api', createApiRoutes());

    // 404 handler
    app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // SECURITY: Error handling (sanitizes in production)
    app.use(errorHandler);

    return app;
  };
}

/**
 * Setup authentication routes with httpOnly cookies and CSRF
 */
function setupAuthRoutes(app: express.Application, config: ServerConfig): void {
  const authRouter = express.Router();

  // Generate CSRF token endpoint
  authRouter.get('/csrf', (req: Request, res: Response) => {
    const csrfToken = generateApiKey('csrf').slice(0, 32);
    res.cookie('csrf_token', csrfToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });
    res.json({ csrfToken });
  });

  // Login - validates credentials and sets httpOnly session cookie
  authRouter.post('/login', asyncHandler(async (req: Request, res: Response) => {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      throw new APIError('Username and password required', 400, 'BAD_REQUEST');
    }

    // TODO: Implement actual credential validation against database
    // This is a placeholder - replace with actual auth logic
    const isValid = validateCredentials(username, password);

    if (!isValid) {
      throw new APIError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    // Generate session token
    const sessionToken = generateApiKey('session');
    const csrfToken = generateApiKey('csrf').slice(0, 32);

    // SECURITY: Set httpOnly session cookie (not accessible to JavaScript)
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Set CSRF token cookie (readable by JS for requests)
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Client needs to read this
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Return user info and CSRF token in header
    res.setHeader('X-CSRF-Token', csrfToken);
    res.json({
      success: true,
      user: {
        id: 'user-1',
        username,
        role: 'admin',
      },
      csrfToken,
    });
  }));

  // Logout - clears session cookie
  authRouter.post('/logout', (req: Request, res: Response) => {
    res.clearCookie('session');
    res.clearCookie('csrf_token');
    res.json({ success: true });
  });

  // Get current user
  authRouter.get('/me', (req: Request, res: Response) => {
    const session = req.cookies?.session;

    if (!session) {
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    // TODO: Validate session and return user info
    res.json({
      success: true,
      user: {
        id: 'user-1',
        username: 'admin',
        role: 'admin',
      },
    });
  });

  // Refresh session
  authRouter.post('/refresh', (req: Request, res: Response) => {
    const session = req.cookies?.session;

    if (!session) {
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const newCsrfToken = generateApiKey('csrf').slice(0, 32);

    res.cookie('csrf_token', newCsrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.setHeader('X-CSRF-Token', newCsrfToken);
    res.json({ success: true, csrfToken: newCsrfToken });
  });

  app.use('/api/auth', authRouter);
}

/**
 * Placeholder for credential validation
 * TODO: Replace with actual database validation
 */
function validateCredentials(username: string, password: string): boolean {
  // This is a placeholder - implement actual credential validation
  // For now, accept any non-empty credentials in development
  if (process.env.NODE_ENV === 'development') {
    return username.length > 0 && password.length >= 8;
  }
  return false;
}

function createApiRoutes() {
  const router = express.Router();
  const swarmRepo = new SwarmRepository();
  const agentRepo = new AgentRepository();
  const eventRepo = new EventRepository();

  // CSRF middleware for state-changing routes
  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Skip for GET requests
    if (req.method === 'GET') return next();

    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies?.csrf_token;

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new APIError('Invalid CSRF token', 403, 'FORBIDDEN');
    }

    next();
  };

  // Swarm endpoints
  router.post('/swarm', csrfProtection, validators.createSwarm, asyncHandler(async (req: Request, res: Response) => {
    const { name, config } = req.body;
    const swarm = await swarmRepo.create({ name, config, status: 'active' });
    res.status(201).json(swarm);
  }));

  router.get('/swarm/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    const swarm = await swarmRepo.findById(id);
    if (!swarm) {
      throw new APIError('Swarm not found', 404, 'NOT_FOUND');
    }
    res.json(swarm);
  }));

  router.delete('/swarm/:id', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    await swarmRepo.delete(id);
    res.status(204).send();
  }));

  // Agent endpoints
  router.get('/agents', asyncHandler(async (_req: Request, res: Response) => {
    const agents = await agentRepo.list();
    res.json(agents);
  }));

  router.post('/agents', csrfProtection, validators.createAgent, asyncHandler(async (req: Request, res: Response) => {
    const agent = await agentRepo.create(req.body);
    res.status(201).json(agent);
  }));

  router.get('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    const agent = await agentRepo.findById(id);
    if (!agent) {
      throw new APIError('Agent not found', 404, 'NOT_FOUND');
    }
    res.json(agent);
  }));

  router.post('/agents/:id/kill', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    await agentRepo.updateStatus(id, 'failed');
    res.json({ success: true });
  }));

  // Event endpoints (SSE)
  router.get('/events', asyncHandler(async (_req: Request, res: Response) => {
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
  }));

  // POST /events - Create a new event
  router.post('/events', csrfProtection, validators.createEvent, asyncHandler(async (req: Request, res: Response) => {
    const { eventType, payload } = req.body;
    const event = await eventRepo.create({
      type: eventType,
      source: 'self-improvement',
      payload: JSON.stringify(payload || {}),
      agent_id: payload?.agentId,
      swarm_id: payload?.swarmId
    });
    res.status(201).json(event);
  }));

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
        env: dashConfig.env,
        security: {
          rateLimiting: true,
          helmet: true,
          csrf: true,
          httpOnlyCookies: true,
        }
      });
      resolve(server);
    });
  });
}

// CLI entry point
if (require.main === module) {
  startServer().catch(console.error);
}
