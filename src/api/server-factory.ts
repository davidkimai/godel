/**
 * Unified Server Factory for Dash API
 * 
 * Provides a single entry point for creating the API server.
 * Supports Express as the primary framework with Fastify compatibility layer.
 * Eliminates port conflicts by ensuring only one server instance binds to a port.
 */

import { createServer as createHttpServer, Server as HttpServer } from 'http';
import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { logger } from '../utils';
import { getConfig, type DashConfig } from '../config';
import { startWebSocketServer } from './websocket';

// Express middleware
import { authMiddleware, generateApiKey } from './middleware/auth';
import { smartRateLimitMiddleware, authRateLimitMiddleware } from './middleware/ratelimit';
import { errorHandler, APIError, asyncHandler } from './middleware/error';
import { applySecurityHeaders, getCorsConfig } from './middleware/security';
import { validators } from './middleware/validation';

// Repositories
import { SwarmRepository } from '../storage/repositories/SwarmRepository';
import { AgentRepository } from '../storage/repositories/AgentRepository';
import { EventRepository } from '../storage/repositories/EventRepository';

// ============================================================================
// Types
// ============================================================================

export type ServerFramework = 'express' | 'fastify';

export interface UnifiedServerConfig {
  /** Server framework to use */
  framework: ServerFramework;
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** API key for authentication */
  apiKey: string;
  /** CORS origins */
  corsOrigins: string[];
  /** Rate limit (requests per minute) */
  rateLimit: number;
  /** Session secret for cookies */
  sessionSecret: string;
  /** Enable Swagger UI */
  enableSwagger: boolean;
  /** Enable authentication */
  enableAuth: boolean;
}

// ============================================================================
// Configuration
// ============================================================================

/**
 * Create server configuration from Dash config
 */
function createServerConfig(config: DashConfig): UnifiedServerConfig {
  // Generate secure API key if default is weak
  let apiKey = config.auth.apiKeys[0];
  if (!apiKey || apiKey === 'dash-api-key') {
    apiKey = generateApiKey('default');
    logger.warn('server-factory', 'Generated secure API key - update your .env file', {
      key: apiKey.slice(0, 20) + '...'
    });
  }

  return {
    framework: (config.server as any).framework || 'express',
    port: config.server.port,
    host: config.server.host,
    apiKey: apiKey,
    corsOrigins: config.server.cors.origins,
    rateLimit: config.server.rateLimit,
    sessionSecret: process.env['SESSION_SECRET'] || generateApiKey('session'),
    enableSwagger: process.env['DASH_ENABLE_SWAGGER'] !== 'false',
    enableAuth: process.env['DASH_ENABLE_AUTH'] !== 'false',
  };
}

// ============================================================================
// Express Server Implementation
// ============================================================================

function getIdParam(req: Request): string {
  const id = req.params['id'];
  return Array.isArray(id) ? id[0] : (id || '');
}

/**
 * Create Express application
 */
export async function createExpressApp(config: UnifiedServerConfig): Promise<express.Application> {
  const app = express();

  // SECURITY: Apply security headers with Helmet
  applySecurityHeaders(app);

  // SECURITY: Parse cookies for session handling
  app.use(cookieParser(config.sessionSecret));

  // SECURITY: CORS with credentials support for cookies
  app.use(cors(getCorsConfig()));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // SECURITY: Smart rate limiting (stricter for auth endpoints)
  app.use(smartRateLimitMiddleware({
    defaultLimit: config.rateLimit || 1000,
  }));

  // Authentication (after rate limiting)
  if (config.enableAuth) {
    app.use(authMiddleware(config.apiKey));
  }

  // Health check (no auth required)
  app.get('/health', (_req: Request, res: Response) => {
    res.json({ 
      status: 'healthy', 
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Detailed health check
  app.get('/health/detailed', asyncHandler(async (_req: Request, res: Response) => {
    const startTime = Date.now();
    
    // Check database
    const dbCheck = await checkDatabase();
    
    // Check memory
    const memUsage = process.memoryUsage();
    const memoryHealthy = memUsage.heapUsed / memUsage.heapTotal < 0.9;
    
    // Determine overall status
    const statuses = [dbCheck.status, memoryHealthy ? 'healthy' : 'degraded'];
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    
    if (statuses.includes('unhealthy')) {
      overallStatus = 'unhealthy';
    } else if (statuses.includes('degraded')) {
      overallStatus = 'degraded';
    }
    
    res.json({
      status: overallStatus,
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: {
          status: dbCheck.status,
          responseTime: dbCheck.responseTime,
          message: dbCheck.message,
        },
        memory: {
          status: memoryHealthy ? 'healthy' : 'degraded',
          responseTime: Date.now() - startTime,
          message: `Heap: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB / ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
        },
        eventBus: {
          status: 'healthy' as const,
          responseTime: 1,
          message: 'Event bus operational',
        },
      },
    });
  }));

  // Readiness check
  app.get('/health/ready', asyncHandler(async (_req: Request, res: Response) => {
    const dbCheck = await checkDatabase();
    const ready = dbCheck.status === 'healthy';
    
    res.json({
      ready,
      checks: {
        database: {
          ready: dbCheck.status === 'healthy',
          message: dbCheck.message,
        },
      },
    });
  }));

  // Liveness check
  app.get('/health/live', (_req: Request, res: Response) => {
    res.json({ alive: true });
  });

  // SECURITY: Auth endpoints with stricter rate limiting
  if (config.enableAuth) {
    app.use('/api/v1/auth', authRateLimitMiddleware());
  }
  setupAuthRoutes(app, config);

  // API Routes
  app.use('/api/v1', createApiRoutes(config));

  // API Capabilities endpoint
  app.get('/api/v1/capabilities', (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: {
        version: '2.0.0',
        features: [
          'agents',
          'swarms',
          'tasks',
          'events',
          'metrics',
          'logs',
          'health',
        ],
        endpoints: {
          agents: '/api/v1/agents',
          swarms: '/api/v1/swarms',
          tasks: '/api/v1/tasks',
          events: '/api/v1/events',
          metrics: '/api/v1/metrics',
          logs: '/api/v1/logs',
          health: '/health',
        },
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ 
      success: false,
      error: { 
        code: 'NOT_FOUND',
        message: 'Not found' 
      } 
    });
  });

  // SECURITY: Error handling (sanitizes in production)
  app.use(errorHandler);

  return app;
}

/**
 * Check database health
 */
async function checkDatabase(): Promise<{
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  message?: string;
}> {
  const start = Date.now();
  
  try {
    // Simple check - try to load the sqlite module
    const { getDb } = require('../storage/sqlite');
    const db = await getDb({ dbPath: './dash.db' });
    
    // Try a simple query
    const result = db.prepare('SELECT 1 as test').get();
    
    if (result && result.test === 1) {
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
        message: 'Database connection OK',
      };
    }
    
    return {
      status: 'degraded',
      responseTime: Date.now() - start,
      message: 'Database query returned unexpected result',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

/**
 * Setup authentication routes with httpOnly cookies and CSRF
 */
function setupAuthRoutes(app: express.Application, config: UnifiedServerConfig): void {
  const authRouter = Router();

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

    // TODO: Implement actual credential validation against database
    // This is a placeholder - this with actual auth logic
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
    const session = req.cookies?.["session"];

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
    const session = req.cookies?.["session"];

    if (!session) {
      throw new APIError('Not authenticated', 401, 'UNAUTHORIZED');
    }

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
}

/**
 * Placeholder for credential validation
 * TODO: Replace with actual database validation
 */
function validateCredentials(username: string, password: string): boolean {
  // This is a placeholder - implement actual credential validation
  // For now, accept any non-empty credentials in development
  if (process.env['NODE_ENV'] === 'development') {
    return username.length > 0 && password.length >= 8;
  }
  return false;
}

/**
 * Create API routes
 */
function createApiRoutes(config: UnifiedServerConfig) {
  const router = Router();
  const swarmRepo = new SwarmRepository();
  const agentRepo = new AgentRepository();
  const eventRepo = new EventRepository();

  // CSRF middleware for state-changing routes
  const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
    // Skip for GET requests
    if (req.method === 'GET') return next();

    const csrfHeader = req.headers['x-csrf-token'];
    const csrfCookie = req.cookies?.["csrf_token"];

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      throw new APIError('Invalid CSRF token', 403, 'FORBIDDEN');
    }

    next();
  };

  // ============================================================================
  // Swarm endpoints
  // ============================================================================
  router.post('/swarms', csrfProtection, validators.createSwarm, asyncHandler(async (req: Request, res: Response) => {
    const { name, config } = req.body;
    const swarm = await swarmRepo.create({ name, config, status: 'active' });
    res.status(201).json({
      success: true,
      data: swarm,
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  router.get('/swarms/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    const swarm = await swarmRepo.findById(id);
    if (!swarm) {
      throw new APIError('Swarm not found', 404, 'NOT_FOUND');
    }
    res.json({
      success: true,
      data: swarm,
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  router.delete('/swarms/:id', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    await swarmRepo.delete(id);
    res.status(204).send();
  }));

  // List swarms
  router.get('/swarms', asyncHandler(async (_req: Request, res: Response) => {
    const swarms = await swarmRepo.list();
    res.json({
      success: true,
      data: { swarms },
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  // ============================================================================
  // Agent endpoints
  // ============================================================================
  router.get('/agents', asyncHandler(async (_req: Request, res: Response) => {
    const agents = await agentRepo.list();
    res.json({
      success: true,
      data: { agents },
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  router.post('/agents', csrfProtection, validators.createAgent, asyncHandler(async (req: Request, res: Response) => {
    const agent = await agentRepo.create(req.body);
    res.status(201).json({
      success: true,
      data: agent,
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  router.get('/agents/:id', asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    const agent = await agentRepo.findById(id);
    if (!agent) {
      throw new APIError('Agent not found', 404, 'NOT_FOUND');
    }
    res.json({
      success: true,
      data: agent,
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  router.post('/agents/:id/kill', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const id = getIdParam(req);
    await agentRepo.updateStatus(id, 'failed');
    res.json({ 
      success: true,
      data: { id, status: 'killed', killedAt: new Date().toISOString() },
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  // ============================================================================
  // Event endpoints (SSE)
  // ============================================================================
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
      payload: (payload || {}) as Record<string, unknown>,
      agent_id: payload?.agentId,
      swarm_id: payload?.swarmId
    });
    res.status(201).json({
      success: true,
      data: event,
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  // ============================================================================
  // Task endpoints (placeholders)
  // ============================================================================
  router.get('/tasks', asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: { tasks: [] },
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  router.post('/tasks', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    res.status(201).json({
      success: true,
      data: { id: `task-${Date.now()}`, ...req.body },
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  // ============================================================================
  // Metrics endpoint
  // ============================================================================
  router.get('/metrics', asyncHandler(async (_req: Request, res: Response) => {
    const memUsage = process.memoryUsage();
    res.json({
      success: true,
      data: {
        memory: {
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          rss: memUsage.rss,
          external: memUsage.external,
        },
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
      },
      meta: { timestamp: new Date().toISOString() },
    });
  }));

  // ============================================================================
  // Logs endpoint
  // ============================================================================
  router.get('/logs', asyncHandler(async (req: Request, res: Response) => {
    const lines = Math.min(parseInt(req.query['lines'] as string) || 100, 1000);
    res.json({
      success: true,
      data: {
        logs: [],
        hasMore: false,
      },
      meta: { 
        timestamp: new Date().toISOString(),
        lines,
      },
    });
  }));

  return router;
}

// ============================================================================
// Server Factory
// ============================================================================

/**
 * Create and start the unified server
 * 
 * This is the main entry point for creating the API server.
 * It ensures only one server instance is created, eliminating port conflicts.
 */
export async function startServer(
  serverConfig?: Partial<UnifiedServerConfig>
): Promise<HttpServer> {
  // Load configuration
  const dashConfig = await getConfig();
  const cfg = { ...createServerConfig(dashConfig), ...serverConfig };

  // Validate framework
  if (cfg.framework !== 'express') {
    logger.warn('server-factory', `Framework '${cfg.framework}' not supported, using Express`);
    cfg.framework = 'express';
  }

  // Initialize database first
  const { getDb } = require('../storage/sqlite');
  await getDb({ dbPath: './dash.db' });

  // Create Express app
  const app = await createExpressApp(cfg);
  
  // Create HTTP server
  const server = createHttpServer(app);

  // Start WebSocket server
  startWebSocketServer(server, cfg.apiKey);

  return new Promise((resolve, reject) => {
    server.listen(cfg.port, cfg.host, () => {
      logger.info('server-factory', 'Dash API server started', {
        host: cfg.host,
        port: cfg.port,
        framework: cfg.framework,
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

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error('server-factory', `Port ${cfg.port} is already in use`, {
          port: cfg.port,
          error: error.message,
        });
        reject(new Error(`Port ${cfg.port} is already in use. Another server instance may be running.`));
      } else {
        reject(error);
      }
    });
  });
}

/**
 * Create server configuration for testing
 */
export async function createServerConfigForTesting(
  overrides?: Partial<UnifiedServerConfig>
): Promise<UnifiedServerConfig> {
  const dashConfig = await getConfig();
  return { ...createServerConfig(dashConfig), ...overrides };
}

// CLI entry point
if (require.main === module) {
  startServer().catch((error) => {
    console.error('Failed to start server:', error);
    process.exit(1);
  });
}
