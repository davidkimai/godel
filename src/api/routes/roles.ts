/**
 * Agent Roles API Routes
 * 
 * RESTful API endpoints for role management:
 * - GET /api/roles - List roles
 * - POST /api/roles - Create custom role
 * - GET /api/roles/:id - Get role
 * - PUT /api/roles/:id - Update role
 * - DELETE /api/roles/:id - Delete role
 * - POST /api/roles/:id/assign - Assign role to agent
 * - GET /api/roles/assignments - List assignments
 * 
 * @module api/routes/roles
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Validation schemas
const RoleIdParamSchema = z.object({
  id: z.string().min(1, 'Role ID is required'),
});

const CreateRoleSchema = z.object({
  name: z.string().min(1, 'Role name is required'),
  description: z.string().optional(),
  capabilities: z.array(z.string()).default([]),
  permissions: z.array(z.string()).default([]),
  metadata: z.record(z.unknown()).default({}),
});

const UpdateRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

const AssignRoleSchema = z.object({
  agentId: z.string().min(1, 'Agent ID is required'),
});

/**
 * Register role routes with Fastify
 */
export async function rolesRoutes(fastify: FastifyInstance): Promise<void> {
  const roleRegistry = (fastify as any).roleRegistry;

  /**
   * @openapi
   * /api/v1/roles:
   *   get:
   *     summary: List roles
   *     description: Get all available agent roles
   *     tags: [roles]
   *     responses:
   *       200:
   *         description: List of roles
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/',
    {
      schema: {
        summary: 'List roles',
        description: 'Get all available agent roles',
        tags: ['roles'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  roles: { type: 'array' },
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
        const roles = roleRegistry ? roleRegistry.getAllRoles() : [];
        return reply.send(createSuccessResponse({ roles }, { requestId: request.id }));
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list roles');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list roles')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/roles/{id}:
   *   get:
   *     summary: Get role
   *     description: Get role details by ID
   *     tags: [roles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Role details
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get role',
        description: 'Get role details by ID',
        tags: ['roles'],
        params: zodToJsonSchema(RoleIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  role: { type: 'object' },
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
        const { id } = RoleIdParamSchema.parse(request.params);
        const role = roleRegistry?.getRole(id);
        
        if (!role) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Role ${id} not found`)
          );
        }
        
        return reply.send(createSuccessResponse({ role }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to get role');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get role')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/roles:
   *   post:
   *     summary: Create role
   *     description: Create a custom agent role
   *     tags: [roles]
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
   *               description:
   *                 type: string
   *               capabilities:
   *                 type: array
   *                 items:
   *                   type: string
   *               permissions:
   *                 type: array
   *                 items:
   *                   type: string
   *               metadata:
   *                 type: object
   *     responses:
   *       201:
   *         description: Role created
   *       400:
   *         description: Invalid input
   *       503:
   *         description: Registry not initialized
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create role',
        description: 'Create a custom agent role',
        tags: ['roles'],
        body: zodToJsonSchema(CreateRoleSchema) as Record<string, unknown>,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  role: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
          503: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateRoleSchema> }>, reply: FastifyReply) => {
      try {
        if (!roleRegistry) {
          return reply.status(503).send(
            createErrorResponse(
              ErrorCodes.INTERNAL_ERROR,
              'Role registry not initialized'
            )
          );
        }
        
        const validated = CreateRoleSchema.parse(request.body);
        const role = await roleRegistry.createCustomRole(validated, 'user_1');
        
        return reply.status(201).send(
          createSuccessResponse({ role }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to create role');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create role')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/roles/{id}:
   *   put:
   *     summary: Update role
   *     description: Update an existing role
   *     tags: [roles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               description:
   *                 type: string
   *               capabilities:
   *                 type: array
   *                 items:
   *                   type: string
   *               permissions:
   *                 type: array
   *                 items:
   *                   type: string
   *               metadata:
   *                 type: object
   *     responses:
   *       200:
   *         description: Role updated
   *       400:
   *         description: Invalid input
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   */
  fastify.put(
    '/:id',
    {
      schema: {
        summary: 'Update role',
        description: 'Update an existing role',
        tags: ['roles'],
        params: zodToJsonSchema(RoleIdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(UpdateRoleSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  role: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof UpdateRoleSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = RoleIdParamSchema.parse(request.params);
        const validated = UpdateRoleSchema.parse(request.body);
        
        const role = await roleRegistry?.updateRole(id, validated);
        if (!role) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Role ${id} not found`)
          );
        }
        
        return reply.send(createSuccessResponse({ role }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to update role');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update role')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/roles/{id}:
   *   delete:
   *     summary: Delete role
   *     description: Delete a custom role
   *     tags: [roles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Role deleted
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Delete role',
        description: 'Delete a custom role',
        tags: ['roles'],
        params: zodToJsonSchema(RoleIdParamSchema) as Record<string, unknown>,
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
        const { id } = RoleIdParamSchema.parse(request.params);
        
        const existingRole = roleRegistry?.getRole(id);
        if (!existingRole) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Role ${id} not found`)
          );
        }
        
        await roleRegistry?.unregisterRole(id);
        return reply.send(createSuccessResponse({ success: true }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to delete role');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete role')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/roles/{id}/assign:
   *   post:
   *     summary: Assign role
   *     description: Assign a role to an agent
   *     tags: [roles]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [agentId]
   *             properties:
   *               agentId:
   *                 type: string
   *     responses:
   *       200:
   *         description: Role assigned
   *       400:
   *         description: Invalid input
   *       404:
   *         description: Role not found
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/:id/assign',
    {
      schema: {
        summary: 'Assign role',
        description: 'Assign a role to an agent',
        tags: ['roles'],
        params: zodToJsonSchema(RoleIdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(AssignRoleSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  assignment: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof AssignRoleSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = RoleIdParamSchema.parse(request.params);
        const validated = AssignRoleSchema.parse(request.body);
        
        const role = roleRegistry?.getRole(id);
        if (!role) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Role ${id} not found`)
          );
        }
        
        const assignment = await roleRegistry?.assignRole(validated.agentId, id);
        return reply.send(createSuccessResponse({ assignment }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to assign role');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to assign role')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/roles/assignments:
   *   get:
   *     summary: List assignments
   *     description: Get all role assignments
   *     tags: [roles]
   *     responses:
   *       200:
   *         description: List of assignments
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/assignments',
    {
      schema: {
        summary: 'List assignments',
        description: 'Get all role assignments',
        tags: ['roles'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  assignments: { type: 'array' },
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
        // Would return all assignments from registry
        return reply.send(
          createSuccessResponse({ assignments: [] }, { requestId: request.id })
        );
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list assignments');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list assignments')
        );
      }
    }
  );
}

export default rolesRoutes;
