/**
 * @dash/ai - Unified LLM API with provider failover
 * 
 * Main exports for the Dash AI package
 */

export * from './types.js';
export { ModelResolver, modelResolver, AVAILABLE_MODELS } from './model-resolver.js';
export { ProviderFailover, failover, type FailoverResult } from './provider-failover.js';

import { modelResolver } from './model-resolver.js';
import { failover } from './provider-failover.js';
import type { 
  ProviderName, 
  AIRequest, 
  AIResponse,
  ProviderConfig,
  ModelInfo
} from './types.js';

/**
 * Get model info by ID (legacy compatibility)
 * Now uses resolveModel with the model ID as a capability hint
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
