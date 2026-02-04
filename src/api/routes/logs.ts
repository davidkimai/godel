/**
 * Logs Routes
 * 
 * Fastify routes for log operations:
 * - GET /api/logs - Query logs
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { LogEntrySchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { join } from 'path';

// In-memory logs store
const systemLogs: Array<{
  id: string;
  timestamp: string;
  level: string;
  source: string;
  message: string;
  metadata: Record<string, unknown>;
}> = [];

// Log file path
const LOG_DIR = join(process.cwd(), 'logs');

export async function logsRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // GET /api/logs - Query logs
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'Query logs',
        description: 'Query system logs with filtering and pagination',
        tags: ['logs'],
        querystring: {
          type: 'object',
          properties: {
            level: { 
              type: 'string', 
              enum: ['debug', 'info', 'warn', 'error', 'fatal'],
              description: 'Filter by log level' 
            },
            source: { type: 'string', description: 'Filter by source' },
            startTime: { type: 'string', format: 'date-time', description: 'Start time (ISO 8601)' },
            endTime: { type: 'string', format: 'date-time', description: 'End time (ISO 8601)' },
            search: { type: 'string', description: 'Search in message' },
            limit: { type: 'number', default: 100, description: 'Number of logs to return' },
            cursor: { type: 'string', description: 'Pagination cursor' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  logs: {
                    type: 'array',
                    items: zodToJsonSchema(LogEntrySchema) as Record<string, unknown>,
                  },
                  hasMore: { type: 'boolean' },
                  nextCursor: { type: 'string' },
                  total: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Querystring: {
          level?: string;
          source?: string;
          startTime?: string;
          endTime?: string;
          search?: string;
          limit?: number;
          cursor?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const limit = Math.min(request.query.limit || 100, 1000);
        const { level, source, startTime, endTime, search } = request.query;
        
        let filteredLogs = [...systemLogs];
        
        // Apply filters
        if (level) {
          filteredLogs = filteredLogs.filter(l => l.level === level);
        }
        if (source) {
          filteredLogs = filteredLogs.filter(l => l.source.toLowerCase().includes(source.toLowerCase()));
        }
        if (startTime) {
          const start = new Date(startTime).getTime();
          filteredLogs = filteredLogs.filter(l => new Date(l.timestamp).getTime() >= start);
        }
        if (endTime) {
          const end = new Date(endTime).getTime();
          filteredLogs = filteredLogs.filter(l => new Date(l.timestamp).getTime() <= end);
        }
        if (search) {
          const searchLower = search.toLowerCase();
          filteredLogs = filteredLogs.filter(l => l.message.toLowerCase().includes(searchLower));
        }
        
        // Sort by timestamp descending
        filteredLogs.sort((a, b) => 
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        
        // Apply pagination
        const paginatedLogs = filteredLogs.slice(0, limit);
        const hasMore = filteredLogs.length > limit;
        
        return reply.send(
          createSuccessResponse({
            logs: paginatedLogs,
            hasMore,
            total: filteredLogs.length,
          }, { requestId: request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to query logs');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to query logs')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/logs/agents - Get agent logs summary
  // ============================================================================
  fastify.get(
    '/agents',
    {
      schema: {
        summary: 'Get agent logs summary',
        description: 'Get aggregated agent log statistics',
        tags: ['logs'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  agents: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        agentId: { type: 'string' },
                        logCount: { type: 'number' },
                        lastLogAt: { type: 'string', format: 'date-time' },
                        errorCount: { type: 'number' },
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
        // Aggregate by agent (placeholder)
        const agentSummaries: Array<{
          agentId: string;
          logCount: number;
          lastLogAt: string;
          errorCount: number;
        }> = [];
        
        return reply.send(
          createSuccessResponse({ agents: agentSummaries }, { requestId: _request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get agent logs summary');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get agent logs summary')
        );
      }
    }
  );
}

export default logsRoutes;
