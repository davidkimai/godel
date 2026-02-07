/**
 * Express REST API Server for Godel v3
 *
 * Production-ready API with authentication, rate limiting, and CORS.
 * Uses the centralized configuration system.
 * SECURITY: Includes Helmet, CSRF protection, secure cookies, and sanitized errors.
 */

import { logger } from '../utils/logger';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { timingSafeEqual } from 'crypto';
import { createServer, Server as HttpServer } from 'http';
import { TeamRepository } from '../storage/repositories/TeamRepository';
import { AgentRepository } from '../storage/repositories/AgentRepository';
import { EventRepository } from '../storage/repositories/EventRepository';
import {
  authMiddleware,
  generateApiKey,
  registerSessionToken,
  revokeSessionToken,
} from './middleware/auth';
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
 * Create server configuration from Godel config
 */
function createServerConfig(config: DashConfig): ServerConfig {
  // Generate secure API key if default is weak
  let apiKey = config.auth.apiKeys[0];
  if (!apiKey || apiKey === 'godel-api-key') {
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
    sessionSecret: process.env['SESSION_SECRET'] || generateApiKey('session'),
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
    app.use('/api/v1/auth', authRateLimitMiddleware());
    app.use('/api/auth', authRateLimitMiddleware());
    setupAuthRoutes(app, cfg);

    // API Routes
    const apiRouter = await createApiRoutes();
    app.use('/api/v1', apiRouter);
    app.use('/api', apiRouter);

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
  const sessionTtlMs = 24 * 60 * 60 * 1000;

  // Generate CSRF token endpoint
  authRouter.get('/csrf', (req: Request, res: Response) => {
    const csrfToken = generateApiKey('csrf').slice(0, 32);
    res.cookie('csrf_token', csrfToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
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

    const isValid = await validateCredentials(username, password);

    if (!isValid) {
      throw new APIError('Invalid credentials', 401, 'UNAUTHORIZED');
    }

    // Generate session token
    const sessionToken = generateApiKey('session');
    const csrfToken = generateApiKey('csrf').slice(0, 32);
    const role = username === (process.env['GODEL_ADMIN_USERNAME'] || 'admin') ? 'admin' : 'user';
    const expiresAt = Date.now() + sessionTtlMs;
    sessionStore.set(sessionToken, { username, role, expiresAt });
    registerSessionToken(sessionToken, expiresAt);

    // SECURITY: Set httpOnly session cookie (not accessible to JavaScript)
    res.cookie('session', sessionToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    // Set CSRF token cookie (readable by JS for requests)
    res.cookie('csrf_token', csrfToken, {
      httpOnly: false, // Client needs to read this
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    // Return user info and CSRF token in header
    res.setHeader('X-CSRF-Token', csrfToken);
    res.json({
      success: true,
      user: {
        id: `user-${username}`,
        username,
        role,
      },
      csrfToken,
    });
  }));

  // Logout - clears session cookie
  authRouter.post('/logout', (req: Request, res: Response) => {
    const sessionToken = req.cookies?.['session'];
    if (sessionToken) {
      sessionStore.delete(sessionToken);
      revokeSessionToken(sessionToken);
    }
    res.clearCookie('session');
    res.clearCookie('csrf_token');
    res.json({ success: true });
  });

  // Get current user
  authRouter.get('/me', (req: Request, res: Response) => {
    const sessionToken = req.cookies?.["session"];

    if (!sessionToken) {
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const session = sessionStore.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
      if (sessionToken) {
        sessionStore.delete(sessionToken);
        revokeSessionToken(sessionToken);
      }
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    res.json({
      success: true,
      user: {
        id: `user-${session.username}`,
        username: session.username,
        role: session.role,
      },
    });
  });

  // Refresh session
  authRouter.post('/refresh', (req: Request, res: Response) => {
    const sessionToken = req.cookies?.["session"];

    if (!sessionToken) {
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    const session = sessionStore.get(sessionToken);
    if (!session || session.expiresAt < Date.now()) {
      sessionStore.delete(sessionToken);
      revokeSessionToken(sessionToken);
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

    session.expiresAt = Date.now() + sessionTtlMs;
    sessionStore.set(sessionToken, session);
    registerSessionToken(sessionToken, session.expiresAt);

    const newCsrfToken = generateApiKey('csrf').slice(0, 32);

    res.cookie('csrf_token', newCsrfToken, {
      httpOnly: false,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.setHeader('X-CSRF-Token', newCsrfToken);
    res.json({ success: true, csrfToken: newCsrfToken });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/auth', authRouter);
}

/**
 * Runtime credential validation for dashboard auth endpoints
 */
const sessionStore = new Map<string, { username: string; role: 'admin' | 'user' | 'readonly'; expiresAt: number }>();

function secureStringCompare(left: string, right: string): boolean {
  const leftBuf = Buffer.from(left, 'utf8');
  const rightBuf = Buffer.from(right, 'utf8');
  if (leftBuf.length !== rightBuf.length) {
    return false;
  }
  return timingSafeEqual(leftBuf, rightBuf);
}

async function validateCredentials(username: string, password: string): Promise<boolean> {
  const configuredUsername = process.env['GODEL_ADMIN_USERNAME'];
  const configuredPassword = process.env['GODEL_ADMIN_PASSWORD'];

  if (configuredUsername && configuredPassword) {
    return secureStringCompare(username, configuredUsername) && secureStringCompare(password, configuredPassword);
  }

  if (process.env['NODE_ENV'] !== 'production' && process.env['GODEL_ALLOW_DEV_AUTH'] === 'true') {
    return username.length > 0 && password.length >= 8;
  }

  return false;
}

async function createApiRoutes() {
  const router = express.Router();
  const teamRepo = new TeamRepository();
  const agentRepo = new AgentRepository();
  const eventRepo = new EventRepository();
  await Promise.all([
    teamRepo.initialize(),
    agentRepo.initialize(),
    eventRepo.initialize(),
  ]);

  // CSRF middleware for state-changing routes
  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Skip for GET requests
    if (req.method === 'GET') return next();

    // API-key authenticated clients are non-browser callers and don't use cookies.
    if (typeof (req as any).apiKey === 'string' && (req as any).apiKey.length > 0) {
      return next();
    }

    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies?.["csrf_token"];

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new APIError('Invalid CSRF token', 403, 'FORBIDDEN');
    }

    next();
  };

  // Team endpoints
  router.post('/team', csrfProtection, validators.createTeam, asyncHandler(async (req: Request, res: Response) => {
    const { name, config } = req.body;
    const team = await teamRepo.create({ name, config, status: 'active' });
    res.status(201).json(team);
  }));

  router.get('/team/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    let team;
    try {
      team = await teamRepo.findById(id);
    } catch (error) {
      if (isInvalidUuidError(error)) {
        throw new APIError('Team not found', 404, 'NOT_FOUND');
      }
      throw error;
    }
    if (!team) {
      throw new APIError('Team not found', 404, 'NOT_FOUND');
    }
    res.json(team);
  }));

  router.delete('/team/:id', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    await teamRepo.delete(id);
    res.status(204).send();
  }));

  // Agent endpoints
  router.get('/agents', asyncHandler(async (_req: Request, res: Response) => {
    const agents = await agentRepo.list();
    res.json(agents);
  }));

  router.post('/agents', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const teamId = body['team_id'] ?? body['teamId'];
    const task = body['task'];
    const model = body['model'];

    if (typeof teamId !== 'string' || teamId.length === 0) {
      throw new APIError('team_id (or teamId) is required', 400, 'BAD_REQUEST');
    }
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new APIError('task is required', 400, 'BAD_REQUEST');
    }
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new APIError('model is required', 400, 'BAD_REQUEST');
    }

    const agent = await agentRepo.create({
      ...body,
      team_id: teamId,
      task,
      model,
      budget_limit: (body['budget_limit'] as number | undefined) ?? (body['budgetLimit'] as number | undefined),
    });
    res.status(201).json(agent);
  }));

  router.get('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    let agent;
    try {
      agent = await agentRepo.findById(id);
    } catch (error) {
      if (isInvalidUuidError(error)) {
        throw new APIError('Agent not found', 404, 'NOT_FOUND');
      }
      throw error;
    }
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
  router.post('/events', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const eventType = body['eventType'] ?? body['type'];
    const payload = (body['payload'] || {}) as Record<string, unknown>;

    if (typeof eventType !== 'string' || eventType.length === 0) {
      throw new APIError('eventType (or type) is required', 400, 'BAD_REQUEST');
    }

    const event = await eventRepo.create({
      type: eventType,
      source: 'self-improvement',
      payload,
      agent_id: typeof payload['agentId'] === 'string' ? payload['agentId'] : undefined,
      team_id: typeof payload['teamId'] === 'string' ? payload['teamId'] : undefined
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
  await getDb({ dbPath: './godel.db' });

  const app = await createApp(cfg)();
  const server = createServer(app);

  // Start WebSocket server
  startWebSocketServer(server, cfg.apiKey);

  return new Promise((resolve) => {
    server.listen(cfg.port, cfg.host, () => {
      logger.info('api/server', 'Godel API server started', {
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
  startServer().catch((error) => {
    logger.error('api/server', 'Failed to start server', {
      error: error instanceof Error ? error.message : String(error),
    });
  });
}

function isInvalidUuidError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('invalid input syntax for type uuid');
}
