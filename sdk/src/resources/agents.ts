/**
 * @godel/client SDK - Agents Resource
 * 
 * Resource class for managing Godel agents - individual worker instances.
 */

import { GodelClient } from '../client';
import {
  Agent,
  AgentListResponse,
  AgentLog,
  Task,
  SpawnAgentRequest,
  AssignTaskRequest,
  PaginationParams,
} from '../types';
import { NotFoundError, ValidationError } from '../errors';

/**
 * Resource for managing Godel agents.
 * Provides methods to spawn, list, get, kill agents and manage their tasks.
 * 
 * @example
 * ```typescript
 * const client = new GodelClient({ apiUrl, apiKey });
 * 
 * // Spawn a new agent
 * const agent = await client.agents.spawn({
 *   config: {
 *     image: 'godel/agent:latest',
 *     resources: { cpu: '1', memory: '2Gi' },
 *   },
 * });
 * 
 * // Assign a task
 * const task = await client.agents.assignTask(agent.id, {
 *   config: {
 *     type: 'process-data',
 *     payload: { fileUrl: 'https://example.com/data.csv' },
 *   },
 * });
 * 
 * // Get logs
 * const logs = await client.agents.getLogs(agent.id);
 * ```
 */
export class AgentsResource {
  private readonly client: GodelClient;
  private readonly basePath = '/agents';

  constructor(client: GodelClient) {
    this.client = client;
  }

  /**
   * Spawn a new agent
   * 
   * @param request - Agent spawn request
   * @returns The created agent
   * @throws {ValidationError} If the request is invalid
   * @throws {NotFoundError} If the specified swarm doesn't exist
   * 
   * @example
   * ```typescript
   * // Spawn standalone agent
   * const agent = await client.agents.spawn({
   *   name: 'my-agent',
   *   config: {
   *     image: 'godel/agent:v1.0.0',
   *     version: 'v1.0.0',
   *     resources: {
   *       cpu: '1',
   *       memory: '2Gi',
   *     },
   *     env: {
   *       API_KEY: 'secret-key',
   *     },
   *   },
   * });
   * 
   * // Spawn agent in a swarm
   * const agent = await client.agents.spawn({
   *   swarmId: 'swarm-123',
   *   config: {
   *     image: 'godel/agent:v1.0.0',
   *     capabilities: {
   *       canExecute: true,
   *       canAccessFilesystem: true,
   *     },
   *   },
   *   wait: true,
   *   timeout: 60,
   * });
   * ```
   */
  async spawn(request: SpawnAgentRequest): Promise<Agent> {
    if (!request.config) {
      throw new ValidationError('Agent config is required', {
        validationErrors: [{ field: 'config', message: 'Config is required', code: 'required' }],
      });
    }

    if (!request.config.image) {
      throw new ValidationError('Agent image is required', {
        validationErrors: [{ field: 'config.image', message: 'Image is required', code: 'required' }],
      });
    }

    return this.client.post<Agent>(this.basePath, request);
  }

  /**
   * List all agents with optional filtering and pagination
   * 
   * @param params - Pagination and filter parameters
   * @returns Paginated list of agents
   * 
   * @example
   * ```typescript
   * // List all agents
   * const agents = await client.agents.list();
   * 
   * // List agents in a specific swarm
   * const agents = await client.agents.list({
   *   swarmId: 'swarm-123',
   * });
   * 
   * // List with filters
   * const agents = await client.agents.list({
   *   status: 'running',
   *   page: 1,
   *   limit: 50,
   * });
   * ```
   */
  async list(
    params?: PaginationParams & { swarmId?: string; status?: string }
  ): Promise<AgentListResponse> {
    const query: Record<string, unknown> = {};

    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    if (params?.sortBy) query.sort_by = params.sortBy;
    if (params?.sortOrder) query.sort_order = params.sortOrder;
    if (params?.cursor) query.cursor = params.cursor;
    if (params?.swarmId) query.swarm_id = params.swarmId;
    if (params?.status) query.status = params.status;

    return this.client.get<AgentListResponse>(this.basePath, query);
  }

  /**
   * Get a single agent by ID
   * 
   * @param agentId - The agent ID
   * @returns The agent
   * @throws {NotFoundError} If the agent doesn't exist
   * 
   * @example
   * ```typescript
   * const agent = await client.agents.get('agent-123');
   * console.log(`Agent status: ${agent.status}`);
   * console.log(`CPU: ${agent.metrics.cpuUtilization}%`);
   * ```
   */
  async get(agentId: string): Promise<Agent> {
    if (!agentId || agentId.trim().length === 0) {
      throw new ValidationError('Agent ID is required', {
        validationErrors: [{ field: 'agentId', message: 'Agent ID is required', code: 'required' }],
      });
    }

    try {
      return await this.client.get<Agent>(`${this.basePath}/${agentId}`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Agent not found: ${agentId}`, {
          resourceType: 'agent',
          resourceId: agentId,
        });
      }
      throw error;
    }
  }

  /**
   * Kill/stop an agent
   * 
   * @param agentId - The agent ID to kill
   * @param options - Kill options
   * @param options.force - Force kill immediately (SIGKILL)
   * @param options.gracePeriod - Grace period in seconds before force kill
   * @returns The stopped agent
   * @throws {NotFoundError} If the agent doesn't exist
   * 
   * @example
   * ```typescript
   * // Graceful shutdown
   * await client.agents.kill('agent-123');
   * 
   * // Force kill
   * await client.agents.kill('agent-123', { force: true });
   * 
   * // Custom grace period
   * await client.agents.kill('agent-123', { gracePeriod: 30 });
   * ```
   */
  async kill(
    agentId: string,
    options?: { force?: boolean; gracePeriod?: number }
  ): Promise<Agent> {
    if (!agentId || agentId.trim().length === 0) {
      throw new ValidationError('Agent ID is required', {
        validationErrors: [{ field: 'agentId', message: 'Agent ID is required', code: 'required' }],
      });
    }

    const body: Record<string, unknown> = {};
    if (options?.force) body.force = true;
    if (options?.gracePeriod) body.grace_period = options.gracePeriod;

    try {
      return await this.client.post<Agent>(`${this.basePath}/${agentId}/kill`, body);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Agent not found: ${agentId}`, {
          resourceType: 'agent',
          resourceId: agentId,
        });
      }
      throw error;
    }
  }

  /**
   * Get agent logs
   * 
   * @param agentId - The agent ID
   * @param options - Log retrieval options
   * @param options.since - Get logs since this timestamp (ISO string)
   * @param options.until - Get logs until this timestamp (ISO string)
   * @param options.tail - Number of recent log lines to retrieve
   * @param options.follow - Whether to stream logs (not yet implemented)
   * @returns Array of log entries
   * @throws {NotFoundError} If the agent doesn't exist
   * 
   * @example
   * ```typescript
   * // Get last 100 log lines
   * const logs = await client.agents.getLogs('agent-123', { tail: 100 });
   * 
   * // Get logs from last hour
   * const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
   * const logs = await client.agents.getLogs('agent-123', { since: oneHourAgo });
   * 
   * // Print logs
   * logs.forEach(log => {
   *   console.log(`[${log.level}] ${log.message}`);
   * });
   * ```
   */
  async getLogs(
    agentId: string,
    options?: {
      since?: string;
      until?: string;
      tail?: number;
      follow?: boolean;
    }
  ): Promise<AgentLog[]> {
    if (!agentId || agentId.trim().length === 0) {
      throw new ValidationError('Agent ID is required', {
        validationErrors: [{ field: 'agentId', message: 'Agent ID is required', code: 'required' }],
      });
    }

    const query: Record<string, unknown> = {};
    if (options?.since) query.since = options.since;
    if (options?.until) query.until = options.until;
    if (options?.tail) query.tail = options.tail;
    if (options?.follow) query.follow = options.follow;

    try {
      const response = await this.client.get<{ logs: AgentLog[] }>(`${this.basePath}/${agentId}/logs`, query);
      return response.logs;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Agent not found: ${agentId}`, {
          resourceType: 'agent',
          resourceId: agentId,
        });
      }
      throw error;
    }
  }

  /**
   * Assign a task to an agent
   * 
   * @param agentId - The agent ID (optional if swarmId is provided for auto-assignment)
   * @param request - Task assignment request
   * @returns The created task
   * @throws {NotFoundError} If the agent doesn't exist
   * @throws {ValidationError} If the task config is invalid
   * @throws {ConflictError} If the agent is not available for tasks
   * 
   * @example
   * ```typescript
   * // Assign to specific agent
   * const task = await client.agents.assignTask('agent-123', {
   *   config: {
   *     type: 'process-image',
   *     payload: {
   *       imageUrl: 'https://example.com/image.jpg',
   *       operations: ['resize', 'compress'],
   *     },
   *     timeout: 300,
   *     priority: 5,
   *   },
   * });
   * 
   * // Assign and wait for completion
   * const task = await client.agents.assignTask('agent-123', {
   *   config: { type: 'quick-task', payload: {} },
   *   wait: true,
   *   timeout: 60,
   * });
   * console.log('Task result:', task.result);
   * 
   * // Auto-assign to any available agent in swarm
   * const task = await client.agents.assignTask(undefined, {
   *   swarmId: 'swarm-123',
   *   config: { type: 'distributed-task', payload: data },
   * });
   * ```
   */
  async assignTask(
    agentId: string | undefined,
    request: AssignTaskRequest
  ): Promise<Task> {
    if (!request.config) {
      throw new ValidationError('Task config is required', {
        validationErrors: [{ field: 'config', message: 'Config is required', code: 'required' }],
      });
    }

    if (!request.config.type) {
      throw new ValidationError('Task type is required', {
        validationErrors: [{ field: 'config.type', message: 'Type is required', code: 'required' }],
      });
    }

    // Build the request body
    const body: Record<string, unknown> = {
      config: request.config,
      wait: request.wait,
      timeout: request.timeout,
    };

    // Add swarmId for auto-assignment if no agentId
    if (!agentId && request.swarmId) {
      body.swarm_id = request.swarmId;
    }

    // If agentId provided, assign directly; otherwise use auto-assign endpoint
    const path = agentId
      ? `${this.basePath}/${agentId}/tasks`
      : `${this.basePath}/tasks/assign`;

    try {
      return await this.client.post<Task>(path, body);
    } catch (error) {
      if (error instanceof NotFoundError) {
        if (agentId) {
          throw new NotFoundError(`Agent not found: ${agentId}`, {
            resourceType: 'agent',
            resourceId: agentId,
          });
        } else if (request.swarmId) {
          throw new NotFoundError(`Swarm not found: ${request.swarmId}`, {
            resourceType: 'swarm',
            resourceId: request.swarmId,
          });
        }
      }
      throw error;
    }
  }

  /**
   * Get all tasks for an agent
   * 
   * @param agentId - The agent ID
   * @param params - Pagination and filter parameters
   * @returns Paginated list of tasks
   * @throws {NotFoundError} If the agent doesn't exist
   * 
   * @example
   * ```typescript
   * // Get all tasks
   * const tasks = await client.agents.getTasks('agent-123');
   * 
   * // Get completed tasks only
   * const tasks = await client.agents.getTasks('agent-123', {
   *   status: 'completed',
   *   limit: 10,
   * });
   * ```
   */
  async getTasks(
    agentId: string,
    params?: PaginationParams & { status?: string }
  ): Promise<{ items: Task[]; total: number }> {
    if (!agentId || agentId.trim().length === 0) {
      throw new ValidationError('Agent ID is required', {
        validationErrors: [{ field: 'agentId', message: 'Agent ID is required', code: 'required' }],
      });
    }

    const query: Record<string, unknown> = {};
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    if (params?.status) query.status = params.status;

    try {
      return await this.client.get<{ items: Task[]; total: number }>(
        `${this.basePath}/${agentId}/tasks`,
        query
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Agent not found: ${agentId}`, {
          resourceType: 'agent',
          resourceId: agentId,
        });
      }
      throw error;
    }
  }

  /**
   * Restart an agent
   * 
   * @param agentId - The agent ID to restart
   * @returns The restarted agent
   * @throws {NotFoundError} If the agent doesn't exist
   * 
   * @example
   * ```typescript
   * const agent = await client.agents.restart('agent-123');
   * console.log(`Agent restarted, new status: ${agent.status}`);
   * ```
   */
  async restart(agentId: string): Promise<Agent> {
    if (!agentId || agentId.trim().length === 0) {
      throw new ValidationError('Agent ID is required', {
        validationErrors: [{ field: 'agentId', message: 'Agent ID is required', code: 'required' }],
      });
    }

    try {
      return await this.client.post<Agent>(`${this.basePath}/${agentId}/restart`, {});
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Agent not found: ${agentId}`, {
          resourceType: 'agent',
          resourceId: agentId,
        });
      }
      throw error;
    }
  }

  /**
   * Get agent metrics history
   * 
   * @param agentId - The agent ID
   * @param options - Query options
   * @param options.since - Start time (ISO string)
   * @param options.until - End time (ISO string)
   * @param options.interval - Aggregation interval in seconds
   * @returns Array of metrics snapshots
   * @throws {NotFoundError} If the agent doesn't exist
   */
  async getMetricsHistory(
    agentId: string,
    options?: {
      since?: string;
      until?: string;
      interval?: number;
    }
  ): Promise<Agent['metrics'][]> {
    if (!agentId || agentId.trim().length === 0) {
      throw new ValidationError('Agent ID is required', {
        validationErrors: [{ field: 'agentId', message: 'Agent ID is required', code: 'required' }],
      });
    }

    const query: Record<string, unknown> = {};
    if (options?.since) query.since = options.since;
    if (options?.until) query.until = options.until;
    if (options?.interval) query.interval = options.interval;

    try {
      const response = await this.client.get<{ metrics: Agent['metrics'][] }>(
        `${this.basePath}/${agentId}/metrics/history`,
        query
      );
      return response.metrics;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Agent not found: ${agentId}`, {
          resourceType: 'agent',
          resourceId: agentId,
        });
      }
      throw error;
    }
  }
}
