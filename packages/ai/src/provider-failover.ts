/**
 * Provider Failover
 * 
 * Automatic failover between LLM providers for high availability swarms.
 * Monitors provider health and switches to backup providers on failure.
 * 
 * @module provider-failover
 */

import { 
  stream, 
  complete,
  Model, 
  Api, 
  Context, 
  StreamOptions,
  AssistantMessage,
  AssistantMessageEventStream,
  Provider,
  KnownProvider,
} from '@mariozechner/pi-ai';

// ============================================================================
// Types
// ============================================================================

export enum FailoverStrategy {
  /** Try primary, then fall back to next on failure */
  SEQUENTIAL = 'sequential',
  
  /** Try all providers in parallel, use first success */
  PARALLEL = 'parallel',
  
  /** Round-robin between providers */
  ROUND_ROBIN = 'round_robin',
  
  /** Use the provider with best recent performance */
  BEST_PERFORMANCE = 'best_performance',
  
  /** Use the cheapest available provider */
  COST_OPTIMIZED = 'cost_optimized',
}

export interface FailoverConfig {
  /** Primary provider preference */
  primaryProvider?: KnownProvider;
  
  /** Backup providers in order of preference */
  backupProviders?: KnownProvider[];
  
  /** Failover strategy */
  strategy?: FailoverStrategy;
  
  /** Max retries per provider */
  maxRetriesPerProvider?: number;
  
  /** Max total retries across all providers */
  maxTotalRetries?: number;
  
  /** Delay between retries (ms) */
  retryDelayMs?: number;
  
  /** Timeout per provider request (ms) */
  providerTimeoutMs?: number;
  
  /** Whether to track provider health */
  trackHealth?: boolean;
  
  /** Health check window (ms) */
  healthCheckWindowMs?: number;
  
  /** Success rate threshold for healthy provider (0-1) */
  healthThreshold?: number;
}

export interface ProviderHealth {
  provider: KnownProvider;
  isHealthy: boolean;
  successRate: number;
  avgLatencyMs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  lastFailure?: Date;
  lastSuccess?: Date;
  consecutiveFailures: number;
}

export interface FailoverAttempt {
  provider: KnownProvider;
  modelId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
  timestamp: Date;
}

export interface FailoverResult {
  message: AssistantMessage;
  attempts: FailoverAttempt[];
  successfulProvider: KnownProvider;
  totalLatencyMs: number;
}

// ============================================================================
// Provider Failover Class
// ============================================================================

export class ProviderFailover {
  private healthData: Map<KnownProvider, ProviderHealth> = new Map();
  private attemptHistory: FailoverAttempt[] = [];
  private roundRobinIndex = 0;
  private config: Required<FailoverConfig>;

  constructor(config: FailoverConfig = {}) {
    this.config = {
      primaryProvider: config.primaryProvider ?? 'anthropic',
      backupProviders: config.backupProviders ?? ['openai', 'google'],
      strategy: config.strategy ?? FailoverStrategy.SEQUENTIAL,
      maxRetriesPerProvider: config.maxRetriesPerProvider ?? 2,
      maxTotalRetries: config.maxTotalRetries ?? 6,
      retryDelayMs: config.retryDelayMs ?? 1000,
      providerTimeoutMs: config.providerTimeoutMs ?? 30000,
      trackHealth: config.trackHealth ?? true,
      healthCheckWindowMs: config.healthCheckWindowMs ?? 5 * 60 * 1000, // 5 min
      healthThreshold: config.healthThreshold ?? 0.8,
    };

    // Initialize health data for all providers
    this.initializeHealthData();
  }

  /**
   * Stream with automatic failover between providers
   */
  async streamWithFailover(
    model: Model<Api>,
    context: Context,
    options?: StreamOptions
  ): Promise<{ stream: AssistantMessageEventStream; result: Promise<FailoverResult> }> {
    const attempts: FailoverAttempt[] = [];
    const startTime = Date.now();
    
    // Get provider list based on strategy
    const providers = this.getProviderList();
    
    // Try each provider
    for (const provider of providers) {
      for (let retry = 0; retry < this.config.maxRetriesPerProvider; retry++) {
        const attemptStart = Date.now();
        
        try {
          // Get model for this provider (or equivalent)
          const providerModel = await this.getModelForProvider(provider, model);
          
          // Attempt streaming
          const s = stream(providerModel, context, {
            ...options,
            signal: this.createTimeoutSignal(this.config.providerTimeoutMs),
          });
          
          // Record successful attempt
          const attempt: FailoverAttempt = {
            provider,
            modelId: providerModel.id,
            success: true,
            latencyMs: Date.now() - attemptStart,
            timestamp: new Date(),
          };
          attempts.push(attempt);
          this.recordAttempt(attempt);
          
          // Create result promise
          const resultPromise = s.result().then(msg => ({
            message: msg,
            attempts,
            successfulProvider: provider,
            totalLatencyMs: Date.now() - startTime,
          }));
          
          return { stream: s, result: resultPromise };
          
        } catch (error) {
          const attempt: FailoverAttempt = {
            provider,
            modelId: model.id,
            success: false,
            latencyMs: Date.now() - attemptStart,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          };
          attempts.push(attempt);
          this.recordAttempt(attempt);
          
          // Wait before retry
          if (retry < this.config.maxRetriesPerProvider - 1) {
            await this.delay(this.config.retryDelayMs * (retry + 1));
          }
        }
      }
    }
    
    // All providers failed
    throw new ProviderFailoverError(
      `All providers failed after ${attempts.length} attempts`,
      attempts
    );
  }

  /**
   * Complete with automatic failover between providers
   */
  async completeWithFailover(
    model: Model<Api>,
    context: Context,
    options?: StreamOptions
  ): Promise<FailoverResult> {
    const attempts: FailoverAttempt[] = [];
    const startTime = Date.now();
    
    // Get provider list based on strategy
    const providers = this.getProviderList();
    
    // Try each provider
    for (const provider of providers) {
      for (let retry = 0; retry < this.config.maxRetriesPerProvider; retry++) {
        const attemptStart = Date.now();
        
        try {
          // Get model for this provider (or equivalent)
          const providerModel = await this.getModelForProvider(provider, model);
          
          // Attempt completion
          const message = await complete(providerModel, context, {
            ...options,
            signal: this.createTimeoutSignal(this.config.providerTimeoutMs),
          });
          
          // Record successful attempt
          const attempt: FailoverAttempt = {
            provider,
            modelId: providerModel.id,
            success: true,
            latencyMs: Date.now() - attemptStart,
            timestamp: new Date(),
          };
          attempts.push(attempt);
          this.recordAttempt(attempt);
          
          return {
            message,
            attempts,
            successfulProvider: provider,
            totalLatencyMs: Date.now() - startTime,
          };
          
        } catch (error) {
          const attempt: FailoverAttempt = {
            provider,
            modelId: model.id,
            success: false,
            latencyMs: Date.now() - attemptStart,
            error: error instanceof Error ? error.message : String(error),
            timestamp: new Date(),
          };
          attempts.push(attempt);
          this.recordAttempt(attempt);
          
          // Wait before retry
          if (retry < this.config.maxRetriesPerProvider - 1) {
            await this.delay(this.config.retryDelayMs * (retry + 1));
          }
        }
      }
    }
    
    // All providers failed
    throw new ProviderFailoverError(
      `All providers failed after ${attempts.length} attempts`,
      attempts
    );
  }

  /**
   * Get health status for all providers
   */
  getProviderHealth(): ProviderHealth[] {
    return Array.from(this.healthData.values());
  }

  /**
   * Get health for a specific provider
   */
  getHealth(provider: KnownProvider): ProviderHealth | undefined {
    return this.healthData.get(provider);
  }

  /**
   * Check if a provider is healthy
   */
  isHealthy(provider: KnownProvider): boolean {
    const health = this.healthData.get(provider);
    return health?.isHealthy ?? true; // Default to healthy if unknown
  }

  /**
   * Get the best performing provider
   */
  getBestProvider(): KnownProvider {
    const healthy = this.getProviderHealth()
      .filter(h => h.isHealthy)
      .sort((a, b) => {
        // Sort by success rate, then by latency
        if (b.successRate !== a.successRate) {
          return b.successRate - a.successRate;
        }
        return a.avgLatencyMs - b.avgLatencyMs;
      });
    
    return healthy[0]?.provider ?? this.config.primaryProvider;
  }

  /**
   * Reset health data
   */
  resetHealth(): void {
    this.initializeHealthData();
    this.attemptHistory = [];
  }

  /**
   * Get recent attempt history
   */
  getAttemptHistory(limit: number = 100): FailoverAttempt[] {
    return this.attemptHistory.slice(-limit);
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<FailoverConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // --------------------------------------------------------------------------
  // Private Methods
  // --------------------------------------------------------------------------

  private initializeHealthData(): void {
    const allProviders: KnownProvider[] = [
      'anthropic',
      'openai', 
      'google',
      'amazon-bedrock',
      'groq',
      'mistral',
      'openrouter',
      'azure-openai-responses',
    ];
    
    for (const provider of allProviders) {
      this.healthData.set(provider, {
        provider,
        isHealthy: true,
        successRate: 1.0,
        avgLatencyMs: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        consecutiveFailures: 0,
      });
    }
  }

  private getProviderList(): KnownProvider[] {
    const all = [
      this.config.primaryProvider,
      ...this.config.backupProviders,
    ];
    
    switch (this.config.strategy) {
      case FailoverStrategy.SEQUENTIAL:
        // Filter out unhealthy providers, but keep primary even if unhealthy
        return all.filter((p, i) => i === 0 || this.isHealthy(p));
        
      case FailoverStrategy.ROUND_ROBIN:
        // Rotate the list
        const rotated = [
          ...all.slice(this.roundRobinIndex),
          ...all.slice(0, this.roundRobinIndex),
        ];
        this.roundRobinIndex = (this.roundRobinIndex + 1) % all.length;
        return rotated.filter(p => this.isHealthy(p));
        
      case FailoverStrategy.BEST_PERFORMANCE:
        // Sort by performance
        return this.getProviderHealth()
          .filter(h => h.isHealthy)
          .sort((a, b) => b.successRate - a.successRate || a.avgLatencyMs - b.avgLatencyMs)
          .map(h => h.provider);
        
      case FailoverStrategy.COST_OPTIMIZED:
        // Use configured order (assumed to be cost-ordered)
        return all.filter(p => this.isHealthy(p));
        
      default:
        return all;
    }
  }

  private async getModelForProvider(
    provider: KnownProvider,
    referenceModel: Model<Api>
  ): Promise<Model<Api>> {
    // Try to find equivalent model in the target provider
    const { getModels } = await import('@mariozechner/pi-ai');
    const providerModels = getModels(provider);
    
    // Try exact match
    const exact = providerModels.find(m => m.id === referenceModel.id);
    if (exact) return exact;
    
    // Try to match by capability level
    // Map known models to capability tiers
    const tier = this.getModelTier(referenceModel.id);
    const equivalent = this.findEquivalentModel(providerModels, tier);
    
    if (equivalent) return equivalent;
    
    // Fall back to first available model
    if (providerModels.length > 0) {
      return providerModels[0];
    }
    
    throw new Error(`No models available for provider: ${provider}`);
  }

  private getModelTier(modelId: string): 'premium' | 'standard' | 'fast' {
    if (modelId.includes('opus') || modelId.includes('5.2') || modelId.includes('5.1-codex')) {
      return 'premium';
    }
    if (modelId.includes('sonnet') || modelId.includes('gpt-4') || modelId.includes('5')) {
      return 'standard';
    }
    return 'fast';
  }

  private findEquivalentModel(
    models: Model<Api>[],
    tier: 'premium' | 'standard' | 'fast'
  ): Model<Api> | undefined {
    const tierMap: Record<string, string[]> = {
      premium: ['opus', '5.2', '5.1-codex'],
      standard: ['sonnet', 'gpt-4', '5.1', '5'],
      fast: ['haiku', 'mini', 'nano', '3.5'],
    };
    
    const keywords = tierMap[tier];
    return models.find(m => keywords.some(k => m.id.includes(k)));
  }

  private recordAttempt(attempt: FailoverAttempt): void {
    this.attemptHistory.push(attempt);
    
    // Keep only recent history
    const cutoff = Date.now() - this.config.healthCheckWindowMs;
    this.attemptHistory = this.attemptHistory.filter(a => 
      a.timestamp.getTime() > cutoff
    );
    
    if (!this.config.trackHealth) return;
    
    // Update health data
    const health = this.healthData.get(attempt.provider);
    if (!health) return;
    
    health.totalRequests++;
    
    if (attempt.success) {
      health.successfulRequests++;
      health.consecutiveFailures = 0;
      health.lastSuccess = attempt.timestamp;
      
      // Update average latency
      if (health.avgLatencyMs === 0) {
        health.avgLatencyMs = attempt.latencyMs;
      } else {
        health.avgLatencyMs = (health.avgLatencyMs * 0.9) + (attempt.latencyMs * 0.1);
      }
    } else {
      health.failedRequests++;
      health.consecutiveFailures++;
      health.lastFailure = attempt.timestamp;
    }
    
    // Recalculate health status
    health.successRate = health.totalRequests > 0 
      ? health.successfulRequests / health.totalRequests 
      : 1.0;
    
    health.isHealthy = 
      health.successRate >= this.config.healthThreshold &&
      health.consecutiveFailures < 3;
  }

  private createTimeoutSignal(ms: number): AbortSignal {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============================================================================
// Custom Error Class
// ============================================================================

export class ProviderFailoverError extends Error {
  constructor(
    message: string,
    public readonly attempts: FailoverAttempt[]
  ) {
    super(message);
    this.name = 'ProviderFailoverError';
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const providerFailover = new ProviderFailover();
