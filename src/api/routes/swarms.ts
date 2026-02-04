/**
 * Swarm Routes
 * 
 * Fastify routes for swarm management:
 * - GET /api/swarms - List swarms
 * - POST /api/swarms - Create swarm
 * - GET /api/swarms/:id - Get swarm details
 * - PUT /api/swarms/:id - Update swarm
 * - DELETE /api/swarms/:id - Delete swarm
 * - POST /api/swarms/:id/start - Start swarm
 * - POST /api/swarms/:id/stop - Stop swarm
 * - POST /api/swarms/:id/pause - Pause swarm
 * - POST /api/swarms/:id/resume - Resume swarm
 * - POST /api/swarms/:id/scale - Scale swarm
 * - GET /api/swarms/:id/events - Get swarm events
 * - GET /api/swarms/:id/tree - Get session tree
 * - GET /api/swarms/:id/branches - List branches
 * - POST /api/swarms/:id/branches - Create branch
 * - POST /api/swarms/:id/switch-branch - Switch branch
 * - POST /api/swarms/:id/compare - Compare branches
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { SwarmRepository } from '../../storage/repositories/SwarmRepository';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { paginateArray, parsePaginationParams, createPaginationLinks } from '../lib/pagination';
import {
  CreateSwarmSchema,
  UpdateSwarmSchema,
  ScaleSwarmSchema,
  CreateBranchSchema,
  SwitchBranchSchema,
  CompareBranchesSchema,
  ListSwarmsQuerySchema,
  SwarmSchema,
  SwarmSummarySchema,
  SwarmListResponseSchema,
  SwarmEventSchema,
  SwarmEventListResponseSchema,
  type CreateSwarm,
  type UpdateSwarm,
  type ScaleSwarm,
  type CreateBranch,
  type SwitchBranch,
  type CompareBranches,
  type ListSwarmsQuery,
} from '../schemas/swarm';

// Re-export CompareBranches to fix import resolution
export type { CompareBranches } from '../schemas/swarm';
import { IdParamSchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

// In-memory store for swarms
const swarms = new Map<string, {
  id: string;
  name: string;
  status: string;
  config: Record<string, unknown>;
  metrics: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  currentBranch: string;
  branches: string[];
  sessionTreeId?: string;
  metadata: Record<string, unknown>;
}>();

// In-memory events
const swarmEvents = new Map<string, Array<{
  id: string;
  swarmId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  agentId?: string;
}>>();

export async function swarmRoutes(fastify: FastifyInstance) {
  const swarmRepo = new SwarmRepository();
  
  try {
    await swarmRepo.initialize();
  } catch (error) {
    fastify.log.warn('Failed to initialize SwarmRepository, using in-memory store');
  }

  // ============================================================================
  // GET /api/swarms - List swarms
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'List swarms',
        description: 'List all swarms with optional filtering and pagination',
        tags: ['swarms'],
        querystring: zodToJsonSchema(ListSwarmsQuerySchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmListResponseSchema) as Record<string, unknown>,
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListSwarmsQuery }>, reply: FastifyReply) => {
      try {
        const params = parsePaginationParams(request.query);
        
        // Get swarms from memory and database
        let swarmList = Array.from(swarms.values());
        
        try {
          const dbSwarms = await swarmRepo.listSummaries({
            limit: params.limit,
            status: request.query.status,
          });
          
          // Merge with memory swarms
          const existingIds = new Set(swarmList.map(s => s.id));
          for (const dbSwarm of dbSwarms) {
            if (!existingIds.has(dbSwarm.id)) {
              swarmList.push({
                id: dbSwarm.id,
                name: dbSwarm.name,
                status: dbSwarm.status,
                config: {
                  maxAgents: dbSwarm.config['maxAgents'],
                  enableScaling: dbSwarm.config['enableScaling'],
                  enableBranching: dbSwarm.config['enableBranching'],
                },
                metrics: {
                  runningAgents: dbSwarm.running_agents,
                  totalAgents: dbSwarm.total_agents,
                  budgetAllocated: dbSwarm.budget_allocated,
                  budgetConsumed: dbSwarm.budget_consumed,
                  budgetPercentage: dbSwarm.budget_percentage,
                },
                createdAt: dbSwarm.created_at.toISOString(),
                updatedAt: dbSwarm.created_at.toISOString(),
                currentBranch: 'main',
                branches: ['main'],
                metadata: {},
              });
            }
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to fetch swarms from database');
        }
        
        // Apply filters
        if (request.query.status) {
          swarmList = swarmList.filter(s => s.status === request.query.status);
        }
        
        // Apply pagination
        const paginated = paginateArray(swarmList, request.query);
        const links = createPaginationLinks('/api/v1/swarms', request.query, paginated);
        
        // Transform to summary format
        const summaries = paginated.items.map(s => ({
          id: s.id,
          name: s.name,
          status: s.status as any,
          createdAt: s.createdAt,
          config: {
            maxAgents: (s.config as any)?.maxAgents || 100,
            enableScaling: (s.config as any)?.enableScaling || false,
            enableBranching: (s.config as any)?.enableBranching || false,
          },
          runningAgents: (s.metrics as any)?.runningAgents || 0,
          totalAgents: (s.metrics as any)?.totalAgents || 0,
          budgetAllocated: (s.metrics as any)?.budgetAllocated || 0,
          budgetConsumed: (s.metrics as any)?.budgetConsumed || 0,
          budgetPercentage: (s.metrics as any)?.budgetPercentage || 0,
        }));
        
        return reply.send(
          createSuccessResponse(
            {
              swarms: summaries,
              hasMore: paginated.hasMore,
              nextCursor: paginated.nextCursor,
            },
            {
              requestId: request.id,
              links,
            }
          )
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list swarms');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list swarms')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms - Create swarm
  // ============================================================================
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create swarm',
        description: 'Create a new swarm with the specified configuration',
        tags: ['swarms'],
        body: zodToJsonSchema(CreateSwarmSchema) as Record<string, unknown>,
        response: {
          201: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateSwarm }>, reply: FastifyReply) => {
      try {
        const validated = CreateSwarmSchema.parse(request.body);
        
        const id = `swarm-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const swarm = {
          id,
          name: validated.name,
          status: 'creating',
          config: validated.config || {
            maxAgents: 100,
            minAgents: 1,
            enableScaling: false,
            enableBranching: false,
            enableEventStreaming: true,
            strategy: 'round-robin',
            agentTimeout: 300000,
          },
          metrics: {
            totalAgents: 0,
            runningAgents: 0,
            pendingAgents: 0,
            completedAgents: 0,
            failedAgents: 0,
            averageRuntime: 0,
            totalRuntime: 0,
            budgetConsumed: 0,
            budgetPercentage: 0,
            eventsProcessed: 0,
            tasksCompleted: 0,
          },
          createdAt: now,
          updatedAt: now,
          currentBranch: 'main',
          branches: ['main'],
          sessionTreeId: undefined,
          metadata: validated.metadata || {},
        };
        
        swarms.set(id, swarm);
        
        // Persist to database
        try {
          await swarmRepo.create({
            name: swarm.name,
            config: swarm.config,
            status: 'creating',
          });
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to persist swarm to database');
        }
        
        return reply.status(201).send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to create swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create swarm')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/swarms/:id - Get swarm details
  // ============================================================================
  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get swarm details',
        description: 'Get detailed information about a specific swarm',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        let swarm = swarms.get(id);
        
        if (!swarm) {
          try {
            const dbSwarm = await swarmRepo.findById(id);
            if (dbSwarm) {
              swarm = {
                id: dbSwarm.id,
                name: dbSwarm.name,
                status: dbSwarm.status,
                config: dbSwarm.config,
                metrics: {},
                createdAt: dbSwarm.created_at.toISOString(),
                updatedAt: dbSwarm.updated_at.toISOString(),
                currentBranch: 'main',
                branches: ['main'],
                sessionTreeId: undefined,
                metadata: {},
              };
            }
          } catch (dbError) {
            fastify.log.warn({ err: dbError }, 'Failed to fetch swarm from database');
          }
        }
        
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to get swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get swarm')
        );
      }
    }
  );

  // ============================================================================
  // PUT /api/swarms/:id - Update swarm
  // ============================================================================
  fastify.put(
    '/:id',
    {
      schema: {
        summary: 'Update swarm',
        description: 'Update swarm configuration',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(UpdateSwarmSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateSwarm }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = UpdateSwarmSchema.parse(request.body);
        
        let swarm = swarms.get(id);
        
        if (swarm) {
          if (validated.name) swarm.name = validated.name;
          if (validated.config) swarm.config = { ...swarm.config, ...validated.config };
          if (validated.status) swarm.status = validated.status;
          if (validated.metadata) swarm.metadata = { ...swarm.metadata, ...validated.metadata };
          swarm.updatedAt = new Date().toISOString();
        }
        
        // Update in database
        try {
          await swarmRepo.update(id, {
            name: validated.name,
            config: validated.config,
            status: validated.status as any,
          });
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update swarm in database');
        }
        
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to update swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update swarm')
        );
      }
    }
  );

  // ============================================================================
  // DELETE /api/swarms/:id - Delete swarm
  // ============================================================================
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Delete swarm',
        description: 'Delete a swarm and all its agents',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          204: { type: 'null' },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        swarms.delete(id);
        swarmEvents.delete(id);
        
        // Delete from database
        try {
          await swarmRepo.delete(id);
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to delete swarm from database');
        }
        
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to delete swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete swarm')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/start - Start swarm
  // ============================================================================
  fastify.post(
    '/:id/start',
    {
      schema: {
        summary: 'Start swarm',
        description: 'Start a swarm and begin agent execution',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        swarm.status = 'active';
        swarm.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'active');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update swarm status');
        }
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to start swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to start swarm')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/stop - Stop swarm
  // ============================================================================
  fastify.post(
    '/:id/stop',
    {
      schema: {
        summary: 'Stop swarm',
        description: 'Stop a swarm and terminate all agents',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        swarm.status = 'completed';
        swarm.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'completed');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update swarm status');
        }
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to stop swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to stop swarm')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/pause - Pause swarm
  // ============================================================================
  fastify.post(
    '/:id/pause',
    {
      schema: {
        summary: 'Pause swarm',
        description: 'Pause all agents in the swarm',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        swarm.status = 'paused';
        swarm.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'paused');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update swarm status');
        }
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to pause swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to pause swarm')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/resume - Resume swarm
  // ============================================================================
  fastify.post(
    '/:id/resume',
    {
      schema: {
        summary: 'Resume swarm',
        description: 'Resume all agents in the swarm',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        swarm.status = 'active';
        swarm.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'active');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update swarm status');
        }
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to resume swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to resume swarm')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/scale - Scale swarm
  // ============================================================================
  fastify.post(
    '/:id/scale',
    {
      schema: {
        summary: 'Scale swarm',
        description: 'Scale the number of agents in the swarm',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(ScaleSwarmSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(SwarmSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: ScaleSwarm }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = ScaleSwarmSchema.parse(request.body);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        swarm.status = 'scaling';
        (swarm.metrics as any).totalAgents = validated.targetSize;
        swarm.updatedAt = new Date().toISOString();
        
        return reply.send(
          createSuccessResponse(swarm, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to scale swarm');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to scale swarm')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/swarms/:id/events - Get swarm events
  // ============================================================================
  fastify.get(
    '/:id/events',
    {
      schema: {
        summary: 'Get swarm events',
        description: 'Get events for a specific swarm',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 100 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: zodToJsonSchema(SwarmEventListResponseSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { limit?: number; cursor?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const limit = Math.min(request.query.limit || 100, 500);
        
        if (!swarms.has(id)) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        const events = swarmEvents.get(id) || [];
        const paginatedEvents = events.slice(-limit);
        
        return reply.send(
          createSuccessResponse({
            events: paginatedEvents,
            hasMore: events.length > limit,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid parameters')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to get swarm events');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get swarm events')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/swarms/:id/branches - List branches
  // ============================================================================
  fastify.get(
    '/:id/branches',
    {
      schema: {
        summary: 'List branches',
        description: 'List all branches in the swarm session tree',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              branches: { type: 'array', items: { type: 'string' } },
              currentBranch: { type: 'string' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse({
            branches: swarm.branches,
            currentBranch: swarm.currentBranch,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to list branches');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list branches')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/branches - Create branch
  // ============================================================================
  fastify.post(
    '/:id/branches',
    {
      schema: {
        summary: 'Create branch',
        description: 'Create a new branch in the session tree',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(CreateBranchSchema) as Record<string, unknown>,
        response: {
          201: {
            type: 'object',
            properties: {
              entryId: { type: 'string' },
              name: { type: 'string' },
              description: { type: 'string' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: CreateBranch }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = CreateBranchSchema.parse(request.body);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        if (!swarm.branches.includes(validated.name)) {
          swarm.branches.push(validated.name);
        }
        
        const entryId = `entry-${Date.now()}`;
        
        return reply.status(201).send(
          createSuccessResponse({
            entryId,
            name: validated.name,
            description: validated.description,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to create branch');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create branch')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/swarms/:id/switch-branch - Switch branch
  // ============================================================================
  fastify.post(
    '/:id/switch-branch',
    {
      schema: {
        summary: 'Switch branch',
        description: 'Switch to a different branch in the session tree',
        tags: ['swarms'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(SwitchBranchSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              currentBranch: { type: 'string' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: SwitchBranch }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = SwitchBranchSchema.parse(request.body);
        
        const swarm = swarms.get(id);
        if (!swarm) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.SWARM_NOT_FOUND, `Swarm ${id} not found`)
          );
        }
        
        if (!swarm.branches.includes(validated.branchName)) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.INVALID_INPUT, `Branch ${validated.branchName} does not exist`)
          );
        }
        
        swarm.currentBranch = validated.branchName;
        
        return reply.send(
          createSuccessResponse({
            success: true,
            currentBranch: swarm.currentBranch,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to switch branch');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to switch branch')
        );
      }
    }
  );
}

export default swarmRoutes;
