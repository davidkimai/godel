/**
 * Pi Integration API Routes
 * 
 * RESTful API endpoints for Pi CLI integration:
 * - GET /api/pi/instances - List Pi instances
 * - POST /api/pi/instances - Register instance
 * - GET /api/pi/instances/:id - Get instance
 * - DELETE /api/pi/instances/:id - Deregister instance
 * - GET /api/pi/instances/:id/health - Check instance health
 * - GET /api/pi/sessions - List sessions
 * - POST /api/pi/sessions - Create session
 * - GET /api/pi/sessions/:id - Get session
 * - DELETE /api/pi/sessions/:id - Terminate session
 * - POST /api/pi/sessions/:id/pause - Pause session
 * - POST /api/pi/sessions/:id/resume - Resume session
 * - POST /api/pi/sessions/:id/checkpoint - Create checkpoint
 * - GET /api/pi/sessions/:id/tree - Get conversation tree
 * - POST /api/pi/execute - Execute task
 * 
 * @module api/routes/pi
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getGlobalPiRegistry, getGlobalPiSessionManager } from '../../integrations/pi';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Validation schemas
const InstanceIdParamSchema = z.object({
  id: z.string().min(1, 'Instance ID is required'),
});

const SessionIdParamSchema = z.object({
  id: z.string().min(1, 'Session ID is required'),
});

const CreateInstanceSchema = z.object({
  name: z.string().min(1, 'Instance name is required'),
  provider: z.string().default('anthropic'),
  model: z.string().default('claude-sonnet-4-5'),
  config: z.record(z.unknown()).default({}),
});

const CreateSessionSchema = z.object({
  instanceId: z.string().min(1, 'Instance ID is required'),
  task: z.string().min(1, 'Task is required'),
  context: z.record(z.unknown()).default({}),
});

const ExecuteSchema = z.object({
  prompt: z.string().min(1, 'Prompt is required'),
  config: z.record(z.unknown()).default({}),
});

/**
 * Register Pi integration routes with Fastify
 */
export async function piRoutes(fastify: FastifyInstance): Promise<void> {
  const registry = getGlobalPiRegistry();
  const sessionManager = getGlobalPiSessionManager();

  // ============================================================================
  // Pi Instances
  // ============================================================================

  /**
   * @openapi
   * /api/v1/pi/instances:
   *   get:
   *     summary: List Pi instances
   *     description: Get all registered Pi CLI instances
   *     tags: [pi]
   *     responses:
   *       200:
   *         description: List of instances
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/instances',
    {
      schema: {
        summary: 'List Pi instances',
        description: 'Get all registered Pi CLI instances',
        tags: ['pi'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instances: { type: 'array' },
                },
              },
              meta: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const instances = registry.getAllInstances();
        return reply.send(createSuccessResponse({ instances }, { requestId: request.id }));
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list Pi instances');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list instances')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/instances:
   *   post:
   *     summary: Register instance
   *     description: Register a new Pi CLI instance
   *     tags: [pi]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name]
   *             properties:
   *               name:
   *                 type: string
   *               provider:
   *                 type: string
   *               model:
   *                 type: string
   *               config:
   *                 type: object
   *     responses:
   *       201:
   *         description: Instance registered
   *       400:
   *         description: Invalid input
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/instances',
    {
      schema: {
        summary: 'Register Pi instance',
        description: 'Register a new Pi CLI instance',
        tags: ['pi'],
        body: zodToJsonSchema(CreateInstanceSchema) as Record<string, unknown>,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instance: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateInstanceSchema> }>, reply: FastifyReply) => {
      try {
        const validated = CreateInstanceSchema.parse(request.body);
        // Create PiInstance with required fields added
        const instance = await registry.register({
          name: validated.name,
          provider: validated.provider as import('../../integrations/pi/types').ProviderId,
          model: validated.model,
          id: `pi-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
          mode: 'local' as const,
          endpoint: 'http://localhost:8787',
          health: 'healthy' as const,
          capabilities: [],
          capacity: {
            maxConcurrent: 5,
            activeTasks: 0,
            queueDepth: 0,
            available: 5,
            utilizationPercent: 0,
          },
          lastHeartbeat: new Date(),
          metadata: validated.config,
          registeredAt: new Date(),
        });
        return reply.status(201).send(
          createSuccessResponse({ instance }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to register Pi instance');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to register instance')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/instances/{id}:
   *   get:
   *     summary: Get instance
   *     description: Get Pi instance details
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Instance details
   *       404:
   *         description: Instance not found
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/instances/:id',
    {
      schema: {
        summary: 'Get Pi instance',
        description: 'Get Pi instance details',
        tags: ['pi'],
        params: zodToJsonSchema(InstanceIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  instance: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = InstanceIdParamSchema.parse(request.params);
        const instance = registry.getInstance(id);
        
        if (!instance) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Instance ${id} not found`)
          );
        }
        
        return reply.send(createSuccessResponse({ instance }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to get Pi instance');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get instance')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/instances/{id}:
   *   delete:
   *     summary: Deregister instance
   *     description: Deregister a Pi CLI instance
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Instance deregistered
   *       404:
   *         description: Instance not found
   *       500:
   *         description: Server error
   */
  fastify.delete(
    '/instances/:id',
    {
      schema: {
        summary: 'Deregister Pi instance',
        description: 'Deregister a Pi CLI instance',
        tags: ['pi'],
        params: zodToJsonSchema(InstanceIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = InstanceIdParamSchema.parse(request.params);
        
        const instance = registry.getInstance(id);
        if (!instance) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Instance ${id} not found`)
          );
        }
        
        registry.unregister(id);
        return reply.send(createSuccessResponse({ success: true }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to deregister Pi instance');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to deregister instance')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/instances/{id}/health:
   *   get:
   *     summary: Instance health
   *     description: Check Pi instance health
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Health status
   *       404:
   *         description: Instance not found
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/instances/:id/health',
    {
      schema: {
        summary: 'Check instance health',
        description: 'Check Pi instance health status',
        tags: ['pi'],
        params: zodToJsonSchema(InstanceIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  health: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = InstanceIdParamSchema.parse(request.params);
        
        const instance = registry.getInstance(id);
        if (!instance) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Instance ${id} not found`)
          );
        }
        
        const health = await registry.checkHealth(id);
        return reply.send(createSuccessResponse({ health }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to check instance health');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to check health')
        );
      }
    }
  );

  // ============================================================================
  // Pi Sessions
  // ============================================================================

  /**
   * @openapi
   * /api/v1/pi/sessions:
   *   get:
   *     summary: List sessions
   *     description: Get all Pi sessions
   *     tags: [pi]
   *     responses:
   *       200:
   *         description: List of sessions
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/sessions',
    {
      schema: {
        summary: 'List Pi sessions',
        description: 'Get all Pi sessions',
        tags: ['pi'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  sessions: { type: 'array' },
                },
              },
              meta: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessions = sessionManager.listSessions();
        return reply.send(createSuccessResponse({ sessions }, { requestId: request.id }));
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list Pi sessions');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list sessions')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions:
   *   post:
   *     summary: Create session
   *     description: Create a new Pi session
   *     tags: [pi]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [instanceId, task]
   *             properties:
   *               instanceId:
   *                 type: string
   *               task:
   *                 type: string
   *               context:
   *                 type: object
   *     responses:
   *       201:
   *         description: Session created
   *       400:
   *         description: Invalid input
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/sessions',
    {
      schema: {
        summary: 'Create Pi session',
        description: 'Create a new Pi session',
        tags: ['pi'],
        body: zodToJsonSchema(CreateSessionSchema) as Record<string, unknown>,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  session: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateSessionSchema> }>, reply: FastifyReply) => {
      try {
        const validated = CreateSessionSchema.parse(request.body);
        // Create session with required fields added
        const session = await sessionManager.create({
          agentId: validated.instanceId, // Use instanceId as agentId
          piConfig: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            ...validated.context,
          },
        });
        return reply.status(201).send(
          createSuccessResponse({ session }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to create Pi session');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create session')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions/{id}:
   *   get:
   *     summary: Get session
   *     description: Get Pi session details
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Session details
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/sessions/:id',
    {
      schema: {
        summary: 'Get Pi session',
        description: 'Get Pi session details',
        tags: ['pi'],
        params: zodToJsonSchema(SessionIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  session: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = SessionIdParamSchema.parse(request.params);
        const session = sessionManager.getSession(id);
        
        if (!session) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Session ${id} not found`)
          );
        }
        
        return reply.send(createSuccessResponse({ session }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to get Pi session');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get session')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions/{id}/pause:
   *   post:
   *     summary: Pause session
   *     description: Pause a Pi session
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Session paused
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/sessions/:id/pause',
    {
      schema: {
        summary: 'Pause Pi session',
        description: 'Pause a Pi session',
        tags: ['pi'],
        params: zodToJsonSchema(SessionIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = SessionIdParamSchema.parse(request.params);
        
        const session = sessionManager.getSession(id);
        if (!session) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Session ${id} not found`)
          );
        }
        
        await sessionManager.pause(id);
        return reply.send(createSuccessResponse({ success: true }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to pause Pi session');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to pause session')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions/{id}/resume:
   *   post:
   *     summary: Resume session
   *     description: Resume a paused Pi session
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Session resumed
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/sessions/:id/resume',
    {
      schema: {
        summary: 'Resume Pi session',
        description: 'Resume a paused Pi session',
        tags: ['pi'],
        params: zodToJsonSchema(SessionIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  session: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = SessionIdParamSchema.parse(request.params);
        const session = await sessionManager.resume(id);
        return reply.send(createSuccessResponse({ session }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to resume Pi session');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to resume session')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions/{id}:
   *   delete:
   *     summary: Terminate session
   *     description: Terminate a Pi session
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Session terminated
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  fastify.delete(
    '/sessions/:id',
    {
      schema: {
        summary: 'Terminate Pi session',
        description: 'Terminate a Pi session',
        tags: ['pi'],
        params: zodToJsonSchema(SessionIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  success: { type: 'boolean' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = SessionIdParamSchema.parse(request.params);
        
        const session = sessionManager.getSession(id);
        if (!session) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Session ${id} not found`)
          );
        }
        
        await sessionManager.terminate(id);
        return reply.send(createSuccessResponse({ success: true }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to terminate Pi session');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to terminate session')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions/{id}/checkpoint:
   *   post:
   *     summary: Create checkpoint
   *     description: Create a checkpoint in a Pi session
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Checkpoint created
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/sessions/:id/checkpoint',
    {
      schema: {
        summary: 'Create checkpoint',
        description: 'Create a checkpoint in a Pi session',
        tags: ['pi'],
        params: zodToJsonSchema(SessionIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  checkpoint: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = SessionIdParamSchema.parse(request.params);
        
        const session = sessionManager.getSession(id);
        if (!session) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Session ${id} not found`)
          );
        }
        
        const checkpoint = await sessionManager.checkpoint(id);
        return reply.send(createSuccessResponse({ checkpoint }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to create checkpoint');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create checkpoint')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/pi/sessions/{id}/tree:
   *   get:
   *     summary: Get conversation tree
   *     description: Get the conversation tree for a Pi session
   *     tags: [pi]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Conversation tree
   *       404:
   *         description: Session not found
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/sessions/:id/tree',
    {
      schema: {
        summary: 'Get conversation tree',
        description: 'Get the conversation tree for a Pi session',
        tags: ['pi'],
        params: zodToJsonSchema(SessionIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  tree: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = SessionIdParamSchema.parse(request.params);
        
        const session = sessionManager.getSession(id);
        if (!session) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Session ${id} not found`)
          );
        }
        
        // Would get tree from SessionTreeManager
        return reply.send(
          createSuccessResponse({ tree: { sessionId: id, nodes: [] } }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to get conversation tree');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get conversation tree')
        );
      }
    }
  );

  // ============================================================================
  // Execution
  // ============================================================================

  /**
   * @openapi
   * /api/v1/pi/execute:
   *   post:
   *     summary: Execute task
   *     description: Execute a task using Pi
   *     tags: [pi]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [prompt]
   *             properties:
   *               prompt:
   *                 type: string
   *               config:
   *                 type: object
   *     responses:
   *       202:
   *         description: Task started
   *       400:
   *         description: Invalid input
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/execute',
    {
      schema: {
        summary: 'Execute task',
        description: 'Execute a task using Pi CLI',
        tags: ['pi'],
        body: zodToJsonSchema(ExecuteSchema) as Record<string, unknown>,
        response: {
          202: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  taskId: { type: 'string' },
                  status: { type: 'string' },
                },
              },
              meta: { type: 'object' },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof ExecuteSchema> }>, reply: FastifyReply) => {
      try {
        const validated = ExecuteSchema.parse(request.body);
        // Would create session and execute
        const taskId = `task_${Date.now()}`;
        return reply.status(202).send(
          createSuccessResponse({ taskId, status: 'started' }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to execute Pi task');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to execute task')
        );
      }
    }
  );
}

export default piRoutes;
