/**
 * OpenClaw Agent Executor
 *
 * Manages agent lifecycle (spawning → idle → running → completed)
 * Handles task dispatch, result capture, timeout, and auto-retry
 *
 * @module integrations/openclaw/AgentExecutor
 */

import { logger } from '../../utils/logger';
import { EventEmitter } from 'events';
import { SessionManager, SessionsSpawnParams, SessionsSpawnResponse, SessionsSendResponse, Message } from './SessionManager';

// ============================================================================
// Types
// ============================================================================

export interface AgentExecution {
  sessionKey: string;
  sessionId: string;
  status: 'spawning' | 'idle' | 'running' | 'completed' | 'failed' | 'killed';
  runId?: string;
  model: string;
  task: string;
  startedAt: Date;
  completedAt?: Date;
  results: AgentResult[];
  error?: string;
  retryCount: number;
}

export interface AgentResult {
  tool: string;
  input: unknown;
  output: unknown;
  duration: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

export interface TaskDispatchOptions {
  task: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
  systemPrompt?: string;
  skills?: string[];
  sandbox?: SessionsSpawnParams['sandbox'];
  thinking?: SessionsSpawnParams['thinking'];
  onProgress?: (execution: AgentExecution) => void;
  onResult?: (result: AgentResult) => void;
}

export interface ExecutorConfig {
  defaultTimeout: number;
  maxRetries: number;
  retryDelayMs: number;
  pollIntervalMs: number;
  autoCleanup: boolean;
  cleanupAfterMs: number;
}

// ============================================================================
// Agent Executor
// ============================================================================

export class AgentExecutor extends EventEmitter {
  private sessionManager: SessionManager;
  private config: ExecutorConfig;
  private executions: Map<string, AgentExecution> = new Map();
  private executionTimeouts: Map<string, NodeJS.Timeout> = new Map();

  constructor(sessionManager: SessionManager, config?: Partial<ExecutorConfig>) {
    super();
    this.sessionManager = sessionManager;
    this.config = {
      defaultTimeout: config?.defaultTimeout || 300000, // 5 minutes
      maxRetries: config?.maxRetries || 3,
      retryDelayMs: config?.retryDelayMs || 1000,
      pollIntervalMs: config?.pollIntervalMs || 1000,
      autoCleanup: config?.autoCleanup ?? true,
      cleanupAfterMs: config?.cleanupAfterMs || 3600000, // 1 hour
    };

    // Listen to session events
    this.sessionManager.on('session.spawned', (data: Record<string, unknown>) => {
      this.handleSessionSpawned(data['sessionKey'] as string);
    });

    this.sessionManager.on('session.sent', (data: Record<string, unknown>) => {
      this.handleSessionSent(data['sessionKey'] as string, data['runId'] as string);
    });

    this.sessionManager.on('session.killed', (data: Record<string, unknown>) => {
      this.handleSessionKilled(data['sessionKey'] as string);
    });

    this.sessionManager.on('event', (event: Record<string, unknown>) => {
      this.handleSessionEvent(event as { event: string; payload: unknown });
    });

    // Start cleanup interval
    if (this.config.autoCleanup) {
      setInterval(() => this.cleanupExecutions(), this.config.cleanupAfterMs);
    }
  }

  // ============================================================================
  // Core Agent Lifecycle
  // ============================================================================

  /**
   * Spawn a new agent and return execution handle
   * Lifecycle: spawning → idle
   */
  async spawnAgent(options: TaskDispatchOptions): Promise<AgentExecution> {
    logger.info('[AgentExecutor] Spawning agent', { model: options.model, task: options.task.substring(0, 50) });

    const spawnParams: SessionsSpawnParams = {
      model: options.model,
      thinking: options.thinking,
      systemPrompt: options.systemPrompt,
      skills: options.skills,
      sandbox: options.sandbox,
    };

    const spawnResponse = await this.sessionManager.sessionsSpawn(spawnParams);

    const execution: AgentExecution = {
      sessionKey: spawnResponse.sessionKey,
      sessionId: spawnResponse.sessionId,
      status: 'spawning',
      model: options.model || 'default',
      task: options.task,
      startedAt: new Date(),
      results: [],
      retryCount: 0,
    };

    this.executions.set(spawnResponse.sessionKey, execution);
    this.emit('agent.spawned', execution);

    return execution;
  }

  /**
   * Dispatch a task to an existing agent
   * Lifecycle: idle → running → completed/failed
   */
  async dispatchTask(sessionKey: string, task: string, options?: Partial<TaskDispatchOptions>): Promise<AgentExecution> {
    const execution = this.executions.get(sessionKey);
    if (!execution) {
      throw new Error(`Agent not found: ${sessionKey}`);
    }

    if (execution.status === 'running') {
      throw new Error(`Agent ${sessionKey} is already running`);
    }

    if (execution.status === 'completed' || execution.status === 'failed') {
      throw new Error(`Agent ${sessionKey} has already finished`);
    }

    logger.info('[AgentExecutor] Dispatching task', { sessionKey, task: task.substring(0, 50) });

    // Update execution
    execution.task = task;
    execution.status = 'running';
    execution.error = undefined;

    // Set up timeout
    const timeout = options?.timeout || this.config.defaultTimeout;
    this.setupTimeout(sessionKey, timeout);

    this.emit('agent.running', execution);

    // Send the task
    await this.sessionManager.sessionsSend({
      sessionKey,
      message: task,
    });

    return execution;
  }

  /**
   * Spawn and execute in one call
   * Full lifecycle: spawning → idle → running → completed/failed
   */
  async execute(options: TaskDispatchOptions): Promise<AgentExecution> {
    const timeout = options.timeout || this.config.defaultTimeout;
    const maxRetries = options.maxRetries ?? this.config.maxRetries;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const execution = await this.spawnAgent(options);

      try {
        // Wait for session to be ready (idle)
        await this.waitForStatus(execution.sessionKey, 'idle', 10000);

        // Dispatch the task
        await this.dispatchTask(execution.sessionKey, options.task, { timeout });

        // Wait for completion
        await this.waitForCompletion(execution.sessionKey, timeout);

        // Capture results
        await this.captureResults(execution.sessionKey);

        const finalExecution = this.executions.get(execution.sessionKey)!;
        
        if (finalExecution.status === 'completed') {
          this.emit('agent.completed', finalExecution);
          return finalExecution;
        }

        throw new Error(finalExecution.error || 'Execution failed');

      } catch (error) {
        lastError = error as Error;
        logger.warn(`[AgentExecutor] Execution attempt ${attempt + 1} failed: ${lastError.message}`);

        // Clean up failed execution
        await this.killAgent(execution.sessionKey);

        if (attempt < maxRetries) {
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          logger.info(`[AgentExecutor] Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('All execution attempts failed');
  }

  /**
   * Kill an agent
   */
  async killAgent(sessionKey: string): Promise<void> {
    logger.info('[AgentExecutor] Killing agent', { sessionKey });

    // Clear timeout
    const timeout = this.executionTimeouts.get(sessionKey);
    if (timeout) {
      clearTimeout(timeout);
      this.executionTimeouts.delete(sessionKey);
    }

    try {
      await this.sessionManager.sessionsKill(sessionKey);
    } catch (error) {
      logger.warn('[AgentExecutor] Error killing session', { error: (error as Error).message });
    }

    const execution = this.executions.get(sessionKey);
    if (execution) {
      execution.status = 'killed';
      execution.completedAt = new Date();
      this.emit('agent.killed', execution);
    }
  }

  /**
   * Get execution status
   */
  getExecution(sessionKey: string): AgentExecution | undefined {
    return this.executions.get(sessionKey);
  }

  /**
   * Get all executions
   */
  getAllExecutions(): AgentExecution[] {
    return Array.from(this.executions.values());
  }

  /**
   * Get executions by status
   */
  getExecutionsByStatus(status: AgentExecution['status']): AgentExecution[] {
    return this.getAllExecutions().filter(e => e.status === status);
  }

  // ============================================================================
  // Result Capture
  // ============================================================================

  /**
   * Capture results from session history
   */
  async captureResults(sessionKey: string): Promise<AgentResult[]> {
    const execution = this.executions.get(sessionKey);
    if (!execution) {
      throw new Error(`Execution not found: ${sessionKey}`);
    }

    logger.debug('[AgentExecutor] Capturing results', { sessionKey });

    try {
      const history = await this.sessionManager.sessionsHistory(sessionKey);
      const results = this.extractResultsFromHistory(history);

      execution.results = results;

      // Emit result events
      results.forEach(result => {
        this.emit('agent.result', { sessionKey, result });
      });

      return results;
    } catch (error) {
      logger.error('[AgentExecutor] Failed to capture results', { error: (error as Error).message });
      throw error;
    }
  }

  /**
   * Extract tool results from session history
   */
  private extractResultsFromHistory(messages: Message[]): AgentResult[] {
    const results: AgentResult[] = [];

    for (const message of messages) {
      if (message.toolCalls) {
        for (const toolCall of message.toolCalls) {
          results.push({
            tool: toolCall.tool,
            input: toolCall.params,
            output: toolCall.result,
            duration: 0, // Would need timing info from Gateway
            success: !toolCall.error,
            error: toolCall.error,
            timestamp: new Date(message.timestamp),
          });
        }
      }
    }

    return results;
  }

  /**
   * Get the final response from an agent
   */
  async getFinalResponse(sessionKey: string): Promise<string | undefined> {
    const history = await this.sessionManager.sessionsHistory(sessionKey);
    
    // Find the last assistant message
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'assistant') {
        return history[i].content;
      }
    }

    return undefined;
  }

  // ============================================================================
  // Timeout Handling
  // ============================================================================

  private setupTimeout(sessionKey: string, timeoutMs: number): void {
    // Clear existing timeout
    const existing = this.executionTimeouts.get(sessionKey);
    if (existing) {
      clearTimeout(existing);
    }

    const timeout = setTimeout(() => {
      this.handleTimeout(sessionKey);
    }, timeoutMs);

    this.executionTimeouts.set(sessionKey, timeout);
  }

  private async handleTimeout(sessionKey: string): Promise<void> {
    logger.warn('[AgentExecutor] Agent timeout', { sessionKey });

    const execution = this.executions.get(sessionKey);
    if (!execution) return;

    execution.status = 'failed';
    execution.error = 'Execution timeout';
    execution.completedAt = new Date();

    this.emit('agent.timeout', execution);

    // Kill the session
    try {
      await this.sessionManager.sessionsKill(sessionKey);
    } catch (error) {
      logger.warn('[AgentExecutor] Error killing timed-out session', { error: (error as Error).message });
    }
  }

  // ============================================================================
  // Event Handlers
  // ============================================================================

  private handleSessionSpawned(sessionKey: string): void {
    const execution = this.executions.get(sessionKey);
    if (execution && execution.status === 'spawning') {
      execution.status = 'idle';
      this.emit('agent.idle', execution);
    }
  }

  private handleSessionSent(sessionKey: string, runId: string): void {
    const execution = this.executions.get(sessionKey);
    if (execution) {
      execution.runId = runId;
      execution.status = 'running';
    }
  }

  private handleSessionKilled(sessionKey: string): void {
    const execution = this.executions.get(sessionKey);
    if (execution && execution.status !== 'completed' && execution.status !== 'failed') {
      execution.status = 'killed';
      execution.completedAt = new Date();
    }

    // Clear timeout
    const timeout = this.executionTimeouts.get(sessionKey);
    if (timeout) {
      clearTimeout(timeout);
      this.executionTimeouts.delete(sessionKey);
    }
  }

  private handleSessionEvent(event: { event: string; payload: unknown }): void {
    if (event.event === 'agent' && event.payload) {
      const payload = event.payload as { 
        sessionKey?: string; 
        status?: string; 
        error?: string;
        runId?: string;
      };
      
      if (payload.sessionKey) {
        const execution = this.executions.get(payload.sessionKey);
        if (!execution) return;

        if (payload.status === 'completed') {
          execution.status = 'completed';
          execution.completedAt = new Date();
          this.clearTimeout(payload.sessionKey);
          this.emit('agent.completed', execution);
        } else if (payload.status === 'failed') {
          execution.status = 'failed';
          execution.error = payload.error || 'Unknown error';
          execution.completedAt = new Date();
          this.clearTimeout(payload.sessionKey);
          this.emit('agent.failed', execution);
        }
      }
    }
  }

  private clearTimeout(sessionKey: string): void {
    const timeout = this.executionTimeouts.get(sessionKey);
    if (timeout) {
      clearTimeout(timeout);
      this.executionTimeouts.delete(sessionKey);
    }
  }

  // ============================================================================
  // Waiting Utilities
  // ============================================================================

  private async waitForStatus(
    sessionKey: string,
    targetStatus: 'idle' | 'running' | 'completed',
    timeoutMs: number
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const execution = this.executions.get(sessionKey);
      if (!execution) {
        throw new Error(`Execution ${sessionKey} not found`);
      }

      if (execution.status === targetStatus) {
        return;
      }

      if (execution.status === 'failed') {
        throw new Error(`Execution ${sessionKey} failed: ${execution.error}`);
      }

      if (execution.status === 'killed') {
        throw new Error(`Execution ${sessionKey} was killed`);
      }

      await this.sleep(this.config.pollIntervalMs);
    }

    throw new Error(`Timeout waiting for ${targetStatus}`);
  }

  private async waitForCompletion(sessionKey: string, timeoutMs: number): Promise<void> {
    return this.waitForStatus(sessionKey, 'completed', timeoutMs);
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  private cleanupExecutions(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, execution] of this.executions) {
      if ((execution.status === 'completed' || execution.status === 'failed' || execution.status === 'killed') &&
          execution.completedAt &&
          now - execution.completedAt.getTime() > this.config.cleanupAfterMs) {
        this.executions.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`[AgentExecutor] Cleaned up ${cleaned} old executions`);
    }
  }

  // ============================================================================
  // Utility
  // ============================================================================

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createAgentExecutor(
  sessionManager: SessionManager,
  config?: Partial<ExecutorConfig>
): AgentExecutor {
  return new AgentExecutor(sessionManager, config);
}

export default AgentExecutor;
