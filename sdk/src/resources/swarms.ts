/**
 * @dash/client SDK - Swarms Resource
 * 
 * Resource class for managing Dash swarms - groups of agents that work together.
 */

import { DashClient } from '../client';
import {
  Swarm,
  SwarmListResponse,
  CreateSwarmRequest,
  UpdateSwarmRequest,
  ScaleSwarmRequest,
  PaginationParams,
} from '../types';
import { NotFoundError, ValidationError } from '../errors';

/**
 * Resource for managing Dash swarms.
 * Provides methods to create, list, update, delete, and scale swarms.
 * 
 * @example
 * ```typescript
 * const client = new DashClient({ apiUrl, apiKey });
 * 
 * // Create a new swarm
 * const swarm = await client.swarms.create({
 *   name: 'my-processing-swarm',
 *   config: {
 *     agentImage: 'dash/agent:latest',
 *     scalingPolicy: {
 *       minAgents: 2,
 *       maxAgents: 10,
 *     },
 *   },
 * });
 * 
 * // List all swarms
 * const swarms = await client.swarms.list();
 * 
 * // Scale a swarm
 * await client.swarms.scale(swarm.id, { targetAgentCount: 5 });
 * 
 * // Delete when done
 * await client.swarms.delete(swarm.id);
 * ```
 */
export class SwarmsResource {
  private readonly client: DashClient;
  private readonly basePath = '/swarms';

  constructor(client: DashClient) {
    this.client = client;
  }

  /**
   * Create a new swarm
   * 
   * @param request - Swarm creation request
   * @returns The created swarm
   * @throws {ValidationError} If the request is invalid
   * @throws {AuthenticationError} If authentication fails
   * @throws {ConflictError} If a swarm with the same name exists
   * 
   * @example
   * ```typescript
   * const swarm = await client.swarms.create({
   *   name: 'processing-swarm',
   *   description: 'Handles data processing tasks',
   *   config: {
   *     agentImage: 'dash/agent:v1.0.0',
   *     agentVersion: 'v1.0.0',
   *     scalingPolicy: {
   *       minAgents: 2,
   *       maxAgents: 20,
   *       targetCpuUtilization: 70,
   *     },
   *     resources: {
   *       cpu: '1',
   *       memory: '2Gi',
   *     },
   *   },
   *   initialAgentCount: 3,
   *   tags: ['production', 'processing'],
   * });
   * ```
   */
  async create(request: CreateSwarmRequest): Promise<Swarm> {
    // Validate required fields
    if (!request.name || request.name.trim().length === 0) {
      throw new ValidationError('Swarm name is required', {
        validationErrors: [{ field: 'name', message: 'Name is required', code: 'required' }],
      });
    }

    if (!request.config) {
      throw new ValidationError('Swarm config is required', {
        validationErrors: [{ field: 'config', message: 'Config is required', code: 'required' }],
      });
    }

    if (!request.config.agentImage) {
      throw new ValidationError('Agent image is required in config', {
        validationErrors: [{ field: 'config.agentImage', message: 'Agent image is required', code: 'required' }],
      });
    }

    return this.client.post<Swarm>(this.basePath, request);
  }

  /**
   * List all swarms with optional filtering and pagination
   * 
   * @param params - Pagination and filter parameters
   * @returns Paginated list of swarms
   * 
   * @example
   * ```typescript
   * // List first page
   * const page1 = await client.swarms.list();
   * 
   * // List with pagination
   * const page2 = await client.swarms.list({ page: 2, limit: 20 });
   * 
   * // List sorted by creation date
   * const swarms = await client.swarms.list({
   *   sortBy: 'createdAt',
   *   sortOrder: 'desc',
   * });
   * ```
   */
  async list(params?: PaginationParams): Promise<SwarmListResponse> {
    const query: Record<string, unknown> = {};
    
    if (params?.page) query.page = params.page;
    if (params?.limit) query.limit = params.limit;
    if (params?.sortBy) query.sort_by = params.sortBy;
    if (params?.sortOrder) query.sort_order = params.sortOrder;
    if (params?.cursor) query.cursor = params.cursor;

    return this.client.get<SwarmListResponse>(this.basePath, query);
  }

  /**
   * Get a single swarm by ID
   * 
   * @param swarmId - The swarm ID
   * @returns The swarm
   * @throws {NotFoundError} If the swarm doesn't exist
   * @throws {AuthenticationError} If authentication fails
   * 
   * @example
   * ```typescript
   * const swarm = await client.swarms.get('swarm-123');
   * console.log(`Swarm status: ${swarm.status}`);
   * console.log(`Running agents: ${swarm.metrics.runningAgents}`);
   * ```
   */
  async get(swarmId: string): Promise<Swarm> {
    if (!swarmId || swarmId.trim().length === 0) {
      throw new ValidationError('Swarm ID is required', {
        validationErrors: [{ field: 'swarmId', message: 'Swarm ID is required', code: 'required' }],
      });
    }

    try {
      return await this.client.get<Swarm>(`${this.basePath}/${swarmId}`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Swarm not found: ${swarmId}`, {
          resourceType: 'swarm',
          resourceId: swarmId,
        });
      }
      throw error;
    }
  }

  /**
   * Update an existing swarm
   * 
   * @param swarmId - The swarm ID to update
   * @param request - Update request with fields to modify
   * @returns The updated swarm
   * @throws {NotFoundError} If the swarm doesn't exist
   * @throws {ValidationError} If the update request is invalid
   * @throws {ConflictError} If there's a conflict with the current state
   * 
   * @example
   * ```typescript
   * // Update name and description
   * const updated = await client.swarms.update('swarm-123', {
   *   name: 'new-name',
   *   description: 'Updated description',
   * });
   * 
   * // Update scaling policy
   * await client.swarms.update('swarm-123', {
   *   config: {
   *     scalingPolicy: {
   *       minAgents: 5,
   *       maxAgents: 50,
   *     },
   *   },
   * });
   * ```
   */
  async update(swarmId: string, request: UpdateSwarmRequest): Promise<Swarm> {
    if (!swarmId || swarmId.trim().length === 0) {
      throw new ValidationError('Swarm ID is required', {
        validationErrors: [{ field: 'swarmId', message: 'Swarm ID is required', code: 'required' }],
      });
    }

    if (!request || Object.keys(request).length === 0) {
      throw new ValidationError('Update request cannot be empty', {
        validationErrors: [{ field: 'request', message: 'Update request is required', code: 'required' }],
      });
    }

    try {
      return await this.client.patch<Swarm>(`${this.basePath}/${swarmId}`, request);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Swarm not found: ${swarmId}`, {
          resourceType: 'swarm',
          resourceId: swarmId,
        });
      }
      throw error;
    }
  }

  /**
   * Delete a swarm
   * 
   * @param swarmId - The swarm ID to delete
   * @param options - Delete options
   * @param options.force - Force delete even if swarm has running agents
   * @param options.wait - Wait for deletion to complete
   * @returns Void or deletion result
   * @throws {NotFoundError} If the swarm doesn't exist
   * @throws {ConflictError} If swarm has running agents and force is not set
   * 
   * @example
   * ```typescript
   * // Normal delete
   * await client.swarms.delete('swarm-123');
   * 
   * // Force delete (kills all agents)
   * await client.swarms.delete('swarm-123', { force: true });
   * ```
   */
  async delete(
    swarmId: string,
    options?: { force?: boolean; wait?: boolean; timeout?: number }
  ): Promise<void> {
    if (!swarmId || swarmId.trim().length === 0) {
      throw new ValidationError('Swarm ID is required', {
        validationErrors: [{ field: 'swarmId', message: 'Swarm ID is required', code: 'required' }],
      });
    }

    const query: Record<string, unknown> = {};
    if (options?.force) query.force = true;
    if (options?.wait) query.wait = true;

    try {
      await this.client.delete<void>(`${this.basePath}/${swarmId}`, {
        timeout: options?.timeout,
      });
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Swarm not found: ${swarmId}`, {
          resourceType: 'swarm',
          resourceId: swarmId,
        });
      }
      throw error;
    }
  }

  /**
   * Scale a swarm to a target number of agents
   * 
   * @param swarmId - The swarm ID to scale
   * @param request - Scale request with target agent count
   * @returns The updated swarm
   * @throws {NotFoundError} If the swarm doesn't exist
   * @throws {ValidationError} If the scale request is invalid
   * @throws {ConflictError} If scaling would violate constraints
   * 
   * @example
   * ```typescript
   * // Scale to specific count
   * const swarm = await client.swarms.scale('swarm-123', {
   *   targetAgentCount: 10,
   * });
   * 
   * // Scale and wait for completion
   * const swarm = await client.swarms.scale('swarm-123', {
   *   targetAgentCount: 20,
   *   wait: true,
   *   timeout: 120, // seconds
   * });
   * ```
   */
  async scale(swarmId: string, request: ScaleSwarmRequest): Promise<Swarm> {
    if (!swarmId || swarmId.trim().length === 0) {
      throw new ValidationError('Swarm ID is required', {
        validationErrors: [{ field: 'swarmId', message: 'Swarm ID is required', code: 'required' }],
      });
    }

    if (typeof request.targetAgentCount !== 'number' || request.targetAgentCount < 0) {
      throw new ValidationError('Valid targetAgentCount is required', {
        validationErrors: [{
          field: 'targetAgentCount',
          message: 'targetAgentCount must be a non-negative number',
          code: 'invalid',
        }],
      });
    }

    try {
      return await this.client.post<Swarm>(
        `${this.basePath}/${swarmId}/scale`,
        request
      );
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Swarm not found: ${swarmId}`, {
          resourceType: 'swarm',
          resourceId: swarmId,
        });
      }
      throw error;
    }
  }

  /**
   * Get swarm metrics
   * 
   * @param swarmId - The swarm ID
   * @returns Current swarm metrics
   * @throws {NotFoundError} If the swarm doesn't exist
   * 
   * @example
   * ```typescript
   * const metrics = await client.swarms.getMetrics('swarm-123');
   * console.log(`CPU: ${metrics.avgCpuUtilization}%`);
   * console.log(`Tasks/sec: ${metrics.tasksPerSecond}`);
   * ```
   */
  async getMetrics(swarmId: string): Promise<Swarm['metrics']> {
    if (!swarmId || swarmId.trim().length === 0) {
      throw new ValidationError('Swarm ID is required', {
        validationErrors: [{ field: 'swarmId', message: 'Swarm ID is required', code: 'required' }],
      });
    }

    try {
      return await this.client.get<Swarm['metrics']>(`${this.basePath}/${swarmId}/metrics`);
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Swarm not found: ${swarmId}`, {
          resourceType: 'swarm',
          resourceId: swarmId,
        });
      }
      throw error;
    }
  }

  /**
   * List all agents in a swarm
   * 
   * @param swarmId - The swarm ID
   * @returns List of agent IDs in the swarm
   * @throws {NotFoundError} If the swarm doesn't exist
   */
  async listAgents(swarmId: string): Promise<string[]> {
    if (!swarmId || swarmId.trim().length === 0) {
      throw new ValidationError('Swarm ID is required', {
        validationErrors: [{ field: 'swarmId', message: 'Swarm ID is required', code: 'required' }],
      });
    }

    try {
      const response = await this.client.get<{ agentIds: string[] }>(`${this.basePath}/${swarmId}/agents`);
      return response.agentIds;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw new NotFoundError(`Swarm not found: ${swarmId}`, {
          resourceType: 'swarm',
          resourceId: swarmId,
        });
      }
      throw error;
    }
  }
}
