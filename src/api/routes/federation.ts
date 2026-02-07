/**
 * Federation API Routes
 *
 * Provides REST API endpoints for the federation system:
 * - POST /api/federation/decompose - Decompose tasks into subtasks
 * - POST /api/federation/execute - Execute tasks with federation
 * - GET /api/federation/execute/:id - Get execution status
 * - GET /api/federation/agents - List federation agents
 * - GET /api/federation/status - Get federation status
 * - POST /api/federation/plan - Generate execution plans
 * - GET /api/federation/health - Health check
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { TaskDecomposer } from '../../federation/task-decomposer';
import { DependencyResolver } from '../../federation/dependency-resolver';
import { 
  ExecutionEngine, 
  InMemoryAgentSelector,
  InMemoryTaskExecutor,
} from '../../federation/execution-engine';
import { ExecutionTracker } from '../../federation/execution-tracker';
import { createSuccessResponse, createErrorResponse, ErrorCodes } from '../lib/response';

// ============================================================================
// In-Memory Execution Store (would be Redis/database in production)
// ============================================================================
interface ExecutionRecord {
  id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  task: string;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  progress: {
    completed: number;
    failed: number;
    total: number;
    percentage: number;
  };
  result?: unknown;
  error?: string;
}

const executionStore = new Map<string, ExecutionRecord>();

// ============================================================================
// Validation Schemas
// ============================================================================

const DecomposeRequestSchema = z.object({
  task: z.string().min(1).max(10000),
  strategy: z.enum(['file-based', 'component-based', 'domain-based', 'llm-assisted']).default('component-based'),
  maxParallelism: z.number().int().min(1).max(100).default(10),
  context: z.object({
    files: z.array(z.string()).optional(),
    components: z.array(z.string()).optional(),
    domains: z.array(z.string()).optional(),
  }).optional(),
});

const ExecuteRequestSchema = z.object({
  task: z.string().min(1).max(10000),
  config: z.object({
    maxAgents: z.number().int().min(1).max(100).default(10),
    strategy: z.enum(['balanced', 'fastest', 'cheapest', 'skill-match', 'round-robin']).default('balanced'),
    decompositionStrategy: z.enum(['file-based', 'component-based', 'domain-based', 'llm-assisted']).default('component-based'),
    budget: z.number().min(0).default(5.00),
    timeout: z.number().int().min(1000).default(3600000), // 1 hour default
    continueOnFailure: z.boolean().default(false),
  }).optional(),
});

const PlanRequestSchema = z.object({
  task: z.string().min(1).max(10000),
  strategy: z.enum(['file-based', 'component-based', 'domain-based', 'llm-assisted']).default('component-based'),
  maxAgents: z.number().int().min(1).max(100).default(10),
});

// ============================================================================
// Route Handlers
// ============================================================================

export async function federationRoutes(fastify: FastifyInstance): Promise<void> {
  // Get federation registry from app context (if available)
  const registry = (fastify as any).federationRegistry;
  const router = (fastify as any).federationRouter;

  // ============================================================================
  // POST /api/federation/decompose - Decompose a task into subtasks
  // ============================================================================
  fastify.post(
    '/decompose',
    {
      schema: {
        summary: 'Decompose a task into subtasks',
        description: 'Break down a large task into smaller, parallelizable subtasks with dependencies',
        tags: ['federation'],
        body: zodToJsonSchema(DecomposeRequestSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  task: { type: 'string' },
                  subtasks: { type: 'array' },
                  executionLevels: { type: 'array' },
                  parallelizationRatio: { type: 'number' },
                  totalComplexity: { type: 'string' },
                  strategyUsed: { type: 'string' },
                  decomposedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
          400: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof DecomposeRequestSchema> }>, reply: FastifyReply) => {
      try {
        const validated = DecomposeRequestSchema.parse(request.body);
        
        const decomposer = new TaskDecomposer();
        const result = await decomposer.decompose(validated.task, validated.context, {
          strategy: validated.strategy,
          maxParallelism: validated.maxParallelism,
        });

        return reply.send(createSuccessResponse({
          task: validated.task,
          subtasks: result.subtasks,
          executionLevels: result.executionLevels,
          parallelizationRatio: result.parallelizationRatio,
          totalComplexity: result.totalComplexity,
          strategyUsed: result.strategyUsed,
          decomposedAt: result.decomposedAt.toISOString(),
        }, { requestId: request.id }));

      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
              details: error.errors as unknown as Record<string, unknown>,
            })
          );
        }
        
        fastify.log.error({ err: error }, 'Task decomposition failed');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Task decomposition failed')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/federation/plan - Generate an execution plan
  // ============================================================================
  fastify.post(
    '/plan',
    {
      schema: {
        summary: 'Generate execution plan',
        description: 'Create a detailed execution plan without executing',
        tags: ['federation'],
        body: zodToJsonSchema(PlanRequestSchema) as Record<string, unknown>,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  task: { type: 'string' },
                  subtasks: { type: 'array' },
                  plan: { type: 'object' },
                  metrics: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof PlanRequestSchema> }>, reply: FastifyReply) => {
      try {
        const validated = PlanRequestSchema.parse(request.body);
        
        // Decompose task
        const decomposer = new TaskDecomposer();
        const decomposition = await decomposer.decompose(validated.task, undefined, {
          strategy: validated.strategy,
          maxParallelism: validated.maxAgents,
        });

        // Build execution plan
        const resolver = new DependencyResolver();
        resolver.buildGraph(decomposition.subtasks.map(st => ({
          id: st.id,
          task: {
            id: st.id,
            name: st.title,
            description: st.description,
            requiredSkills: st.requiredCapabilities || [],
            priority: 'medium',
          },
          dependencies: st.dependencies,
        })));

        const plan = resolver.getExecutionPlan();

        return reply.send(createSuccessResponse({
          task: validated.task,
          subtasks: decomposition.subtasks,
          plan: {
            totalLevels: plan.levels.length,
            totalTasks: plan.totalTasks,
            estimatedParallelism: plan.estimatedParallelism,
            criticalPath: plan.criticalPath,
            levels: plan.levels,
          },
          metrics: {
            parallelizationRatio: decomposition.parallelizationRatio,
            totalComplexity: decomposition.totalComplexity,
          },
        }, { requestId: request.id }));

      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Plan generation failed');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Plan generation failed')
        );
      }
    }
  );

  // ============================================================================
  // POST /api/federation/execute - Execute a task with federation
  // ============================================================================
  fastify.post(
    '/execute',
    {
      schema: {
        summary: 'Execute task with federation',
        description: 'Decompose and execute a task using distributed agent federation',
        tags: ['federation'],
        body: zodToJsonSchema(ExecuteRequestSchema) as Record<string, unknown>,
        response: {
          202: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  executionId: { type: 'string' },
                  status: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof ExecuteRequestSchema> }>, reply: FastifyReply) => {
      try {
        const validated = ExecuteRequestSchema.parse(request.body);
        const config = validated.config || {};
        
        // Generate execution ID
        const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        
        // Create execution record
        const execution: ExecutionRecord = {
          id: executionId,
          status: 'pending',
          task: validated.task,
          createdAt: new Date(),
          progress: { completed: 0, failed: 0, total: 0, percentage: 0 },
        };
        executionStore.set(executionId, execution);

        // Return immediately with execution ID
        reply.status(202).send(createSuccessResponse({
          executionId,
          status: 'pending',
          message: 'Execution started. Use GET /federation/execute/:id for status.',
        }, { requestId: request.id }));

        // Execute asynchronously
        executeTaskAsync(executionId, validated.task, config).catch(error => {
          fastify.log.error({ err: error, executionId }, 'Async execution failed');
          const record = executionStore.get(executionId);
          if (record) {
            record.status = 'failed';
            record.error = error instanceof Error ? error.message : String(error);
            record.completedAt = new Date();
          }
        });

      } catch (error) {
        if (error instanceof z.ZodError) {
          return reply.status(400).send(
            createErrorResponse(ErrorCodes.VALIDATION_ERROR, 'Validation failed')
          );
        }
        
        fastify.log.error({ err: error }, 'Execution start failed');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to start execution')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/federation/execute/:id - Get execution status
  // ============================================================================
  fastify.get(
    '/execute/:id',
    {
      schema: {
        summary: 'Get execution status',
        description: 'Get the status and progress of a federation execution',
        tags: ['federation'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
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
                  id: { type: 'string' },
                  status: { type: 'string' },
                  task: { type: 'string' },
                  progress: { type: 'object' },
                  result: { type: 'object' },
                  error: { type: 'string' },
                },
              },
            },
          },
          404: { type: 'object', properties: { success: { type: 'boolean' }, error: { type: 'object' } } },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const execution = executionStore.get(id);
      
      if (!execution) {
        return reply.status(404).send(
          createErrorResponse(ErrorCodes.NOT_FOUND, `Execution ${id} not found`)
        );
      }
      
      return reply.send(createSuccessResponse({
        id: execution.id,
        status: execution.status,
        task: execution.task,
        createdAt: execution.createdAt.toISOString(),
        startedAt: execution.startedAt?.toISOString(),
        completedAt: execution.completedAt?.toISOString(),
        progress: execution.progress,
        result: execution.result,
        error: execution.error,
      }, { requestId: request.id }));
    }
  );

  // ============================================================================
  // GET /api/federation/agents - List federation agents
  // ============================================================================
  fastify.get(
    '/agents',
    {
      schema: {
        summary: 'List federation agents',
        description: 'Get all agents registered in the federation',
        tags: ['federation'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  count: { type: 'number' },
                  agents: { type: 'array' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Return mock agents for demo (in production would query actual registry)
        const mockAgents = Array.from({ length: 5 }, (_, i) => ({
          id: `agent-${i + 1}`,
          status: i < 2 ? 'busy' : 'idle',
          capabilities: {
            skills: ['typescript', 'testing', 'api'],
            costPerHour: 0.50 + (i * 0.10),
          },
          load: i < 2 ? 0.75 : 0.0,
        }));
        
        return reply.send(createSuccessResponse({
          count: mockAgents.length,
          agents: mockAgents,
        }, { requestId: request.id }));

      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to list agents');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to list agents')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/federation/status - Get federation status
  // ============================================================================
  fastify.get(
    '/status',
    {
      schema: {
        summary: 'Get federation status',
        description: 'Get overall federation system status and metrics',
        tags: ['federation'],
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              data: {
                type: 'object',
                properties: {
                  timestamp: { type: 'string' },
                  status: { type: 'string' },
                  agents: { type: 'object' },
                  cost: { type: 'object' },
                  federation: { type: 'object' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const agentCount = 5; // Mock data
        const healthy = 5;
        const busy = 2;
        const idle = 3;
        
        return reply.send(createSuccessResponse({
          timestamp: new Date().toISOString(),
          status: healthy > 0 ? 'active' : 'inactive',
          agents: {
            total: agentCount,
            healthy,
            busy,
            idle,
          },
          cost: {
            estimatedHourly: agentCount * 0.50,
            currency: 'USD',
          },
          federation: {
            capacity: agentCount,
            utilization: agentCount > 0 ? busy / agentCount : 0,
          },
        }, { requestId: request.id }));

      } catch (error) {
        fastify.log.error({ err: error }, 'Failed to get federation status');
        return reply.status(500).send(
          createErrorResponse(ErrorCodes.INTERNAL_ERROR, 'Failed to get federation status')
        );
      }
    }
  );

  // ============================================================================
  // GET /api/federation/health - Health check
  // ============================================================================
  fastify.get(
    '/health',
    {
      schema: {
        summary: 'Federation health check',
        description: 'Quick health check for the federation system',
        tags: ['federation'],
        response: {
          200: {
            type: 'object',
            properties: {
              healthy: { type: 'boolean' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async () => {
      return {
        healthy: true,
        timestamp: new Date().toISOString(),
      };
    }
  );

  // ============================================================================
  // Legacy Federation Routes (existing)
  // ============================================================================

  // List instances
  fastify.get('/instances', async () => {
    const instances = registry ? registry.getAllInstances() : [];
    return { instances };
  });

  // Register instance
  fastify.post('/instances', async (request) => {
    if (!registry) {
      return { error: 'Federation not initialized' };
    }
    const instance = await registry.register(request.body as any);
    return { instance };
  });

  // Get instance
  fastify.get('/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    const instance = registry?.getInstance(id);
    if (!instance) {
      return reply.status(404).send({ error: 'Instance not found' });
    }
    return { instance };
  });

  // Unregister instance
  fastify.delete('/instances/:id', async (request, reply) => {
    const { id } = request.params as { id: string };
    await registry?.unregister(id);
    return { success: true };
  });

  // Get capacity report
  fastify.get('/capacity', async () => {
    const report = registry ? registry.getCapacityReport() : null;
    return { report };
  });

  // Test routing
  fastify.post('/route', async (request) => {
    const context = request.body as any;
    const selection = router ? router.selectInstance(context) : null;
    return { selection };
  });
}

// ============================================================================
// Async Execution Helper
// ============================================================================

async function executeTaskAsync(
  executionId: string,
  task: string,
  config: z.infer<typeof ExecuteRequestSchema>['config']
): Promise<void> {
  const record = executionStore.get(executionId);
  if (!record) return;

  // Update status to running
  record.status = 'running';
  record.startedAt = new Date();

  try {
    // Step 1: Decompose task
    const decomposer = new TaskDecomposer();
    const decomposition = await decomposer.decompose(task, undefined, {
      strategy: config?.decompositionStrategy || 'component-based',
      maxParallelism: config?.maxAgents || 10,
    });

    record.progress.total = decomposition.subtasks.length;

    // Step 2: Build execution plan
    const resolver = new DependencyResolver();
    resolver.buildGraph(decomposition.subtasks.map(st => ({
      id: st.id,
      task: {
        id: st.id,
        name: st.title,
        description: st.description,
        requiredSkills: st.requiredCapabilities || [],
        priority: 'medium',
      },
      dependencies: st.dependencies,
    })));

    const plan = resolver.getExecutionPlan();

    // Step 3: Initialize components
    const mockAgents = Array.from({ length: config?.maxAgents || 5 }, (_, i) => ({
      id: `agent-${i + 1}`,
      name: `Agent ${i + 1}`,
      skills: ['typescript', 'javascript', 'testing'],
      estimatedCost: 0.50,
      estimatedLatency: 1000,
    }));
    
    const selector = new InMemoryAgentSelector(mockAgents);
    
    // Create task executor
    const executor: import('../../federation/types').TaskExecutor = {
      execute: async (_agentId: string, subtask) => {
        // Simulate task execution
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Update progress
        record.progress.completed++;
        record.progress.percentage = Math.round(
          (record.progress.completed / record.progress.total) * 100
        );
        
        return { success: true, subtaskId: subtask.id };
      },
      cancel: async () => true,
    };

    // Step 4: Execute
    const engine = new ExecutionEngine(selector, executor, {
      maxConcurrency: config?.maxAgents || 10,
      continueOnFailure: config?.continueOnFailure || false,
      levelTimeoutMs: 300000,
      totalTimeoutMs: config?.timeout || 3600000,
      retryAttempts: 1,
      retryDelayMs: 1000,
    });

    const result = await engine.executePlan(plan);

    // Update final status
    record.status = result.failed > 0 ? 'failed' : 'completed';
    record.result = {
      completed: result.completed,
      failed: result.failed,
      cancelled: result.cancelled,
      durationMs: result.durationMs,
    };
    record.completedAt = new Date();

  } catch (error) {
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    record.completedAt = new Date();
    throw error;
  }
}

export default federationRoutes;
