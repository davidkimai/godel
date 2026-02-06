/**
 * Fastify REST API Server for Dash v2
 * 
 * Production-ready API with:
 * - Authentication (X-API-Key, Bearer tokens)
 * - Rate limiting
 * - CORS
 * - OpenAPI/Swagger documentation
 * - WebSocket support
 * - Comprehensive error handling
 */

import { logger } from '../utils/logger';
import Fastify, { FastifyInstance, FastifyError } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';

// Routes
import agentRoutes from './routes/agents';
import swarmRoutes from './routes/swarms';
import taskRoutes from './routes/tasks';
import busRoutes from './routes/bus';
import logsRoutes from './routes/logs';
import capabilitiesRoutes from './routes/capabilities';
import metricsApiRoutes from './routes/metrics';
import { healthRoutes } from './health';
import { metricsRoutes as collectorMetricsRoutes, setupMetricsPlugin } from '../metrics/collector';
import { setupCorrelationMiddleware, tracingRoutes } from '../tracing/correlation';

// Middleware
import authPlugin, { AuthConfig } from './middleware/auth-fastify';

export interface FastifyServerConfig {
  /** Server port */
  port: number;
  /** Server host */
  host: string;
  /** API key for authentication */
  apiKey: string;
  /** CORS origins */
  corsOrigins: string[];
  /** Rate limit requests per minute */
  rateLimit: number;
  /** Enable Swagger UI */
  enableSwagger: boolean;
  /** Enable authentication */
  enableAuth: boolean;
  /** JWT secret for Bearer tokens */
  jwtSecret?: string;
}

const DEFAULT_CONFIG: FastifyServerConfig = {
  port: 7373,
  host: '0.0.0.0',
  apiKey: process.env['DASH_API_KEY'] || 'dash-api-key',
  corsOrigins: parseCorsOrigins(process.env['DASH_CORS_ORIGINS']),
  rateLimit: parseInt(process.env['DASH_RATE_LIMIT'] || '100', 10),
  enableSwagger: process.env['DASH_ENABLE_SWAGGER'] !== 'false',
  enableAuth: process.env['DASH_ENABLE_AUTH'] !== 'false',
  jwtSecret: process.env['DASH_JWT_SECRET'],
};

function parseCorsOrigins(envValue: string | undefined): string[] {
  if (!envValue) {
    return ['http://localhost:3000', 'http://localhost:5173'];
  }
  return envValue.split(',').map(origin => origin.trim());
}

/**
 * Create and configure the Fastify server
 */
export async function createFastifyServer(
  config: Partial<FastifyServerConfig> = {}
): Promise<FastifyInstance> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const compatibilitySunset = process.env['DASH_API_COMPAT_SUNSET'] || 'Wed, 31 Dec 2026 23:59:59 GMT';
  
  // Create Fastify instance
  const fastify = Fastify({
    logger: {
      level: 'info',
    },
    genReqId: () => `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  });

  // Mark legacy compatibility surface as deprecated while preserving runtime behavior.
  fastify.addHook('onSend', async (request, reply, payload) => {
    const rawUrl = request.raw.url || request.url || '';
    const path = rawUrl.split('?')[0] || '';
    const isCompatPath = (path === '/api' || path.startsWith('/api/')) && !path.startsWith('/api/v1/');

    if (isCompatPath) {
      reply.header('Deprecation', 'true');
      reply.header('Sunset', compatibilitySunset);
      reply.header('Link', '</api/v1>; rel="successor-version"');
    }

    return payload;
  });
  
  // Register plugins
  
  // CORS
  await fastify.register(cors, {
    origin: cfg.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  });
  
  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https:'],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
  });
  
  // Rate limiting
  await fastify.register(rateLimit, {
    max: cfg.rateLimit,
    timeWindow: '1 minute',
    keyGenerator: (req) => {
      return req.ip || 'unknown';
    },
    errorResponseBuilder: (req, context) => ({
      success: false,
      error: {
        code: 'RATE_LIMITED',
        message: `Rate limit exceeded. Retry after ${context.after}`,
      },
    }),
  });
  
  // Swagger/OpenAPI documentation
  if (cfg.enableSwagger) {
    await fastify.register(swagger, {
      openapi: {
        info: {
          title: 'Dash API',
          description: 'Dash Agent Orchestration Platform API',
          version: '2.0.0',
          contact: {
            name: 'Dash Team',
          },
        },
        servers: [
          {
            url: `http://localhost:${cfg.port}`,
            description: 'Development server',
          },
        ],
        components: {
          securitySchemes: {
            apiKey: {
              type: 'apiKey',
              name: 'X-API-Key',
              in: 'header',
            },
            bearerAuth: {
              type: 'http',
              scheme: 'bearer',
              bearerFormat: 'JWT',
            },
          },
        },
        security: [
          { apiKey: [] },
          { bearerAuth: [] },
        ],
        tags: [
          { name: 'capabilities', description: 'API discovery' },
          { name: 'agents', description: 'Agent management' },
          { name: 'swarms', description: 'Swarm orchestration' },
          { name: 'tasks', description: 'Task management' },
          { name: 'bus', description: 'Event bus' },
          { name: 'metrics', description: 'System metrics' },
          { name: 'logs', description: 'Log querying' },
          { name: 'health', description: 'Health checks' },
        ],
      },
    });
    
    await fastify.register(swaggerUi, {
      routePrefix: '/api/v1/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: true,
      },
      staticCSP: true,
    });
  }
  
  // Authentication
  if (cfg.enableAuth) {
    const authConfig: AuthConfig = {
      apiKey: cfg.apiKey,
      jwtSecret: cfg.jwtSecret,
      publicRoutes: [
        '/health',
        '/health/detailed',
        '/health/ready',
        '/health/live',
        '/api/v1/openapi.json',
        '/api/v1/docs',
        '/api/v1/docs/*',
        '/api/v1/capabilities',
        '/api/openapi.json',
        '/api/capabilities',
      ],
    };
    await fastify.register(authPlugin, authConfig);
  }
  
  // Error handler
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    fastify.log.error({
      err: error,
      req: {
        id: request.id,
        method: request.method,
        url: request.url,
      },
    }, 'Request error');
    
    const statusCode = error.statusCode || 500;
    
    reply.status(statusCode).send({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message,
        ...(process.env['NODE_ENV'] === 'development' && {
          stack: error.stack,
        }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        requestId: request.id,
      },
    });
  });
  
  // Not found handler
  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
      meta: {
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        requestId: request.id,
      },
    });
  });

  // Setup observability middleware
  setupCorrelationMiddleware(fastify);
  setupMetricsPlugin(fastify);

  // Register routes
  
  // Public health check (no prefix)
  await fastify.register(healthRoutes, { prefix: '/health' });

  // Tracing endpoints for correlation ID management
  await fastify.register(tracingRoutes, { prefix: '/trace' });

  // API routes
  await fastify.register(capabilitiesRoutes, { prefix: '/api/v1/capabilities' });
  await fastify.register(healthRoutes, { prefix: '/api/v1/health' });
  await fastify.register(agentRoutes, { prefix: '/api/v1/agents' });
  await fastify.register(swarmRoutes, { prefix: '/api/v1/swarms' });
  await fastify.register(taskRoutes, { prefix: '/api/v1/tasks' });
  await fastify.register(busRoutes, { prefix: '/api/v1/bus' });
  await fastify.register(metricsApiRoutes, { prefix: '/api/v1/metrics' });
  await fastify.register(logsRoutes, { prefix: '/api/v1/logs' });

  // Compatibility aliases for /api/*
  await fastify.register(capabilitiesRoutes, { prefix: '/api/capabilities' });
  await fastify.register(healthRoutes, { prefix: '/api/health' });
  await fastify.register(agentRoutes, { prefix: '/api/agents' });
  await fastify.register(swarmRoutes, { prefix: '/api/swarms' });
  await fastify.register(taskRoutes, { prefix: '/api/tasks' });
  await fastify.register(busRoutes, { prefix: '/api/bus' });
  await fastify.register(metricsApiRoutes, { prefix: '/api/metrics' });
  await fastify.register(logsRoutes, { prefix: '/api/logs' });

  // Collector metrics endpoints (Prometheus/ops) at root
  await fastify.register(collectorMetricsRoutes);
  
  // OpenAPI JSON endpoint
  fastify.get('/api/v1/openapi.json', async (_request, reply) => {
    return reply.send(fastify.swagger());
  });
  fastify.get('/api/openapi.json', async (_request, reply) => {
    return reply.send(fastify.swagger());
  });
  
  return fastify;
}

/**
 * Start the Fastify server
 */
export async function startFastifyServer(
  config: Partial<FastifyServerConfig> = {}
): Promise<FastifyInstance> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const fastify = await createFastifyServer(cfg);
  
  try {
    await fastify.listen({ port: cfg.port, host: cfg.host });
    
    logger.info('api/fastify', 'Dash Fastify API server started', {
      host: cfg.host,
      port: cfg.port,
      swagger: cfg.enableSwagger ? `http://${cfg.host}:${cfg.port}/api/v1/docs` : 'disabled',
      openapi: `http://${cfg.host}:${cfg.port}/api/v1/openapi.json`,
    });
    
    return fastify;
  } catch (error) {
    fastify.log.error({ err: error }, 'Failed to start server');
    throw error;
  }
}

// CLI entry point
if (require.main === module) {
  startFastifyServer().catch((error) => {
    logger.error('Failed to start server:', error);
    process.exit(1);
  });
}

export default createFastifyServer;
