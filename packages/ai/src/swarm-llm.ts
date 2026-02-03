/**
 * Swarm LLM
 * 
 * High-level API for using the unified LLM system in Dash swarms.
 * Combines model resolution, provider failover, and cost tracking.
 * 
 * @module swarm-llm
 */

import { 
  stream, 
  complete,
  streamSimple,
  completeSimple,
  Model, 
  Api, 
  Context, 
  StreamOptions,
  SimpleStreamOptions,
  AssistantMessage,
  AssistantMessageEventStream,
  KnownProvider,
} from '@mariozechner/pi-ai';

import { 
  SwarmModelResolver, 
  SwarmModelConfig, 
  TaskType,
  getSwarmModel as getSwarmModelBase,
} from './swarm-model-resolver';

import { 
  ProviderFailover, 
  FailoverConfig, 
  FailoverStrategy,
  FailoverResult,
} from './provider-failover';

import { 
  CostTracker, 
  CostTrackingOptions,
  CostEntry,
} from './cost-tracker';

// ============================================================================
// Types
// ============================================================================

export interface SwarmStreamOptions extends StreamOptions {
  /** Task type for model selection */
  taskType?: TaskType;
  
  /** Enable provider failover */
  enableFailover?: boolean;
  
  /** Failover configuration */
  failoverConfig?: Partial<FailoverConfig>;
  
  /** Enable cost tracking */
  enableCostTracking?: boolean;
  
  /** Cost tracking configuration */
  costTrackingOptions?: CostTrackingOptions;
  
  /** Task ID for cost tracking */
  taskId?: string;
  
  /** Agent ID for cost tracking */
  agentId?: string;
  
  /** Swarm ID for cost tracking */
  swarmId?: string;
}

export interface SwarmCompleteOptions extends SwarmStreamOptions {
  /** Timeout for the complete operation */
  timeoutMs?: number;
}

export interface MultiProviderSwarmConfig {
  /** Number of agents */
  agentCount: number;
  
  /** Task type for all agents */
  taskType: TaskType;
  
  /** Provider distribution strategy */
  distributionStrategy: 'round_robin' | 'weighted' | 'performance_based';
  
  /** Provider weights (for weighted strategy) */
  providerWeights?: Partial<Record<KnownProvider, number>>;
  
  /** Preferred providers */
  preferredProviders?: KnownProvider[];
  
  /** Budget per agent */
  budgetPerAgent?: number;
  
  /** Enable failover for all agents */
  enableFailover?: boolean;
}

export interface SwarmAgentConfig {
  agentId: string;
  model: Model<Api>;
  provider: KnownProvider;
  taskType: TaskType;
  budgetLimit?: number;
  enableFailover: boolean;
}

// ============================================================================
// High-Level API Functions
// ============================================================================

const modelResolver = new SwarmModelResolver();
const providerFailover = new ProviderFailover();

/**
 * Get a model optimized for swarm tasks
 * 
 * Example:
 * ```typescript
 * const model = getSwarmModel('coding', { 
 *   preferredProviders: ['anthropic', 'openai'],
 *   budgetLimit: 0.01 
 * });
 * ```
 */
export function getSwarmModel(
  taskType: TaskType,
  options?: Omit<SwarmModelConfig, 'taskType'>
): Model<Api> {
  return getSwarmModelBase(taskType, options);
}

/**
 * Stream with automatic failover and cost tracking
 * 
 * Example:
 * ```typescript
 * const { stream, result } = await streamWithFailover(
 *   model,
 *   context,
 *   { 
 *     taskType: 'coding',
 *     enableFailover: true,
 *     enableCostTracking: true,
 *     agentId: 'agent-1',
 *     swarmId: 'swarm-1'
 *   }
 * );
 * 
 * for await (const event of stream) {
 *   // Handle events
 * }
 * 
 * const { message, attempts, successfulProvider } = await result;
 * ```
 */
export async function streamWithFailover(
  model: Model<Api>,
  context: Context,
  options?: SwarmStreamOptions
): Promise<{ stream: AssistantMessageEventStream; result: Promise<SwarmLLMResult> }> {
  const opts = normalizeOptions(options);
  const costTracker = opts.enableCostTracking 
    ? new CostTracker(opts.costTrackingOptions)
    : null;
  
  const startTime = Date.now();
  
  // Use failover if enabled
  if (opts.enableFailover) {
    const failover = new ProviderFailover(opts.failoverConfig);
    const { stream: s, result } = await failover.streamWithFailover(model, context, opts);
    
    // Wrap result to add cost tracking
    const wrappedResult = result.then(async (failoverResult) => {
      const latencyMs = Date.now() - startTime;
      
      // Record cost if tracking enabled
      if (costTracker) {
        await costTracker.recordCost(
          model,
          failoverResult.message.usage,
          {
            taskId: opts.taskId,
            agentId: opts.agentId,
            swarmId: opts.swarmId,
            latencyMs,
            metadata: {
              failoverAttempts: failoverResult.attempts.length,
              successfulProvider: failoverResult.successfulProvider,
            },
          }
        );
      }
      
      return {
        message: failoverResult.message,
        attempts: failoverResult.attempts,
        successfulProvider: failoverResult.successfulProvider,
        totalLatencyMs: failoverResult.totalLatencyMs,
        costStatus: costTracker?.getStatus(),
      };
    });
    
    return { stream: s, result: wrappedResult };
  }
  
  // Direct streaming without failover
  const s = stream(model, context, opts);
  
  const wrappedResult = s.result().then(async (message) => {
    const latencyMs = Date.now() - startTime;
    
    if (costTracker) {
      await costTracker.recordCost(
        model,
        message.usage,
        {
          taskId: opts.taskId,
          agentId: opts.agentId,
          swarmId: opts.swarmId,
          latencyMs,
        }
      );
    }
    
    return {
      message,
      attempts: [{
        provider: model.provider as KnownProvider,
        modelId: model.id,
        success: true,
        latencyMs,
        timestamp: new Date(),
      }],
      successfulProvider: model.provider as KnownProvider,
      totalLatencyMs: latencyMs,
      costStatus: costTracker?.getStatus(),
    };
  });
  
  return { stream: s, result: wrappedResult };
}

/**
 * Complete with automatic failover and cost tracking
 * 
 * Example:
 * ```typescript
 * const result = await completeWithFailover(
 *   model,
 *   context,
 *   { 
 *     taskType: 'coding',
 *     enableFailover: true,
 *     timeoutMs: 30000
 *   }
 * );
 * ```
 */
export async function completeWithFailover(
  model: Model<Api>,
  context: Context,
  options?: SwarmCompleteOptions
): Promise<SwarmLLMResult> {
  const { result } = await streamWithFailover(model, context, options);
  return result;
}

/**
 * Create a multi-provider swarm configuration
 * 
 * Distributes agents across multiple providers for redundancy and load balancing.
 * 
 * Example:
 * ```typescript
 * const swarm = createMultiProviderSwarm({
 *   agentCount: 6,
 *   taskType: 'coding',
 *   distributionStrategy: 'round_robin',
 *   preferredProviders: ['anthropic', 'openai', 'google'],
 *   enableFailover: true
 * });
 * 
 * // swarm.agents will have 2 agents on Anthropic, 2 on OpenAI, 2 on Google
 * ```
 */
export function createMultiProviderSwarm(
  config: MultiProviderSwarmConfig
): { swarmId: string; agents: SwarmAgentConfig[] } {
  const swarmId = `swarm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const agents: SwarmAgentConfig[] = [];
  
  const providers = config.preferredProviders ?? ['anthropic', 'openai', 'google'];
  
  // Get models for each provider
  const providerModels = new Map<KnownProvider, Model<Api>[]>();
  for (const provider of providers) {
    const models = modelResolver.getModelsForTask(config.taskType)
      .filter(m => m.provider === provider);
    if (models.length > 0) {
      providerModels.set(provider, models);
    }
  }
  
  // Filter to providers with available models
  const availableProviders = Array.from(providerModels.keys());
  
  if (availableProviders.length === 0) {
    throw new Error(`No providers available for task type: ${config.taskType}`);
  }
  
  // Distribute agents
  for (let i = 0; i < config.agentCount; i++) {
    let provider: KnownProvider;
    
    switch (config.distributionStrategy) {
      case 'round_robin':
        provider = availableProviders[i % availableProviders.length];
        break;
        
      case 'weighted':
        provider = selectWeightedProvider(availableProviders, config.providerWeights);
        break;
        
      case 'performance_based':
        // Use the provider with best health
        provider = providerFailover.getBestProvider();
        break;
        
      default:
        provider = availableProviders[0];
    }
    
    const models = providerModels.get(provider)!;
    const model = models[0]; // Best model for the task
    
    agents.push({
      agentId: `${swarmId}_agent_${i + 1}`,
      model,
      provider,
      taskType: config.taskType,
      budgetLimit: config.budgetPerAgent,
      enableFailover: config.enableFailover ?? true,
    });
  }
  
  return { swarmId, agents };
}

// ============================================================================
// Result Type
// ============================================================================

export interface SwarmLLMResult {
  message: AssistantMessage;
  attempts: Array<{
    provider: KnownProvider;
    modelId: string;
    success: boolean;
    latencyMs: number;
    error?: string;
    timestamp: Date;
  }>;
  successfulProvider: KnownProvider;
  totalLatencyMs: number;
  costStatus?: {
    totalCost: number;
    budgetLimit: number;
    percentUsed: number;
    remainingBudget: number;
    entryCount: number;
    warningTriggered: boolean;
    stopTriggered: boolean;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function normalizeOptions(options?: SwarmStreamOptions): Required<SwarmStreamOptions> {
  return {
    ...options,
    taskType: options?.taskType ?? 'chat',
    enableFailover: options?.enableFailover ?? false,
    failoverConfig: options?.failoverConfig ?? {},
    enableCostTracking: options?.enableCostTracking ?? false,
    costTrackingOptions: options?.costTrackingOptions ?? {},
    taskId: options?.taskId,
    agentId: options?.agentId,
    swarmId: options?.swarmId,
  } as Required<SwarmStreamOptions>;
}

function selectWeightedProvider(
  providers: KnownProvider[],
  weights?: Partial<Record<KnownProvider, number>>
): KnownProvider {
  if (!weights) {
    return providers[Math.floor(Math.random() * providers.length)];
  }
  
  const totalWeight = providers.reduce((sum, p) => sum + (weights[p] ?? 1), 0);
  let random = Math.random() * totalWeight;
  
  for (const provider of providers) {
    random -= weights[provider] ?? 1;
    if (random <= 0) {
      return provider;
    }
  }
  
  return providers[providers.length - 1];
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export { 
  SwarmModelResolver,
  TaskType,
  SwarmModelConfig,
} from './swarm-model-resolver';

export {
  ProviderFailover,
  FailoverStrategy,
  FailoverConfig,
  FailoverResult,
  ProviderFailoverError,
} from './provider-failover';

export {
  CostTracker,
  CostTrackingOptions,
  CostEntry,
  CostStatus,
  CostReport,
} from './cost-tracker';
