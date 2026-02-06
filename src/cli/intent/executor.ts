/**
 * @fileoverview Intent Executor - Intent execution engine for agent swarms
 * 
 * This module provides the execution engine that transforms parsed intents
 * into running agent swarms. It handles swarm configuration, worktree setup,
 * progress streaming, and result aggregation.
 * 
 * @module @godel/cli/intent/executor
 */

import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  Intent,
  ExecutionPlan,
  ExecutionResult,
  ExecutionMetrics,
  ProgressEvent,
  ProgressCallback,
  ExecutorConfig,
  ComplexityLevel,
  SWARM_CONFIGS,
  ESTIMATED_DURATIONS,
  SwarmConfiguration,
} from './types';
import { SwarmConfig } from '../../core/swarm';
import { WorktreeConfig, DependencyConfig, CleanupStrategy } from '../../core/worktree/types';

// ============================================================================
// DEFAULT EXECUTOR CONFIGURATION
// ============================================================================

const DEFAULT_EXECUTOR_CONFIG: ExecutorConfig = {
  useWorktrees: true,
  defaultBudget: 10.0,
  maxExecutionTime: 60,
};

// ============================================================================
// EXECUTOR CLASS
// ============================================================================

export class IntentExecutor extends EventEmitter {
  private config: ExecutorConfig;
  private activeExecutions: Map<string, ExecutionContext> = new Map();

  constructor(config: Partial<ExecutorConfig> = {}) {
    super();
    this.config = { ...DEFAULT_EXECUTOR_CONFIG, ...config };
  }

  /**
   * Execute an intent by creating and managing an agent swarm.
   * 
   * @param intent - Parsed intent to execute
   * @param options - Optional execution overrides
   * @returns Promise resolving to execution result
   */
  async execute(
    intent: Intent,
    options?: Partial<ExecutorConfig>
  ): Promise<ExecutionResult> {
    const mergedConfig = { ...this.config, ...options };
    const executionId = uuidv4();
    
    // Create execution context
    const context: ExecutionContext = {
      id: executionId,
      intent,
      config: mergedConfig,
      status: 'starting',
      metrics: {
        startTime: new Date(),
        totalCost: 0,
        agentsSpawned: 0,
        tasksCompleted: 0,
      },
    };
    
    this.activeExecutions.set(executionId, context);
    
    try {
      // Emit start event
      this.emitProgress(context, {
        type: 'start',
        timestamp: new Date(),
        progress: 0,
        message: `Starting execution: ${intent.type} ${intent.subject}`,
        data: { intent, executionId },
      });

      // Generate execution plan
      const plan = this.generateExecutionPlan(intent, mergedConfig);
      
      // Setup worktree if enabled
      let worktreeId: string | undefined;
      if (mergedConfig.useWorktrees && plan.worktreeConfig) {
        worktreeId = await this.setupWorktree(context, plan.worktreeConfig);
      }
      
      // Create and configure swarm
      const swarmId = await this.createSwarm(context, plan);
      
      // Update context
      context.swarmId = swarmId;
      context.worktreeId = worktreeId;
      context.status = 'running';
      
      // Execute swarm
      const result = await this.executeSwarm(context, plan);
      
      // Calculate final metrics
      context.metrics.endTime = new Date();
      context.metrics.durationMs = context.metrics.endTime.getTime() - context.metrics.startTime.getTime();
      
      context.status = result.success ? 'completed' : 'failed';
      
      // Emit completion event
      this.emitProgress(context, {
        type: result.success ? 'complete' : 'error',
        timestamp: new Date(),
        progress: result.success ? 100 : context.metrics.progress || 0,
        message: result.success 
          ? `Execution completed successfully` 
          : `Execution failed: ${result.error}`,
        data: { 
          executionId, 
          swarmId, 
          worktreeId,
          metrics: context.metrics,
        },
      });
      
      // Cleanup
      this.activeExecutions.delete(executionId);
      
      return {
        success: result.success,
        swarmId,
        worktreeId,
        output: result.output,
        error: result.error,
        metrics: context.metrics,
      };
      
    } catch (error) {
      context.status = 'failed';
      context.metrics.endTime = new Date();
      context.metrics.durationMs = context.metrics.endTime.getTime() - context.metrics.startTime.getTime();
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      this.emitProgress(context, {
        type: 'error',
        timestamp: new Date(),
        progress: context.metrics.progress || 0,
        message: `Execution error: ${errorMessage}`,
        data: { executionId, error: errorMessage },
      });
      
      this.activeExecutions.delete(executionId);
      
      return {
        success: false,
        swarmId: context.swarmId,
        worktreeId: context.worktreeId,
        error: errorMessage,
        metrics: context.metrics,
      };
    }
  }

  /**
   * Cancel a running execution.
   * 
   * @param executionId - ID of the execution to cancel
   * @returns True if cancelled successfully
   */
  async cancel(executionId: string): Promise<boolean> {
    const context = this.activeExecutions.get(executionId);
    if (!context || context.status !== 'running') {
      return false;
    }
    
    context.status = 'cancelled';
    
    this.emitProgress(context, {
      type: 'error',
      timestamp: new Date(),
      progress: context.metrics.progress || 0,
      message: 'Execution cancelled by user',
      data: { executionId },
    });
    
    this.activeExecutions.delete(executionId);
    
    return true;
  }

  /**
   * Get status of an active execution.
   * 
   * @param executionId - Execution ID
   * @returns Execution context or undefined
   */
  getExecutionStatus(executionId: string): ExecutionContext | undefined {
    return this.activeExecutions.get(executionId);
  }

  /**
   * List all active executions.
   * 
   * @returns Array of active execution contexts
   */
  listActiveExecutions(): ExecutionContext[] {
    return Array.from(this.activeExecutions.values());
  }

  // =========================================================================
  // PRIVATE METHODS
  // =========================================================================

  /**
   * Generate an execution plan from an intent.
   */
  private generateExecutionPlan(
    intent: Intent,
    config: ExecutorConfig
  ): ExecutionPlan {
    // Get base swarm config for complexity level
    const baseConfig = SWARM_CONFIGS[intent.complexity];
    
    // Create swarm configuration
    const swarmConfig: SwarmConfiguration = {
      ...baseConfig,
      name: `intent-${intent.type}-${Date.now()}`,
      task: this.buildTaskDescription(intent),
      budget: {
        amount: config.defaultBudget || 10.0,
        currency: 'USD',
        warningThreshold: 0.75,
        criticalThreshold: 0.90,
      },
      safety: {
        fileSandbox: true,
        maxExecutionTime: (config.maxExecutionTime || 60) * 60 * 1000, // Convert to ms
      },
    };
    
    // Create worktree config if enabled
    let worktreeConfig: WorktreeConfig | undefined;
    if (config.useWorktrees) {
      worktreeConfig = this.createWorktreeConfig(intent, config);
    }
    
    return {
      swarmConfig,
      worktreeConfig,
      estimatedDuration: ESTIMATED_DURATIONS[intent.complexity],
    };
  }

  /**
   * Build a detailed task description from intent.
   */
  private buildTaskDescription(intent: Intent): string {
    let description = `${intent.type}: ${intent.subject}`;
    
    if (intent.requirements.length > 0) {
      description += `\n\nRequirements:\n`;
      intent.requirements.forEach((req, i) => {
        description += `- ${req}\n`;
      });
    }
    
    description += `\nComplexity: ${intent.complexity}`;
    
    return description;
  }

  /**
   * Create worktree configuration for isolated execution.
   */
  private createWorktreeConfig(intent: Intent, config: ExecutorConfig): WorktreeConfig {
    const dependencies: DependencyConfig = {
      shared: ['node_modules', '.git'],
      isolated: ['dist', 'build', '.env', 'coverage'],
    };
    
    return {
      repository: process.cwd(),
      baseBranch: 'main',
      sessionId: `intent-${intent.type}-${Date.now()}`,
      dependencies,
      cleanup: 'on_success' as CleanupStrategy,
    };
  }

  /**
   * Setup worktree for isolated execution.
   */
  private async setupWorktree(
    context: ExecutionContext,
    config: WorktreeConfig
  ): Promise<string> {
    this.emitProgress(context, {
      type: 'progress',
      timestamp: new Date(),
      progress: 5,
      message: 'Setting up isolated worktree...',
      data: { repository: config.repository },
    });
    
    // In a real implementation, this would integrate with the worktree manager
    // For now, return a simulated worktree ID
    const worktreeId = `worktree-${uuidv4().slice(0, 8)}`;
    
    this.emitProgress(context, {
      type: 'progress',
      timestamp: new Date(),
      progress: 10,
      message: 'Worktree ready',
      data: { worktreeId },
    });
    
    return worktreeId;
  }

  /**
   * Create and configure the agent swarm.
   */
  private async createSwarm(
    context: ExecutionContext,
    plan: ExecutionPlan
  ): Promise<string> {
    this.emitProgress(context, {
      type: 'progress',
      timestamp: new Date(),
      progress: 15,
      message: `Creating swarm: ${plan.swarmConfig.name}`,
      data: { 
        strategy: plan.swarmConfig.strategy,
        agentCount: plan.swarmConfig.initialAgents,
      },
    });
    
    // In a real implementation, this would integrate with the swarm manager
    // For now, return a simulated swarm ID
    const swarmId = `swarm-${uuidv4().slice(0, 8)}`;
    
    // Simulate agent spawning
    for (const role of plan.swarmConfig.roles) {
      for (let i = 0; i < role.count; i++) {
        context.metrics.agentsSpawned++;
        
        this.emitProgress(context, {
          type: 'agent_spawned',
          timestamp: new Date(),
          progress: 15 + (context.metrics.agentsSpawned / plan.swarmConfig.initialAgents) * 10,
          message: `Spawned ${role.role} agent ${i + 1}/${role.count}`,
          data: { 
            role: role.role, 
            agentIndex: i,
            task: role.task,
          },
        });
        
        // Simulate slight delay for agent spawn
        await this.delay(50);
      }
    }
    
    return swarmId;
  }

  /**
   * Execute the swarm and collect results.
   */
  private async executeSwarm(
    context: ExecutionContext,
    plan: ExecutionPlan
  ): Promise<{ success: boolean; output?: string; error?: string }> {
    const { swarmConfig, estimatedDuration } = plan;
    
    this.emitProgress(context, {
      type: 'progress',
      timestamp: new Date(),
      progress: 25,
      message: 'Executing swarm...',
      data: { 
        estimatedDuration: `${estimatedDuration} minutes`,
        strategy: swarmConfig.strategy,
      },
    });
    
    // Simulate execution progress
    const totalSteps = 10;
    for (let step = 0; step < totalSteps; step++) {
      // Check if cancelled
      if (context.status === 'cancelled') {
        return { success: false, error: 'Execution cancelled' };
      }
      
      const progress = 25 + ((step + 1) / totalSteps) * 70;
      context.metrics.progress = progress;
      
      this.emitProgress(context, {
        type: 'progress',
        timestamp: new Date(),
        progress,
        message: `Executing... (${step + 1}/${totalSteps})`,
        data: { step, totalSteps },
      });
      
      // Simulate work
      await this.delay(100);
    }
    
    // Simulate agent completions
    for (let i = 0; i < swarmConfig.initialAgents; i++) {
      context.metrics.tasksCompleted++;
      
      this.emitProgress(context, {
        type: 'agent_completed',
        timestamp: new Date(),
        progress: 95 + (i / swarmConfig.initialAgents) * 5,
        message: `Agent ${i + 1} completed`,
        data: { agentIndex: i },
      });
    }
    
    // Simulate cost
    context.metrics.totalCost = Math.random() * swarmConfig.budget!.amount * 0.5;
    
    return {
      success: true,
      output: `Successfully executed ${context.intent.type} for: ${context.intent.subject}`,
    };
  }

  /**
   * Emit progress event.
   */
  private emitProgress(context: ExecutionContext, event: ProgressEvent): void {
    // Update stored progress
    if (event.progress) {
      context.metrics.progress = event.progress;
    }
    
    // Emit on the executor
    this.emit('progress', event);
    
    // Call callback if provided
    if (this.config.onProgress) {
      this.config.onProgress(event);
    }
  }

  /**
   * Utility delay function.
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// EXECUTION CONTEXT TYPE
// ============================================================================

/**
 * Internal execution context for tracking a single execution.
 */
interface ExecutionContext {
  id: string;
  intent: Intent;
  config: ExecutorConfig;
  status: 'starting' | 'running' | 'completed' | 'failed' | 'cancelled';
  swarmId?: string;
  worktreeId?: string;
  metrics: ExecutionMetrics & { progress?: number };
}

// ============================================================================
// CONVENIENCE FUNCTIONS
// ============================================================================

/**
 * Execute an intent with default configuration.
 * 
 * @param intent - Parsed intent to execute
 * @param options - Optional execution configuration
 * @returns Promise resolving to execution result
 */
export async function executeIntent(
  intent: Intent,
  options?: Partial<ExecutorConfig>
): Promise<ExecutionResult> {
  const executor = new IntentExecutor(options);
  return executor.execute(intent);
}

/**
 * Create an executor with custom configuration.
 * 
 * @param config - Executor configuration
 * @returns Configured IntentExecutor instance
 */
export function createExecutor(config: Partial<ExecutorConfig>): IntentExecutor {
  return new IntentExecutor(config);
}

/**
 * Generate an execution plan from an intent without executing.
 * 
 * @param intent - Parsed intent
 * @returns Execution plan
 */
export function generatePlan(intent: Intent): ExecutionPlan {
  const baseConfig = SWARM_CONFIGS[intent.complexity];
  
  const swarmConfig: SwarmConfiguration = {
    ...baseConfig,
    name: `intent-${intent.type}-${Date.now()}`,
    task: `${intent.type}: ${intent.subject}`,
    budget: {
      amount: 10.0,
      currency: 'USD',
      warningThreshold: 0.75,
      criticalThreshold: 0.90,
    },
    safety: {
      fileSandbox: true,
      maxExecutionTime: 60 * 60 * 1000,
    },
  };
  
  return {
    swarmConfig,
    estimatedDuration: ESTIMATED_DURATIONS[intent.complexity],
  };
}

/**
 * Estimate execution time for an intent.
 * 
 * @param intent - Parsed intent
 * @returns Estimated duration in minutes
 */
export function estimateDuration(intent: Intent): number {
  return ESTIMATED_DURATIONS[intent.complexity];
}

/**
 * Estimate cost for an intent.
 * 
 * @param intent - Parsed intent
 * @returns Estimated cost in USD
 */
export function estimateCost(intent: Intent): number {
  const baseCosts: Record<ComplexityLevel, number> = {
    low: 1.0,
    medium: 5.0,
    high: 20.0,
  };
  
  return baseCosts[intent.complexity];
}
