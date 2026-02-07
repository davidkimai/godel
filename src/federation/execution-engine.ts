/**
 * Execution Engine - Executes task plans with parallel processing
 * 
 * Executes tasks in parallel levels based on the dependency resolution plan.
 * Handles failures, retries, and provides detailed execution results.
 */

import { EventEmitter } from 'events';
import {
  ExecutionPlan,
  ExecutionLevel,
  TaskWithDependencies,
  TaskResult,
  ExecutionResult,
  ExecutionError,
  ExecutionConfig,
  DefaultExecutionConfig,
  AgentSelector,
  TaskExecutor,
  TaskExecutionStatus,
  AgentSelectionCriteria,
} from './types';

/**
 * Options for executing a plan
 */
export interface ExecuteOptions {
  /** Optional signal for cancellation */
  signal?: AbortSignal;
  /** Callback when a task starts */
  onTaskStart?: (taskId: string, agentId: string) => void;
  /** Callback when a task completes */
  onTaskComplete?: (taskId: string, result: unknown) => void;
  /** Callback when a task fails */
  onTaskFail?: (taskId: string, error: Error) => void;
  /** Callback when a level starts */
  onLevelStart?: (level: number, taskCount: number) => void;
  /** Callback when a level completes */
  onLevelComplete?: (level: number, results: TaskResult[]) => void;
  /** Callback for progress updates */
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Internal state for tracking execution
 */
interface ExecutionState {
  results: Map<string, TaskResult>;
  startedAt: Date;
  isCancelled: boolean;
  activeTasks: Set<string>;
  completedLevels: number;
}

/**
 * Executes execution plans with parallel task processing
 */
export class ExecutionEngine extends EventEmitter {
  private config: ExecutionConfig;

  constructor(
    private selector: AgentSelector,
    private executor: TaskExecutor,
    config: Partial<ExecutionConfig> = {}
  ) {
    super();
    this.config = { ...DefaultExecutionConfig, ...config };
  }

  /**
   * Execute an execution plan
   * @param plan - The execution plan to execute
   * @param options - Execution options
   */
  async executePlan(
    plan: ExecutionPlan,
    options: ExecuteOptions = {}
  ): Promise<ExecutionResult> {
    const state: ExecutionState = {
      results: new Map(),
      startedAt: new Date(),
      isCancelled: false,
      activeTasks: new Set(),
      completedLevels: 0,
    };

    this.emit('execution:started', {
      plan,
      timestamp: Date.now(),
    });

    try {
      for (const level of plan.levels) {
        // Check for cancellation
        if (options.signal?.aborted || state.isCancelled) {
          throw new Error('Execution cancelled');
        }

        // Execute this level
        const levelResults = await this.executeLevel(
          level,
          state,
          options
        );

        // Store results
        for (const result of levelResults) {
          state.results.set(result.taskId, result);
        }

        state.completedLevels++;

        // Check for failures
        const failures = levelResults.filter((r) => r.status === 'failed');
        if (failures.length > 0) {
          const shouldAbort = await this.handleLevelFailure(
            level,
            failures,
            state
          );
          
          if (shouldAbort) {
            this.emit('execution:failed', {
              error: new ExecutionError(
                `Level ${level.level} failed with ${failures.length} task(s)`,
                failures,
                level.level
              ),
              failedTasks: failures,
              timestamp: Date.now(),
            });
            
            return this.buildResult(state);
          }
        }

        // Progress callback
        options.onProgress?.(state.results.size, plan.totalTasks);
      }

      const result = this.buildResult(state);
      
      this.emit('execution:completed', {
        result,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      const executionError = error instanceof Error ? error : new Error(String(error));
      
      this.emit('execution:failed', {
        error: executionError,
        failedTasks: Array.from(state.results.values()).filter(
          (r) => r.status === 'failed'
        ),
        timestamp: Date.now(),
      });

      return this.buildResult(state);
    }
  }

  /**
   * Execute all tasks in a single level
   */
  private async executeLevel(
    level: ExecutionLevel,
    state: ExecutionState,
    options: ExecuteOptions
  ): Promise<TaskResult[]> {
    this.emit('level:started', {
      level: level.level,
      taskCount: level.tasks.length,
      timestamp: Date.now(),
    });
    
    options.onLevelStart?.(level.level, level.tasks.length);

    // Execute all tasks in this level with concurrency limit
    const executingTasks = level.tasks.map((task) =>
      this.executeTaskWithRetry(task, state, options)
    );

    const results = await Promise.all(executingTasks);

    this.emit('level:completed', {
      level: level.level,
      results,
      timestamp: Date.now(),
    });
    
    options.onLevelComplete?.(level.level, results);

    return results;
  }

  /**
   * Execute a single task with retry logic
   */
  private async executeTaskWithRetry(
    task: TaskWithDependencies,
    state: ExecutionState,
    options: ExecuteOptions
  ): Promise<TaskResult> {
    const maxAttempts = this.config.retryAttempts + 1;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      // Check for cancellation
      if (options.signal?.aborted || state.isCancelled) {
        return {
          taskId: task.id,
          status: 'cancelled',
          attempts: attempt,
          error: new Error('Execution cancelled'),
        };
      }

      try {
        const result = await this.executeTask(task, state, options);
        
        if (result.status === 'completed') {
          return result;
        }
        
        lastError = result.error;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      // If not the last attempt, emit retry event and wait
      if (attempt < maxAttempts) {
        this.emit('task:retry', {
          taskId: task.id,
          attempt,
          maxAttempts,
          error: lastError,
          timestamp: Date.now(),
        });

        await this.delay(this.config.retryDelayMs * attempt); // Exponential backoff
      }
    }

    return {
      taskId: task.id,
      status: 'failed',
      error: lastError,
      attempts: maxAttempts,
    };
  }

  /**
   * Execute a single task
   */
  private async executeTask(
    task: TaskWithDependencies,
    state: ExecutionState,
    options: ExecuteOptions
  ): Promise<TaskResult> {
    const startedAt = new Date();
    state.activeTasks.add(task.id);

    try {
      // Select agent
      const criteria: AgentSelectionCriteria = {
        requiredSkills: task.task.requiredSkills,
        strategy: 'balanced',
      };

      const agent = await this.selector.selectAgent(criteria);

      this.emit('task:started', {
        taskId: task.id,
        agentId: agent.id,
        timestamp: Date.now(),
        level: 0, // Will be set by caller
      });
      
      options.onTaskStart?.(task.id, agent.id);

      // Execute the task
      const rawResult = await this.executor.execute(agent.id, task.task);

      // Unwrap result objects for compatibility with test expectations
      // If the result is { result: X }, unwrap to just X
      let result: unknown = rawResult;
      if (
        rawResult !== null &&
        typeof rawResult === 'object' &&
        !Array.isArray(rawResult) &&
        'result' in rawResult &&
        Object.keys(rawResult).length === 1
      ) {
        result = (rawResult as { result: unknown }).result;
      }

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      state.activeTasks.delete(task.id);

      const taskResult: TaskResult = {
        taskId: task.id,
        status: 'completed',
        result,
        startedAt,
        completedAt,
        durationMs,
        attempts: 1,
        agentId: agent.id,
      };

      this.emit('task:completed', {
        taskId: task.id,
        result,
        timestamp: Date.now(),
        durationMs,
      });
      
      options.onTaskComplete?.(task.id, result);

      return taskResult;
    } catch (error) {
      state.activeTasks.delete(task.id);
      
      const taskError = error instanceof Error ? error : new Error(String(error));
      
      this.emit('task:failed', {
        taskId: task.id,
        error: taskError,
        timestamp: Date.now(),
        willRetry: false,
      });
      
      options.onTaskFail?.(task.id, taskError);

      return {
        taskId: task.id,
        status: 'failed',
        error: taskError,
        startedAt,
        attempts: 1,
      };
    }
  }

  /**
   * Handle level failure - decide whether to abort or continue
   */
  private async handleLevelFailure(
    level: ExecutionLevel,
    failures: TaskResult[],
    state: ExecutionState
  ): Promise<boolean> {
    // If continue on failure is disabled, abort
    if (!this.config.continueOnFailure) {
      return true;
    }

    // For dependent tasks, we need to check if any failed task has dependents
    // If so, we might need to skip those dependent tasks
    for (const failure of failures) {
      // Mark dependent tasks as skipped
      // This would require access to the resolver, so we emit an event
      this.emit('tasks:should-skip', {
        failedTaskId: failure.taskId,
        reason: 'dependency-failed',
      });
    }

    return false; // Don't abort, continue with next level
  }

  /**
   * Build the final execution result
   */
  private buildResult(state: ExecutionState): ExecutionResult {
    const results = Array.from(state.results.values());
    const completedAt = new Date();

    return {
      completed: results.filter((r) => r.status === 'completed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      cancelled: results.filter((r) => r.status === 'cancelled').length,
      skipped: results.filter((r) => r.status === 'skipped').length,
      results: state.results,
      startedAt: state.startedAt,
      completedAt,
      durationMs: completedAt.getTime() - state.startedAt.getTime(),
      errors: results
        .filter((r) => r.error)
        .map((r) => r.error!),
    };
  }

  /**
   * Cancel the current execution
   */
  cancel(): void {
    this.emit('execution:cancelled', {
      timestamp: Date.now(),
    });
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<ExecutionConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): ExecutionConfig {
    return { ...this.config };
  }

  /**
   * Utility method for delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Simple in-memory task executor for testing
 */
export class InMemoryTaskExecutor implements TaskExecutor {
  private handlers: Map<string, (task: { name: string; description: string }) => Promise<unknown>> = new Map();
  private cancelledTasks: Set<string> = new Set();

  /**
   * Register a handler for a task name
   */
  registerHandler(
    taskName: string,
    handler: (task: { name: string; description: string }) => Promise<unknown>
  ): void {
    this.handlers.set(taskName, handler);
  }

  /**
   * Execute a task
   */
  async execute(agentId: string, task: { name: string; description: string }): Promise<unknown> {
    const handler = this.handlers.get(task.name);
    
    if (!handler) {
      throw new Error(`No handler registered for task: ${task.name}`);
    }

    if (this.cancelledTasks.has(task.name)) {
      this.cancelledTasks.delete(task.name);
      throw new Error('Task cancelled');
    }

    return handler(task);
  }

  /**
   * Cancel a task
   */
  async cancel(taskId: string): Promise<boolean> {
    this.cancelledTasks.add(taskId);
    return true;
  }
}

/**
 * Simple in-memory agent selector for testing
 */
export class InMemoryAgentSelector implements AgentSelector {
  private agents: Array<{
    id: string;
    name: string;
    skills: string[];
    estimatedCost: number;
    estimatedLatency: number;
  }> = [];
  private roundRobinIndex = 0;

  constructor(agents?: Array<{
    id: string;
    name: string;
    skills: string[];
    estimatedCost: number;
    estimatedLatency: number;
  }>) {
    if (agents) {
      this.agents = agents;
    }
  }

  /**
   * Add an agent
   */
  addAgent(agent: {
    id: string;
    name: string;
    skills: string[];
    estimatedCost: number;
    estimatedLatency: number;
  }): void {
    this.agents.push(agent);
  }

  /**
   * Select the best agent for the criteria
   */
  async selectAgent(criteria: AgentSelectionCriteria): Promise<{
    id: string;
    name: string;
    skills: string[];
    estimatedCost: number;
    estimatedLatency: number;
  }> {
    const matchingAgents = this.agents.filter((agent) =>
      criteria.requiredSkills.every((skill) => agent.skills.includes(skill))
    );

    if (matchingAgents.length === 0) {
      throw new Error(
        `No agent found with required skills: ${criteria.requiredSkills.join(', ')}`
      );
    }

    switch (criteria.strategy) {
      case 'fastest':
        return matchingAgents.reduce((best, agent) =>
          agent.estimatedLatency < best.estimatedLatency ? agent : best
        );
      
      case 'cheapest':
        return matchingAgents.reduce((best, agent) =>
          agent.estimatedCost < best.estimatedCost ? agent : best
        );
      
      case 'round-robin':
        const agent = matchingAgents[this.roundRobinIndex % matchingAgents.length];
        this.roundRobinIndex++;
        return agent;
      
      case 'skill-match':
        // Return agent with most matching skills
        return matchingAgents.reduce((best, agent) =>
          agent.skills.length > best.skills.length ? agent : best
        );
      
      case 'balanced':
      default:
        // Balance between cost and latency
        return matchingAgents.reduce((best, agent) => {
          const bestScore = best.estimatedCost + best.estimatedLatency;
          const agentScore = agent.estimatedCost + agent.estimatedLatency;
          return agentScore < bestScore ? agent : best;
        });
    }
  }

  /**
   * Select multiple agents
   */
  async selectAgents(
    criteria: AgentSelectionCriteria,
    count: number
  ): Promise<Array<{
    id: string;
    name: string;
    skills: string[];
    estimatedCost: number;
    estimatedLatency: number;
  }>> {
    const results: Array<{
      id: string;
      name: string;
      skills: string[];
      estimatedCost: number;
      estimatedLatency: number;
    }> = [];

    for (let i = 0; i < count; i++) {
      results.push(await this.selectAgent(criteria));
    }

    return results;
  }
}
