/**
 * FallbackOrchestrator - Automatic runtime fallback with health checking
 * 
 * Implements automatic fallback between runtime providers:
 * E2B (primary) → Kata (secondary) → Worktree (fallback)
 * 
 * Features:
 * - <1s failover time
 * - Health checking for all providers
 * - Circuit breaker pattern for failing providers
 * - Cost-aware provider selection
 * 
 * @module @godel/core/runtime/fallback-orchestrator
 * @version 1.0.0
 * @since 2026-02-08
 * @see SPEC-002 Section 4.4
 */

import { EventEmitter } from 'events';
import { logger } from '../../../utils/logger';
import {
  RuntimeProvider,
  SpawnConfig,
  AgentRuntime,
  RuntimeState,
  RuntimeType,
  SpawnError,
  ResourceExhaustedError,
  TimeoutError,
  RuntimeStatus,
} from './runtime-provider';
import { E2BRuntimeProvider } from './providers/e2b-runtime-provider';
import { KataRuntimeProvider } from './providers/kata-runtime-provider';
import { WorktreeRuntimeProvider } from './providers/worktree-runtime-provider';

// ============================================================================
// Types
// ============================================================================

/**
 * Fallback configuration
 */
export interface FallbackConfig {
  /** Provider priority order (first is primary) */
  providerOrder?: RuntimeType[];
  /** Health check interval in milliseconds */
  healthCheckInterval?: number;
  /** Circuit breaker failure threshold */
  circuitBreakerThreshold?: number;
  /** Circuit breaker reset timeout in milliseconds */
  circuitBreakerResetTimeout?: number;
  /** Maximum failover time in milliseconds */
  maxFailoverTime?: number;
  /** Enable cost-aware provider selection */
  costAware?: boolean;
  /** Team ID for cost tracking */
  teamId?: string;
}

/**
 * Provider health status
 */
interface ProviderHealth {
  type: RuntimeType;
  healthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  circuitOpen: boolean;
  circuitOpenSince?: Date;
  lastError?: string;
  averageSpawnTime: number;
  spawnAttempts: number;
  spawnSuccesses: number;
}

/**
 * Provider wrapper with metadata
 */
interface ProviderWrapper {
  type: RuntimeType;
  provider: RuntimeProvider;
  health: ProviderHealth;
  config: any;
}

/**
 * Fallback result with metadata
 */
export interface FallbackResult {
  runtime: AgentRuntime;
  providerType: RuntimeType;
  failoverCount: number;
  totalTime: number;
  providerHealth: Record<RuntimeType, ProviderHealth>;
}

// ============================================================================
// Circuit Breaker
// ============================================================================

/**
 * Circuit breaker states
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private lastFailureTime?: number;
  private readonly threshold: number;
  private readonly resetTimeout: number;

  constructor(threshold: number, resetTimeout: number) {
    this.threshold = threshold;
    this.resetTimeout = resetTimeout;
  }

  /**
   * Check if circuit allows requests
   */
  canExecute(): boolean {
    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (this.lastFailureTime && Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
        return true;
      }
      return false;
    }

    return true; // HALF_OPEN allows one request
  }

  /**
   * Record a success
   */
  recordSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  /**
   * Record a failure
   */
  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.failures >= this.threshold) {
      this.state = 'OPEN';
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }
}

// ============================================================================
// FallbackOrchestrator Implementation
// ============================================================================

export class FallbackOrchestrator extends EventEmitter {
  private providers: Map<RuntimeType, ProviderWrapper> = new Map();
  private config: Required<FallbackConfig>;
  private circuitBreakers: Map<RuntimeType, CircuitBreaker> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;
  private defaultWorktreeConfig: any;
  private defaultKataConfig: any;
  private defaultE2BConfig: any;

  constructor(config: FallbackConfig = {}) {
    super();

    this.config = {
      providerOrder: config.providerOrder || ['e2b', 'kata', 'worktree'],
      healthCheckInterval: config.healthCheckInterval || 10000,
      circuitBreakerThreshold: config.circuitBreakerThreshold || 5,
      circuitBreakerResetTimeout: config.circuitBreakerResetTimeout || 60000,
      maxFailoverTime: config.maxFailoverTime || 1000,
      costAware: config.costAware ?? true,
      teamId: config.teamId || 'default',
    };

    // Initialize circuit breakers
    this.config.providerOrder.forEach(type => {
      this.circuitBreakers.set(type, new CircuitBreaker(
        this.config.circuitBreakerThreshold,
        this.config.circuitBreakerResetTimeout
      ));
    });

    logger.info('[FallbackOrchestrator] Initialized', {
      providerOrder: this.config.providerOrder,
      maxFailoverTime: this.config.maxFailoverTime,
    });
  }

  /**
   * Register a runtime provider
   */
  registerProvider(type: RuntimeType, provider: RuntimeProvider, config?: any): void {
    const health: ProviderHealth = {
      type,
      healthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      circuitOpen: false,
      averageSpawnTime: 0,
      spawnAttempts: 0,
      spawnSuccesses: 0,
    };

    this.providers.set(type, {
      type,
      provider,
      health,
      config,
    });

    // Store config for lazy initialization
    if (type === 'worktree') {
      this.defaultWorktreeConfig = config;
    } else if (type === 'kata') {
      this.defaultKataConfig = config;
    } else if (type === 'e2b') {
      this.defaultE2BConfig = config;
    }

    logger.info(`[FallbackOrchestrator] Registered provider: ${type}`);
  }

  /**
   * Spawn a runtime with automatic fallback
   */
  async spawnWithFallback(config: SpawnConfig): Promise<FallbackResult> {
    const startTime = Date.now();
    let failoverCount = 0;
    const errors: Array<{ type: RuntimeType; error: Error }> = [];

    // Try providers in order
    for (const providerType of this.config.providerOrder) {
      const timeElapsed = Date.now() - startTime;
      
      // Check max failover time
      if (timeElapsed > this.config.maxFailoverTime && failoverCount > 0) {
        logger.warn('[FallbackOrchestrator] Max failover time exceeded', {
          timeElapsed,
          maxFailoverTime: this.config.maxFailoverTime,
        });
        break;
      }

      const circuitBreaker = this.circuitBreakers.get(providerType);
      
      // Skip if circuit is open
      if (circuitBreaker && !circuitBreaker.canExecute()) {
        logger.debug(`[FallbackOrchestrator] Circuit open for ${providerType}, skipping`);
        continue;
      }

      // Get or initialize provider
      const wrapper = this.providers.get(providerType);
      if (!wrapper) {
        // Try to lazily initialize
        const provider = this.initializeProvider(providerType);
        if (!provider) {
          logger.warn(`[FallbackOrchestrator] Provider ${providerType} not available`);
          continue;
        }
        this.registerProvider(providerType, provider, this.getProviderConfig(providerType));
      }

      const currentWrapper = this.providers.get(providerType)!;

      try {
        logger.info(`[FallbackOrchestrator] Attempting spawn with ${providerType}`, {
          attempt: failoverCount + 1,
        });

        const spawnStart = Date.now();
        const runtime = await this.spawnWithTimeout(
          currentWrapper.provider,
          config,
          500 // 500ms timeout per attempt
        );
        const spawnTime = Date.now() - spawnStart;

        // Update health metrics
        currentWrapper.health.spawnAttempts++;
        currentWrapper.health.spawnSuccesses++;
        currentWrapper.health.averageSpawnTime = 
          (currentWrapper.health.averageSpawnTime * (currentWrapper.health.spawnAttempts - 1) + spawnTime) /
          currentWrapper.health.spawnAttempts;
        currentWrapper.health.consecutiveFailures = 0;
        currentWrapper.health.healthy = true;

        // Record circuit breaker success
        circuitBreaker?.recordSuccess();

        const totalTime = Date.now() - startTime;

        logger.info(`[FallbackOrchestrator] Spawn successful with ${providerType}`, {
          runtimeId: runtime.id,
          failoverCount,
          totalTime,
          spawnTime,
        });

        // Emit success event
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
          providerHealth: this.getAllHealth(),
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`[FallbackOrchestrator] Spawn failed with ${providerType}`, {
          error: errorMessage,
        });

        // Update health metrics
        currentWrapper.health.consecutiveFailures++;
        currentWrapper.health.lastError = errorMessage;
        
        // Record circuit breaker failure
        circuitBreaker?.recordFailure();
        
        if (circuitBreaker?.getState() === 'OPEN') {
          currentWrapper.health.circuitOpen = true;
          currentWrapper.health.circuitOpenSince = new Date();
        }

        errors.push({ type: providerType, error: error as Error });
        failoverCount++;

        // Emit failure event
        this.emit('spawnFailure', {
          providerType,
          error: errorMessage,
          failoverCount,
        });
      }
    }

    // All providers failed
    const totalTime = Date.now() - startTime;
    logger.error('[FallbackOrchestrator] All providers failed', {
      failoverCount,
      totalTime,
      errors: errors.map(e => ({ type: e.type, error: e.error.message })),
    });

    throw new SpawnError(
      `All runtime providers failed after ${failoverCount} attempts in ${totalTime}ms. ` +
      `Errors: ${errors.map(e => `${e.type}: ${e.error.message}`).join('; ')}`
    );
  }

  /**
   * Get the best available provider (for cost-aware selection)
   */
  async getBestProvider(): Promise<RuntimeType | null> {
    const available: Array<{ type: RuntimeType; score: number }> = [];

    for (const providerType of this.config.providerOrder) {
      const wrapper = this.providers.get(providerType);
      const circuitBreaker = this.circuitBreakers.get(providerType);

      if (!wrapper || !circuitBreaker?.canExecute()) {
        continue;
      }

      // Calculate health score (0-100)
      const healthScore = wrapper.health.healthy ? 100 : 0;
      const successRate = wrapper.health.spawnAttempts > 0
        ? (wrapper.health.spawnSuccesses / wrapper.health.spawnAttempts) * 100
        : 100;
      const speedScore = Math.max(0, 100 - wrapper.health.averageSpawnTime / 10);

      // Cost score (lower is better)
      let costScore = 100;
      if (this.config.costAware) {
        switch (providerType) {
          case 'worktree': costScore = 100; break; // Free
          case 'kata': costScore = 80; break;      // Low cost
          case 'e2b': costScore = 60; break;       // Higher cost
        }
      }

      const score = (healthScore + successRate + speedScore + costScore) / 4;
      available.push({ type: providerType, score });
    }

    if (available.length === 0) {
      return null;
    }

    // Sort by score descending
    available.sort((a, b) => b.score - a.score);
    return available[0].type;
  }

  /**
   * Get health status for all providers
   */
  getAllHealth(): Record<RuntimeType, ProviderHealth> {
    const health: Record<string, ProviderHealth> = {};
    
    for (const [type, wrapper] of this.providers) {
      health[type] = { ...wrapper.health };
    }

    return health as Record<RuntimeType, ProviderHealth>;
  }

  /**
   * Get health for a specific provider
   */
  getProviderHealth(type: RuntimeType): ProviderHealth | null {
    const wrapper = this.providers.get(type);
    return wrapper ? { ...wrapper.health } : null;
  }

  /**
   * Manually mark a provider as unhealthy
   */
  markProviderUnhealthy(type: RuntimeType, reason?: string): void {
    const wrapper = this.providers.get(type);
    if (wrapper) {
      wrapper.health.healthy = false;
      wrapper.health.lastError = reason || 'Manually marked unhealthy';
      
      const circuitBreaker = this.circuitBreakers.get(type);
      if (circuitBreaker) {
        // Force circuit open
        for (let i = 0; i < this.config.circuitBreakerThreshold; i++) {
          circuitBreaker.recordFailure();
        }
      }

      logger.warn(`[FallbackOrchestrator] Provider ${type} marked unhealthy`, { reason });
      this.emit('providerUnhealthy', { type, reason });
    }
  }

  /**
   * Reset circuit breaker for a provider
   */
  resetCircuitBreaker(type: RuntimeType): void {
    const circuitBreaker = this.circuitBreakers.get(type);
    if (circuitBreaker) {
      circuitBreaker.recordSuccess();
      
      const wrapper = this.providers.get(type);
      if (wrapper) {
        wrapper.health.circuitOpen = false;
        wrapper.health.circuitOpenSince = undefined;
        wrapper.health.consecutiveFailures = 0;
      }

      logger.info(`[FallbackOrchestrator] Circuit breaker reset for ${type}`);
    }
  }

  /**
   * Start health checking
   */
  startHealthChecks(): void {
    if (this.healthCheckInterval) {
      return;
    }

    this.healthCheckInterval = setInterval(async () => {
      for (const [type, wrapper] of this.providers) {
        try {
          // Simple health check: try to list runtimes
          await wrapper.provider.listRuntimes({ runtime: type });
          
          wrapper.health.healthy = true;
          wrapper.health.lastCheck = new Date();
          
          // If circuit was open, try to close it
          const circuitBreaker = this.circuitBreakers.get(type);
          if (circuitBreaker?.getState() === 'OPEN') {
            this.resetCircuitBreaker(type);
          }
        } catch (error) {
          wrapper.health.healthy = false;
          wrapper.health.lastCheck = new Date();
          wrapper.health.consecutiveFailures++;
          wrapper.health.lastError = error instanceof Error ? error.message : String(error);

          const circuitBreaker = this.circuitBreakers.get(type);
          circuitBreaker?.recordFailure();

          logger.warn(`[FallbackOrchestrator] Health check failed for ${type}`, {
            error: wrapper.health.lastError,
          });
        }
      }
    }, this.config.healthCheckInterval);

    logger.info('[FallbackOrchestrator] Health checks started');
  }

  /**
   * Stop health checking
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      logger.info('[FallbackOrchestrator] Health checks stopped');
    }
  }

  /**
   * Dispose of the orchestrator
   */
  dispose(): void {
    this.stopHealthChecks();
    this.removeAllListeners();
    this.providers.clear();
    this.circuitBreakers.clear();
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Spawn with timeout
   */
  private async spawnWithTimeout(
    provider: RuntimeProvider,
    config: SpawnConfig,
    timeout: number
  ): Promise<AgentRuntime> {
    return Promise.race([
      provider.spawn(config),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new TimeoutError(
          `Spawn timeout after ${timeout}ms`,
          timeout,
          'spawn'
        )), timeout);
      }),
    ]);
  }

  /**
   * Initialize a provider lazily
   */
  private initializeProvider(type: RuntimeType): RuntimeProvider | null {
    try {
      switch (type) {
        case 'worktree':
          if (this.defaultWorktreeConfig) {
            return new WorktreeRuntimeProvider(this.defaultWorktreeConfig);
          }
          break;
        case 'kata':
          if (this.defaultKataConfig && process.env['K8S_NAMESPACE']) {
            return new KataRuntimeProvider(this.defaultKataConfig);
          }
          break;
        case 'e2b':
          if (this.defaultE2BConfig && process.env['E2B_API_KEY']) {
            return new E2BRuntimeProvider(this.defaultE2BConfig);
          }
          break;
      }
    } catch (error) {
      logger.warn(`[FallbackOrchestrator] Failed to initialize ${type}`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    return null;
  }

  /**
   * Get config for provider type
   */
  private getProviderConfig(type: RuntimeType): any {
    switch (type) {
      case 'worktree': return this.defaultWorktreeConfig;
      case 'kata': return this.defaultKataConfig;
      case 'e2b': return this.defaultE2BConfig;
      default: return undefined;
    }
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalFallbackOrchestrator: FallbackOrchestrator | null = null;

/**
 * Get or create the global FallbackOrchestrator instance
 */
export function getGlobalFallbackOrchestrator(config?: FallbackConfig): FallbackOrchestrator {
  if (!globalFallbackOrchestrator) {
    globalFallbackOrchestrator = new FallbackOrchestrator(config);
  }
  return globalFallbackOrchestrator;
}

/**
 * Initialize the global FallbackOrchestrator
 */
export function initializeGlobalFallbackOrchestrator(config: FallbackConfig): FallbackOrchestrator {
  if (globalFallbackOrchestrator) {
    globalFallbackOrchestrator.dispose();
  }
  globalFallbackOrchestrator = new FallbackOrchestrator(config);
  return globalFallbackOrchestrator;
}

/**
 * Reset the global FallbackOrchestrator
 */
export function resetGlobalFallbackOrchestrator(): void {
  if (globalFallbackOrchestrator) {
    globalFallbackOrchestrator.dispose();
    globalFallbackOrchestrator = null;
  }
}

export default FallbackOrchestrator;
