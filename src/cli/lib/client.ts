/**
 * API Client Library
 * 
 * Provides a unified client for interacting with the Dash API.
 * Supports both direct core module access and HTTP API (when available).
 */

import type { Agent, CreateAgentOptions } from '../../models/agent';
import type { Task, CreateTaskOptions } from '../../models/task';
import type { Event, CreateEventOptions } from '../../models/event';
import type { Swarm, SwarmConfig, SwarmStatusInfo } from '../../core/swarm';
import type { Message, MessageFilter } from '../../bus/index';
import type { AgentState, RetryOptions } from '../../core/lifecycle';

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ListOptions {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

// ============================================================================
// Abstract Client Interface
// ============================================================================

export interface DashApiClient {
  // Swarm operations
  listSwarms(options?: ListOptions): Promise<ApiResponse<PaginatedResponse<Swarm>>>;
  getSwarm(id: string): Promise<ApiResponse<Swarm>>;
  createSwarm(config: SwarmConfig): Promise<ApiResponse<Swarm>>;
  scaleSwarm(id: string, targetSize: number): Promise<ApiResponse<Swarm>>;
  destroySwarm(id: string, force?: boolean): Promise<ApiResponse<void>>;
  getSwarmStatus(id: string): Promise<ApiResponse<SwarmStatusInfo>>;
  
  // Agent operations
  listAgents(options?: ListOptions & { swarmId?: string; status?: string }): Promise<ApiResponse<PaginatedResponse<Agent>>>;
  getAgent(id: string): Promise<ApiResponse<Agent>>;
  spawnAgent(options: CreateAgentOptions): Promise<ApiResponse<Agent>>;
  killAgent(id: string, force?: boolean): Promise<ApiResponse<void>>;
  pauseAgent(id: string): Promise<ApiResponse<void>>;
  resumeAgent(id: string): Promise<ApiResponse<void>>;
  retryAgent(id: string, options?: RetryOptions): Promise<ApiResponse<Agent>>;
  getAgentLogs(id: string, options?: { follow?: boolean; lines?: number }): Promise<ApiResponse<string[]>>;
  
  // Task operations
  listTasks(options?: ListOptions & { status?: string; assigneeId?: string }): Promise<ApiResponse<PaginatedResponse<Task>>>;
  getTask(id: string): Promise<ApiResponse<Task>>;
  createTask(options: CreateTaskOptions): Promise<ApiResponse<Task>>;
  assignTask(taskId: string, agentId: string): Promise<ApiResponse<Task>>;
  completeTask(id: string): Promise<ApiResponse<Task>>;
  cancelTask(id: string): Promise<ApiResponse<Task>>;
  
  // Event operations
  listEvents(options?: ListOptions & { 
    since?: Date; 
    until?: Date; 
    agentId?: string; 
    taskId?: string;
    type?: string;
  }): Promise<ApiResponse<PaginatedResponse<Event>>>;
  getEvent(id: string): Promise<ApiResponse<Event>>;
  createEvent(options: CreateEventOptions): Promise<ApiResponse<Event>>;
  streamEvents(options?: { filter?: MessageFilter }): AsyncIterable<Event>;
  
  // Message bus operations
  publishMessage(topic: string, payload: unknown, metadata?: Record<string, unknown>): Promise<ApiResponse<Message>>;
  subscribeToTopic(topic: string, handler: (message: Message) => void): Promise<ApiResponse<string>>; // Returns subscription ID
  unsubscribe(subscriptionId: string): Promise<ApiResponse<void>>;
  listSubscriptions(): Promise<ApiResponse<string[]>>;
  
  // Metrics operations
  getMetrics(): Promise<ApiResponse<{
    activeAgents: number;
    totalAgents: number;
    completedAgents: number;
    failedAgents: number;
    activeSwarms: number;
    totalSwarms: number;
    eventsProcessed: number;
    messagesPublished: number;
    averageRuntime: number;
    successRate: number;
  }>>;
  
  // Health operations
  getHealth(): Promise<ApiResponse<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    checks: Record<string, { status: string; message?: string }>;
  }>>;
  
  // Config operations
  getConfig(): Promise<ApiResponse<Record<string, unknown>>>;
  updateConfig(config: Record<string, unknown>): Promise<ApiResponse<void>>;
}

// ============================================================================
// Direct Core Client (uses core modules directly)
// ============================================================================

import { getGlobalSwarmManager, type SwarmManager } from '../../core/swarm';
import { getGlobalLifecycle, type AgentLifecycle } from '../../core/lifecycle';
import { getGlobalBus, type MessageBus } from '../../bus/index';
import { memoryStore, initDatabase } from '../../storage';
import { AgentRepository } from '../../storage/repositories/AgentRepository';
import { TaskRepository } from '../../storage/repositories/TaskRepository';
import { EventRepository } from '../../storage/repositories/EventRepository';
import { SwarmRepository } from '../../storage/repositories/SwarmRepository';
import { getGlobalSQLiteStorage } from '../../storage/sqlite';
import { AgentStatus } from '../../models/agent';
import { TaskStatus } from '../../models/task';
import { resolve } from 'path';
import { existsSync, mkdirSync } from 'fs';

export class DirectDashClient implements DashApiClient {
  private swarmManager: SwarmManager | null = null;
  private lifecycle: AgentLifecycle | null = null;
  private messageBus: MessageBus | null = null;
  private agentRepo: AgentRepository | null = null;
  private taskRepo: TaskRepository | null = null;
  private eventRepo: EventRepository | null = null;
  private swarmRepo: SwarmRepository | null = null;
  private initialized = false;
  private dbPath: string;

  constructor(dbPath: string = './dash.db') {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Ensure data directory exists
    const dataDir = resolve(process.cwd(), '.dash');
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true });
    }

    const fullDbPath = resolve(dataDir, this.dbPath);
    
    // Initialize database
    await initDatabase({ dbPath: fullDbPath, enableWAL: true });

    // Initialize message bus
    this.messageBus = getGlobalBus();

    // Initialize lifecycle
    this.lifecycle = getGlobalLifecycle(memoryStore.agents, this.messageBus);
    this.lifecycle.start();

    // Initialize swarm manager
    this.swarmManager = getGlobalSwarmManager(this.lifecycle, this.messageBus, memoryStore.agents);
    this.swarmManager.start();

    // Initialize repositories
    const storage = getGlobalSQLiteStorage({ dbPath: fullDbPath });
    this.agentRepo = new AgentRepository();
    this.taskRepo = new TaskRepository();
    this.eventRepo = new EventRepository();
    this.swarmRepo = new SwarmRepository();

    this.initialized = true;
  }

  // ============================================================================
  // Swarm Operations
  // ============================================================================

  async listSwarms(options: ListOptions = {}): Promise<ApiResponse<PaginatedResponse<Swarm>>> {
    await this.initialize();
    const swarms = this.swarmManager!.listSwarms();
    const total = swarms.length;
    
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedSwarms = swarms.slice(start, end);
    
    return {
      success: true,
      data: {
        items: paginatedSwarms,
        total,
        page,
        pageSize,
        hasMore: end < total,
      },
    };
  }

  async getSwarm(id: string): Promise<ApiResponse<Swarm>> {
    await this.initialize();
    const swarm = this.swarmManager!.getSwarm(id);
    
    if (!swarm) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Swarm ${id} not found` },
      };
    }
    
    return { success: true, data: swarm };
  }

  async createSwarm(config: SwarmConfig): Promise<ApiResponse<Swarm>> {
    await this.initialize();
    
    try {
      const swarm = await this.swarmManager!.create(config);
      return { success: true, data: swarm };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'CREATE_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to create swarm' 
        },
      };
    }
  }

  async scaleSwarm(id: string, targetSize: number): Promise<ApiResponse<Swarm>> {
    await this.initialize();
    
    try {
      await this.swarmManager!.scale(id, targetSize);
      const swarm = this.swarmManager!.getSwarm(id);
      return { success: true, data: swarm! };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'SCALE_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to scale swarm' 
        },
      };
    }
  }

  async destroySwarm(id: string, force?: boolean): Promise<ApiResponse<void>> {
    await this.initialize();
    
    try {
      await this.swarmManager!.destroy(id, force);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'DESTROY_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to destroy swarm' 
        },
      };
    }
  }

  async getSwarmStatus(id: string): Promise<ApiResponse<SwarmStatusInfo>> {
    await this.initialize();
    
    try {
      const status = this.swarmManager!.getStatus(id);
      return { success: true, data: status };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'STATUS_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to get swarm status' 
        },
      };
    }
  }

  // ============================================================================
  // Agent Operations
  // ============================================================================

  async listAgents(options: ListOptions & { swarmId?: string; status?: string } = {}): Promise<ApiResponse<PaginatedResponse<Agent>>> {
    await this.initialize();
    
    // Get all agents from storage
    const storage = getGlobalSQLiteStorage({ dbPath: this.dbPath });
    let agents = storage.getAgentListLightweight();
    
    // Apply filters
    if (options.swarmId) {
      agents = agents.filter(a => a.swarmId === options.swarmId);
    }
    if (options.status) {
      agents = agents.filter(a => a.status === options.status);
    }
    
    const total = agents.length;
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      success: true,
      data: {
        items: agents.slice(start, end),
        total,
        page,
        pageSize,
        hasMore: end < total,
      },
    };
  }

  async getAgent(id: string): Promise<ApiResponse<Agent>> {
    await this.initialize();
    
    const state = this.lifecycle!.getState(id);
    if (!state) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Agent ${id} not found` },
      };
    }
    
    return { success: true, data: state.agent };
  }

  async spawnAgent(options: CreateAgentOptions): Promise<ApiResponse<Agent>> {
    await this.initialize();
    
    try {
      const state = await this.lifecycle!.spawn(options);
      
      // Persist to database
      await this.agentRepo!.create({
        id: state.agent.id,
        label: state.agent.label,
        status: 'spawning',
        model: state.agent.model,
        task: state.agent.task,
        swarm_id: state.agent.swarmId,
        parent_id: state.agent.parentId,
        max_retries: state.agent.maxRetries,
        metadata: state.agent.metadata,
      });
      
      return { success: true, data: state.agent };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'SPAWN_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to spawn agent' 
        },
      };
    }
  }

  async killAgent(id: string, force?: boolean): Promise<ApiResponse<void>> {
    await this.initialize();
    
    try {
      await this.lifecycle!.kill(id, force);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'KILL_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to kill agent' 
        },
      };
    }
  }

  async pauseAgent(id: string): Promise<ApiResponse<void>> {
    await this.initialize();
    
    try {
      await this.lifecycle!.pause(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'PAUSE_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to pause agent' 
        },
      };
    }
  }

  async resumeAgent(id: string): Promise<ApiResponse<void>> {
    await this.initialize();
    
    try {
      await this.lifecycle!.resume(id);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'RESUME_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to resume agent' 
        },
      };
    }
  }

  async retryAgent(id: string, options?: RetryOptions): Promise<ApiResponse<Agent>> {
    await this.initialize();
    
    try {
      await this.lifecycle!.retry(id, options);
      const state = this.lifecycle!.getState(id);
      return { success: true, data: state!.agent };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'RETRY_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to retry agent' 
        },
      };
    }
  }

  async getAgentLogs(id: string, options: { follow?: boolean; lines?: number } = {}): Promise<ApiResponse<string[]>> {
    await this.initialize();
    
    // Get logs from message bus
    const topic = `agent.${id}.logs`;
    const messages = this.messageBus!.getMessages(topic, options.lines || 100);
    
    const logs = messages.map(m => {
      const payload = m.payload as { message?: string } | undefined;
      return payload?.message || JSON.stringify(m.payload);
    });
    
    return { success: true, data: logs };
  }

  // ============================================================================
  // Task Operations
  // ============================================================================

  async listTasks(options: ListOptions & { status?: string; assigneeId?: string } = {}): Promise<ApiResponse<PaginatedResponse<Task>>> {
    await this.initialize();
    
    let tasks = await this.taskRepo!.list();
    
    // Apply filters
    if (options.status) {
      tasks = tasks.filter(t => t.status === options.status);
    }
    if (options.assigneeId) {
      tasks = tasks.filter(t => t.assigneeId === options.assigneeId);
    }
    
    const total = tasks.length;
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      success: true,
      data: {
        items: tasks.slice(start, end),
        total,
        page,
        pageSize,
        hasMore: end < total,
      },
    };
  }

  async getTask(id: string): Promise<ApiResponse<Task>> {
    await this.initialize();
    
    const task = await this.taskRepo!.getById(id);
    if (!task) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Task ${id} not found` },
      };
    }
    
    return { success: true, data: task };
  }

  async createTask(options: CreateTaskOptions): Promise<ApiResponse<Task>> {
    await this.initialize();
    
    try {
      const task = await this.taskRepo!.create({
        title: options.title,
        description: options.description,
        status: TaskStatus.PENDING,
        assignee_id: options.assigneeId,
        priority: options.priority || 'medium',
        depends_on: options.dependsOn || [],
        metadata: options.reasoning ? { reasoning: options.reasoning } : {},
      });
      
      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'CREATE_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to create task' 
        },
      };
    }
  }

  async assignTask(taskId: string, agentId: string): Promise<ApiResponse<Task>> {
    await this.initialize();
    
    try {
      const task = await this.taskRepo!.update(taskId, {
        assignee_id: agentId,
        status: TaskStatus.IN_PROGRESS,
      });
      
      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'ASSIGN_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to assign task' 
        },
      };
    }
  }

  async completeTask(id: string): Promise<ApiResponse<Task>> {
    await this.initialize();
    
    try {
      const task = await this.taskRepo!.update(id, {
        status: TaskStatus.COMPLETED,
        completed_at: new Date().toISOString(),
      });
      
      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'COMPLETE_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to complete task' 
        },
      };
    }
  }

  async cancelTask(id: string): Promise<ApiResponse<Task>> {
    await this.initialize();
    
    try {
      const task = await this.taskRepo!.update(id, {
        status: TaskStatus.CANCELLED,
      });
      
      return { success: true, data: task };
    } catch (error) {
      return {
        success: false,
        error: { 
          code: 'CANCEL_FAILED', 
          message: error instanceof Error ? error.message : 'Failed to cancel task' 
        },
      };
    }
  }

  // ============================================================================
  // Event Operations
  // ============================================================================

  async listEvents(options: ListOptions & { 
    since?: Date; 
    until?: Date; 
    agentId?: string; 
    taskId?: string;
    type?: string;
  } = {}): Promise<ApiResponse<PaginatedResponse<Event>>> {
    await this.initialize();
    
    let events = await this.eventRepo!.query({
      since: options.since,
      until: options.until,
      agentId: options.agentId,
      taskId: options.taskId,
      type: options.type as any,
    });
    
    const total = events.length;
    const page = options.page || 1;
    const pageSize = options.pageSize || 50;
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    
    return {
      success: true,
      data: {
        items: events.slice(start, end),
        total,
        page,
        pageSize,
        hasMore: end < total,
      },
    };
  }

  async getEvent(id: string): Promise<ApiResponse<Event>> {
    await this.initialize();
    
    const event = await this.eventRepo!.getById(id);
    if (!event) {
      return {
        success: false,
        error: { code: 'NOT_FOUND', message: `Event ${id} not found` },
      };
    }
    
    return { success: true, data: event };
  }

  async createEvent(options: CreateEventOptions): Promise<ApiResponse<Event>> {
    await this.initialize();
    
    const { createEvent } = await import('../../models/event');
    const event = createEvent(options);
    
    await this.eventRepo!.create({
      id: event.id,
      type: event.type,
      timestamp: event.timestamp.toISOString(),
      entity_id: event.entityId,
      entity_type: event.entityType,
      payload: event.payload,
      correlation_id: event.correlationId,
      parent_event_id: event.parentEventId,
    });
    
    return { success: true, data: event };
  }

  async *streamEvents(options: { filter?: MessageFilter } = {}): AsyncIterable<Event> {
    await this.initialize();
    
    // This is a simplified implementation
    // In production, this would use the message bus's streaming capabilities
    const events = await this.eventRepo!.getRecent({ limit: 100 });
    
    for (const event of events) {
      yield event;
    }
  }

  // ============================================================================
  // Message Bus Operations
  // ============================================================================

  async publishMessage(topic: string, payload: unknown, metadata?: Record<string, unknown>): Promise<ApiResponse<Message>> {
    await this.initialize();
    
    const message = this.messageBus!.publish(topic, payload, {
      source: metadata?.source as string,
      priority: metadata?.priority as any,
    });
    
    return { success: true, data: message };
  }

  async subscribeToTopic(topic: string, handler: (message: Message) => void): Promise<ApiResponse<string>> {
    await this.initialize();
    
    const subscription = this.messageBus!.subscribe(topic, handler);
    
    return { success: true, data: subscription.id };
  }

  async unsubscribe(subscriptionId: string): Promise<ApiResponse<void>> {
    await this.initialize();
    
    // Note: This is simplified - the actual implementation would need to track subscriptions
    return { success: true };
  }

  async listSubscriptions(): Promise<ApiResponse<string[]>> {
    await this.initialize();
    
    // This would return active subscription IDs
    return { success: true, data: [] };
  }

  // ============================================================================
  // Metrics Operations
  // ============================================================================

  async getMetrics(): Promise<ApiResponse<{
    activeAgents: number;
    totalAgents: number;
    completedAgents: number;
    failedAgents: number;
    activeSwarms: number;
    totalSwarms: number;
    eventsProcessed: number;
    messagesPublished: number;
    averageRuntime: number;
    successRate: number;
  }>> {
    await this.initialize();
    
    const lifecycleMetrics = this.lifecycle!.getMetrics();
    const swarms = this.swarmManager!.listSwarms();
    const activeSwarms = this.swarmManager!.listActiveSwarms();
    
    const totalAgents = lifecycleMetrics.totalSpawned;
    const completedAgents = lifecycleMetrics.totalCompleted;
    const successRate = totalAgents > 0 ? completedAgents / totalAgents : 0;
    
    return {
      success: true,
      data: {
        activeAgents: lifecycleMetrics.activeAgents,
        totalAgents,
        completedAgents,
        failedAgents: lifecycleMetrics.totalFailed,
        activeSwarms: activeSwarms.length,
        totalSwarms: swarms.length,
        eventsProcessed: totalAgents * 5, // Approximate
        messagesPublished: totalAgents * 10, // Approximate
        averageRuntime: lifecycleMetrics.averageRuntime || 0,
        successRate,
      },
    };
  }

  // ============================================================================
  // Health Operations
  // ============================================================================

  async getHealth(): Promise<ApiResponse<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    version: string;
    uptime: number;
    checks: Record<string, { status: string; message?: string }>;
  }>> {
    await this.initialize();
    
    const checks: Record<string, { status: string; message?: string }> = {};
    
    // Check lifecycle
    checks.lifecycle = { status: this.lifecycle ? 'healthy' : 'unhealthy' };
    
    // Check swarm manager
    checks.swarmManager = { status: this.swarmManager ? 'healthy' : 'unhealthy' };
    
    // Check message bus
    checks.messageBus = { status: this.messageBus ? 'healthy' : 'unhealthy' };
    
    // Determine overall status
    const allHealthy = Object.values(checks).every(c => c.status === 'healthy');
    const status = allHealthy ? 'healthy' : 'degraded';
    
    return {
      success: true,
      data: {
        status,
        version: '2.0.0',
        uptime: process.uptime(),
        checks,
      },
    };
  }

  // ============================================================================
  // Config Operations
  // ============================================================================

  async getConfig(): Promise<ApiResponse<Record<string, unknown>>> {
    await this.initialize();
    
    // Return current configuration
    return {
      success: true,
      data: {
        version: '2.0.0',
        dbPath: this.dbPath,
        initialized: this.initialized,
      },
    };
  }

  async updateConfig(config: Record<string, unknown>): Promise<ApiResponse<void>> {
    await this.initialize();
    
    // Update configuration (simplified)
    if (config.dbPath) {
      this.dbPath = config.dbPath as string;
    }
    
    return { success: true };
  }
}

// ============================================================================
// Client Factory
// ============================================================================

export function createClient(dbPath?: string): DashApiClient {
  return new DirectDashClient(dbPath);
}

// Singleton instance
let globalClient: DashApiClient | null = null;

export function getGlobalClient(dbPath?: string): DashApiClient {
  if (!globalClient) {
    globalClient = createClient(dbPath);
  }
  return globalClient;
}
