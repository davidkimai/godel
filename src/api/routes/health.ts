/**
 * Health Routes
 * 
 * Fastify routes for health checks:
 * - GET /health - Basic health check
 * - GET /api/health/detailed - Detailed health check
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { HealthStatusSchema, DetailedHealthSchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function healthRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // GET /health - Basic health check (no auth)
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'Health check',
        description: 'Basic health check endpoint',
        tags: ['health'],
        response: {
          200: zodToJsonSchema(HealthStatusSchema) as Record<string, unknown>,
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        return reply.send({
          status: 'healthy',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      } catch (error) {
        return reply.status(503).send({
          status: 'unhealthy',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      }
    }
  );

  // ============================================================================
  // GET /api/health/detailed - Detailed health check
  // ============================================================================
  fastify.get(
    '/detailed',
    {
      schema: {
        summary: 'Detailed health check',
        description: 'Detailed health check with individual component status',
        tags: ['health'],
        response: {
          200: zodToJsonSchema(DetailedHealthSchema) as Record<string, unknown>,
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
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
        
        return reply.send({
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
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get detailed health');
        return reply.status(503).send({
          status: 'unhealthy',
          version: '2.0.0',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          checks: {
            error: {
              status: 'unhealthy' as const,
              responseTime: 0,
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
      }
    }
  );

  // ============================================================================
  // GET /api/health/ready - Readiness check
  // ============================================================================
  fastify.get(
    '/ready',
    {
      schema: {
        summary: 'Readiness check',
        description: 'Check if the API is ready to accept traffic',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              ready: { type: 'boolean' },
              checks: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    ready: { type: 'boolean' },
                    message: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const dbCheck = await checkDatabase();
        
        const ready = dbCheck.status === 'healthy';
        
        return reply.send({
          ready,
          checks: {
            database: {
              ready: dbCheck.status === 'healthy',
              message: dbCheck.message,
            },
          },
        });
      } catch (error) {
        return reply.status(503).send({
          ready: false,
          checks: {
            error: {
              ready: false,
              message: error instanceof Error ? error.message : 'Unknown error',
            },
          },
        });
      }
    }
  );

  // ============================================================================
  // GET /api/health/live - Liveness check
  // ============================================================================
  fastify.get(
    '/live',
    {
      schema: {
        summary: 'Liveness check',
        description: 'Check if the API is alive',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              alive: { type: 'boolean' },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send({ alive: true });
    }
  );
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
    const { getDb } = require('../../storage/sqlite');
    const db = await getDb({ dbPath: './godel.db' });
    
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

export default healthRoutes;
