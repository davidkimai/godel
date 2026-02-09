/**
 * FallbackOrchestrator
 * Manages fallback chain: E2B → Kata → Worktree
 */

import { EventEmitter } from 'eventemitter3';
import type { RuntimeProvider, SpawnConfig, AgentRuntime, RuntimeType } from './runtime-provider';

export type RuntimeProviderType = 'e2b' | 'kata' | 'worktree';

export interface FallbackConfig {
  /** @deprecated Use providerOrder instead */
  primary?: RuntimeProviderType;
  /** @deprecated Use providerOrder instead */
  fallbackChain?: RuntimeProviderType[];
  /** Order of providers to try */
  providerOrder?: RuntimeProviderType[];
  /** Timeout per provider in milliseconds */
  timeoutPerProvider?: number;
  /** @deprecated Use timeoutPerProvider */
  maxFailoverTime?: number;
  /** Max retries per provider */
  maxRetries?: number;
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Circuit breaker threshold */
  circuitBreakerThreshold?: number;
  /** Whether to use cost-aware routing */
  costAware?: boolean;
}

export interface ExecutionResult {
  provider: RuntimeProviderType;
  success: boolean;
  output?: string;
  error?: string;
  duration: number;
  attempts: number;
  fallbackUsed: boolean;
}

export interface SpawnWithFallbackResult {
  runtime: AgentRuntime;
  providerType: RuntimeProviderType;
  failoverCount: number;
  totalTime: number;
}

export interface ProviderHealth {
  /** Provider type */
  type: RuntimeProviderType;
  /** @deprecated Use type instead */
  provider: RuntimeProviderType;
  /** Whether provider is healthy */
  healthy: boolean;
  /** Whether circuit breaker is open */
  circuitOpen: boolean;
  /** Latency in milliseconds */
  latency: number;
  /** Last checked timestamp */
  lastChecked: Date;
  /** Consecutive failures */
  consecutiveFailures: number;
  /** Last error message */
  lastError?: string;
}

export class FallbackOrchestrator extends EventEmitter {
  private config: Required<FallbackConfig>;
  private providerHealth: Map<RuntimeProviderType, ProviderHealth> = new Map();
  private providers: Map<RuntimeProviderType, RuntimeProvider> = new Map();
  private healthCheckTimer: NodeJS.Timeout | null = null;

  constructor(config: Partial<FallbackConfig> = {}) {
    super();

    const providerOrder = config.providerOrder || config.fallbackChain || ['e2b', 'kata', 'worktree'];

    this.config = {
      primary: config.primary || 'e2b',
      fallbackChain: providerOrder,
      providerOrder,
      timeoutPerProvider: config.timeoutPerProvider || config.maxFailoverTime || 30000,
      maxFailoverTime: config.maxFailoverTime || 30000,
      maxRetries: config.maxRetries || 2,
      healthCheckInterval: config.healthCheckInterval || 30000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 3,
      costAware: config.costAware ?? false,
    };

    this.initializeHealthTracking();
    this.startHealthChecks();
  }

  private initializeHealthTracking(): void {
    for (const provider of this.config.providerOrder) {
      this.providerHealth.set(provider, {
        type: provider,
        provider,
        healthy: true,
        circuitOpen: false,
        latency: 0,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
    }
  }

  /**
   * Start health check interval
   */
  startHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.healthCheckTimer = setInterval(() => {
      this.checkAllProviders();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health check interval
   */
  stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  /**
   * Register a provider for fallback orchestration
   * @param name - Provider name
   * @param provider - RuntimeProvider instance
   */
  registerProvider(name: RuntimeProviderType, provider: RuntimeProvider): void {
    this.providers.set(name, provider);
    // Initialize health if not already tracked
    if (!this.providerHealth.has(name)) {
      this.providerHealth.set(name, {
        type: name,
        provider: name,
        healthy: true,
        circuitOpen: false,
        latency: 0,
        lastChecked: new Date(),
        consecutiveFailures: 0,
      });
    }
    this.emit('provider:registered', { provider: name });
  }

  /**
   * Spawn a runtime with automatic fallback
   * @param config - Spawn configuration
   * @returns Spawn result with failover information
   */
  async spawnWithFallback(config: SpawnConfig): Promise<SpawnWithFallbackResult> {
    const startTime = Date.now();
    let failoverCount = 0;
    let lastError: Error | null = null;

    for (const providerType of this.config.providerOrder) {
      const provider = this.providers.get(providerType);
      if (!provider) {
        continue;
      }

      if (!this.isProviderHealthy(providerType)) {
        this.emit('provider:skipped', { provider: providerType, reason: 'unhealthy' });
        // Don't increment failoverCount when provider is skipped due to open circuit
        continue;
      }

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          const runtime = await provider.spawn(config);
          this.recordSuccess(providerType);

          const totalTime = Date.now() - startTime;

          // Emit both event formats for compatibility
          this.emit('spawn:success', {
            provider: providerType,
            runtimeId: runtime.id,
            failoverCount,
            totalTime,
          });
          this.emit('spawnSuccess', {
            runtime,
            providerType,
            failoverCount,
            totalTime,
          });

          return {
            runtime,
            providerType,
            failoverCount,
            totalTime,
          };
        } catch (error) {
          lastError = error as Error;
          this.recordFailure(providerType, lastError.message);

          this.emit('spawn:retry', {
            provider: providerType,
            attempt: attempt + 1,
            error: lastError.message,
          });
          this.emit('spawnFailure', {
            providerType,
            attempt: attempt + 1,
            error: lastError.message,
          });
        }
      }

      failoverCount++;
      this.emit('provider:failed', { provider: providerType, error: lastError?.message });
    }

    // All providers failed
    throw new Error(`All runtime providers failed: ${lastError?.message || 'Unknown error'}`);
  }

  async execute(
    command: string,
    options: { timeout?: number; cwd?: string } = {}
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    let lastError: Error | null = null;

    for (const provider of this.config.providerOrder) {
      if (!this.isProviderHealthy(provider)) {
        this.emit('provider:skipped', { provider, reason: 'unhealthy' });
        continue;
      }

      for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
        try {
          // In real implementation, execute command via provider
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate

          this.recordSuccess(provider);

          const executionResult: ExecutionResult = {
            provider,
            success: true,
            output: `Executed: ${command}`,
            duration: Date.now() - startTime,
            attempts: attempt + 1,
            fallbackUsed: provider !== this.config.providerOrder[0],
          };

          this.emit('execution:success', executionResult);
          return executionResult;
        } catch (error) {
          lastError = error as Error;
          this.recordFailure(provider, lastError.message);

          this.emit('execution:retry', {
            provider,
            attempt: attempt + 1,
            error: lastError.message,
          });
        }
      }

      this.emit('provider:failed', { provider, error: lastError?.message });
    }

    // All providers failed
    const failedResult: ExecutionResult = {
      provider: this.config.providerOrder[this.config.providerOrder.length - 1],
      success: false,
      error: lastError?.message || 'All providers failed',
      duration: Date.now() - startTime,
      attempts: this.config.maxRetries * this.config.providerOrder.length,
      fallbackUsed: true,
    };

    this.emit('execution:failed', failedResult);
    return failedResult;
  }

  private isProviderHealthy(provider: RuntimeProviderType): boolean {
    const health = this.providerHealth.get(provider);
    return health?.healthy ?? false;
  }

  private recordSuccess(provider: RuntimeProviderType): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.healthy = true;
      health.circuitOpen = false;
      health.consecutiveFailures = 0;
      health.lastChecked = new Date();
      health.lastError = undefined;
    }
  }

  private recordFailure(provider: RuntimeProviderType, errorMessage?: string): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.consecutiveFailures++;
      health.lastError = errorMessage;
      if (health.consecutiveFailures >= (this.config.circuitBreakerThreshold || 3)) {
        health.healthy = false;
        health.circuitOpen = true;
        this.emit('provider:unhealthy', { provider });
      }
    }
  }

  /**
   * Mark a provider as unhealthy manually
   * @param provider - Provider type
   * @param reason - Reason for marking unhealthy
   */
  markProviderUnhealthy(provider: RuntimeProviderType, reason?: string): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.healthy = false;
      health.circuitOpen = true;
      health.lastError = reason;
      this.emit('providerUnhealthy', { type: provider, reason });
      this.emit('provider:unhealthy', { provider, reason });
    }
  }

  /**
   * Reset circuit breaker for a provider
   * @param provider - Provider type
   */
  resetCircuitBreaker(provider: RuntimeProviderType): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.healthy = true;
      health.circuitOpen = false;
      health.consecutiveFailures = 0;
      health.lastError = undefined;
      this.emit('provider:reset', { provider });
    }
  }

  private async checkAllProviders(): Promise<void> {
    for (const provider of this.config.providerOrder) {
      await this.checkProviderHealth(provider);
    }
  }

  private async checkProviderHealth(provider: RuntimeProviderType): Promise<void> {
    const start = Date.now();
    const health = this.providerHealth.get(provider);
    if (!health) return;

    try {
      let isHealthy = false;
      const providerInstance = this.providers.get(provider);

      switch (provider) {
        case 'e2b':
          isHealthy = providerInstance ? await this.checkE2BHealth(providerInstance) : false;
          break;
        case 'kata':
          isHealthy = providerInstance ? await this.checkKataHealth(providerInstance) : true;
          break;
        case 'worktree':
          isHealthy = process.cwd() !== undefined;
          break;
        default:
          isHealthy = false;
      }

      health.healthy = isHealthy && !health.circuitOpen;
      health.latency = Date.now() - start;
      health.lastChecked = new Date();

      if (isHealthy) {
        health.consecutiveFailures = 0;
      }
    } catch {
      health.healthy = false;
      health.latency = Date.now() - start;
      health.lastChecked = new Date();
      health.consecutiveFailures++;
    }

    this.emit('health:check', { ...health });
  }

  private async checkE2BHealth(provider: RuntimeProvider): Promise<boolean> {
    try {
      // Check if we can list runtimes as a health check
      await provider.listRuntimes();
      return true;
    } catch {
      return false;
    }
  }

  private async checkKataHealth(provider: RuntimeProvider): Promise<boolean> {
    try {
      await provider.listRuntimes();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the best available provider based on health
   * @returns The best provider type or null if none available
   */
  async getBestProvider(): Promise<RuntimeProviderType | null> {
    for (const provider of this.config.providerOrder) {
      // Only consider registered providers
      if (!this.providers.has(provider)) {
        continue;
      }
      const health = this.providerHealth.get(provider);
      if (health?.healthy && !health?.circuitOpen) {
        return provider;
      }
    }
    return null;
  }

  /**
   * Get health for a specific provider
   * @param provider - Provider type
   * @returns Provider health or null if not found
   */
  getProviderHealth(provider: RuntimeProviderType): ProviderHealth | null {
    return this.providerHealth.get(provider) ?? null;
  }

  /**
   * Get health for all providers as an object keyed by provider type
   * @returns Object with provider types as keys and health as values
   */
  getAllHealth(): Record<RuntimeProviderType, ProviderHealth> {
    const result = {} as Record<RuntimeProviderType, ProviderHealth>;
    for (const [key, value] of this.providerHealth) {
      result[key] = value;
    }
    return result;
  }

  /**
   * Alias for getProviderHealth(provider)
   * @param provider - Provider type
   * @returns Provider health or undefined
   * @deprecated Use getProviderHealth instead
   */
  getHealth(provider: RuntimeProviderType): ProviderHealth | undefined {
    return this.providerHealth.get(provider);
  }

  forceFailover(provider: RuntimeProviderType): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.healthy = false;
      health.circuitOpen = true;
      health.consecutiveFailures = 999;
      this.emit('provider:forced-failover', { provider });
    }
  }

  resetProvider(provider: RuntimeProviderType): void {
    const health = this.providerHealth.get(provider);
    if (health) {
      health.healthy = true;
      health.circuitOpen = false;
      health.consecutiveFailures = 0;
      health.lastError = undefined;
      this.emit('provider:reset', { provider });
    }
  }

  /**
   * Dispose of the orchestrator and cleanup resources
   */
  dispose(): void {
    this.stopHealthChecks();
    this.removeAllListeners();
    this.providers.clear();
    this.providerHealth.clear();
  }

  /**
   * Alias for dispose()
   * @deprecated Use dispose() instead
   */
  destroy(): void {
    this.dispose();
  }
}

// Global instance management
let globalFallbackOrchestrator: FallbackOrchestrator | null = null;

/**
 * Get the global fallback orchestrator instance
 * @returns The global FallbackOrchestrator instance
 */
export function getGlobalFallbackOrchestrator(): FallbackOrchestrator {
  if (!globalFallbackOrchestrator) {
    globalFallbackOrchestrator = new FallbackOrchestrator();
  }
  return globalFallbackOrchestrator;
}

/**
 * Initialize or reinitialize the global fallback orchestrator
 * @param config - Optional configuration for the orchestrator
 * @returns The new global FallbackOrchestrator instance
 */
export function initializeGlobalFallbackOrchestrator(config?: Partial<FallbackConfig>): FallbackOrchestrator {
  if (globalFallbackOrchestrator) {
    globalFallbackOrchestrator.dispose();
  }
  globalFallbackOrchestrator = new FallbackOrchestrator(config);
  return globalFallbackOrchestrator;
}

/**
 * Reset the global fallback orchestrator (useful for testing)
 */
export function resetGlobalFallbackOrchestrator(): void {
  if (globalFallbackOrchestrator) {
    globalFallbackOrchestrator.dispose();
    globalFallbackOrchestrator = null;
  }
}

export default FallbackOrchestrator;
