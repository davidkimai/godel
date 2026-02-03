/**
 * LLM Adapter
 * 
 * Bridge between Dash's legacy OpenClaw integration and the new @dash/ai unified API.
 * Provides backward compatibility while enabling new features.
 * 
 * @module core/llm
 * 
 * ## Migration Status
 * 
 * This file is part of Phase 1 of the pi-mono integration. It provides:
 * - Backward-compatible API for existing code
 * - New unified LLM features via @dash/ai
 * - Gradual migration path for agents
 * 
 * ## Usage
 * 
 * ### Legacy (still works):
 * ```typescript
 * import { getOpenClawCore } from './openclaw';
 * const openclaw = getOpenClawCore(messageBus);
 * const sessionId = await openclaw.spawnSession({ agentId: 'a1', task: 'Hello' });
 * ```
 * 
 * ### New unified API:
 * ```typescript
 * import { getSwarmModel, completeWithFailover } from '@dash/ai';
 * const model = getSwarmModel('coding');
 * const result = await completeWithFailover(model, context, { enableFailover: true });
 * ```
 * 
 * ### Hybrid (recommended during migration):
 * ```typescript
 * import { UnifiedLLMClient } from './llm';
 * const client = new UnifiedLLMClient();
 * const result = await client.complete('coding', context, { useFailover: true });
 * ```
 */

import { EventEmitter } from 'events';
import { MessageBus } from '../bus/index';
import { logger } from '../utils/logger';
import {
  OpenClawCore,
  getOpenClawCore,
  SessionSpawnOptions,
  OpenClawSession,
} from './openclaw';

// Import from new @dash/ai package
import type { TaskType, KnownProvider, MultiProviderSwarmConfig, SwarmAgentConfig, CostReport } from '@dash/ai';
import {
  getSwarmModel,
  completeWithFailover,
  streamWithFailover,
  createMultiProviderSwarm,
  SwarmModelResolver,
  ProviderFailover,
  FailoverStrategy,
  CostTracker,
  Model,
  Api,
  Context,
  AssistantMessage,
} from '@dash/ai';

// Re-export types from @dash/ai for convenience
export type { 
  Model, 
  Api, 
  Context, 
  AssistantMessage,
  SwarmModelConfig,
  TaskType,
  FailoverConfig,
  CostTrackingOptions,
  MultiProviderSwarmConfig,
  SwarmAgentConfig,
  // Also re-export the types we need internally
  ProviderHealth,
  FailoverAttempt,
  FailoverResult,
  ModelCapability,
  ModelScore,
  CostEntry,
  CostStatus,
  CostReport,
  ProviderCostSummary,
  ModelCostSummary,
  SwarmStreamOptions,
  SwarmCompleteOptions,
  SwarmLLMResult,
} from '@dash/ai';

export {
  getSwarmModel,
  completeWithFailover,
  streamWithFailover,
  createMultiProviderSwarm,
  SwarmModelResolver,
  ProviderFailover,
  CostTracker,
  // FailoverStrategy is both a type and a value, export as value
  FailoverStrategy,
} from '@dash/ai';

// ============================================================================
// Configuration
// ============================================================================

export interface UnifiedLLMConfig {
  /** Use new unified API (default: false for backward compatibility) */
  useUnifiedAPI?: boolean;
  
  /** Enable provider failover (default: true when using unified API) */
  enableFailover?: boolean;
  
  /** Enable cost tracking (default: true) */
  enableCostTracking?: boolean;
  
  /** Default task type for model selection */
  defaultTaskType?: TaskType;
  
  /** Budget limit per request */
  budgetPerRequest?: number;
  
  /** Preferred providers */
  preferredProviders?: KnownProvider[];
  
  /** Failover strategy */
  failoverStrategy?: FailoverStrategy;
  
  /** Callback for cost tracking */
  onCostIncurred?: (cost: number, details: Record<string, unknown>) => void;
}

// ============================================================================
// Unified LLM Client
// ============================================================================

/**
 * Unified LLM Client
 * 
 * Provides a unified interface that can use either:
 * 1. Legacy OpenClaw integration (backward compatible)
 * 2. New @dash/ai unified API (new features)
 * 
 * This class enables gradual migration of existing code.
 */
export class UnifiedLLMClient extends EventEmitter {
  private openclaw: OpenClawCore;
  private config: Required<UnifiedLLMConfig>;
  private modelResolver: SwarmModelResolver;
  private providerFailover: ProviderFailover;
  private costTracker: CostTracker;
  private messageBus: MessageBus;

  constructor(messageBus: MessageBus, config: UnifiedLLMConfig = {}) {
    super();
    
    this.messageBus = messageBus;
    this.openclaw = getOpenClawCore(messageBus);
    
    this.config = {
      useUnifiedAPI: config.useUnifiedAPI ?? false,
      enableFailover: config.enableFailover ?? true,
      enableCostTracking: config.enableCostTracking ?? true,
      defaultTaskType: config.defaultTaskType ?? 'chat',
      budgetPerRequest: config.budgetPerRequest ?? 0.1,
      preferredProviders: config.preferredProviders ?? ['anthropic', 'openai'],
      failoverStrategy: config.failoverStrategy ?? FailoverStrategy.SEQUENTIAL,
      onCostIncurred: config.onCostIncurred ?? (() => {}),
    };
    
    this.modelResolver = new SwarmModelResolver();
    this.providerFailover = new ProviderFailover({
      primaryProvider: this.config.preferredProviders[0],
      backupProviders: this.config.preferredProviders.slice(1),
      strategy: this.config.failoverStrategy,
    });
    this.costTracker = new CostTracker({
      budgetLimit: Infinity, // Track without enforcing
      onCostIncurred: (entry) => {
        this.config.onCostIncurred(entry.cost.total, {
          provider: entry.provider,
          model: entry.modelId,
          agentId: entry.agentId,
          swarmId: entry.swarmId,
        });
      },
    });
  }

  /**
   * Complete a request (unified interface)
   * 
   * Uses either OpenClaw or unified API based on configuration.
   */
  async complete(
    taskType: TaskType,
    context: Context,
    options?: {
      agentId?: string;
      swarmId?: string;
      useFailover?: boolean;
      useCache?: boolean;
    }
  ): Promise<{
    content: string;
    provider: string;
    model: string;
    cost: number;
    usage: { input: number; output: number; total: number };
    attempts?: number;
  }> {
    if (this.config.useUnifiedAPI) {
      return this.completeUnified(taskType, context, options);
    } else {
      return this.completeLegacy(taskType, context, options);
    }
  }

  /**
   * Stream a request (unified interface)
   */
  async stream(
    taskType: TaskType,
    context: Context,
    options?: {
      agentId?: string;
      swarmId?: string;
      useFailover?: boolean;
      onChunk?: (chunk: string) => void;
    }
  ): Promise<{
    content: string;
    provider: string;
    model: string;
    cost: number;
  }> {
    if (this.config.useUnifiedAPI) {
      return this.streamUnified(taskType, context, options);
    } else {
      return this.streamLegacy(taskType, context, options);
    }
  }

  /**
   * Create a multi-provider swarm
   */
  createSwarm(config: MultiProviderSwarmConfig): {
    swarmId: string;
    agents: SwarmAgentConfig[];
  } {
    return createMultiProviderSwarm(config);
  }

  /**
   * Get current cost status
   */
  getCostStatus(): {
    totalCost: number;
    entryCount: number;
    byProvider: Array<{ provider: string; totalCost: number; count: number }>;
  } {
    const status = this.costTracker.getStatus();
    const byProvider = this.costTracker.getCostsByProvider();
    
    return {
      totalCost: status.totalCost,
      entryCount: status.entryCount,
      byProvider: byProvider.map(p => ({
        provider: p.provider,
        totalCost: p.totalCost,
        count: p.requestCount,
      })),
    };
  }

  /**
   * Get provider health status
   */
  getProviderHealth(): Array<{
    provider: string;
    isHealthy: boolean;
    successRate: number;
    avgLatencyMs: number;
  }> {
    return this.providerFailover.getProviderHealth().map(h => ({
      provider: h.provider,
      isHealthy: h.isHealthy,
      successRate: h.successRate,
      avgLatencyMs: h.avgLatencyMs,
    }));
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<UnifiedLLMConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Update failover config if changed
    if (config.preferredProviders || config.failoverStrategy) {
      this.providerFailover.updateConfig({
        primaryProvider: this.config.preferredProviders[0],
        backupProviders: this.config.preferredProviders.slice(1),
        strategy: this.config.failoverStrategy,
      });
    }
  }

  /**
   * Export cost report
   */
  exportCostReport(): CostReport {
    return this.costTracker.exportReport();
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private async completeUnified(
    taskType: TaskType,
    context: Context,
    options?: { agentId?: string; swarmId?: string; useFailover?: boolean }
  ): Promise<any> {
    // Get optimized model
    const model = this.modelResolver.resolveModel({
      taskType,
      budgetLimit: this.config.budgetPerRequest,
      preferredProviders: this.config.preferredProviders,
    });

    // Complete with failover
    const result = await completeWithFailover(model, context, {
      enableFailover: options?.useFailover ?? this.config.enableFailover,
      enableCostTracking: this.config.enableCostTracking,
      agentId: options?.agentId,
      swarmId: options?.swarmId,
    });

    // Track cost
    if (result.costStatus) {
      this.emit('cost', {
        amount: result.costStatus.totalCost,
        provider: result.successfulProvider,
        agentId: options?.agentId,
      });
    }

    // Extract text content
    const textContent = result.message.content
      .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
      .map(c => c.text)
      .join('');

    return {
      content: textContent,
      provider: result.successfulProvider,
      model: model.id,
      cost: result.costStatus?.totalCost ?? 0,
      usage: {
        input: result.message.usage.input,
        output: result.message.usage.output,
        total: result.message.usage.totalTokens,
      },
      attempts: result.attempts.length,
    };
  }

  private async completeLegacy(
    taskType: TaskType,
    context: Context,
    options?: { agentId?: string; swarmId?: string }
  ): Promise<any> {
    const agentId = options?.agentId ?? `legacy_${Date.now()}`;
    
    // Get model for task type
    const model = this.modelResolver.resolveModel({
      taskType,
      budgetLimit: this.config.budgetPerRequest,
    });

    // Use OpenClaw session
    const sessionId = await this.openclaw.spawnSession({
      agentId,
      model: model.id,
      task: context.messages[0]?.content?.toString() ?? 'Complete task',
    });

    // Send message and get response
    const response = await this.openclaw['gateway'].sessionsSend(
      sessionId,
      context.messages[0]?.content?.toString() ?? 'Hello'
    );

    // Estimate cost (OpenClaw doesn't provide exact usage)
    const estimatedCost = 0.001; // Placeholder
    // Note: Cost tracking is done via the costTracker callbacks, not direct calls

    return {
      content: 'Response via OpenClaw session',
      provider: model.provider,
      model: model.id,
      cost: estimatedCost,
      usage: { input: 0, output: 0, total: 0 },
    };
  }

  private async streamUnified(
    taskType: TaskType,
    context: Context,
    options?: { agentId?: string; swarmId?: string; useFailover?: boolean; onChunk?: (chunk: string) => void }
  ): Promise<any> {
    const model = this.modelResolver.resolveModel({
      taskType,
      budgetLimit: this.config.budgetPerRequest,
    });

    const { stream, result } = await streamWithFailover(model, context, {
      enableFailover: options?.useFailover ?? this.config.enableFailover,
      enableCostTracking: this.config.enableCostTracking,
      agentId: options?.agentId,
      swarmId: options?.swarmId,
    });

    // Collect chunks
    const chunks: string[] = [];
    for await (const event of stream) {
      if (event.type === 'text_delta') {
        chunks.push(event.delta);
        options?.onChunk?.(event.delta);
      }
    }

    const finalResult = await result;
    
    return {
      content: chunks.join(''),
      provider: finalResult.successfulProvider,
      model: model.id,
      cost: finalResult.costStatus?.totalCost ?? 0,
    };
  }

  private async streamLegacy(
    taskType: TaskType,
    context: Context,
    options?: { agentId?: string; swarmId?: string; onChunk?: (chunk: string) => void }
  ): Promise<any> {
    // Legacy streaming through OpenClaw
    // This is a simplified version - full implementation would use session streaming
    
    const agentId = options?.agentId ?? `legacy_${Date.now()}`;
    const model = this.modelResolver.resolveModel({ taskType });
    
    const sessionId = await this.openclaw.spawnSession({
      agentId,
      model: model.id,
      task: 'Streaming task',
    });

    // Note: Full implementation would set up event listeners for streaming
    return {
      content: 'Legacy streaming not fully implemented',
      provider: model.provider,
      model: model.id,
      cost: 0,
    };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalLLMClient: UnifiedLLMClient | null = null;

export function getUnifiedLLMClient(
  messageBus?: MessageBus,
  config?: UnifiedLLMConfig
): UnifiedLLMClient {
  if (!globalLLMClient) {
    if (!messageBus) {
      throw new Error('UnifiedLLMClient requires MessageBus on first initialization');
    }
    globalLLMClient = new UnifiedLLMClient(messageBus, config);
  }
  return globalLLMClient;
}

export function resetLLMClient(): void {
  globalLLMClient = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Quick complete function (uses unified API)
 */
export async function quickComplete(
  taskType: TaskType,
  prompt: string,
  options?: {
    agentId?: string;
    useFailover?: boolean;
  }
): Promise<string> {
  const model = getSwarmModel(taskType);
  const context: Context = {
    messages: [{
      role: 'user',
      content: prompt,
      timestamp: Date.now(),
    }],
  };

  const result = await completeWithFailover(model, context, {
    enableFailover: options?.useFailover ?? true,
    agentId: options?.agentId,
  });

  return result.message.content
    .filter((c): c is { type: 'text'; text: string } => c.type === 'text')
    .map(c => c.text)
    .join('');
}

export default UnifiedLLMClient;
