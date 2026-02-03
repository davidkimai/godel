/**
 * Automatic provider failover logic
 */
import type { ProviderName, AIRequest, AIResponse, FailoverConfig, ProviderConfig } from './types';
import { ModelResolver, modelResolver } from './model-resolver';

export interface FailoverResult {
  success: boolean;
  response?: AIResponse;
  error?: string;
  providersTried: ProviderName[];
}

export class ProviderFailover {
  private config: FailoverConfig;
  private resolver: ModelResolver;
  private providerConfigs: Map<ProviderName, ProviderConfig>;

  constructor(
    config?: Partial<FailoverConfig>,
    resolver?: ModelResolver
  ) {
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      retryDelayMs: config?.retryDelayMs ?? 1000,
      fallbackOrder: config?.fallbackOrder ?? ['openai', 'anthropic', 'google', 'deepseek', 'groq'],
    };
    this.resolver = resolver ?? modelResolver;
    this.providerConfigs = new Map();
  }

  /**
   * Register a provider configuration
   */
  registerProvider(config: ProviderConfig): void {
    this.providerConfigs.set(config.name, config);
  }

  /**
   * Execute a request with automatic failover
   */
  async execute(request: AIRequest): Promise<FailoverResult> {
    const providersTried: ProviderName[] = [];
    const usedFallbackOrder = this.getEffectiveFallbackOrder(request.model);

    for (const provider of usedFallbackOrder) {
      const config = this.providerConfigs.get(provider);
      
      // Skip disabled providers
      if (config && !config.enabled) {
        continue;
      }

      providersTried.push(provider);

      try {
        const result = await this.executeWithProvider(provider, request);
        
        if (result.success) {
          this.resolver.updateSwarmState(provider, true);
          return {
            success: true,
            response: result.response,
            providersTried,
          };
        }
      } catch (error) {
        this.resolver.markProviderUnavailable(provider);
        // Continue to next provider
      }

      // Wait before retrying next provider
      await this.delay(this.config.retryDelayMs);
    }

    return {
      success: false,
      error: 'All providers failed',
      providersTried,
    };
  }

  /**
   * Get effective fallback order based on model and config
   */
  private getEffectiveFallbackOrder(modelId: string): ProviderName[] {
    // Extract provider from model ID if it contains provider prefix
    const providerPrefix = this.extractProviderPrefix(modelId);
    
    if (providerPrefix) {
      // If model specifies a provider, try that first then fall back
      const otherProviders = this.config.fallbackOrder.filter((p) => p !== providerPrefix);
      return [providerPrefix, ...otherProviders];
    }

    return this.config.fallbackOrder;
  }

  /**
   * Extract provider prefix from model ID
   */
  private extractProviderPrefix(modelId: string): ProviderName | null {
    const providerPatterns: Record<string, ProviderName> = {
      'gpt-': 'openai',
      'claude-': 'anthropic',
      'gemini-': 'google',
      'deepseek-': 'deepseek',
      'llama-': 'groq',
    };

    for (const [pattern, provider] of Object.entries(providerPatterns)) {
      if (modelId.startsWith(pattern)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * Execute request with a specific provider
   */
  private async executeWithProvider(
    provider: ProviderName,
    request: AIRequest
  ): Promise<{ success: boolean; response?: AIResponse }> {
    const config = this.providerConfigs.get(provider);
    
    // Simulated provider execution - in real implementation, this would call the actual API
    // For now, we'll simulate based on whether API key is configured
    if (!config?.apiKey && provider !== 'deepseek') {
      // Simulate failure for providers without API key (except deepseek for demo)
      throw new Error(`No API key configured for ${provider}`);
    }

    // Simulate successful response
    const response: AIResponse = {
      id: `${provider}-${Date.now()}`,
      content: `Response from ${provider} using model ${request.model}`,
      provider,
      model: request.model,
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
    };

    return { success: true, response };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current failover statistics
   */
  getStats(): {
    configuredProviders: number;
    enabledProviders: number;
    fallbackOrder: ProviderName[];
  } {
    const configs = Array.from(this.providerConfigs.values());
    return {
      configuredProviders: configs.length,
      enabledProviders: configs.filter((c) => c.enabled).length,
      fallbackOrder: this.config.fallbackOrder,
    };
  }
}

export const failover = new ProviderFailover();
