import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { budgetController } from './budget-controller';
import { decisionEngine, AuthorizationTier } from './decision-engine';

// ============================================================================
// SWARM EXECUTOR TYPES
// ============================================================================

export interface SwarmExecutionConfig {
  maxConcurrentSwarms: number;
  maxAgentsPerSwarm: number;
  executionTimeout: number; // minutes
  retryFailedAgents: boolean;
  retryAttempts: number;
  parallelismStrategy: 'serial' | 'parallel' | 'hybrid';
}

export interface SwarmExecutionContext {
  swarmId: string;
  config: SwarmExecutionConfig;
  startTime: Date;
  endTime?: Date;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  agentResults: Map<string, AgentExecutionResult>;
  totalCost: number;
  progress: number;
}

export interface AgentExecutionResult {
  agentId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'retrying' | 'cancelled';
  startTime?: Date;
  endTime?: Date;
  cost: number;
  output?: string;
  error?: string;
  retries: number;
}

export interface ExecutionMetrics {
  swarmsCompleted: number;
  swarmsFailed: number;
  totalAgentsExecuted: number;
  totalCost: number;
  averageSwarmDuration: number;
  successRate: number;
}

// ============================================================================
// SWARM EXECUTOR
// ============================================================================

export class SwarmExecutor extends EventEmitter {
  private config: SwarmExecutionConfig;
  private activeContexts: Map<string, SwarmExecutionContext> = new Map();
  private executionQueue: string[] = [];
  private isProcessing: boolean = false;
  private metrics: ExecutionMetrics = {
    swarmsCompleted: 0,
    swarmsFailed: 0,
    totalAgentsExecuted: 0,
    totalCost: 0,
    averageSwarmDuration: 0,
    successRate: 0,
  };

  constructor() {
    super();
    this.config = {
      maxConcurrentSwarms: 10,
      maxAgentsPerSwarm: 20,
      executionTimeout: 30,
      retryFailedAgents: true,
      retryAttempts: 3,
      parallelismStrategy: 'parallel',
    };
  }

  // =========================================================================
  // PUBLIC METHODS
  // =========================================================================

  /**
   * Execute a swarm with the specified configuration
   */
  async executeSwarm(
    swarmId: string,
    agentIds: string[],
    options?: Partial<SwarmExecutionConfig>
  ): Promise<SwarmExecutionContext> {
    // Merge options with defaults
    const mergedConfig = { ...this.config, ...options };

    // Check concurrent swarm limit
    if (this.activeContexts.size >= mergedConfig.maxConcurrentSwarms) {
      logger.warn('swarm-executor', 'Max concurrent swarms reached, queuing');
      this.executionQueue.push(swarmId);
      return this.createPendingContext(swarmId, agentIds, mergedConfig);
    }

    // Create execution context
    const context = this.createExecutionContext(swarmId, agentIds, mergedConfig);
    this.activeContexts.set(swarmId, context);

    // Emit start event
    this.emit('swarm:starting', { swarmId, agentCount: agentIds.length });

    try {
      // Execute based on parallelism strategy
      await this.executeAccordingToStrategy(context, agentIds);

      // Mark as completed
      context.status = 'completed';
      this.metrics.swarmsCompleted++;
      this.updateSuccessRate();

      // Emit completion event
      this.emit('swarm:completed', {
        swarmId,
        duration: this.getDuration(context),
        cost: context.totalCost,
        agentResults: context.agentResults,
      });

      // Update budget
      budgetController.recordSpend(context.totalCost);
      this.metrics.totalCost += context.totalCost;

      // Cleanup
      setTimeout(() => this.activeContexts.delete(swarmId), 60000);

      return context;
    } catch (error) {
      context.status = 'failed';
      this.metrics.swarmsFailed++;
      this.updateSuccessRate();

      this.emit('swarm:failed', {
        swarmId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Cancel a running swarm
   */
  async cancelSwarm(swarmId: string): Promise<boolean> {
    const context = this.activeContexts.get(swarmId);
    if (!context) {
      logger.warn('swarm-executor', 'Swarm not found for cancellation', { swarmId });
      return false;
    }

    context.status = 'cancelled';
    this.emit('swarm:cancelled', { swarmId });

    // Stop all agent executions
    for (const [agentId, result] of context.agentResults) {
      if (result.status === 'running' || result.status === 'pending') {
        result.status = 'cancelled';
      }
    }

    // Remove from active contexts
    this.activeContexts.delete(swarmId);

    // Process queue
    await this.processQueue();

    return true;
  }

  /**
   * Get status of active swarms
   */
  getActiveSwarms(): SwarmExecutionContext[] {
    return Array.from(this.activeContexts.values()).filter(
      (ctx) => ctx.status === 'running'
    );
  }

  /**
   * Get execution metrics
   */
  getMetrics(): ExecutionMetrics {
    return { ...this.metrics };
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { queued: number; processing: boolean } {
    return {
      queued: this.executionQueue.length,
      processing: this.isProcessing,
    };
  }

  /**
   * Scale a running swarm (add/remove agents)
   */
  async scaleSwarm(
    swarmId: string,
    targetAgentCount: number
  ): Promise<boolean> {
    const context = this.activeContexts.get(swarmId);
    if (!context || context.status !== 'running') {
      return false;
    }

    const currentCount = context.agentResults.size;
    if (targetAgentCount === currentCount) return true;

    if (targetAgentCount > currentCount) {
      // Scale up - would need to implement agent spawning
      logger.info('swarm-executor', 'Scaling up swarm not yet implemented', {
        swarmId,
        target: targetAgentCount,
      });
    } else {
      // Scale down - cancel excess agents
      const agentIds = Array.from(context.agentResults.keys());
      const toRemove = agentIds.slice(targetAgentCount);
      
      for (const agentId of toRemove) {
        const result = context.agentResults.get(agentId);
        if (result && result.status !== 'completed') {
          result.status = 'cancelled';
        }
      }
    }

    return true;
  }

  /**
   * Get execution context for a swarm
   */
  getContext(swarmId: string): SwarmExecutionContext | undefined {
    return this.activeContexts.get(swarmId);
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  private createExecutionContext(
    swarmId: string,
    agentIds: string[],
    config: SwarmExecutionConfig
  ): SwarmExecutionContext {
    const agentResults = new Map<string, AgentExecutionResult>();
    
    for (const agentId of agentIds) {
      agentResults.set(agentId, {
        agentId,
        status: 'pending',
        cost: 0,
        retries: 0,
      });
    }

    return {
      swarmId,
      config,
      startTime: new Date(),
      status: 'pending',
      agentResults,
      totalCost: 0,
      progress: 0,
    };
  }

  private createPendingContext(
    swarmId: string,
    agentIds: string[],
    config: SwarmExecutionConfig
  ): SwarmExecutionContext {
    return this.createExecutionContext(swarmId, agentIds, config);
  }

  private async executeAccordingToStrategy(
    context: SwarmExecutionContext,
    agentIds: string[]
  ): Promise<void> {
    context.status = 'running';

    switch (this.config.parallelismStrategy) {
      case 'serial':
        await this.executeSerial(context, agentIds);
        break;
      case 'parallel':
        await this.executeParallel(context, agentIds);
        break;
      case 'hybrid':
        await this.executeHybrid(context, agentIds);
        break;
      default:
        await this.executeParallel(context, agentIds);
    }
  }

  private async executeSerial(
    context: SwarmExecutionContext,
    agentIds: string[]
  ): Promise<void> {
    for (let i = 0; i < agentIds.length; i++) {
      const agentId = agentIds[i];
      const result = context.agentResults.get(agentId);
      if (!result) continue;

      try {
        result.status = 'running';
        result.startTime = new Date();

        // Execute agent (simulated - would integrate with actual agent runner)
        const executionResult = await this.executeAgent(agentId);
        
        result.status = executionResult.success ? 'completed' : 'failed';
        result.endTime = new Date();
        result.cost = executionResult.cost;
        result.output = executionResult.output;
        result.error = executionResult.error;

        if (executionResult.success) {
          context.totalCost += executionResult.cost;
        }

        context.progress = ((i + 1) / agentIds.length) * 100;
        this.emit('agent:completed', { agentId, result });
      } catch (error) {
        await this.handleAgentFailure(context, agentId, error);
      }
    }
  }

  private async executeParallel(
    context: SwarmExecutionContext,
    agentIds: string[]
  ): Promise<void> {
    const promises = agentIds.map((agentId) =>
      this.executeAgentAsync(context, agentId)
    );

    await Promise.allSettled(promises);
  }

  private async executeHybrid(
    context: SwarmExecutionContext,
    agentIds: string[]
  ): Promise<void> {
    const batchSize = 5; // Process in batches of 5
    for (let i = 0; i < agentIds.length; i += batchSize) {
      const batch = agentIds.slice(i, i + batchSize);
      const promises = batch.map((agentId) =>
        this.executeAgentAsync(context, agentId)
      );
      await Promise.allSettled(promises);
    }
  }

  private async executeAgentAsync(
    context: SwarmExecutionContext,
    agentId: string
  ): Promise<void> {
    const result = context.agentResults.get(agentId);
    if (!result) return;

    try {
      result.status = 'running';
      result.startTime = new Date();

      const executionResult = await this.executeAgent(agentId);
      
      result.status = executionResult.success ? 'completed' : 'failed';
      result.endTime = new Date();
      result.cost = executionResult.cost;
      result.output = executionResult.output;
      result.error = executionResult.error;

      if (executionResult.success) {
        context.totalCost += executionResult.cost;
      }

      this.metrics.totalAgentsExecuted++;
      this.emit('agent:completed', { agentId, result });
    } catch (error) {
      await this.handleAgentFailure(context, agentId, error);
    }
  }

  private async executeAgent(agentId: string): Promise<{
    success: boolean;
    cost: number;
    output?: string;
    error?: string;
  }> {
    // Simulated execution - would integrate with actual agent runner
    // In real implementation, this would call the agent execution service
    
    // Simulate some work
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Simulated cost (random for demo)
    const cost = Math.random() * 0.5;
    
    // 90% success rate for simulation
    const success = Math.random() > 0.1;

    return {
      success,
      cost,
      output: success ? `Agent ${agentId} completed successfully` : undefined,
      error: success ? undefined : `Agent ${agentId} failed`,
    };
  }

  private async handleAgentFailure(
    context: SwarmExecutionContext,
    agentId: string,
    error: unknown
  ): Promise<void> {
    const result = context.agentResults.get(agentId);
    if (!result) return;

    result.error = error instanceof Error ? error.message : String(error);
    result.retries++;

    if (
      this.config.retryFailedAgents &&
      result.retries < this.config.retryAttempts
    ) {
      result.status = 'retrying';
      this.emit('agent:retrying', { agentId, attempt: result.retries });

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 1000 * result.retries));
      await this.executeAgentAsync(context, agentId);
    } else {
      result.status = 'failed';
      this.emit('agent:failed', { agentId, error: result.error });
    }
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.executionQueue.length === 0) return;

    this.isProcessing = true;

    while (this.executionQueue.length > 0) {
      const swarmId = this.executionQueue.shift();
      if (!swarmId) break;

      const context = this.activeContexts.get(swarmId);
      if (context) {
        context.status = 'pending';
        // Would re-trigger execution here
      }
    }

    this.isProcessing = false;
  }

  private getDuration(context: SwarmExecutionContext): number {
    if (!context.startTime) return 0;
    const endTime = context.endTime || new Date();
    return Math.floor((endTime.getTime() - context.startTime.getTime()) / 1000);
  }

  private updateSuccessRate(): void {
    const total = this.metrics.swarmsCompleted + this.metrics.swarmsFailed;
    if (total > 0) {
      this.metrics.successRate =
        this.metrics.swarmsCompleted / total;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const swarmExecutor = new SwarmExecutor();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick swarm execution
 */
export async function executeSwarm(
  swarmId: string,
  agentIds: string[]
): Promise<SwarmExecutionContext> {
  return swarmExecutor.executeSwarm(swarmId, agentIds);
}

/**
 * Get swarm execution status
 */
export function getSwarmStatus(swarmId: string): SwarmExecutionContext | undefined {
  return swarmExecutor.getContext(swarmId);
}

/**
 * Get execution metrics
 */
export function getExecutionMetrics(): ExecutionMetrics {
  return swarmExecutor.getMetrics();
}
