import { logger } from '../utils/logger';
import { EventEmitter } from 'events';
import { budgetController } from './budget-controller';
import { decisionEngine, AuthorizationTier } from './decision-engine';

// ============================================================================
// TEAM EXECUTOR TYPES
// ============================================================================

export interface TeamExecutionConfig {
  maxConcurrentTeams: number;
  maxAgentsPerTeam: number;
  executionTimeout: number; // minutes
  retryFailedAgents: boolean;
  retryAttempts: number;
  parallelismStrategy: 'serial' | 'parallel' | 'hybrid';
}

export interface TeamExecutionContext {
  teamId: string;
  config: TeamExecutionConfig;
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
  teamsCompleted: number;
  teamsFailed: number;
  totalAgentsExecuted: number;
  totalCost: number;
  averageTeamDuration: number;
  successRate: number;
}

// ============================================================================
// TEAM EXECUTOR
// ============================================================================

export class TeamExecutor extends EventEmitter {
  private config: TeamExecutionConfig;
  private activeContexts: Map<string, TeamExecutionContext> = new Map();
  private executionQueue: string[] = [];
  private isProcessing: boolean = false;
  private metrics: ExecutionMetrics = {
    teamsCompleted: 0,
    teamsFailed: 0,
    totalAgentsExecuted: 0,
    totalCost: 0,
    averageTeamDuration: 0,
    successRate: 0,
  };

  constructor() {
    super();
    this.config = {
      maxConcurrentTeams: 10,
      maxAgentsPerTeam: 20,
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
   * Execute a team with the specified configuration
   */
  async executeTeam(
    teamId: string,
    agentIds: string[],
    options?: Partial<TeamExecutionConfig>
  ): Promise<TeamExecutionContext> {
    // Merge options with defaults
    const mergedConfig = { ...this.config, ...options };

    // Check concurrent team limit
    if (this.activeContexts.size >= mergedConfig.maxConcurrentTeams) {
      logger.warn('team-executor', 'Max concurrent teams reached, queuing');
      this.executionQueue.push(teamId);
      return this.createPendingContext(teamId, agentIds, mergedConfig);
    }

    // Create execution context
    const context = this.createExecutionContext(teamId, agentIds, mergedConfig);
    this.activeContexts.set(teamId, context);

    // Emit start event
    this.emit('team:starting', { teamId, agentCount: agentIds.length });

    try {
      // Execute based on parallelism strategy
      await this.executeAccordingToStrategy(context, agentIds);

      // Mark as completed
      context.status = 'completed';
      this.metrics.teamsCompleted++;
      this.updateSuccessRate();

      // Emit completion event
      this.emit('team:completed', {
        teamId,
        duration: this.getDuration(context),
        cost: context.totalCost,
        agentResults: context.agentResults,
      });

      // Update budget
      budgetController.recordSpend(context.totalCost);
      this.metrics.totalCost += context.totalCost;

      // Cleanup
      setTimeout(() => this.activeContexts.delete(teamId), 60000);

      return context;
    } catch (error) {
      context.status = 'failed';
      this.metrics.teamsFailed++;
      this.updateSuccessRate();

      this.emit('team:failed', {
        teamId,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Cancel a running team
   */
  async cancelTeam(teamId: string): Promise<boolean> {
    const context = this.activeContexts.get(teamId);
    if (!context) {
      logger.warn('team-executor', 'Team not found for cancellation', { teamId });
      return false;
    }

    context.status = 'cancelled';
    this.emit('team:cancelled', { teamId });

    // Stop all agent executions
    for (const [agentId, result] of context.agentResults) {
      if (result.status === 'running' || result.status === 'pending') {
        result.status = 'cancelled';
      }
    }

    // Remove from active contexts
    this.activeContexts.delete(teamId);

    // Process queue
    await this.processQueue();

    return true;
  }

  /**
   * Get status of active teams
   */
  getActiveTeams(): TeamExecutionContext[] {
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
   * Scale a running team (add/remove agents)
   */
  async scaleTeam(
    teamId: string,
    targetAgentCount: number
  ): Promise<boolean> {
    const context = this.activeContexts.get(teamId);
    if (!context || context.status !== 'running') {
      return false;
    }

    const currentCount = context.agentResults.size;
    if (targetAgentCount === currentCount) return true;

    if (targetAgentCount > currentCount) {
      // Scale up - would need to implement agent spawning
      logger.info('team-executor', 'Scaling up team not yet implemented', {
        teamId,
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
   * Get execution context for a team
   */
  getContext(teamId: string): TeamExecutionContext | undefined {
    return this.activeContexts.get(teamId);
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  private createExecutionContext(
    teamId: string,
    agentIds: string[],
    config: TeamExecutionConfig
  ): TeamExecutionContext {
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
      teamId,
      config,
      startTime: new Date(),
      status: 'pending',
      agentResults,
      totalCost: 0,
      progress: 0,
    };
  }

  private createPendingContext(
    teamId: string,
    agentIds: string[],
    config: TeamExecutionConfig
  ): TeamExecutionContext {
    return this.createExecutionContext(teamId, agentIds, config);
  }

  private async executeAccordingToStrategy(
    context: TeamExecutionContext,
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
    context: TeamExecutionContext,
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
    context: TeamExecutionContext,
    agentIds: string[]
  ): Promise<void> {
    const promises = agentIds.map((agentId) =>
      this.executeAgentAsync(context, agentId)
    );

    await Promise.allSettled(promises);
  }

  private async executeHybrid(
    context: TeamExecutionContext,
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
    context: TeamExecutionContext,
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
    context: TeamExecutionContext,
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
      const teamId = this.executionQueue.shift();
      if (!teamId) break;

      const context = this.activeContexts.get(teamId);
      if (context) {
        context.status = 'pending';
        // Would re-trigger execution here
      }
    }

    this.isProcessing = false;
  }

  private getDuration(context: TeamExecutionContext): number {
    if (!context.startTime) return 0;
    const endTime = context.endTime || new Date();
    return Math.floor((endTime.getTime() - context.startTime.getTime()) / 1000);
  }

  private updateSuccessRate(): void {
    const total = this.metrics.teamsCompleted + this.metrics.teamsFailed;
    if (total > 0) {
      this.metrics.successRate =
        this.metrics.teamsCompleted / total;
    }
  }
}

// ============================================================================
// SINGLETON INSTANCE
// ============================================================================

export const teamExecutor = new TeamExecutor();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Quick team execution
 */
export async function executeTeam(
  teamId: string,
  agentIds: string[]
): Promise<TeamExecutionContext> {
  return teamExecutor.executeTeam(teamId, agentIds);
}

/**
 * Get team execution status
 */
export function getTeamStatus(teamId: string): TeamExecutionContext | undefined {
  return teamExecutor.getContext(teamId);
}

/**
 * Get execution metrics
 */
export function getExecutionMetrics(): ExecutionMetrics {
  return teamExecutor.getMetrics();
}
