/**
 * Agent Routes
 * 
 * Fastify routes for agent management:
 * - POST /api/agents - Spawn agent
 * - GET /api/agents - List agents
 * - GET /api/agents/:id - Get agent details
 * - POST /api/agents/:id/kill - Kill agent
 * - GET /api/agents/:id/logs - Get agent logs
 * - POST /api/agents/:id/restart - Restart agent
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AgentRepository } from '../../storage/repositories/AgentRepository';
import { createAgent, AgentStatus } from '../../models/agent';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { paginateArray, parsePaginationParams, createPaginationLinks } from '../lib/pagination';
import {
  CreateAgentSchema,
  UpdateAgentSchema,
  ListAgentsQuerySchema,
  AgentSchema,
  AgentListResponseSchema,
  AgentLogResponseSchema,
  type CreateAgent,
  type UpdateAgent,
  type ListAgentsQuery,
} from '../schemas/agent';
import { IdParamSchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

// In-memory store for agents spawned via API (until integrated with orchestrator)
const spawnedAgents = new Map<string, ReturnType<typeof createAgent>>();

// In-memory logs for demo
const agentLogs = new Map<string, Array<{
  id: string;
  agentId: string;
  timestamp: string;
  level: string;
  message: string;
  source: string;
  metadata: Record<string, unknown>;
}>>();

export async function agentRoutes(fastify: FastifyInstance) {
  const agentRepo = new AgentRepository();
  
  // Initialize repository
  try {
    await agentRepo.initialize();
  } catch (error) {
    fastify.log.warn('Failed to initialize AgentRepository, using in-memory store');
  }

  // ============================================================================
  // POST /api/agents - Spawn agent
  // ============================================================================
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Spawn a new agent',
        description: 'Create and spawn a new agent with the specified configuration',
        tags: ['agents'],
        body: zodToJsonSchema(CreateAgentSchema) as Record<string, unknown>,
        response: {
          201: zodToJsonSchema(AgentSchema) as Record<string, unknown>,
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateAgent }>, reply: FastifyReply) => {
      try {
        const validated = CreateAgentSchema.parse(request.body);
        
        // Create agent
        const agent = createAgent({
          label: validated.label,
          model: validated.model,
          task: validated.task,
          swarmId: validated.swarmId,
          parentId: validated.parentId,
          maxRetries: validated.maxRetries,
          budgetLimit: validated.budgetLimit,
          contextItems: validated.contextItems,
          language: validated.language,
        });
        
        // Store in memory
        spawnedAgents.set(agent.id, agent);
        
        // Try to persist to database
        try {
          await agentRepo.create({
            label: agent.label,
            model: agent.model,
            task: agent.task,
            swarm_id: agent.swarmId,
            status: 'pending',
            lifecycle_state: 'initializing',
            max_retries: agent.maxRetries,
            budget_limit: agent.budgetLimit,
            metadata: validated.metadata || {},
          });
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to persist agent to database');
        }
        
        // Add initial log entry
        const logs = agentLogs.get(agent.id) || [];
        logs.push({
          id: `log-${Date.now()}`,
          agentId: agent.id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: `Agent spawned with model ${agent.model}`,
          source: 'api',
          metadata: { task: agent.task },
        });
        agentLogs.set(agent.id, logs);
        
        return reply.status(201).send(
          createSuccessResponse(agent, {
            requestId: request.id,
          })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to spawn agent');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to spawn agent')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/agents - List agents
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'List agents',
        description: 'List all agents with optional filtering and pagination',
        tags: ['agents'],
        querystring: zodToJsonSchema(ListAgentsQuerySchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(AgentListResponseSchema) as Record<string, unknown>,
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListAgentsQuery }>, reply: FastifyReply) => {
      try {
        const params = parsePaginationParams(request.query);
        
        // Get agents from memory and database
        let agents = Array.from(spawnedAgents.values());
        
        try {
          const dbAgents = await agentRepo.list({
            limit: params.limit,
            status: request.query.status,
            lifecycle_state: request.query.lifecycleState,
            swarm_id: request.query.swarmId,
            model: request.query.model,
          });
          
          // Merge with spawned agents, avoiding duplicates
          const existingIds = new Set(agents.map(a => a.id));
          for (const dbAgent of dbAgents) {
            if (!existingIds.has(dbAgent.id)) {
              agents.push({
                id: dbAgent.id,
                label: dbAgent.label,
                status: dbAgent.status as AgentStatus,
                // lifecycleState: dbAgent.lifecycle_state,
                model: dbAgent.model,
                task: dbAgent.task,
                spawnedAt: new Date(dbAgent.spawned_at),
                completedAt: dbAgent.completed_at ? new Date(dbAgent.completed_at) : undefined,
                runtime: dbAgent.runtime,
                swarmId: dbAgent.swarm_id,
                parentId: undefined, // Not stored in DB
                childIds: [],
                context: dbAgent.context as any || {
                  inputContext: [],
                  outputContext: [],
                  sharedContext: [],
                  contextSize: 0,
                  contextWindow: 100000,
                  contextUsage: 0,
                },
                retryCount: dbAgent.retry_count,
                maxRetries: dbAgent.max_retries,
                lastError: dbAgent.last_error,
                budgetLimit: dbAgent.budget_limit,
                metadata: dbAgent.metadata,
              });
            }
          }
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to fetch agents from database');
        }
        
        // Apply filters
        if (request.query.status) {
          agents = agents.filter(a => a.status === request.query.status);
        }
        if (request.query.swarmId) {
          agents = agents.filter(a => a.swarmId === request.query.swarmId);
        }
        if (request.query.model) {
          agents = agents.filter(a => a.model.includes(request.query.model!));
        }
        
        // Apply pagination
        const paginated = paginateArray(agents, request.query);
        const links = createPaginationLinks('/api/v1/agents', request.query, paginated);
        
        return reply.send(
          createSuccessResponse(
            {
              agents: paginated.items,
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
        fastify.log.error({ err: error }, 'Failed to list agents');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list agents')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/agents/:id - Get agent details
  // ============================================================================
  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get agent details',
        description: 'Get detailed information about a specific agent',
        tags: ['agents'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(AgentSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        // Try memory first
        let agent = spawnedAgents.get(id);
        
        // Try database
        if (!agent) {
          try {
            const dbAgent = await agentRepo.findById(id);
            if (dbAgent) {
              agent = {
                id: dbAgent.id,
                label: dbAgent.label,
                status: dbAgent.status as AgentStatus,
                // lifecycleState: dbAgent.lifecycle_state,
                model: dbAgent.model,
                task: dbAgent.task,
                spawnedAt: new Date(dbAgent.spawned_at),
                completedAt: dbAgent.completed_at ? new Date(dbAgent.completed_at) : undefined,
                runtime: dbAgent.runtime,
                swarmId: dbAgent.swarm_id,
                parentId: undefined,
                childIds: [],
                context: dbAgent.context as any || {
                  inputContext: [],
                  outputContext: [],
                  sharedContext: [],
                  contextSize: 0,
                  contextWindow: 100000,
                  contextUsage: 0,
                },
                retryCount: dbAgent.retry_count,
                maxRetries: dbAgent.max_retries,
                lastError: dbAgent.last_error,
                budgetLimit: dbAgent.budget_limit,
                metadata: dbAgent.metadata,
              };
            }
          } catch (dbError) {
            fastify.log.warn({ err: dbError }, 'Failed to fetch agent from database');
          }
        }
        
        if (!agent) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.AGENT_NOT_FOUND, `Agent ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse(agent, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to get agent');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get agent')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/agents/:id/kill - Kill agent
  // ============================================================================
  fastify.post(
    '/:id/kill',
    {
      schema: {
        summary: 'Kill agent',
        description: 'Forcefully terminate an agent',
        tags: ['agents'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  status: { type: 'string' },
                  killedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        // Try memory first
        let agent = spawnedAgents.get(id);
        
        if (agent) {
          agent.status = 'killed' as any;
          spawnedAgents.set(id, agent);
        }
        
        // Update in database
        try {
          await agentRepo.updateStatus(id, 'killed');
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update agent status in database');
        }
        
        // Add kill log
        const logs = agentLogs.get(id) || [];
        logs.push({
          id: `log-${Date.now()}`,
          agentId: id,
          timestamp: new Date().toISOString(),
          level: 'warn',
          message: 'Agent killed via API',
          source: 'api',
          metadata: { killedBy: request.user?.id || 'unknown' },
        });
        agentLogs.set(id, logs);
        
        return reply.send(
          createSuccessResponse({
            id,
            status: 'killed',
            killedAt: new Date().toISOString(),
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to kill agent');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to kill agent')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/agents/:id/logs - Get agent logs
  // ============================================================================
  fastify.get(
    '/:id/logs',
    {
      schema: {
        summary: 'Get agent logs',
        description: 'Get logs for a specific agent',
        tags: ['agents'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        querystring: {
          type: 'object',
          properties: {
            lines: { type: 'number', default: 100 },
            cursor: { type: 'string' },
          },
        },
        response: {
          200: zodToJsonSchema(AgentLogResponseSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { lines?: number; cursor?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const lines = Math.min(request.query.lines || 100, 1000);
        
        // Get logs from memory
        const logs = agentLogs.get(id) || [];
        
        // Apply pagination
        const paginatedLogs = logs.slice(-lines);
        
        return reply.send(
          createSuccessResponse({
            logs: paginatedLogs,
            hasMore: logs.length > lines,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid parameters')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to get agent logs');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get agent logs')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/agents/:id/restart - Restart agent
  // ============================================================================
  fastify.post(
    '/:id/restart',
    {
      schema: {
        summary: 'Restart agent',
        description: 'Restart a failed or completed agent',
        tags: ['agents'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(AgentSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        // Try memory first
        let agent = spawnedAgents.get(id);
        
        if (agent) {
          agent.status = 'pending' as any;
          agent.retryCount = 0;
          spawnedAgents.set(id, agent);
        }
        
        // Update in database
        try {
          await agentRepo.update(id, {
            status: 'pending',
            lifecycle_state: 'initializing',
            retry_count: 0,
          });
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to update agent in database');
        }
        
        // Add restart log
        const logs = agentLogs.get(id) || [];
        logs.push({
          id: `log-${Date.now()}`,
          agentId: id,
          timestamp: new Date().toISOString(),
          level: 'info',
          message: 'Agent restarted via API',
          source: 'api',
          metadata: { restartedBy: request.user?.id || 'unknown' },
        });
        agentLogs.set(id, logs);
        
        return reply.send(
          createSuccessResponse(agent || { id, status: 'pending' }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to restart agent');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to restart agent')
        );
      }
    }
  );

  // ============================================================================
  // DELETE /api/agents/:id - Delete agent
  // ============================================================================
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Delete agent',
        description: 'Delete an agent from the system',
        tags: ['agents'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          204: { type: 'null' },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          401: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        // Remove from memory
        spawnedAgents.delete(id);
        agentLogs.delete(id);
        
        // Delete from database
        try {
          await agentRepo.delete(id);
        } catch (dbError) {
          fastify.log.warn({ err: dbError }, 'Failed to delete agent from database');
        }
        
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to delete agent');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete agent')
        );
      }
    }
  );
}

export default agentRoutes;
