/**
 * Unified Server Factory for Dash API
 * 
 * Provides a single entry point for creating the API server.
 * Supports Express as the primary framework with Fastify compatibility layer.
 * Eliminates port conflicts by ensuring only one server instance binds to a port.
 */

import { logger } from '../utils/logger';
import { createServer as createHttpServer, Server as HttpServer } from 'http';
import express, { Request, Response, NextFunction, Router } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { timingSafeEqual } from 'crypto';
import { Client as PgClient } from 'pg';
import Redis from 'ioredis';
import WebSocket from 'ws';
import { getConfig, type DashConfig } from '../config';
import { startWebSocketServer } from './websocket';

// Express middleware
import {
  authMiddleware,
  generateApiKey,
  registerSessionToken,
  revokeSessionToken,
} from './middleware/auth';
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
  const compatibilitySunset = process.env['DASH_API_COMPAT_SUNSET'] || 'Wed, 31 Dec 2026 23:59:59 GMT';

  // SECURITY: Apply security headers with Helmet
  applySecurityHeaders(app);

  // SECURITY: Parse cookies for session handling
  app.use(cookieParser(config.sessionSecret));

  // SECURITY: CORS with credentials support for cookies
  app.use(cors(getCorsConfig()));

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Mark compatibility API namespace as deprecated, preserving runtime support.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.path === '/api' || req.path.startsWith('/api/')) && !req.path.startsWith('/api/v1/')) {
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', compatibilitySunset);
      res.setHeader('Link', '</api/v1>; rel="successor-version"');
    }
    next();
  });

  // SECURITY: Smart rate limiting (stricter for auth endpoints)
  app.use(smartRateLimitMiddleware({
    defaultLimit: config.rateLimit || 1000,
  }));

  // Authentication (after rate limiting)
  if (config.enableAuth) {
    app.use(authMiddleware(config.apiKey));
  }

  const healthHandler = asyncHandler(async (_req: Request, res: Response) => {
    const health = await collectDependencyHealth();
    const statusCode = health.status === 'unhealthy' ? 503 : 200;
    res.status(statusCode).json({
      status: health.status,
      version: '2.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: health.checks,
    });
  });

  // Root health routes.
  app.get('/health', healthHandler);
  app.get('/health/detailed', healthHandler);
  app.get('/health/ready', asyncHandler(async (_req: Request, res: Response) => {
    const health = await collectDependencyHealth();
    const blocking = Object.entries(health.checks).find(([, value]) => value.required && value.status !== 'healthy');

    if (!blocking) {
      res.json({ status: 'ready' });
      return;
    }

    res.status(503).json({
      status: 'not ready',
      reason: `${blocking[0]} unavailable`,
      checks: health.checks,
    });
  }));
  app.get('/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  // API-prefixed compatibility aliases.
  app.get('/api/v1/health', healthHandler);
  app.get('/api/v1/health/detailed', healthHandler);
  app.get('/api/v1/health/ready', asyncHandler(async (_req: Request, res: Response) => {
    const health = await collectDependencyHealth();
    const blocking = Object.entries(health.checks).find(([, value]) => value.required && value.status !== 'healthy');
    if (!blocking) {
      res.json({ status: 'ready' });
      return;
    }
    res.status(503).json({ status: 'not ready', reason: `${blocking[0]} unavailable`, checks: health.checks });
  }));
  app.get('/api/v1/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  app.get('/api/health', healthHandler);
  app.get('/api/health/detailed', healthHandler);
  app.get('/api/health/ready', asyncHandler(async (_req: Request, res: Response) => {
    const health = await collectDependencyHealth();
    const blocking = Object.entries(health.checks).find(([, value]) => value.required && value.status !== 'healthy');
    if (!blocking) {
      res.json({ status: 'ready' });
      return;
    }
    res.status(503).json({ status: 'not ready', reason: `${blocking[0]} unavailable`, checks: health.checks });
  }));
  app.get('/api/health/live', (_req: Request, res: Response) => {
    res.json({ status: 'alive', timestamp: new Date().toISOString() });
  });

  const openApiSpec = buildOpenApiDocument(config);
  app.get('/api/v1/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });
  app.get('/api/openapi.json', (_req: Request, res: Response) => {
    res.json(openApiSpec);
  });

  // SECURITY: Auth endpoints with stricter rate limiting
  if (config.enableAuth) {
    app.use('/api/v1/auth', authRateLimitMiddleware());
    app.use('/api/auth', authRateLimitMiddleware());
  }
  setupAuthRoutes(app, config);

  // API Routes
  const apiRouter = await createApiRoutes(config);
  app.use('/api/v1', apiRouter);
  app.use('/api', apiRouter);

  // API Capabilities endpoint
  const capabilitiesHandler = (_req: Request, res: Response) => {
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
  };
  app.get('/api/v1/capabilities', capabilitiesHandler);
  app.get('/api/capabilities', capabilitiesHandler);

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

interface DependencyCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  message?: string;
  required: boolean;
}

interface CombinedDependencyHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: DependencyCheckResult;
    redis: DependencyCheckResult;
    openclaw: DependencyCheckResult;
  };
}

function parseBooleanEnv(value: string | undefined, defaultValue = false): boolean {
  if (value == null) return defaultValue;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function resolveDatabaseUrl(): string | undefined {
  const explicit = process.env['DATABASE_URL'] || process.env['TEST_DATABASE_URL'];
  if (explicit && explicit.trim().length > 0) return explicit;

  const host = process.env['POSTGRES_HOST'];
  const port = process.env['POSTGRES_PORT'] || '5432';
  const db = process.env['POSTGRES_DB'] || 'dash';
  const user = process.env['POSTGRES_USER'] || 'dash';
  const password = process.env['POSTGRES_PASSWORD'] || 'dash';

  if (host && host.trim().length > 0) {
    return `postgresql://${user}:${password}@${host}:${port}/${db}`;
  }

  return undefined;
}

/**
 * Check database health
 */
async function checkDatabase(): Promise<DependencyCheckResult> {
  const start = Date.now();
  const timeoutMs = Number(process.env['DASH_HEALTH_TIMEOUT_MS'] || 2000);
  const databaseUrl = resolveDatabaseUrl();

  if (databaseUrl && databaseUrl.startsWith('postgres')) {
    const client = new PgClient({
      connectionString: databaseUrl,
      connectionTimeoutMillis: timeoutMs,
    });

    try {
      await withTimeout(client.connect(), timeoutMs, 'postgres connect timeout');
      await withTimeout(client.query('SELECT 1 AS ok'), timeoutMs, 'postgres query timeout');
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
        message: 'PostgreSQL connection OK',
        required: true,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTime: Date.now() - start,
        message: error instanceof Error ? error.message : 'PostgreSQL connection failed',
        required: true,
      };
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  try {
    const { getDb } = await import('../storage/sqlite');
    const dbPath = process.env['DASH_SQLITE_PATH'] || './dash.db';
    const db = await withTimeout(getDb({ dbPath }), timeoutMs, 'sqlite init timeout');
    const result = await withTimeout(db.get('SELECT 1 as ok'), timeoutMs, 'sqlite query timeout');

    if (result?.ok === 1) {
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
        message: 'SQLite connection OK',
        required: true,
      };
    }

    return {
      status: 'degraded',
      responseTime: Date.now() - start,
      message: 'SQLite health query returned unexpected response',
      required: true,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'SQLite connection failed',
      required: true,
    };
  }
}

async function checkRedis(): Promise<DependencyCheckResult> {
  const start = Date.now();
  const timeoutMs = Number(process.env['DASH_HEALTH_TIMEOUT_MS'] || 2000);
  const required = parseBooleanEnv(process.env['DASH_HEALTH_REQUIRE_REDIS'], false);
  const redisUrl = process.env['REDIS_URL']
    || process.env['TEST_REDIS_URL']
    || `redis://${process.env['REDIS_HOST'] || '127.0.0.1'}:${process.env['REDIS_PORT'] || '6379'}/${process.env['REDIS_DB'] || '0'}`;
  const redis = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: timeoutMs,
  });

  try {
    await withTimeout(redis.connect(), timeoutMs, 'redis connect timeout');
    const pong = await withTimeout(redis.ping(), timeoutMs, 'redis ping timeout');
    if (pong === 'PONG') {
      return {
        status: 'healthy',
        responseTime: Date.now() - start,
        message: 'Redis ping OK',
        required,
      };
    }

    return {
      status: required ? 'unhealthy' : 'degraded',
      responseTime: Date.now() - start,
      message: `Unexpected Redis ping response: ${pong}`,
      required,
    };
  } catch (error) {
    return {
      status: required ? 'unhealthy' : 'degraded',
      responseTime: Date.now() - start,
      message: error instanceof Error ? error.message : 'Redis unavailable',
      required,
    };
  } finally {
    redis.disconnect();
  }
}

async function checkOpenClaw(): Promise<DependencyCheckResult> {
  const start = Date.now();
  const timeoutMs = Number(process.env['DASH_HEALTH_TIMEOUT_MS'] || 2000);
  const required = parseBooleanEnv(
    process.env['DASH_OPENCLAW_REQUIRED'] || process.env['OPENCLAW_REQUIRED'],
    false
  );
  const openclawUrlFromList = process.env['OPENCLAW_GATEWAY_URLS']
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean)[0];
  const gatewayUrl = process.env['OPENCLAW_GATEWAY_URL'] || openclawUrlFromList || 'ws://127.0.0.1:18789';

  return new Promise<DependencyCheckResult>((resolve) => {
    const ws = new WebSocket(gatewayUrl);
    const timeout = setTimeout(() => {
      ws.terminate();
      resolve({
        status: required ? 'unhealthy' : 'degraded',
        responseTime: Date.now() - start,
        message: `Gateway probe timeout (${gatewayUrl})`,
        required,
      });
    }, timeoutMs);

    ws.once('open', () => {
      clearTimeout(timeout);
      ws.close();
      resolve({
        status: 'healthy',
        responseTime: Date.now() - start,
        message: `Gateway reachable (${gatewayUrl})`,
        required,
      });
    });

    ws.once('error', (error) => {
      clearTimeout(timeout);
      resolve({
        status: required ? 'unhealthy' : 'degraded',
        responseTime: Date.now() - start,
        message: error.message,
        required,
      });
    });
  });
}

async function collectDependencyHealth(): Promise<CombinedDependencyHealth> {
  const [database, redis, openclaw] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkOpenClaw(),
  ]);

  const checks = { database, redis, openclaw };
  const requiredFailures = Object.values(checks).some((check) => check.required && check.status === 'unhealthy');
  const hasDegradation = Object.values(checks).some((check) => check.status !== 'healthy');

  return {
    status: requiredFailures ? 'unhealthy' : hasDegradation ? 'degraded' : 'healthy',
    checks,
  };
}

function buildOpenApiDocument(config: UnifiedServerConfig): Record<string, unknown> {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Dash API',
      version: '2.0.0',
      description: 'Dash orchestration API compatibility contract',
    },
    servers: [
      { url: `http://${config.host}:${config.port}/api/v1`, description: 'Versioned API' },
      { url: `http://${config.host}:${config.port}/api`, description: 'Deprecated compatibility API' },
    ],
    paths: {
      '/health': { get: { summary: 'Health check' } },
      '/health/live': { get: { summary: 'Liveness check' } },
      '/health/ready': { get: { summary: 'Readiness check' } },
      '/agents': { get: { summary: 'List agents' }, post: { summary: 'Create agent' } },
      '/swarms': { get: { summary: 'List swarms' }, post: { summary: 'Create swarm' } },
      '/tasks': { get: { summary: 'List tasks' }, post: { summary: 'Create task' } },
      '/metrics': { get: { summary: 'Metrics endpoint' } },
      '/logs': { get: { summary: 'Logs endpoint' } },
    },
  };
}

/**
 * Setup authentication routes with httpOnly cookies and CSRF
 */
function setupAuthRoutes(app: express.Application, config: UnifiedServerConfig): void {
  const authRouter = Router();
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
    const role = username === (process.env['DASH_ADMIN_USERNAME'] || 'admin') ? 'admin' : 'user';
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
  const configuredUsername = process.env['DASH_ADMIN_USERNAME'];
  const configuredPassword = process.env['DASH_ADMIN_PASSWORD'];

  if (configuredUsername && configuredPassword) {
    return secureStringCompare(username, configuredUsername) && secureStringCompare(password, configuredPassword);
  }

  // Explicit opt-in for development-only credential fallback.
  if (process.env['NODE_ENV'] !== 'production' && process.env['DASH_ALLOW_DEV_AUTH'] === 'true') {
    return username.length > 0 && password.length >= 8;
  }

  return false;
}

/**
 * Create API routes
 */
async function createApiRoutes(config: UnifiedServerConfig) {
  const router = Router();
  const swarmRepo = new SwarmRepository();
  const agentRepo = new AgentRepository();
  const eventRepo = new EventRepository();
  await Promise.all([
    swarmRepo.initialize(),
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
    let swarm;
    try {
      swarm = await swarmRepo.findById(id);
    } catch (error) {
      if (isInvalidUuidError(error)) {
        throw new APIError('Swarm not found', 404, 'NOT_FOUND');
      }
      throw error;
    }
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

  router.post('/agents', csrfProtection, asyncHandler(async (req: Request, res: Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const swarmId = body['swarm_id'] ?? body['swarmId'];
    const task = body['task'];
    const model = body['model'];

    if (typeof swarmId !== 'string' || swarmId.length === 0) {
      throw new APIError('swarm_id (or swarmId) is required', 400, 'BAD_REQUEST');
    }
    if (typeof task !== 'string' || task.trim().length === 0) {
      throw new APIError('task is required', 400, 'BAD_REQUEST');
    }
    if (typeof model !== 'string' || model.trim().length === 0) {
      throw new APIError('model is required', 400, 'BAD_REQUEST');
    }

    const agent = await agentRepo.create({
      ...body,
      swarm_id: swarmId,
      task,
      model,
      budget_limit: (body['budget_limit'] as number | undefined) ?? (body['budgetLimit'] as number | undefined),
    });
    res.status(201).json({
      success: true,
      data: agent,
      meta: { timestamp: new Date().toISOString() },
    });
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
      swarm_id: typeof payload['swarmId'] === 'string' ? payload['swarmId'] : undefined
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

function isInvalidUuidError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('invalid input syntax for type uuid');
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
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}
