/**
 * Task Queue - Redis-backed Priority Queue
 * 
 * Features:
 * - Redis Streams for persistent task queue
 * - Priority queue support (critical > high > medium > low)
 * - Delayed task execution (schedule for future)
 * - Task retry with exponential backoff
 * - Dead letter queue for failed tasks
 * - Work distribution across agents
 */

import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';
import type {
  QueuedTask,
  EnqueueTaskOptions,
  TaskAgent,
  RegisterAgentOptions,
  TaskQueueConfig,
  QueueEvent,
  QueueEventHandler,
  QueueMetrics,
  TaskResult,
  DeadLetterEntry,
  TaskQueueStatus,
} from './types';
import {
  distributeTask,
  createDistributionContext,
  type DistributionContext,
} from './work-distributor';
import { QueueMetricsCollector } from './metrics';

// Default configuration
const DEFAULT_CONFIG: Partial<TaskQueueConfig> = {
  maxRetries: 3,
  baseRetryDelayMs: 1000,
  maxRetryDelayMs: 300000, // 5 minutes
  defaultTimeoutMs: 300000, // 5 minutes
  heartbeatTimeoutMs: 30000, // 30 seconds
  deadLetterEnabled: true,
  deadLetterMaxAgeDays: 7,
  pollIntervalMs: 100,
  batchSize: 10,
  defaultStrategy: 'load-based',
};

// Redis key prefixes
const KEYS = {
  pendingQueue: (prefix: string) => `${prefix}:queue:pending`,
  priorityQueue: (prefix: string, priority: string) => `${prefix}:queue:priority:${priority}`,
  scheduledQueue: (prefix: string) => `${prefix}:queue:scheduled`,
  processingSet: (prefix: string) => `${prefix}:tasks:processing`,
  deadLetterQueue: (prefix: string) => `${prefix}:queue:dead`,
  taskKey: (prefix: string, taskId: string) => `${prefix}:task:${taskId}`,
  agentKey: (prefix: string, agentId: string) => `${prefix}:agent:${agentId}`,
  agentsSet: (prefix: string) => `${prefix}:agents`,
  stickyMap: (prefix: string) => `${prefix}:sticky:map`,
  metricsKey: (prefix: string) => `${prefix}:metrics`,
  streamKey: (prefix: string) => `${prefix}:stream`,
};

export class TaskQueue {
  private redis: Redis;
  private config: TaskQueueConfig;
  private metrics: QueueMetricsCollector;
  private eventHandlers: Map<string, QueueEventHandler> = new Map();
  private distributionState = {
    lastAssignmentIndex: -1,
    stickyAssignments: new Map<string, string>(),
  };
  
  // Processing loops
  private schedulerInterval?: NodeJS.Timeout;
  private heartbeatInterval?: NodeJS.Timeout;
  private isRunning = false;

  constructor(config: Partial<TaskQueueConfig> & { redis: TaskQueueConfig['redis'] }) {
    this.config = { ...DEFAULT_CONFIG, ...config } as TaskQueueConfig;
    
    // Initialize Redis connection
    this.redis = new Redis({
      host: this.config.redis.host,
      port: this.config.redis.port,
      password: this.config.redis.password,
      db: this.config.redis.db || 0,
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    
    // Initialize metrics
    this.metrics = new QueueMetricsCollector(this.redis, this.config.redis.keyPrefix || 'dash:queue');
  }

  // ========================================================================
  // LIFECYCLE
  // ========================================================================

  /**
   * Start the task queue processing loops
   */
  async start(): Promise<void> {
    if (this.isRunning) return;
    
    this.isRunning = true;
    logger.info('[TaskQueue] Starting task queue...');
    
    // Start scheduler loop (processes delayed tasks)
    this.schedulerInterval = setInterval(
      () => this.processScheduledTasks(),
      this.config.pollIntervalMs
    );
    
    // Start heartbeat checker
    this.heartbeatInterval = setInterval(
      () => this.checkAgentHeartbeats(),
      this.config.heartbeatTimeoutMs
    );
    
    // Load sticky assignments from Redis
    await this.loadStickyAssignments();
    
    logger.info('[TaskQueue] Task queue started');
    await this.emit({
      type: 'queue.scaling_needed',
      timestamp: new Date(),
    });
  }

  /**
   * Stop the task queue processing loops
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    this.isRunning = false;
    logger.info('[TaskQueue] Stopping task queue...');
    
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = undefined;
    }
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
    
    // Save sticky assignments to Redis
    await this.saveStickyAssignments();
    
    await this.redis.quit();
    logger.info('[TaskQueue] Task queue stopped');
  }

  // ========================================================================
  // TASK MANAGEMENT
  // ========================================================================

  /**
   * Enqueue a new task
   */
  async enqueue(options: EnqueueTaskOptions): Promise<QueuedTask> {
    const now = new Date();
    const task: QueuedTask = {
      id: options.id || `task-${uuidv4()}`,
      type: options.type,
      payload: options.payload,
      priority: options.priority || 'medium',
      status: options.delayMs || options.scheduledFor ? 'scheduled' : 'pending',
      retryCount: 0,
      maxRetries: options.maxRetries ?? this.config.maxRetries,
      retryDelayMs: options.retryDelayMs ?? this.config.baseRetryDelayMs,
      requiredSkills: options.requiredSkills,
      stickyKey: options.stickyKey,
      routingHint: options.routingHint,
      progress: 0,
      createdAt: now,
      scheduledFor: options.scheduledFor,
      metadata: options.metadata || {},
    };

    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const taskKey = KEYS.taskKey(prefix, task.id);

    // Store task data
    await this.redis.setex(
      taskKey,
      86400 * 7, // 7 days TTL
      JSON.stringify(task)
    );

    if (options.delayMs || options.scheduledFor) {
      // Schedule for future
      const scheduledTime = options.scheduledFor 
        ? options.scheduledFor.getTime()
        : Date.now() + options.delayMs!;
      
      await this.redis.zadd(
        KEYS.scheduledQueue(prefix),
        scheduledTime,
        task.id
      );
      
      task.status = 'scheduled';
      logger.debug(`[TaskQueue] Task ${task.id} scheduled for ${new Date(scheduledTime).toISOString()}`);
    } else {
      // Add to priority queue
      const score = this.priorityToScore(task.priority);
      await this.redis.zadd(
        KEYS.priorityQueue(prefix, task.priority),
        score,
        task.id
      );
      
      // Also add to pending queue for quick lookup
      await this.redis.lpush(KEYS.pendingQueue(prefix), task.id);
    }

    // Update metrics
    await this.metrics.incrementTasksEnqueued();
    
    // Emit event
    await this.emit({
      type: 'task.enqueued',
      timestamp: now,
      taskId: task.id,
      payload: { type: task.type, priority: task.priority },
    });

    logger.info(`[TaskQueue] Task ${task.id} enqueued (type: ${task.type}, priority: ${task.priority})`);
    
    return task;
  }

  /**
   * Dequeue the next available task for an agent
   */
  async dequeue(agentId: string): Promise<QueuedTask | null> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const agent = await this.getAgent(agentId);
    
    if (!agent || agent.status === 'offline') {
      throw new Error(`Agent ${agentId} not found or offline`);
    }
    
    if (agent.currentLoad >= agent.capacity) {
      return null; // Agent at capacity
    }

    // Try to get task from priority queues (critical -> high -> medium -> low)
    const priorities: Array<QueuedTask['priority']> = ['critical', 'high', 'medium', 'low'];
    
    for (const priority of priorities) {
      const taskId = await this.redis.rpop(KEYS.pendingQueue(prefix));
      
      if (taskId) {
        // Also remove from priority sorted set
        await this.redis.zrem(KEYS.priorityQueue(prefix, priority), taskId);
        
        const task = await this.getTask(taskId);
        if (task && task.status === 'pending') {
          // Assign to agent
          task.status = 'assigned';
          task.assigneeId = agentId;
          await this.updateTask(task);
          
          // Add to processing set
          await this.redis.zadd(
            KEYS.processingSet(prefix),
            Date.now(),
            taskId
          );
          
          // Update agent load
          await this.updateAgentLoad(agentId, 1);
          
          // Emit event
          await this.emit({
            type: 'task.assigned',
            timestamp: new Date(),
            taskId: task.id,
            agentId,
            payload: { priority: task.priority, type: task.type },
          });
          
          logger.debug(`[TaskQueue] Task ${task.id} assigned to agent ${agentId}`);
          return task;
        }
      }
    }
    
    return null;
  }

  /**
   * Claim the next task using work distribution algorithm
   */
  async claimTask(agentId?: string): Promise<QueuedTask | null> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    
    // If agentId provided, use direct dequeue
    if (agentId) {
      return this.dequeue(agentId);
    }
    
    // Otherwise, use distribution algorithm
    const agents = await this.getAvailableAgents();
    
    if (agents.length === 0) {
      return null;
    }

    // Get next pending task
    const taskId = await this.redis.rpop(KEYS.pendingQueue(prefix));
    
    if (!taskId) {
      return null;
    }
    
    const task = await this.getTask(taskId);
    if (!task || task.status !== 'pending') {
      return null;
    }

    // Distribute task to best agent
    const ctx = createDistributionContext(task, agents, this.distributionState);
    const distribution = distributeTask(ctx, this.config.defaultStrategy);
    
    if (!distribution) {
      // No suitable agent found, requeue the task
      await this.requeueTask(task);
      return null;
    }

    // Assign task
    task.status = 'assigned';
    task.assigneeId = distribution.agentId;
    await this.updateTask(task);
    
    // Add to processing set
    await this.redis.zadd(
      KEYS.processingSet(prefix),
      Date.now(),
      taskId
    );
    
    // Update agent load
    await this.updateAgentLoad(distribution.agentId, 1);
    
    // Update distribution state
    this.distributionState.lastAssignmentIndex = agents.findIndex(
      a => a.id === distribution.agentId
    );
    
    if (task.stickyKey) {
      this.distributionState.stickyAssignments.set(task.stickyKey, distribution.agentId);
    }
    
    // Emit event
    await this.emit({
      type: 'task.assigned',
      timestamp: new Date(),
      taskId: task.id,
      agentId: distribution.agentId,
      payload: { 
        priority: task.priority, 
        type: task.type,
        strategy: distribution.strategy,
        reason: distribution.reason,
      },
    });
    
    logger.info(`[TaskQueue] Task ${task.id} distributed to agent ${distribution.agentId} (${distribution.strategy})`);
    
    return task;
  }

  /**
   * Mark a task as started (processing)
   */
  async startTask(taskId: string): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    task.status = 'processing';
    task.startedAt = new Date();
    await this.updateTask(task);
    
    await this.emit({
      type: 'task.started',
      timestamp: new Date(),
      taskId,
      agentId: task.assigneeId,
    });
  }

  /**
   * Complete a task successfully
   */
  async completeTask(taskId: string, output?: unknown): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    const now = new Date();
    const processingTimeMs = task.startedAt 
      ? now.getTime() - task.startedAt.getTime()
      : 0;
    
    task.status = 'completed';
    task.completedAt = now;
    task.progress = 100;
    await this.updateTask(task);
    
    // Remove from processing set
    await this.redis.zrem(KEYS.processingSet(prefix), taskId);
    
    // Update agent load
    if (task.assigneeId) {
      await this.updateAgentLoad(task.assigneeId, -1);
    }
    
    // Update metrics
    await this.metrics.incrementTasksCompleted(processingTimeMs);
    
    // Emit event
    await this.emit({
      type: 'task.completed',
      timestamp: now,
      taskId,
      agentId: task.assigneeId,
      payload: { processingTimeMs, output },
    });
    
    logger.info(`[TaskQueue] Task ${taskId} completed in ${processingTimeMs}ms`);
  }

  /**
   * Fail a task (with retry logic)
   */
  async failTask(taskId: string, error: string): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    task.retryCount++;
    task.lastError = error;
    
    // Check if we should retry
    if (task.retryCount < task.maxRetries) {
      // Calculate exponential backoff delay
      const delayMs = Math.min(
        task.retryDelayMs * Math.pow(2, task.retryCount - 1),
        this.config.maxRetryDelayMs
      );
      
      task.status = 'scheduled';
      task.assigneeId = undefined;
      await this.updateTask(task);
      
      // Schedule retry
      const scheduledTime = Date.now() + delayMs;
      await this.redis.zadd(
        KEYS.scheduledQueue(prefix),
        scheduledTime,
        taskId
      );
      
      // Remove from processing set
      await this.redis.zrem(KEYS.processingSet(prefix), taskId);
      
      // Update agent load
      if (task.assigneeId) {
        await this.updateAgentLoad(task.assigneeId, -1);
      }
      
      // Update metrics
      await this.metrics.incrementTasksRetried();
      
      // Emit event
      await this.emit({
        type: 'task.retried',
        timestamp: new Date(),
        taskId,
        payload: { 
          retryCount: task.retryCount, 
          maxRetries: task.maxRetries,
          delayMs,
          error,
        },
      });
      
      logger.info(`[TaskQueue] Task ${taskId} scheduled for retry ${task.retryCount}/${task.maxRetries} in ${delayMs}ms`);
    } else {
      // Max retries exceeded - move to dead letter queue
      await this.moveToDeadLetter(task, error);
    }
  }

  /**
   * Cancel a task
   */
  async cancelTask(taskId: string, reason?: string): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    if (task.status === 'completed' || task.status === 'dead') {
      throw new Error(`Cannot cancel task in ${task.status} state`);
    }
    
    const wasProcessing = task.status === 'processing' || task.status === 'assigned';
    
    task.status = 'cancelled';
    await this.updateTask(task);
    
    // Remove from all queues
    await this.redis.zrem(KEYS.scheduledQueue(prefix), taskId);
    await this.redis.zrem(KEYS.processingSet(prefix), taskId);
    await this.redis.lrem(KEYS.pendingQueue(prefix), 0, taskId);
    
    // Update agent load if task was assigned
    if (wasProcessing && task.assigneeId) {
      await this.updateAgentLoad(task.assigneeId, -1);
    }
    
    // Emit event
    await this.emit({
      type: 'task.cancelled',
      timestamp: new Date(),
      taskId,
      agentId: task.assigneeId,
      payload: { reason },
    });
    
    logger.info(`[TaskQueue] Task ${taskId} cancelled: ${reason || 'No reason provided'}`);
  }

  /**
   * Update task progress
   */
  async updateProgress(
    taskId: string, 
    progress: number, 
    progressData?: Record<string, unknown>
  ): Promise<void> {
    const task = await this.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }
    
    task.progress = Math.max(0, Math.min(100, progress));
    if (progressData) {
      task.progressData = { ...task.progressData, ...progressData };
    }
    
    await this.updateTask(task);
    
    await this.emit({
      type: 'task.progress',
      timestamp: new Date(),
      taskId,
      agentId: task.assigneeId,
      payload: { progress: task.progress, data: progressData },
    });
  }

  // ========================================================================
  // AGENT MANAGEMENT
  // ========================================================================

  /**
   * Register an agent to receive tasks
   */
  async registerAgent(options: RegisterAgentOptions): Promise<TaskAgent> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    
    const agent: TaskAgent = {
      id: options.id,
      skills: options.skills || [],
      capacity: options.capacity || 1,
      currentLoad: 0,
      status: 'idle',
      lastHeartbeat: new Date(),
      metadata: options.metadata,
    };
    
    const agentKey = KEYS.agentKey(prefix, agent.id);
    await this.redis.setex(
      agentKey,
      Math.floor(this.config.heartbeatTimeoutMs! / 1000) * 2,
      JSON.stringify(agent)
    );
    
    await this.redis.sadd(KEYS.agentsSet(prefix), agent.id);
    
    await this.emit({
      type: 'agent.registered',
      timestamp: new Date(),
      agentId: agent.id,
      payload: { skills: agent.skills, capacity: agent.capacity },
    });
    
    logger.info(`[TaskQueue] Agent ${agent.id} registered`);
    
    return agent;
  }

  /**
   * Unregister an agent
   */
  async unregisterAgent(agentId: string): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    
    // Get agent's tasks and requeue them
    const tasks = await this.getAgentTasks(agentId);
    for (const task of tasks) {
      if (task.status === 'assigned' || task.status === 'processing') {
        task.status = 'pending';
        task.assigneeId = undefined;
        await this.updateTask(task);
        await this.redis.lpush(KEYS.pendingQueue(prefix), task.id);
        
        logger.warn(`[TaskQueue] Task ${task.id} requeued due to agent ${agentId} unregistering`);
      }
    }
    
    // Remove agent
    await this.redis.del(KEYS.agentKey(prefix, agentId));
    await this.redis.srem(KEYS.agentsSet(prefix), agentId);
    
    await this.emit({
      type: 'agent.unregistered',
      timestamp: new Date(),
      agentId,
    });
    
    logger.info(`[TaskQueue] Agent ${agentId} unregistered`);
  }

  /**
   * Update agent heartbeat
   */
  async agentHeartbeat(agentId: string): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const agent = await this.getAgent(agentId);
    
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    
    agent.lastHeartbeat = new Date();
    agent.status = agent.currentLoad >= agent.capacity ? 'busy' : 'idle';
    
    const agentKey = KEYS.agentKey(prefix, agent.id);
    await this.redis.setex(
      agentKey,
      Math.floor(this.config.heartbeatTimeoutMs! / 1000) * 2,
      JSON.stringify(agent)
    );
    
    await this.emit({
      type: 'agent.heartbeat',
      timestamp: new Date(),
      agentId,
      payload: { load: agent.currentLoad, status: agent.status },
    });
  }

  /**
   * Get agent by ID
   */
  async getAgent(agentId: string): Promise<TaskAgent | null> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const data = await this.redis.get(KEYS.agentKey(prefix, agentId));
    
    if (!data) return null;
    
    try {
      const agent = JSON.parse(data) as TaskAgent;
      agent.lastHeartbeat = new Date(agent.lastHeartbeat);
      return agent;
    } catch {
      return null;
    }
  }

  /**
   * Get all registered agents
   */
  async getAllAgents(): Promise<TaskAgent[]> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const agentIds = await this.redis.smembers(KEYS.agentsSet(prefix));
    
    const agents: TaskAgent[] = [];
    for (const id of agentIds) {
      const agent = await this.getAgent(id);
      if (agent) {
        agents.push(agent);
      }
    }
    
    return agents;
  }

  /**
   * Get available agents (online with capacity)
   */
  async getAvailableAgents(): Promise<TaskAgent[]> {
    const agents = await this.getAllAgents();
    const now = Date.now();
    const timeoutThreshold = this.config.heartbeatTimeoutMs;
    
    return agents.filter(agent => {
      const lastHeartbeatMs = new Date(agent.lastHeartbeat).getTime();
      const isOnline = now - lastHeartbeatMs < timeoutThreshold;
      const hasCapacity = agent.currentLoad < agent.capacity;
      
      return isOnline && hasCapacity;
    });
  }

  // ========================================================================
  // DEAD LETTER QUEUE
  // ========================================================================

  /**
   * Move a task to the dead letter queue
   */
  private async moveToDeadLetter(task: QueuedTask, finalError: string): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    
    task.status = 'dead';
    task.deadLetterReason = finalError;
    
    const entry: DeadLetterEntry = {
      task,
      deadAt: new Date(),
      reason: finalError,
      errorHistory: [
        ...(task.lastError ? [{ error: task.lastError, timestamp: new Date() }] : []),
        { error: finalError, timestamp: new Date() },
      ],
    };
    
    // Add to dead letter queue
    await this.redis.zadd(
      KEYS.deadLetterQueue(prefix),
      Date.now(),
      JSON.stringify(entry)
    );
    
    // Remove from processing set
    await this.redis.zrem(KEYS.processingSet(prefix), task.id);
    
    // Update agent load
    if (task.assigneeId) {
      await this.updateAgentLoad(task.assigneeId, -1);
    }
    
    // Update metrics
    await this.metrics.incrementTasksDeadLettered();
    
    // Emit event
    await this.emit({
      type: 'task.dead_lettered',
      timestamp: new Date(),
      taskId: task.id,
      agentId: task.assigneeId,
      payload: { reason: finalError, retryCount: task.retryCount },
    });
    
    logger.error(`[TaskQueue] Task ${task.id} moved to dead letter queue: ${finalError}`);
  }

  /**
   * Get dead letter queue entries
   */
  async getDeadLetterEntries(limit = 100): Promise<DeadLetterEntry[]> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const entries = await this.redis.zrevrange(
      KEYS.deadLetterQueue(prefix),
      0,
      limit - 1
    );
    
    return entries.map(e => {
      const entry = JSON.parse(e) as DeadLetterEntry;
      entry.deadAt = new Date(entry.deadAt);
      return entry;
    });
  }

  /**
   * Replay a dead letter task (retry it)
   */
  async replayDeadLetter(taskId: string): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    
    // Find the entry
    const entries = await this.getDeadLetterEntries(1000);
    const entry = entries.find(e => e.task.id === taskId);
    
    if (!entry) {
      throw new Error(`Dead letter entry for task ${taskId} not found`);
    }
    
    // Remove from dead letter queue
    await this.redis.zrem(KEYS.deadLetterQueue(prefix), JSON.stringify(entry));
    
    // Reset task for retry
    const task = entry.task;
    task.status = 'pending';
    task.retryCount = 0;
    task.lastError = undefined;
    task.deadLetterReason = undefined;
    
    await this.updateTask(task);
    await this.redis.lpush(KEYS.pendingQueue(prefix), task.id);
    
    logger.info(`[TaskQueue] Dead letter task ${taskId} replayed`);
  }

  // ========================================================================
  // BACKGROUND PROCESSING
  // ========================================================================

  /**
   * Process scheduled tasks (move to pending when ready)
   */
  private async processScheduledTasks(): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const now = Date.now();
    
    // Get tasks that are ready to execute
    const readyTaskIds = await this.redis.zrangebyscore(
      KEYS.scheduledQueue(prefix),
      0,
      now
    );
    
    for (const taskId of readyTaskIds) {
      const task = await this.getTask(taskId);
      if (!task) continue;
      
      // Remove from scheduled queue
      await this.redis.zrem(KEYS.scheduledQueue(prefix), taskId);
      
      // Add to pending queue
      task.status = 'pending';
      task.scheduledFor = undefined;
      await this.updateTask(task);
      await this.redis.lpush(KEYS.pendingQueue(prefix), taskId);
      
      logger.debug(`[TaskQueue] Scheduled task ${taskId} moved to pending`);
    }
  }

  /**
   * Check agent heartbeats and mark offline agents
   */
  private async checkAgentHeartbeats(): Promise<void> {
    const agents = await this.getAllAgents();
    const now = Date.now();
    const timeoutThreshold = this.config.heartbeatTimeoutMs;
    
    for (const agent of agents) {
      const lastHeartbeatMs = new Date(agent.lastHeartbeat).getTime();
      
      if (now - lastHeartbeatMs > timeoutThreshold) {
        logger.warn(`[TaskQueue] Agent ${agent.id} heartbeat timeout, marking offline`);
        
        // Requeue assigned tasks
        const tasks = await this.getAgentTasks(agent.id);
        for (const task of tasks) {
          if (task.status === 'assigned' || task.status === 'processing') {
            await this.failTask(task.id, 'Agent heartbeat timeout');
          }
        }
        
        // Mark agent offline
        agent.status = 'offline';
        const prefix = this.config.redis.keyPrefix || 'dash:queue';
        const agentKey = KEYS.agentKey(prefix, agent.id);
        await this.redis.setex(agentKey, 60, JSON.stringify(agent)); // Short TTL for offline agents
      }
    }
  }

  // ========================================================================
  // QUERY METHODS
  // ========================================================================

  /**
   * Get task by ID
   */
  async getTask(taskId: string): Promise<QueuedTask | null> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const data = await this.redis.get(KEYS.taskKey(prefix, taskId));
    
    if (!data) return null;
    
    try {
      const task = JSON.parse(data) as QueuedTask;
      task.createdAt = new Date(task.createdAt);
      if (task.scheduledFor) task.scheduledFor = new Date(task.scheduledFor);
      if (task.startedAt) task.startedAt = new Date(task.startedAt);
      if (task.completedAt) task.completedAt = new Date(task.completedAt);
      return task;
    } catch {
      return null;
    }
  }

  /**
   * Get tasks assigned to an agent
   */
  async getAgentTasks(agentId: string): Promise<QueuedTask[]> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const processingIds = await this.redis.zrange(KEYS.processingSet(prefix), 0, -1);
    
    const tasks: QueuedTask[] = [];
    for (const id of processingIds) {
      const task = await this.getTask(id);
      if (task?.assigneeId === agentId) {
        tasks.push(task);
      }
    }
    
    return tasks;
  }

  /**
   * Get queue depth (pending tasks count)
   */
  async getQueueDepth(): Promise<number> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    return this.redis.llen(KEYS.pendingQueue(prefix));
  }

  /**
   * Get queue metrics
   */
  async getMetrics(): Promise<QueueMetrics> {
    return this.metrics.getMetrics();
  }

  // ========================================================================
  // EVENT HANDLING
  // ========================================================================

  /**
   * Subscribe to queue events
   */
  onEvent(handler: QueueEventHandler): string {
    const id = uuidv4();
    this.eventHandlers.set(id, handler);
    return id;
  }

  /**
   * Unsubscribe from queue events
   */
  offEvent(subscriptionId: string): boolean {
    return this.eventHandlers.delete(subscriptionId);
  }

  /**
   * Emit a queue event
   */
  private async emit(event: QueueEvent): Promise<void> {
    // Emit to local handlers
    for (const handler of this.eventHandlers.values()) {
      try {
        await handler(event);
      } catch (error) {
        logger.error('[TaskQueue] Event handler error:', error);
      }
    }
    
    // Also publish to Redis stream for external consumers
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    await this.redis.xadd(
      KEYS.streamKey(prefix),
      '*',
      'event',
      JSON.stringify(event)
    );
  }

  // ========================================================================
  // PRIVATE HELPERS
  // ========================================================================

  private async updateTask(task: QueuedTask): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    await this.redis.setex(
      KEYS.taskKey(prefix, task.id),
      86400 * 7,
      JSON.stringify(task)
    );
  }

  private async requeueTask(task: QueuedTask): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    await this.redis.lpush(KEYS.pendingQueue(prefix), task.id);
  }

  private async updateAgentLoad(agentId: string, delta: number): Promise<void> {
    const agent = await this.getAgent(agentId);
    if (!agent) return;
    
    agent.currentLoad = Math.max(0, agent.currentLoad + delta);
    agent.status = agent.currentLoad >= agent.capacity ? 'busy' : 'idle';
    
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const agentKey = KEYS.agentKey(prefix, agentId);
    await this.redis.setex(
      agentKey,
      Math.floor(this.config.heartbeatTimeoutMs! / 1000) * 2,
      JSON.stringify(agent)
    );
  }

  private priorityToScore(priority: QueuedTask['priority']): number {
    const scores = { critical: 4, high: 3, medium: 2, low: 1 };
    return scores[priority];
  }

  private async loadStickyAssignments(): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const data = await this.redis.hgetall(KEYS.stickyMap(prefix));
    
    for (const [key, agentId] of Object.entries(data)) {
      this.distributionState.stickyAssignments.set(key, agentId);
    }
  }

  private async saveStickyAssignments(): Promise<void> {
    const prefix = this.config.redis.keyPrefix || 'dash:queue';
    const entries: Record<string, string> = {};
    
    for (const [key, agentId] of this.distributionState.stickyAssignments) {
      entries[key] = agentId;
    }
    
    if (Object.keys(entries).length > 0) {
      await this.redis.hset(KEYS.stickyMap(prefix), entries);
    }
  }
}

export default TaskQueue;
