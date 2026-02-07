/**
 * Agent Read Model
 *
 * CQRS read model for agent projections. Maintains denormalized agent views
 * optimized for queries. Projects agent events into queryable state.
 *
 * @module loop/read-models/agent-read-model
 */

import type { GodelEvent, ProjectionHandler } from '../event-replay';
import type { PostgresPool } from '../../storage/postgres/pool';

// ============================================================================
// Type Definitions
// ============================================================================

/**
 * Agent capability set
 */
export interface AgentCapabilities {
  /** Available skills */
  skills: string[];
  /** Supported programming languages */
  languages: string[];
  /** Specialization areas */
  specialties: string[];
  /** Cost per hour in USD */
  costPerHour: number;
  /** Average speed rating (0-1) */
  avgSpeed: number;
  /** Reliability rating (0-1) */
  reliability: number;
}

/**
 * Denormalized agent view for queries
 */
export interface AgentView {
  /** Agent ID */
  id: string;
  /** Current state in the lifecycle */
  currentState: string;
  /** Last seen timestamp */
  lastSeen: number;
  /** Total tasks completed */
  totalTasksCompleted: number;
  /** Total tasks failed */
  totalTasksFailed: number;
  /** Average task duration in ms */
  averageTaskDuration: number;
  /** Current load (0-1) */
  currentLoad: number;
  /** Agent capabilities */
  capabilities: AgentCapabilities;
  /** Current task ID (if any) */
  currentTaskId?: string;
  /** Error count for circuit breaker */
  consecutiveErrors: number;
  /** Last error message */
  lastError?: string;
  /** Created timestamp */
  createdAt: number;
  /** Updated timestamp */
  updatedAt: number;
}

/**
 * Query options for filtering agents
 */
export interface AgentQueryOptions {
  /** Filter by state */
  state?: string;
  /** Minimum reliability threshold (0-1) */
  minReliability?: number;
  /** Required skills */
  hasSkills?: string[];
  /** Maximum current load */
  maxLoad?: number;
  /** Limit results */
  limit?: number;
  /** Offset for pagination */
  offset?: number;
}

/**
 * Agent statistics
 */
export interface AgentStats {
  total: number;
  byState: Record<string, number>;
  totalTasksCompleted: number;
  totalTasksFailed: number;
  averageReliability: number;
  averageLoad: number;
}

// ============================================================================
// Event Type Guards
// ============================================================================

interface AgentRegisteredEvent extends GodelEvent {
  type: 'agent.registered' | 'agent.spawned';
  payload: {
    agentId: string;
    capabilities: AgentCapabilities;
    [key: string]: unknown;
  };
}

interface AgentStateChangedEvent extends GodelEvent {
  type: 'agent.state_changed' | 'agent.status_changed';
  payload: {
    agentId: string;
    newState?: string;
    newStatus?: string;
    previousState?: string;
    previousStatus?: string;
    [key: string]: unknown;
  };
}

interface TaskAssignedEvent extends GodelEvent {
  type: 'task.assigned';
  payload: {
    agentId: string;
    taskId: string;
    [key: string]: unknown;
  };
}

interface TaskCompletedEvent extends GodelEvent {
  type: 'task.completed' | 'agent.task_completed' | 'agent.completed';
  payload: {
    agentId: string;
    taskId?: string;
    duration?: number;
    runtime?: number;
    [key: string]: unknown;
  };
}

interface TaskFailedEvent extends GodelEvent {
  type: 'task.failed' | 'agent.task_failed' | 'agent.failed';
  payload: {
    agentId: string;
    taskId?: string;
    error?: string;
    [key: string]: unknown;
  };
}

interface AgentLoadChangedEvent extends GodelEvent {
  type: 'agent.load_changed';
  payload: {
    agentId: string;
    load: number;
    [key: string]: unknown;
  };
}

// ============================================================================
// Agent Read Model
// ============================================================================

/**
 * Agent Read Model for CQRS queries
 *
 * Projects agent lifecycle events into a denormalized view
 * optimized for fast queries. Supports in-memory caching
 * with optional persistence.
 *
 * @example
 * ```typescript
 * const agentReadModel = new AgentReadModel(pool);
 *
 * // Replay events to build state
 * await replayEngine.replay({ from: Date.now() - 86400000 });
 *
 * // Query the read model
 * const topAgents = await agentReadModel.getTopPerformers(5);
 * const available = await agentReadModel.getAvailable({ maxLoad: 0.5 });
 * ```
 */
export class AgentReadModel implements ProjectionHandler {
  readonly name = 'AgentReadModel';

  private agents = new Map<string, AgentView>();
  private persistEnabled: boolean;

  constructor(
    private db: PostgresPool,
    options: { persist?: boolean } = {}
  ) {
    this.persistEnabled = options.persist ?? true;
  }

  // ============================================================================
  // ProjectionHandler Implementation
  // ============================================================================

  /**
   * Handle incoming events to update the read model
   */
  async handle(event: GodelEvent): Promise<void> {
    switch (event.type) {
      case 'agent.registered':
      case 'agent.spawned':
        await this.handleAgentRegistered(event as AgentRegisteredEvent);
        break;

      case 'agent.state_changed':
      case 'agent.status_changed':
        await this.handleStateChanged(event as AgentStateChangedEvent);
        break;

      case 'task.assigned':
        await this.handleTaskAssigned(event as TaskAssignedEvent);
        break;

      case 'task.completed':
      case 'agent.task_completed':
      case 'agent.completed':
        await this.handleTaskCompleted(event as TaskCompletedEvent);
        break;

      case 'task.failed':
      case 'agent.task_failed':
      case 'agent.failed':
        await this.handleTaskFailed(event as TaskFailedEvent);
        break;

      case 'agent.load_changed':
        await this.handleLoadChanged(event as AgentLoadChangedEvent);
        break;
    }
  }

  // ============================================================================
  // Query Methods
  // ============================================================================

  /**
   * Get a single agent by ID
   */
  async getById(agentId: string): Promise<AgentView | null> {
    return this.agents.get(agentId) || null;
  }

  /**
   * Get all agents matching the query options
   */
  async getAll(options: AgentQueryOptions = {}): Promise<AgentView[]> {
    let agents = Array.from(this.agents.values());

    // Apply filters
    if (options.state) {
      agents = agents.filter(a => a.currentState === options.state);
    }

    if (options.minReliability !== undefined) {
      agents = agents.filter(a => {
        const total = a.totalTasksCompleted + a.totalTasksFailed;
        if (total === 0) return false;
        const reliability = a.totalTasksCompleted / total;
        return reliability >= options.minReliability!;
      });
    }

    if (options.hasSkills?.length) {
      agents = agents.filter(a =>
        options.hasSkills!.every(skill => a.capabilities.skills.includes(skill))
      );
    }

    if (options.maxLoad !== undefined) {
      agents = agents.filter(a => a.currentLoad <= options.maxLoad!);
    }

    // Apply pagination
    if (options.offset) {
      agents = agents.slice(options.offset);
    }
    if (options.limit) {
      agents = agents.slice(0, options.limit);
    }

    return agents;
  }

  /**
   * Get agents available for work
   */
  async getAvailable(options: Omit<AgentQueryOptions, 'state'> = {}): Promise<AgentView[]> {
    return this.getAll({ ...options, state: 'idle' });
  }

  /**
   * Get top performing agents by reliability
   */
  async getTopPerformers(limit: number = 10): Promise<AgentView[]> {
    return Array.from(this.agents.values())
      .filter(a => a.totalTasksCompleted > 0)
      .map(a => ({
        agent: a,
        score: this.calculatePerformanceScore(a),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ agent }) => agent);
  }

  /**
   * Get agents by capability
   */
  async getByCapability(
    skill: string,
    options: Omit<AgentQueryOptions, 'hasSkills'> = {}
  ): Promise<AgentView[]> {
    return this.getAll({ ...options, hasSkills: [skill] });
  }

  /**
   * Get agent statistics
   */
  async getStats(): Promise<AgentStats> {
    const agents = Array.from(this.agents.values());
    const byState: Record<string, number> = {};

    for (const agent of agents) {
      byState[agent.currentState] = (byState[agent.currentState] || 0) + 1;
    }

    const totalTasksCompleted = agents.reduce(
      (sum, a) => sum + a.totalTasksCompleted,
      0
    );
    const totalTasksFailed = agents.reduce(
      (sum, a) => sum + a.totalTasksFailed,
      0
    );

    const averageReliability =
      agents.length > 0
        ? agents.reduce((sum, a) => {
            const total = a.totalTasksCompleted + a.totalTasksFailed;
            if (total === 0) return sum;
            return sum + a.totalTasksCompleted / total;
          }, 0) / agents.length
        : 0;

    const averageLoad =
      agents.length > 0
        ? agents.reduce((sum, a) => sum + a.currentLoad, 0) / agents.length
        : 0;

    return {
      total: agents.length,
      byState,
      totalTasksCompleted,
      totalTasksFailed,
      averageReliability,
      averageLoad,
    };
  }

  /**
   * Get agents requiring attention (high error rate)
   */
  async getUnhealthy(threshold: number = 3): Promise<AgentView[]> {
    return Array.from(this.agents.values()).filter(
      a => a.consecutiveErrors >= threshold || a.currentState === 'error'
    );
  }

  /**
   * Get agent count
   */
  getCount(): number {
    return this.agents.size;
  }

  /**
   * Clear all agents (for testing)
   */
  clear(): void {
    this.agents.clear();
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private async handleAgentRegistered(event: AgentRegisteredEvent): Promise<void> {
    const { agentId, capabilities } = event.payload;

    const view: AgentView = {
      id: agentId,
      currentState: 'created',
      lastSeen: event.timestamp,
      totalTasksCompleted: 0,
      totalTasksFailed: 0,
      averageTaskDuration: 0,
      currentLoad: 0,
      capabilities: capabilities || {
        skills: [],
        languages: [],
        specialties: [],
        costPerHour: 0,
        avgSpeed: 0,
        reliability: 0,
      },
      consecutiveErrors: 0,
      createdAt: event.timestamp,
      updatedAt: event.timestamp,
    };

    this.agents.set(view.id, view);
    await this.save(view);
  }

  private async handleStateChanged(event: AgentStateChangedEvent): Promise<void> {
    const { agentId, newState, newStatus } = event.payload;
    const view = this.agents.get(agentId);
    if (!view) return;

    const state = newState || newStatus;
    if (state) {
      view.currentState = state;
    }
    view.lastSeen = event.timestamp;
    view.updatedAt = event.timestamp;

    // Reset error count on successful state transition
    if (state === 'idle' || state === 'completed') {
      view.consecutiveErrors = 0;
    }

    await this.save(view);
  }

  private async handleTaskAssigned(event: TaskAssignedEvent): Promise<void> {
    const { agentId, taskId } = event.payload;
    const view = this.agents.get(agentId);
    if (!view) return;

    view.currentTaskId = taskId;
    view.currentState = 'busy';
    view.currentLoad = Math.min(1, view.currentLoad + 0.25);
    view.lastSeen = event.timestamp;
    view.updatedAt = event.timestamp;

    await this.save(view);
  }

  private async handleTaskCompleted(event: TaskCompletedEvent): Promise<void> {
    const { agentId, duration, runtime } = event.payload;
    const view = this.agents.get(agentId);
    if (!view) return;

    view.totalTasksCompleted++;
    view.currentLoad = Math.max(0, view.currentLoad - 0.25);
    view.consecutiveErrors = 0;
    view.currentTaskId = undefined;

    // Update rolling average duration
    const taskDuration = duration || runtime || 0;
    if (taskDuration > 0) {
      const n = view.totalTasksCompleted;
      view.averageTaskDuration =
        (view.averageTaskDuration * (n - 1) + taskDuration) / n;
    }

    view.lastSeen = event.timestamp;
    view.updatedAt = event.timestamp;

    await this.save(view);
  }

  private async handleTaskFailed(event: TaskFailedEvent): Promise<void> {
    const { agentId, error } = event.payload;
    const view = this.agents.get(agentId);
    if (!view) return;

    view.totalTasksFailed++;
    view.currentLoad = Math.max(0, view.currentLoad - 0.25);
    view.consecutiveErrors++;
    view.currentTaskId = undefined;
    view.lastError = error;
    view.lastSeen = event.timestamp;
    view.updatedAt = event.timestamp;

    await this.save(view);
  }

  private async handleLoadChanged(event: AgentLoadChangedEvent): Promise<void> {
    const { agentId, load } = event.payload;
    const view = this.agents.get(agentId);
    if (!view) return;

    view.currentLoad = Math.max(0, Math.min(1, load));
    view.updatedAt = event.timestamp;

    await this.save(view);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private calculatePerformanceScore(agent: AgentView): number {
    const total = agent.totalTasksCompleted + agent.totalTasksFailed;
    if (total === 0) return 0;

    const reliability = agent.totalTasksCompleted / total;
    const speedScore = agent.capabilities.avgSpeed;
    const loadFactor = 1 - agent.currentLoad;

    // Weighted composite score
    return reliability * 0.5 + speedScore * 0.3 + loadFactor * 0.2;
  }

  private async save(view: AgentView): Promise<void> {
    if (!this.persistEnabled) return;

    try {
      await this.db.query(
        `INSERT INTO agent_views (
          id, current_state, last_seen, total_tasks_completed,
          total_tasks_failed, average_task_duration, current_load,
          capabilities, current_task_id, consecutive_errors, last_error,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          current_state = EXCLUDED.current_state,
          last_seen = EXCLUDED.last_seen,
          total_tasks_completed = EXCLUDED.total_tasks_completed,
          total_tasks_failed = EXCLUDED.total_tasks_failed,
          average_task_duration = EXCLUDED.average_task_duration,
          current_load = EXCLUDED.current_load,
          capabilities = EXCLUDED.capabilities,
          current_task_id = EXCLUDED.current_task_id,
          consecutive_errors = EXCLUDED.consecutive_errors,
          last_error = EXCLUDED.last_error,
          updated_at = EXCLUDED.updated_at`,
        [
          view.id,
          view.currentState,
          new Date(view.lastSeen),
          view.totalTasksCompleted,
          view.totalTasksFailed,
          view.averageTaskDuration,
          view.currentLoad,
          JSON.stringify(view.capabilities),
          view.currentTaskId || null,
          view.consecutiveErrors,
          view.lastError || null,
          new Date(view.createdAt),
          new Date(view.updatedAt),
        ]
      );
    } catch (error) {
      // Log but don't fail - in-memory state is primary
      console.warn(`Failed to persist agent view ${view.id}:`, error);
    }
  }
}

// ============================================================================
// In-Memory Agent Read Model (for testing)
// ============================================================================

/**
 * In-memory only agent read model for testing
 */
export class InMemoryAgentReadModel extends AgentReadModel {
  constructor() {
    // Pass a mock pool that won't be used
    super({ query: async () => ({ rows: [] }) } as unknown as PostgresPool, {
      persist: false,
    });
  }
}
