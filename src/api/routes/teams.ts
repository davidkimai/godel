/**
 * Team Routes
 * 
 * Fastify routes for team management:
 * - GET /api/teams - List teams
 * - POST /api/teams - Create team
 * - GET /api/teams/:id - Get team details
 * - PUT /api/teams/:id - Update team
 * - DELETE /api/teams/:id - Delete team
 * - POST /api/teams/:id/start - Start team
 * - POST /api/teams/:id/stop - Stop team
 * - POST /api/teams/:id/pause - Pause team
 * - POST /api/teams/:id/resume - Resume team
 * - POST /api/teams/:id/scale - Scale team
 * - GET /api/teams/:id/events - Get team events
 * - GET /api/teams/:id/tree - Get session tree
 * - GET /api/teams/:id/branches - List branches
 * - POST /api/teams/:id/branches - Create branch
 * - POST /api/teams/:id/switch-branch - Switch branch
 * - POST /api/teams/:id/compare - Compare branches
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { TeamRepository } from '../../storage/repositories/TeamRepository';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { paginateArray, parsePaginationParams, createPaginationLinks } from '../lib/pagination';
import {
  CreateTeamSchema,
  UpdateTeamSchema,
  ScaleTeamSchema,
  CreateBranchSchema,
  SwitchBranchSchema,
  CompareBranchesSchema,
  ListTeamsQuerySchema,
  TeamSchema,
  TeamSummarySchema,
  TeamListResponseSchema,
  TeamEventSchema,
  TeamEventListResponseSchema,
  type CreateTeam,
  type UpdateTeam,
  type ScaleTeam,
  type CreateBranch,
  type SwitchBranch,
  type CompareBranches,
  type ListTeamsQuery,
} from '../schemas/team';

// Re-export CompareBranches to fix import resolution
export type { CompareBranches } from '../schemas/team';
import { IdParamSchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

// In-memory store for teams
const teams = new Map<string, {
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
  teamId: string;
  type: string;
  payload: Record<string, unknown>;
  timestamp: string;
  agentId?: string;
}>>();

export async function teamRoutes(fastify: FastifyInstance) {
  const swarmRepo = new TeamRepository();
  
  try {
    await swarmRepo.initialize();
  } catch (error) {
    fastify.log.warn('Failed to initialize TeamRepository, using in-memory store');
  }

  // ============================================================================
  // GET /api/teams - List teams
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'List teams',
        description: 'List all teams with optional filtering and pagination',
        tags: ['teams'],
        querystring: zodToJsonSchema(ListTeamsQuerySchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamListResponseSchema) as Record<string, unknown>,
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListTeamsQuery }>, reply: FastifyReply) => {
      try {
        const params = parsePaginationParams(request.query);
        
        // Get teams from memory and database
        let swarmList = Array.from(teams.values());
        
        try {
          const dbTeams = await swarmRepo.listSummaries({
            limit: params.limit,
            status: request.query.status,
          });
          
          // Merge with memory teams
          const existingIds = new Set(swarmList.map(s => s.id));
          for (const dbTeam of dbTeams) {
            if (!existingIds.has(dbTeam.id)) {
              swarmList.push({
                id: dbTeam.id,
                name: dbTeam.name,
                status: dbTeam.status,
                config: {
                  maxAgents: dbTeam.config['maxAgents'],
                  enableScaling: dbTeam.config['enableScaling'],
                  enableBranching: dbTeam.config['enableBranching'],
                },
                metrics: {
                  runningAgents: dbTeam.running_agents,
                  totalAgents: dbTeam.total_agents,
                  budgetAllocated: dbTeam.budget_allocated,
                  budgetConsumed: dbTeam.budget_consumed,
                  budgetPercentage: dbTeam.budget_percentage,
                },
                createdAt: dbTeam.created_at.toISOString(),
                updatedAt: dbTeam.created_at.toISOString(),
                currentBranch: 'main',
                branches: ['main'],
                metadata: {},
              });
            }
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to fetch teams from database');
        }
        
        // Apply filters
        if (request.query.status) {
          swarmList = swarmList.filter(s => s.status === request.query.status);
        }
        
        // Apply pagination
        const paginated = paginateArray(swarmList, request.query);
        const links = createPaginationLinks('/api/v1/teams', request.query, paginated);
        
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
              teams: summaries,
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
        fastify.log.error({ err: error }, 'Failed to list teams');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list teams')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/teams - Create team
  // ============================================================================
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create team',
        description: 'Create a new team with the specified configuration',
        tags: ['teams'],
        body: zodToJsonSchema(CreateTeamSchema) as Record<string, unknown>,
        response: {
          201: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateTeam }>, reply: FastifyReply) => {
      try {
        const validated = CreateTeamSchema.parse(request.body);
        
        const id = `team-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const now = new Date().toISOString();
        
        const team = {
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
        
        teams.set(id, team);
        
        // Persist to database
        try {
          await swarmRepo.create({
            name: team.name,
            config: team.config,
            status: 'creating',
          });
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to persist team to database');
        }
        
        return reply.status(201).send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to create team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create team')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/teams/:id - Get team details
  // ============================================================================
  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get team details',
        description: 'Get detailed information about a specific team',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        let team = teams.get(id);
        
        if (!team) {
          try {
            const dbTeam = await swarmRepo.findById(id);
            if (dbTeam) {
              team = {
                id: dbTeam.id,
                name: dbTeam.name,
                status: dbTeam.status,
                config: dbTeam.config,
                metrics: {},
                createdAt: dbTeam.created_at.toISOString(),
                updatedAt: dbTeam.updated_at.toISOString(),
                currentBranch: 'main',
                branches: ['main'],
                sessionTreeId: undefined,
                metadata: {},
              };
            }
          } catch (dbError) {
            fastify.log.warn({ err: dbError }, 'Failed to fetch team from database');
          }
        }
        
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to get team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get team')
        );
      }
    }
  );

  // ============================================================================
  // PUT /api/teams/:id - Update team
  // ============================================================================
  fastify.put(
    '/:id',
    {
      schema: {
        summary: 'Update team',
        description: 'Update team configuration',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(UpdateTeamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateTeam }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = UpdateTeamSchema.parse(request.body);
        
        let team = teams.get(id);
        
        if (team) {
          if (validated.name) team.name = validated.name;
          if (validated.config) team.config = { ...team.config, ...validated.config };
          if (validated.status) team.status = validated.status;
          if (validated.metadata) team.metadata = { ...team.metadata, ...validated.metadata };
          team.updatedAt = new Date().toISOString();
        }
        
        // Update in database
        try {
          await swarmRepo.update(id, {
            name: validated.name,
            config: validated.config,
            status: validated.status as any,
          });
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update team in database');
        }
        
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to update team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update team')
        );
      }
    }
  );

  // ============================================================================
  // DELETE /api/teams/:id - Delete team
  // ============================================================================
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Delete team',
        description: 'Delete a team and all its agents',
        tags: ['teams'],
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
        
        teams.delete(id);
        swarmEvents.delete(id);
        
        // Delete from database
        try {
          await swarmRepo.delete(id);
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to delete team from database');
        }
        
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to delete team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete team')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/teams/:id/start - Start team
  // ============================================================================
  fastify.post(
    '/:id/start',
    {
      schema: {
        summary: 'Start team',
        description: 'Start a team and begin agent execution',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        team.status = 'active';
        team.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'active');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update team status');
        }
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to start team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to start team')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/teams/:id/stop - Stop team
  // ============================================================================
  fastify.post(
    '/:id/stop',
    {
      schema: {
        summary: 'Stop team',
        description: 'Stop a team and terminate all agents',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        team.status = 'completed';
        team.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'completed');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update team status');
        }
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to stop team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to stop team')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/teams/:id/pause - Pause team
  // ============================================================================
  fastify.post(
    '/:id/pause',
    {
      schema: {
        summary: 'Pause team',
        description: 'Pause all agents in the team',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        team.status = 'paused';
        team.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'paused');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update team status');
        }
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to pause team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to pause team')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/teams/:id/resume - Resume team
  // ============================================================================
  fastify.post(
    '/:id/resume',
    {
      schema: {
        summary: 'Resume team',
        description: 'Resume all agents in the team',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        team.status = 'active';
        team.updatedAt = new Date().toISOString();
        
        // Update in database
        try {
          await swarmRepo.updateStatus(id, 'active');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update team status');
        }
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to resume team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to resume team')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/teams/:id/scale - Scale team
  // ============================================================================
  fastify.post(
    '/:id/scale',
    {
      schema: {
        summary: 'Scale team',
        description: 'Scale the number of agents in the team',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(ScaleTeamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TeamSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: ScaleTeam }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = ScaleTeamSchema.parse(request.body);
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        team.status = 'scaling';
        (team.metrics as any).totalAgents = validated.targetSize;
        team.updatedAt = new Date().toISOString();
        
        return reply.send(
          createSuccessResponse(team, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to scale team');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to scale team')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/teams/:id/events - Get team events
  // ============================================================================
  fastify.get(
    '/:id/events',
    {
      schema: {
        summary: 'Get team events',
        description: 'Get events for a specific team',
        tags: ['teams'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 100 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: zodToJsonSchema(TeamEventListResponseSchema) as Record<string, unknown>,
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
        
        if (!teams.has(id)) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
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
        
        fastify.log.error({ err: error }, 'Failed to get team events');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get team events')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/teams/:id/branches - List branches
  // ============================================================================
  fastify.get(
    '/:id/branches',
    {
      schema: {
        summary: 'List branches',
        description: 'List all branches in the team session tree',
        tags: ['teams'],
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
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse({
            branches: team.branches,
            currentBranch: team.currentBranch,
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
  // POST /api/teams/:id/branches - Create branch
  // ============================================================================
  fastify.post(
    '/:id/branches',
    {
      schema: {
        summary: 'Create branch',
        description: 'Create a new branch in the session tree',
        tags: ['teams'],
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
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        if (!team.branches.includes(validated.name)) {
          team.branches.push(validated.name);
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
  // POST /api/teams/:id/switch-branch - Switch branch
  // ============================================================================
  fastify.post(
    '/:id/switch-branch',
    {
      schema: {
        summary: 'Switch branch',
        description: 'Switch to a different branch in the session tree',
        tags: ['teams'],
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
        
        const team = teams.get(id);
        if (!team) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TEAM_NOT_FOUND, `Team ${id} not found`)
          );
        }
        
        if (!team.branches.includes(validated.branchName)) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.INVALID_INPUT, `Branch ${validated.branchName} does not exist`)
          );
        }
        
        team.currentBranch = validated.branchName;
        
        return reply.send(
          createSuccessResponse({
            success: true,
            currentBranch: team.currentBranch,
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

export default teamRoutes;
