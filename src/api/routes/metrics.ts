/**
 * Metrics Routes
 * 
 * Fastify routes for metrics:
 * - GET /api/metrics/json - JSON metrics
 * - GET /api/metrics/dashboard - Dashboard stats
 * - GET /api/metrics/cost - Cost metrics
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { MetricsSchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

export async function metricsRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // GET /api/metrics/json - JSON metrics
  // ============================================================================
  fastify.get(
    '/json',
    {
      schema: {
        summary: 'Get JSON metrics',
        description: 'Get system metrics in JSON format',
        tags: ['metrics'],
        response: {
          200: zodToJsonSchema(MetricsSchema) as Record<string, unknown>,
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get memory usage
        const memUsage = process.memoryUsage();
        
        // Build metrics response
        const metrics = {
          timestamp: new Date().toISOString(),
          agents: {
            total: 0,
            running: 0,
            pending: 0,
            completed: 0,
            failed: 0,
          },
          swarms: {
            total: 0,
            active: 0,
          },
          tasks: {
            total: 0,
            pending: 0,
            inProgress: 0,
            completed: 0,
          },
          system: {
            memoryUsed: memUsage.heapUsed,
            memoryTotal: memUsage.heapTotal,
            cpuUsage: 0, // Would need cpu-usage package
            uptime: process.uptime(),
          },
        };
        
        return reply.send(
          createSuccessResponse(metrics, { requestId: _request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get metrics');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get metrics')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/metrics/dashboard - Dashboard stats
  // ============================================================================
  fastify.get(
    '/dashboard',
    {
      schema: {
        summary: 'Get dashboard stats',
        description: 'Get aggregated statistics for the dashboard',
        tags: ['metrics'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  agents: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      running: { type: 'number' },
                      pending: { type: 'number' },
                      completed: { type: 'number' },
                      failed: { type: 'number' },
                    },
                  },
                  swarms: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      active: { type: 'number' },
                    },
                  },
                  tasks: {
                    type: 'object',
                    properties: {
                      total: { type: 'number' },
                      pending: { type: 'number' },
                      inProgress: { type: 'number' },
                      completed: { type: 'number' },
                    },
                  },
                  events: {
                    type: 'object',
                    properties: {
                      totalToday: { type: 'number' },
                      lastHour: { type: 'number' },
                    },
                  },
                  system: {
                    type: 'object',
                    properties: {
                      memoryUsed: { type: 'number' },
                      memoryTotal: { type: 'number' },
                      uptime: { type: 'number' },
                    },
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
        const memUsage = process.memoryUsage();
        
        const stats = {
          agents: {
            total: 0,
            running: 0,
            pending: 0,
            completed: 0,
            failed: 0,
          },
          swarms: {
            total: 0,
            active: 0,
          },
          tasks: {
            total: 0,
            pending: 0,
            inProgress: 0,
            completed: 0,
          },
          events: {
            totalToday: 0,
            lastHour: 0,
          },
          system: {
            memoryUsed: memUsage.heapUsed,
            memoryTotal: memUsage.heapTotal,
            uptime: process.uptime(),
          },
        };
        
        return reply.send(
          createSuccessResponse(stats, { requestId: _request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get dashboard stats');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get dashboard stats')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/metrics/cost - Cost metrics
  // ============================================================================
  fastify.get(
    '/cost',
    {
      schema: {
        summary: 'Get cost metrics',
        description: 'Get cost-related metrics',
        tags: ['metrics'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  totalConsumed: { type: 'number' },
                  totalAllocated: { type: 'number' },
                  remaining: { type: 'number' },
                  percentage: { type: 'number' },
                  byModel: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        model: { type: 'string' },
                        cost: { type: 'number' },
                        tokens: { type: 'number' },
                      },
                    },
                  },
                  byDay: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        date: { type: 'string' },
                        cost: { type: 'number' },
                      },
                    },
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
        const costMetrics = {
          totalConsumed: 0,
          totalAllocated: 0,
          remaining: 0,
          percentage: 0,
          byModel: [],
          byDay: [],
        };
        
        return reply.send(
          createSuccessResponse(costMetrics, { requestId: _request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get cost metrics');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get cost metrics')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/metrics/cost/breakdown - Cost breakdown
  // ============================================================================
  fastify.get(
    '/cost/breakdown',
    {
      schema: {
        summary: 'Get cost breakdown',
        description: 'Get detailed cost breakdown by category',
        tags: ['metrics'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  categories: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        cost: { type: 'number' },
                        percentage: { type: 'number' },
                      },
                    },
                  },
                  total: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const breakdown = {
          categories: [
            { name: 'LLM Calls', cost: 0, percentage: 0 },
            { name: 'Storage', cost: 0, percentage: 0 },
            { name: 'Compute', cost: 0, percentage: 0 },
          ],
          total: 0,
        };
        
        return reply.send(
          createSuccessResponse(breakdown, { requestId: _request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get cost breakdown');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get cost breakdown')
        );
      }
    }
  );
}

export default metricsRoutes;
