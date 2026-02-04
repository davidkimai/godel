/**
 * Task Routes
 * 
 * Fastify routes for task management:
 * - GET /api/tasks - List tasks
 * - POST /api/tasks - Create task
 * - GET /api/tasks/:id - Get task details
 * - PUT /api/tasks/:id - Update task
 * - DELETE /api/tasks/:id - Delete task
 * - POST /api/tasks/:id/assign - Assign task
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createTask, type QualityGate, type TaskReasoning, TaskStatus } from '../../models/task';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';
import { paginateArray, parsePaginationParams, createPaginationLinks } from '../lib/pagination';
import {
  CreateTaskSchema,
  UpdateTaskSchema,
  AssignTaskSchema,
  ListTasksQuerySchema,
  TaskSchema,
  TaskSummarySchema,
  TaskListResponseSchema,
  type CreateTask,
  type UpdateTask,
  type AssignTask,
  type ListTasksQuery,
} from '../schemas/task';
import { IdParamSchema } from '../schemas/common';
import { zodToJsonSchema } from 'zod-to-json-schema';

// In-memory store for tasks
const tasks = new Map<string, ReturnType<typeof createTask>>();

export async function taskRoutes(fastify: FastifyInstance) {
  // ============================================================================
  // GET /api/tasks - List tasks
  // ============================================================================
  fastify.get(
    '/',
    {
      schema: {
        summary: 'List tasks',
        description: 'List all tasks with optional filtering and pagination',
        tags: ['tasks'],
        querystring: zodToJsonSchema(ListTasksQuerySchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TaskListResponseSchema) as Record<string, unknown>,
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: ListTasksQuery }>, reply: FastifyReply) => {
      try {
        const params = parsePaginationParams(request.query);
        
        let taskList = Array.from(tasks.values());
        
        // Apply filters
        if (request.query.status) {
          taskList = taskList.filter(t => t.status === request.query.status);
        }
        if (request.query.assigneeId) {
          taskList = taskList.filter(t => t.assigneeId === request.query.assigneeId);
        }
        if (request.query.priority) {
          taskList = taskList.filter(t => t.priority === request.query.priority);
        }
        
        // Apply pagination
        const paginated = paginateArray(
          taskList.map(t => ({
            id: t.id,
            title: t.title,
            status: t.status,
            priority: t.priority,
            assigneeId: t.assigneeId,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
            completedAt: t.completedAt?.toISOString(),
            dependencyCount: t.dependsOn.length,
            blockedCount: t.blocks.length,
          })),
          request.query
        );
        
        const links = createPaginationLinks('/api/v1/tasks', request.query, paginated);
        
        return reply.send(
          createSuccessResponse(
            {
              tasks: paginated.items,
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
        fastify.log.error({ err: error }, 'Failed to list tasks');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list tasks')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/tasks - Create task
  // ============================================================================
  fastify.post(
    '/',
    {
      schema: {
        summary: 'Create task',
        description: 'Create a new task with the specified configuration',
        tags: ['tasks'],
        body: zodToJsonSchema(CreateTaskSchema) as Record<string, unknown>,
        response: {
          201: zodToJsonSchema(TaskSchema) as Record<string, unknown>,
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: CreateTask }>, reply: FastifyReply) => {
      try {
        const validated = CreateTaskSchema.parse(request.body);
        
        const task = createTask({
          title: validated.title,
          description: validated.description,
          assigneeId: validated.assigneeId,
          dependsOn: validated.dependsOn,
          priority: validated.priority,
          qualityGate: validated.qualityGate as QualityGate | undefined,
          reasoning: validated.reasoning as TaskReasoning | undefined,
        });
        
        tasks.set(task.id, task);
        
        return reply.status(201).send(
          createSuccessResponse({
            ...task,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            completedAt: task.completedAt?.toISOString(),
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to create task');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to create task')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/tasks/:id - Get task details
  // ============================================================================
  fastify.get(
    '/:id',
    {
      schema: {
        summary: 'Get task details',
        description: 'Get detailed information about a specific task',
        tags: ['tasks'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TaskSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        
        const task = tasks.get(id);
        if (!task) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TASK_NOT_FOUND, `Task ${id} not found`)
          );
        }
        
        return reply.send(
          createSuccessResponse({
            ...task,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            completedAt: task.completedAt?.toISOString(),
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to get task');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get task')
        );
      }
    }
  );

  // ============================================================================
  // PUT /api/tasks/:id - Update task
  // ============================================================================
  fastify.put(
    '/:id',
    {
      schema: {
        summary: 'Update task',
        description: 'Update task details',
        tags: ['tasks'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(UpdateTaskSchema) as Record<string, unknown>,
        response: {
          200: zodToJsonSchema(TaskSchema) as Record<string, unknown>,
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: UpdateTask }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = UpdateTaskSchema.parse(request.body);
        
        const task = tasks.get(id);
        if (!task) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TASK_NOT_FOUND, `Task ${id} not found`)
          );
        }
        
        if (validated.title) task.title = validated.title;
        if (validated.description) task.description = validated.description;
        if (validated.status) task.status = validated.status as TaskStatus;
        if (validated.priority) task.priority = validated.priority;
        if (validated.metadata) task.metadata = { ...task.metadata, ...validated.metadata };
        
        task.updatedAt = new Date();
        
        return reply.send(
          createSuccessResponse({
            ...task,
            createdAt: task.createdAt.toISOString(),
            updatedAt: task.updatedAt.toISOString(),
            completedAt: task.completedAt?.toISOString(),
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to update task');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to update task')
        );
      }
    }
  );

  // ============================================================================
  // DELETE /api/tasks/:id - Delete task
  // ============================================================================
  fastify.delete(
    '/:id',
    {
      schema: {
        summary: 'Delete task',
        description: 'Delete a task from the system',
        tags: ['tasks'],
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
        
        if (!tasks.has(id)) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TASK_NOT_FOUND, `Task ${id} not found`)
          );
        }
        
        tasks.delete(id);
        
        return reply.status(204).send();
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Invalid ID format')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to delete task');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to delete task')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/tasks/:id/assign - Assign task
  // ============================================================================
  fastify.post(
    '/:id/assign',
    {
      schema: {
        summary: 'Assign task',
        description: 'Assign a task to an agent',
        tags: ['tasks'],
        params: zodToJsonSchema(IdParamSchema) as Record<string, unknown>,
        body: zodToJsonSchema(AssignTaskSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  taskId: { type: 'string' },
                  agentId: { type: 'string' },
                  assignedAt: { type: 'string', format: 'date-time' },
                  previousAgentId: { type: 'string' },
                },
              },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string }; Body: AssignTask }>, reply: FastifyReply) => {
      try {
        const { id } = IdParamSchema.parse(request.params);
        const validated = AssignTaskSchema.parse(request.body);
        
        const task = tasks.get(id);
        if (!task) {
          return reply.status(404).send(
            createErrorResponse(ErrorCodes.TASK_NOT_FOUND, `Task ${id} not found`)
          );
        }
        
        const previousAgentId = task.assigneeId;
        task.assigneeId = validated.agentId;
        task.updatedAt = new Date();
        
        // If first assignment, set status to in_progress
        if (task.status === TaskStatus.PENDING) {
          task.status = TaskStatus.IN_PROGRESS;
        }
        
        return reply.send(
          createSuccessResponse({
            taskId: id,
            agentId: validated.agentId,
            assignedAt: new Date().toISOString(),
            previousAgentId,
          }, { requestId: request.id })
        );
      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Failed to assign task');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to assign task')
        );
      }
    }
  );
}

export default taskRoutes;
