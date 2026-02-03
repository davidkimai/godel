/**
 * LLM Adapter (Simplified for Phase 1)
 * 
 * Basic bridge to @dash/ai package.
 * Full unified client implementation deferred to Phase 2.
 */

import { 
  getModel,
  execute,
  registerProvider,
  ModelResolver,
  ProviderFailover,
  modelResolver,
  failover,
  AVAILABLE_MODELS,
  CostTracker,
} from '@dash/ai';

import type {
  ProviderName,
  AIRequest,
  AIResponse,
  ProviderConfig,
  ModelInfo,
  Message,
} from '@dash/ai';

// Re-export everything from @dash/ai
export * from '@dash/ai';

// Simple wrapper for quick tasks
export async function quickComplete(
  prompt: string,
  provider?: ProviderName
): Promise<string> {
  const model = modelResolver.resolveModel();
  
  const result = await execute({
    model: model.id,
    messages: [{ role: 'user', content: prompt }],
  });
  
  if (!result.success || !result.response) {
    throw new Error(result.error || 'Request failed');
  }
  
  return result.response.content;
}

// Legacy compatibility - will be expanded in Phase 2
export class UnifiedLLMClient {
  private costTracker = new CostTracker();
  
  async complete(prompt: string): Promise<{ content: string; cost: number }> {
    const content = await quickComplete(prompt);
    this.costTracker.track('default', 0.001, 100);
    return { content, cost: 0.001 };
  }
  
  getCostStatus() {
    return this.costTracker.getReport();
  }
}

let globalClient: UnifiedLLMClient | null = null;

export function getUnifiedLLMClient(): UnifiedLLMClient {
  if (!globalClient) {
    globalClient = new UnifiedLLMClient();
  }
  return globalClient;
}
