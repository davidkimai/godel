/**
 * Worktree API Routes
 * 
 * RESTful API endpoints for git worktree management:
 * - GET /api/worktrees - List worktrees
 * - POST /api/worktrees - Create worktree
 * - GET /api/worktrees/:id - Get worktree details
 * - DELETE /api/worktrees/:id - Remove worktree
 * - POST /api/worktrees/:id/cleanup - Cleanup worktree
 * 
 * @module api/routes/worktrees
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { getGlobalWorktreeManager } from '../../core/worktree';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Validation schemas
const ListWorktreesQuerySchema = z.object({
  repository: z.string().optional().describe('Filter by repository path'),
});

const CreateWorktreeSchema = z.object({
  repository: z.string().min(1, 'Repository path is required'),
  branch: z.string().min(1, 'Branch name is required'),
  path: z.string().optional().describe('Custom worktree path'),
  basePath: z.string().optional().describe('Base directory for worktrees'),
});

const WorktreeIdParamSchema = z.object({
  id: z.string().min(1, 'Worktree ID is required'),
});

const CleanupWorktreeSchema = z.object({
  removeBranch: z.boolean().default(false).describe('Delete the associated branch'),
  force: z.boolean().default(false).describe('Force removal even if dirty'),
});

/**
 * Register worktree routes with Fastify
 */
export async function worktreeRoutes(fastify: FastifyInstance): Promise<void> {
  const manager = getGlobalWorktreeManager();
  
  if (!manager) {
    fastify.log.error('Worktree manager not initialized');
    throw new Error('Worktree manager not initialized');
  }

  /**
   * @openapi
   * /api/v1/worktrees:
   *   get:
   *     summary: List worktrees
   *     description: List all git worktrees, optionally filtered by repository
   *     tags: [worktrees]
   *     parameters:
   *       - in: query
   *         name: repository
   *         schema:
   *           type: string
   *         description: Filter by repository path
   *     responses:
   *       200:
   *         description: List of worktrees
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/',
    {
      schema: {
        summary: 'List worktrees',
        description: 'List all git worktrees',
        tags: ['worktrees'],
        querystring: zodToJsonSchema(ListWorktreesQuerySchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  worktrees: { type: 'array' },
                },
              },
              meta: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: { repository?: string } }>, reply: FastifyReply) => {
      try {
        const { repository } = request.query;
        const worktrees = await manager.listWorktrees(repository);
        return reply.send(createSuccessResponse({ worktrees }, { requestId: request.id }));
      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list worktrees');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list worktrees')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/worktrees:
   *   post:
   *     summary: Create worktree
   *     description: Create a new git worktree
   *     tags: [worktrees]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [repository, branch]
   *             properties:
   *               repository:
   *                 type: string
   *               branch:
   *                 type: string
   *               path:
   *                 type: string
   *               basePath:
   *                 type: string
   *     responses:
   *       201:
   *         description: Worktree created
   *       400:
   *         description: Invalid input
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create worktree',
        description: 'Create a new git worktree',
        tags: ['worktrees'],
        body: zodToJsonSchema(CreateWorktreeSchema) as Record<string, unknown>,
        response: {
          201: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  worktree: { type: 'object' },
                },
              },
              meta: { type: 'object' },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateWorktreeSchema> }>, reply: FastifyReply) => {
      try {
        const validated = CreateWorktreeSchema.parse(request.body);
        const worktree = await manager.createWorktree(validated);
        return reply.status(201).send(
          createSuccessResponse({ worktree }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to create worktree');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create worktree')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/worktrees/{id}:
   *   get:
   *     summary: Get worktree
   *     description: Get worktree details by ID
   *     tags: [worktrees]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Worktree details
   *       404:
   *         description: Worktree not found
   *       500:
   *         description: Server error
   */
  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get worktree',
        description: 'Get worktree details by ID',
        tags: ['worktrees'],
        params: zodToJsonSchema(WorktreeIdParamSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  worktree: { type: 'object' },
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
        const { id } = WorktreeIdParamSchema.parse(request.params);
        const worktree = await manager.getWorktree(id);
        
        if (!worktree) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Worktree ${id} not found`)
          );
        }
        
        return reply.send(createSuccessResponse({ worktree }, { requestId: request.id }));
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to get worktree');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get worktree')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/worktrees/{id}:
   *   delete:
   *     summary: Remove worktree
   *     description: Remove a git worktree
   *     tags: [worktrees]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       204:
   *         description: Worktree removed
   *       404:
   *         description: Worktree not found
   *       500:
   *         description: Server error
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Remove worktree',
        description: 'Remove a git worktree',
        tags: ['worktrees'],
        params: zodToJsonSchema(WorktreeIdParamSchema) as Record<string, unknown>,
        response: {
          204: { type: 'null' },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = WorktreeIdParamSchema.parse(request.params);
        const worktree = await manager.getWorktree(id);
        
        if (!worktree) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Worktree ${id} not found`)
          );
        }
        
        await manager.removeWorktree(worktree);
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        fastify.log.error({ err: error }, 'Failed to remove worktree');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to remove worktree')
        );
      }
    }
  );

  /**
   * @openapi
   * /api/v1/worktrees/{id}/cleanup:
   *   post:
   *     summary: Cleanup worktree
   *     description: Cleanup and optionally delete branch
   *     tags: [worktrees]
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
   *               deleteBranch:
   *                 type: boolean
   *               force:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Worktree cleaned up
   *       404:
   *         description: Worktree not found
   *       500:
   *         description: Server error
   */
  fastify.post(
    '/:id/cleanup',
    {
      schema: {
        summary: 'Cleanup worktree',
        description: 'Cleanup worktree with options',
        tags: ['worktrees'],
        params: zodToJsonSchema(WorktreeIdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(CleanupWorktreeSchema) as Record<string, unknown>,
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
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: z.infer<typeof CleanupWorktreeSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { id } = WorktreeIdParamSchema.parse(request.params);
        const validated = CleanupWorktreeSchema.parse(request.body);
        
        const worktree = await manager.getWorktree(id);
        if (!worktree) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.NOT_FOUND, `Worktree ${id} not found`)
          );
        }
        
        await manager.removeWorktree(worktree, validated);
        return reply.send(
          createSuccessResponse({ success: true }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        fastify.log.error({ err: error }, 'Failed to cleanup worktree');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to cleanup worktree')
        );
      }
    }
  );
}

export default worktreeRoutes;
