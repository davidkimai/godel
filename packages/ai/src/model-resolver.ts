/**
 * Swarm-aware model selection resolver
 */
import type { ModelInfo, ProviderName, SwarmContext } from './types';

export const AVAILABLE_MODELS: ModelInfo[] = [
  {
    id: 'gpt-4o',
    name: 'GPT-4o',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'gpt-4o-mini',
    name: 'GPT-4o Mini',
    provider: 'openai',
    contextWindow: 128000,
    maxOutputTokens: 16384,
    supportsStreaming: true,
    capabilities: ['text', 'function-calling'],
  },
  {
    id: 'claude-sonnet-4-20250514',
    name: 'Claude Sonnet 4',
    provider: 'anthropic',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'gemini-2.0-flash',
    name: 'Gemini 2.0 Flash',
    provider: 'google',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    capabilities: ['text', 'vision', 'function-calling'],
  },
  {
    id: 'deepseek-chat',
    name: 'DeepSeek Chat',
    provider: 'deepseek',
    contextWindow: 128000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    capabilities: ['text'],
  },
  {
    id: 'llama-4-scout',
    name: 'Llama 4 Scout',
    provider: 'groq',
    contextWindow: 200000,
    maxOutputTokens: 8192,
    supportsStreaming: true,
    capabilities: ['text'],
  },
];

export class ModelResolver {
  private swarmContext: SwarmContext;

  constructor(initialProviders: ProviderName[] = ['openai', 'anthropic', 'google', 'deepseek', 'groq']) {
    this.swarmContext = {
      availableProviders: initialProviders,
      currentLoad: {} as Record<ProviderName, number>,
      lastUsed: {} as Record<ProviderName, number>,
    };
  }

  /**
   * Get the best model based on requirements and swarm state
   */
  resolveModel(
    requirements?: {
      minContext?: number;
      capabilities?: string[];
      preferFast?: boolean;
    }
  ): ModelInfo {
    let candidates = [...AVAILABLE_MODELS];

    if (requirements?.capabilities && requirements.capabilities.length > 0) {
      candidates = candidates.filter((model) =>
        requirements.capabilities!.every((cap) => model.capabilities.includes(cap))
      );
    }

    if (requirements?.minContext && requirements.minContext > 0) {
      candidates = candidates.filter((model) => model.contextWindow >= requirements.minContext!);
    }

    // Apply swarm load balancing - prefer less loaded providers
    candidates.sort((a, b) => {
      const loadA = this.swarmContext.currentLoad[a.provider] || 0;
      const loadB = this.swarmContext.currentLoad[b.provider] || 0;
      
      if (loadA !== loadB) {
        return loadA - loadB;
      }

      // If loads are equal, prefer faster models if requested
      if (requirements?.preferFast) {
        const isMiniA = a.id.includes('mini') || a.id.includes('fast');
        const isMiniB = b.id.includes('mini') || b.id.includes('fast');
        return isMiniA ? -1 : isMiniB ? 1 : 0;
      }

      return 0;
    });

    return candidates[0] || AVAILABLE_MODELS[0];
  }

  /**
   * Get all available models for a provider
   */
  getModelsForProvider(provider: ProviderName): ModelInfo[] {
    return AVAILABLE_MODELS.filter((model) => model.provider === provider);
  }

  /**
   * Update swarm context after a request
   */
  updateSwarmState(provider: ProviderName, success: boolean): void {
    const current = this.swarmContext.currentLoad[provider] || 0;
    
    if (success) {
      this.swarmContext.currentLoad[provider] = current + 1;
    }
    
    this.swarmContext.lastUsed[provider] = Date.now();
  }

  /**
   * Mark a provider as unavailable
   */
  markProviderUnavailable(provider: ProviderName): void {
    this.swarmContext.availableProviders = this.swarmContext.availableProviders.filter(
      (p) => p !== provider
    );
  }

  /**
   * Get the current swarm context
   */
  getSwarmContext(): SwarmContext {
    return { ...this.swarmContext };
  }
}

export const modelResolver = new ModelResolver();
