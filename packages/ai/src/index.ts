/**
 * @dash/ai - Unified LLM API with provider failover
 * 
 * Main exports for the Dash AI package
 */

// Types
export * from './types.js';

// Core classes
export { ModelResolver, modelResolver, AVAILABLE_MODELS } from './model-resolver.js';
export { ProviderFailover, failover, type FailoverResult } from './provider-failover.js';

// Additional type exports for compatibility
export type TaskType = 'coding' | 'reasoning' | 'analysis' | 'quick';
export type KnownProvider = import('./types.js').ProviderName;
export type SwarmAgentConfig = import('./types.js').ProviderConfig;
export type CostReport = {
  totalCost: number;
  totalTokens: number;
  providerBreakdown: Record<string, { cost: number; tokens: number }>;
};
export type MultiProviderSwarmConfig = {
  agents: SwarmAgentConfig[];
  failoverStrategy: FailoverStrategy;
};
export type FailoverStrategy = 'sequential' | 'parallel' | 'adaptive';

// Import dependencies
import { ModelResolver, modelResolver } from './model-resolver.js';
import { ProviderFailover, failover } from './provider-failover.js';
import type { 
  ProviderName, 
  AIRequest, 
  AIResponse,
  ProviderConfig,
  ModelInfo,
  Message
} from './types.js';

// Legacy compatibility exports (for src/core/llm.ts) - must be after imports
export const SwarmModelResolver = ModelResolver;

// ============================================================================
// Legacy Compatibility Functions
// ============================================================================

/**
 * Get swarm model for a task type (legacy compatibility)
 */
export function getSwarmModel(taskType: TaskType): ModelInfo {
  const capabilities: Record<TaskType, string[]> = {
    coding: ['code', 'reasoning'],
    reasoning: ['reasoning', 'analysis'],
    analysis: ['analysis', 'reasoning'],
    quick: ['text'],
  };
  
  return modelResolver.resolveModel({
    capabilities: capabilities[taskType] || ['text'],
  });
}

/**
 * Complete with failover (legacy compatibility)
 */
export async function completeWithFailover(
  model: ModelInfo,
  context: { messages: Message[] },
  options?: { enableFailover?: boolean }
): Promise<{
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: ProviderName;
}> {
  const result = await failover.execute({
    model: model.id,
    messages: context.messages,
  });
  
  if (!result.success || !result.response) {
    throw new Error(result.error || 'Request failed');
  }
  
  return {
    content: result.response.content,
    usage: result.response.usage || { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    provider: result.response.provider,
  };
}

/**
 * Stream with failover (legacy compatibility - currently same as complete)
 */
export async function streamWithFailover(
  model: ModelInfo,
  context: { messages: Message[] },
  options?: { enableFailover?: boolean }
): Promise<{
  content: string;
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  provider: ProviderName;
}> {
  // For now, same as complete (streaming not implemented yet)
  return completeWithFailover(model, context, options);
}

/**
 * Create multi-provider swarm (legacy compatibility)
 */
export function createMultiProviderSwarm(config: MultiProviderSwarmConfig): {
  id: string;
  agents: SwarmAgentConfig[];
} {
  // Register all providers
  for (const agent of config.agents) {
    failover.registerProvider(agent);
  }
  
  return {
    id: `swarm_${Date.now()}`,
    agents: config.agents,
  };
}

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get model info by ID
 */
export function getModel(modelId: string): ModelInfo | undefined {
  // Try to find exact match first
  const exact = modelResolver.getModelsForProvider('openai')
    .concat(modelResolver.getModelsForProvider('anthropic'))
    .concat(modelResolver.getModelsForProvider('google'))
    .concat(modelResolver.getModelsForProvider('deepseek'))
    .concat(modelResolver.getModelsForProvider('groq'))
    .find(m => m.id === modelId);
  
  if (exact) return exact;
  
  // Otherwise resolve best model
  return modelResolver.resolveModel();
}

/**
 * Get the model resolver instance
 */
export function getModelResolver(): typeof modelResolver {
  return modelResolver;
}

/**
 * Execute request with automatic failover
 */
export async function execute(request: AIRequest): Promise<{
  success: boolean;
  response?: AIResponse;
  error?: string;
  providersTried: ProviderName[];
}> {
  return failover.execute(request);
}

/**
 * Register a provider configuration
 */
export function registerProvider(config: ProviderConfig): void {
  failover.registerProvider(config);
}

// ============================================================================
// Stub Classes for Compatibility
// ============================================================================

/**
 * Cost tracker stub (for compatibility)
 */
export class CostTracker {
  private costs: Array<{ provider: string; cost: number; tokens: number }> = [];
  
  track(provider: string, cost: number, tokens: number): void {
    this.costs.push({ provider, cost, tokens });
  }
  
  getReport(): CostReport {
    const providerBreakdown: Record<string, { cost: number; tokens: number }> = {};
    let totalCost = 0;
    let totalTokens = 0;
    
    for (const entry of this.costs) {
      if (!providerBreakdown[entry.provider]) {
        providerBreakdown[entry.provider] = { cost: 0, tokens: 0 };
      }
      providerBreakdown[entry.provider].cost += entry.cost;
      providerBreakdown[entry.provider].tokens += entry.tokens;
      totalCost += entry.cost;
      totalTokens += entry.tokens;
    }
    
    return { totalCost, totalTokens, providerBreakdown };
  }
}

// Re-export type aliases for compatibility
export type Model = ModelInfo;
export type Api = ProviderConfig;
export type Context = { messages: Message[] };
export type AssistantMessage = Message;
export type SwarmModelConfig = import('./types.js').SwarmContext;
export type FailoverConfig = import('./provider-failover.js').FailoverResult;
export type CostTrackingOptions = { enabled: boolean; budget?: number };
export type ProviderHealth = { provider: ProviderName; healthy: boolean; latency: number };
export type FailoverAttempt = { provider: ProviderName; success: boolean; latency: number };
export type ModelCapability = string;
export type ModelScore = { model: ModelInfo; score: number };
export type CostEntry = { timestamp: number; provider: string; cost: number; tokens: number };
export type CostStatus = 'ok' | 'warning' | 'critical';
export type ProviderCostSummary = { provider: ProviderName; totalCost: number; totalTokens: number };
export type ModelCostSummary = { model: string; totalCost: number; totalTokens: number };
export type SwarmStreamOptions = { stream?: boolean; timeout?: number };
export type SwarmCompleteOptions = { timeout?: number; maxRetries?: number };
export type SwarmLLMResult = AIResponse;
