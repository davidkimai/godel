/**
 * LLM Proxy - Main proxy class
 * Routes requests to appropriate providers with fallback support
 */

import { EventEmitter } from 'events';
import {
  ProxyConfig, ProviderConfig, CompletionRequest, CompletionResponse, StreamChunk,
  AuthContext, ProxyError, RateLimitError, ProviderError, MODEL_ALIASES, ModelInfo
} from './types';
import { ProviderAdapter, createAdapter } from './adapters';

export class LlmProxy extends EventEmitter {
  private config: ProxyConfig;
  private adapters: Map<string, ProviderAdapter> = new Map();
  private requestCounts: Map<string, { count: number; resetAt: Date }> = new Map();

  constructor(config: ProxyConfig) {
    super();
    this.config = config;
    
    // Initialize adapters for all providers
    for (const provider of config.providers) {
      if (provider.enabled) {
        this.registerProvider(provider);
      }
    }
  }

  registerProvider(config: ProviderConfig): void {
    const adapter = createAdapter(config.type, config.apiKey, config.baseUrl, config.pricing);
    this.adapters.set(config.id, adapter);
    this.emit('provider.registered', { id: config.id, name: config.name });
  }

  unregisterProvider(providerId: string): void {
    this.adapters.delete(providerId);
    this.emit('provider.unregistered', { id: providerId });
  }

  getProvider(providerId: string): ProviderConfig | undefined {
    return this.config.providers.find(p => p.id === providerId);
  }

  getAllProviders(): ProviderConfig[] {
    return this.config.providers.filter(p => p.enabled);
  }

  async handleCompletion(req: CompletionRequest, auth: AuthContext): Promise<CompletionResponse> {
    const startTime = Date.now();
    
    // Check rate limit
    if (!this.checkRateLimit(auth.userId)) {
      throw new RateLimitError('Rate limit exceeded');
    }

    // Log request
    this.emit('request', { userId: auth.userId, model: req.model });

    // Select provider
    let provider = this.selectProvider(req);
    let lastError: Error | null = null;
    const attemptedProviders: string[] = [];

    // Try with fallback
    while (provider) {
      try {
        const adapter = this.adapters.get(provider.id);
        if (!adapter) {
          throw new ProviderError(`Adapter not found for ${provider.id}`, provider.id);
        }

        // Transform and send request
        const transformedReq = adapter.transformRequest(req);
        
        const response = await fetch(`${provider.baseUrl || this.getDefaultBaseUrl(provider.type)}/v1/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${provider.apiKey}`
          },
          body: JSON.stringify(transformedReq)
        });

        if (!response.ok) {
          const error = await response.text();
          throw new ProviderError(error, provider.id, response.status >= 500);
        }

        const data = await response.json();
        const result = adapter.transformResponse(data);
        
        // Record usage
        this.recordUsage(auth.userId, result.usage.total_tokens);
        
        // Log response
        this.emit('response', {
          userId: auth.userId,
          provider: provider.id,
          model: result.model,
          duration: Date.now() - startTime,
          tokens: result.usage.total_tokens,
          cost: result.cost
        });

        return result;
      } catch (error) {
        lastError = error as Error;
        attemptedProviders.push(provider.id);
        
        // Try fallback if allowed
        if (req.routing?.fallbackAllowed !== false && this.shouldUseFallback(error as Error)) {
          provider = this.getFallbackProvider(provider.id, attemptedProviders);
        } else {
          break;
        }
      }
    }

    // All providers failed
    throw lastError || new ProviderError('All providers failed', 'unknown');
  }

  async *handleStreaming(req: CompletionRequest, auth: AuthContext): AsyncIterable<StreamChunk> {
    // Check rate limit
    if (!this.checkRateLimit(auth.userId)) {
      throw new RateLimitError('Rate limit exceeded');
    }

    const provider = this.selectProvider(req);
    const adapter = this.adapters.get(provider.id);
    
    if (!adapter) {
      throw new ProviderError(`Adapter not found for ${provider.id}`, provider.id);
    }

    const transformedReq = { ...adapter.transformRequest(req), stream: true };
    
    const response = await fetch(`${provider.baseUrl || this.getDefaultBaseUrl(provider.type)}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify(transformedReq)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new ProviderError(error, provider.id);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            
            try {
              const chunk = JSON.parse(data);
              const transformed = adapter.transformStreamChunk(chunk);
              if (transformed) {
                yield transformed;
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  getModels(): ModelInfo[] {
    const models: ModelInfo[] = [];
    
    for (const provider of this.config.providers) {
      if (!provider.enabled) continue;
      
      for (const modelId of provider.models) {
        models.push({
          id: modelId,
          provider: provider.id,
          name: `${provider.name} ${modelId}`,
          capabilities: provider.capabilities,
          contextWindow: this.getContextWindow(modelId),
          pricing: provider.pricing
        });
      }
    }
    
    return models;
  }

  async checkHealth(): Promise<Record<string, { healthy: boolean; latency: number }>> {
    const results: Record<string, { healthy: boolean; latency: number }> = {};
    
    for (const [id, adapter] of this.adapters) {
      results[id] = await adapter.checkHealth();
    }
    
    return results;
  }

  private selectProvider(req: CompletionRequest): ProviderConfig {
    // Check for model alias
    const alias = MODEL_ALIASES[req.model];
    if (alias) {
      const provider = this.getProvider(alias.provider);
      if (provider && provider.enabled) {
        return provider;
      }
    }

    // Check for preferred provider in routing hints
    if (req.routing?.preferredProvider) {
      const provider = this.getProvider(req.routing.preferredProvider);
      if (provider && provider.enabled) {
        return provider;
      }
    }

    // Use default provider
    const defaultProvider = this.getProvider(this.config.defaultProvider);
    if (defaultProvider && defaultProvider.enabled) {
      return defaultProvider;
    }

    // Find any enabled provider
    const enabled = this.getAllProviders();
    if (enabled.length === 0) {
      throw new ProxyError('No providers available', 'no_providers', 503);
    }

    return enabled[0];
  }

  private getFallbackProvider(currentId: string, attempted: string[]): ProviderConfig | null {
    const enabled = this.getAllProviders()
      .filter(p => !attempted.includes(p.id))
      .sort((a, b) => a.priority - b.priority);
    
    return enabled[0] || null;
  }

  private shouldUseFallback(error: Error): boolean {
    if (error instanceof ProviderError) {
      return error.retryable;
    }
    return false;
  }

  private checkRateLimit(userId: string): boolean {
    const now = new Date();
    const key = `${userId}:${now.getHours()}:${now.getMinutes()}`;
    
    const current = this.requestCounts.get(key);
    if (!current) {
      const resetAt = new Date(now);
      resetAt.setMinutes(resetAt.getMinutes() + 1);
      this.requestCounts.set(key, { count: 1, resetAt });
      return true;
    }

    if (now > current.resetAt) {
      const resetAt = new Date(now);
      resetAt.setMinutes(resetAt.getMinutes() + 1);
      this.requestCounts.set(key, { count: 1, resetAt });
      return true;
    }

    if (current.count >= this.config.rateLimiting.requestsPerMinute) {
      return false;
    }

    current.count++;
    return true;
  }

  private recordUsage(userId: string, tokens: number): void {
    // Track usage for analytics
    this.emit('usage', { userId, tokens, timestamp: new Date() });
  }

  private getDefaultBaseUrl(providerType: string): string {
    switch (providerType) {
      case 'anthropic':
        return 'https://api.anthropic.com';
      case 'openai':
        return 'https://api.openai.com';
      default:
        return '';
    }
  }

  private getContextWindow(modelId: string): number {
    // Simplified context window lookup
    if (modelId.includes('claude-opus')) return 200000;
    if (modelId.includes('claude-sonnet')) return 200000;
    if (modelId.includes('claude-haiku')) return 200000;
    if (modelId.includes('gpt-4')) return 128000;
    return 4096;
  }
}
