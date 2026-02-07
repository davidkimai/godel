/**
 * Pi Provider Fallback Chain
 *
 * Implements intelligent fallback chains for provider selection when
 * primary providers fail. Supports priority-based chains, capability-based
 * fallbacks, and health-aware provider selection.
 *
 * @module integrations/pi/fallback
 */

import { EventEmitter } from 'events';
import {
  ProviderId,
  PiInstance,
  PiCapability,
  PiRegistryError,
} from './types';
import { ProviderManager, DEFAULT_PROVIDER_CHAIN, getProviderConfig } from './provider';
import { logger } from '../../utils/logger';

// ============================================================================
// Fallback Types
// ============================================================================

/**
 * Fallback strategy type
 */
export type FallbackStrategy = 'priority' | 'capability' | 'latency' | 'cost' | 'hybrid';

/**
 * Fallback chain configuration
 */
export interface FallbackChainConfig {
  /** Strategy for building fallback chain */
  strategy: FallbackStrategy;

  /** Primary provider to start with */
  primaryProvider: ProviderId;

  /** Maximum number of fallback attempts */
  maxAttempts: number;

  /** Delay between fallback attempts (ms) */
  retryDelayMs: number;

  /** Required capabilities for fallback providers */
  requiredCapabilities?: PiCapability[];

  /** Maximum acceptable latency for fallbacks (ms) */
  maxLatencyMs?: number;

  /** Maximum acceptable cost per request ($) */
  maxCost?: number;

  /** Whether to require same capabilities as primary */
  strictCapabilityMatch: boolean;
}

/**
 * Fallback attempt result
 */
export interface FallbackAttempt {
  /** Provider attempted */
  provider: ProviderId;

  /** Instance ID if selected */
  instanceId?: string;

  /** Whether attempt succeeded */
  success: boolean;

  /** Error if failed */
  error?: Error;

  /** Latency for this attempt (ms) */
  latencyMs: number;

  /** Timestamp of attempt */
  timestamp: Date;
}

/**
 * Fallback chain result
 */
export interface FallbackChainResult {
  /** Whether any provider succeeded */
  success: boolean;

  /** Successful provider if any */
  selectedProvider?: ProviderId;

  /** Selected instance if successful */
  selectedInstance?: PiInstance;

  /** All attempts made */
  attempts: FallbackAttempt[];

  /** Total time taken (ms) */
  totalDurationMs: number;

  /** Number of providers tried */
  providersTried: number;
}

/**
 * Fallback chain entry
 */
export interface FallbackChainEntry {
  /** Provider in chain */
  provider: ProviderId;

  /** Priority score (lower = higher priority) */
  priority: number;

  /** Expected latency (ms) */
  expectedLatency: number;

  /** Capability match score (0-1) */
  capabilityScore: number;

  /** Whether provider is currently healthy */
  isHealthy: boolean;

  /** Reason for inclusion in chain */
  reason: string;
}

// ============================================================================
// Default Configuration
// ============================================================================

/**
 * Default fallback chain configuration
 */
export const DEFAULT_FALLBACK_CONFIG: FallbackChainConfig = {
  strategy: 'priority',
  primaryProvider: 'anthropic',
  maxAttempts: 5,
  retryDelayMs: 1000,
  strictCapabilityMatch: true,
};

// ============================================================================
// Fallback Chain Builder
// ============================================================================

/**
 * Builds a fallback chain based on priority
 *
 * @param primaryProvider - Starting provider
 * @returns Ordered array of provider IDs
 */
export function buildPriorityChain(primaryProvider: ProviderId = 'anthropic'): ProviderId[] {
  const manager = new ProviderManager();
  return manager.getFallbackChain(primaryProvider);
}

/**
 * Builds a capability-matched fallback chain
 *
 * @param primaryProvider - Starting provider
 * @param requiredCapabilities - Required capabilities
 * @returns Ordered array of provider IDs
 */
export function buildCapabilityChain(
  primaryProvider: ProviderId = 'anthropic',
  requiredCapabilities: PiCapability[] = []
): ProviderId[] {
  const manager = new ProviderManager();

  // Get providers that support all required capabilities
  const capableProviders = manager.getProvidersWithCapabilities(requiredCapabilities);

  // Sort by priority
  const sorted = capableProviders.sort((a, b) => a.fallbackPriority - b.fallbackPriority);

  // Build chain starting from primary
  const chain: ProviderId[] = [primaryProvider];

  for (const config of sorted) {
    if (config.id !== primaryProvider) {
      chain.push(config.id);
    }
  }

  return chain;
}

/**
 * Builds a latency-optimized fallback chain
 *
 * @param primaryProvider - Starting provider
 * @param maxLatencyMs - Maximum acceptable latency
 * @returns Ordered array of provider IDs
 */
export function buildLatencyChain(
  primaryProvider: ProviderId = 'anthropic',
  maxLatencyMs: number = 5000
): ProviderId[] {
  const configs = Object.values(getProviderConfig)
    .map((fn) => {
      // Get provider IDs from DEFAULT_PROVIDER_CHAIN
      const providers: ProviderId[] = DEFAULT_PROVIDER_CHAIN;
      return providers.map((id) => ({ id, config: getProviderConfig(id) }));
    })
    .flat()
    .filter((item): item is { id: ProviderId; config: NonNullable<typeof item.config> } =>
      item.config !== undefined && item.config.expectedLatencyMs <= maxLatencyMs
    )
    .sort((a, b) => a.config.expectedLatencyMs - b.config.expectedLatencyMs);

  const chain: ProviderId[] = [primaryProvider];

  for (const { id } of configs) {
    if (id !== primaryProvider) {
      chain.push(id);
    }
  }

  return chain;
}

/**
 * Builds a hybrid fallback chain balancing multiple factors
 *
 * @param primaryProvider - Starting provider
 * @param requiredCapabilities - Required capabilities
 * @param config - Chain configuration
 * @returns Ordered array of provider IDs
 */
export function buildHybridChain(
  primaryProvider: ProviderId = 'anthropic',
  requiredCapabilities: PiCapability[] = [],
  config: Partial<FallbackChainConfig> = {}
): ProviderId[] {
  const fullConfig = { ...DEFAULT_FALLBACK_CONFIG, ...config };
  const manager = new ProviderManager();

  // Get all providers
  const allProviders = manager.getAllConfigs();

  // Score each provider
  const scored = allProviders.map((providerConfig) => {
    let score = 0;

    // Priority score (40%)
    score += (100 - providerConfig.fallbackPriority) * 0.4;

    // Latency score (30%) - lower is better
    const maxLatency = 5000;
    score += Math.max(0, (maxLatency - providerConfig.expectedLatencyMs) / maxLatency) * 100 * 0.3;

    // Capability match score (30%)
    if (requiredCapabilities.length > 0) {
      const matching = requiredCapabilities.filter((cap) =>
        providerConfig.capabilities.includes(cap)
      ).length;
      score += (matching / requiredCapabilities.length) * 100 * 0.3;
    } else {
      score += 30;
    }

    return { provider: providerConfig.id, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Build chain with primary first
  const chain: ProviderId[] = [primaryProvider];

  for (const { provider } of scored) {
    if (provider !== primaryProvider) {
      chain.push(provider);
    }
  }

  // Limit to max attempts
  return chain.slice(0, fullConfig.maxAttempts);
}

/**
 * Builds a fallback chain based on configuration
 *
 * @param config - Fallback chain configuration
 * @returns Ordered array of provider IDs
 */
export function buildFallbackChain(config: FallbackChainConfig): ProviderId[] {
  switch (config.strategy) {
    case 'priority':
      return buildPriorityChain(config.primaryProvider);

    case 'capability':
      return buildCapabilityChain(config.primaryProvider, config.requiredCapabilities);

    case 'latency':
      return buildLatencyChain(config.primaryProvider, config.maxLatencyMs);

    case 'hybrid':
      return buildHybridChain(
        config.primaryProvider,
        config.requiredCapabilities,
        config
      );

    case 'cost':
      // Cost chain uses priority as proxy (cheaper providers are later in chain)
      return buildPriorityChain(config.primaryProvider).reverse();

    default:
      return buildPriorityChain(config.primaryProvider);
  }
}

// ============================================================================
// Fallback Executor
// ============================================================================

/**
 * Executes a function with fallback to multiple providers
 *
 * @param chain - Provider fallback chain
 * @param executor - Function to execute for each provider
 * @param config - Execution configuration
 * @returns Fallback chain result
 */
export async function executeWithFallback<T>(
  chain: ProviderId[],
  executor: (provider: ProviderId) => Promise<T>,
  config: Partial<FallbackChainConfig> = {}
): Promise<{ result: T; provider: ProviderId; attempts: FallbackAttempt[] }> {
  const fullConfig = { ...DEFAULT_FALLBACK_CONFIG, ...config };
  const attempts: FallbackAttempt[] = [];
  const startTime = Date.now();

  for (const provider of chain.slice(0, fullConfig.maxAttempts)) {
    const attemptStart = Date.now();

    try {
      logger.debug('[FallbackChain] Attempting provider: %s', provider);

      const result = await executor(provider);

      const attempt: FallbackAttempt = {
        provider,
        success: true,
        latencyMs: Date.now() - attemptStart,
        timestamp: new Date(),
      };

      attempts.push(attempt);

      logger.info('[FallbackChain] Success with provider: %s', provider);

      return {
        result,
        provider,
        attempts,
      };
    } catch (error) {
      const attempt: FallbackAttempt = {
        provider,
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        latencyMs: Date.now() - attemptStart,
        timestamp: new Date(),
      };

      attempts.push(attempt);

      logger.warn(
        `[FallbackChain] Provider ${provider} failed: ${attempt.error?.message || 'Unknown error'}`
      );

      // Apply retry delay if not the last attempt
      if (attempts.length < fullConfig.maxAttempts && fullConfig.retryDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, fullConfig.retryDelayMs));
      }
    }
  }

  // All providers exhausted
  const errorContext: Record<string, unknown> = {
    attempts: attempts.map((a) => ({ provider: a.provider, error: a.error?.message })),
    attemptCount: attempts.length,
  };

  throw new PiRegistryError(
    `All providers in fallback chain exhausted after ${attempts.length} attempts`,
    'FALLBACK_EXHAUSTED',
    errorContext
  );
}

// ============================================================================
// Fallback Chain Manager
// ============================================================================

/**
 * Manages fallback chains for provider selection
 */
export class FallbackChainManager extends EventEmitter {
  private config: FallbackChainConfig;
  private providerManager: ProviderManager;
  private attemptHistory: Map<string, FallbackAttempt[]> = new Map();

  /**
   * Creates a new FallbackChainManager
   *
   * @param config - Fallback chain configuration
   */
  constructor(config: Partial<FallbackChainConfig> = {}) {
    super();
    this.config = { ...DEFAULT_FALLBACK_CONFIG, ...config };
    this.providerManager = new ProviderManager();
  }

  /**
   * Builds a fallback chain for the configured strategy
   *
   * @param requiredCapabilities - Optional required capabilities
   * @returns Array of provider IDs in fallback order
   */
  buildChain(requiredCapabilities?: PiCapability[]): ProviderId[] {
    const config: FallbackChainConfig = {
      ...this.config,
      requiredCapabilities: requiredCapabilities || this.config.requiredCapabilities,
    };

    return buildFallbackChain(config);
  }

  /**
   * Gets the default fallback chain
   *
   * @returns Default provider chain
   */
  getDefaultChain(): ProviderId[] {
    return DEFAULT_PROVIDER_CHAIN;
  }

  /**
   * Records a fallback attempt
   *
   * @param requestId - Request identifier
   * @param attempt - Attempt details
   */
  recordAttempt(requestId: string, attempt: FallbackAttempt): void {
    const history = this.attemptHistory.get(requestId) || [];
    history.push(attempt);
    this.attemptHistory.set(requestId, history);

    this.emit('attempt.recorded', requestId, attempt);

    if (!attempt.success) {
      this.emit('attempt.failed', requestId, attempt);
    } else {
      this.emit('attempt.succeeded', requestId, attempt);
    }
  }

  /**
   * Gets attempt history for a request
   *
   * @param requestId - Request identifier
   * @returns Array of attempts
   */
  getAttemptHistory(requestId: string): FallbackAttempt[] {
    return this.attemptHistory.get(requestId) || [];
  }

  /**
   * Clears attempt history for a request
   *
   * @param requestId - Request identifier
   */
  clearHistory(requestId: string): void {
    this.attemptHistory.delete(requestId);
  }

  /**
   * Gets the healthiest provider from a chain
   *
   * @param chain - Provider chain
   * @param healthCheck - Function to check provider health
   * @returns Healthiest provider or undefined
   */
  async getHealthiestProvider(
    chain: ProviderId[],
    healthCheck: (provider: ProviderId) => Promise<boolean>
  ): Promise<ProviderId | undefined> {
    for (const provider of chain) {
      try {
        const isHealthy = await healthCheck(provider);
        if (isHealthy) {
          return provider;
        }
      } catch {
        // Provider failed health check, continue to next
        continue;
      }
    }

    return undefined;
  }

  /**
   * Analyzes fallback patterns from history
   *
   * @returns Statistics about fallback patterns
   */
  analyzePatterns(): {
    totalAttempts: number;
    successRate: number;
    avgLatencyMs: number;
    mostReliableProvider: ProviderId | null;
    failurePatterns: Map<ProviderId, number>;
  } {
    const allAttempts = Array.from(this.attemptHistory.values()).flat();

    const totalAttempts = allAttempts.length;
    const successfulAttempts = allAttempts.filter((a) => a.success).length;
    const successRate = totalAttempts > 0 ? successfulAttempts / totalAttempts : 0;

    const avgLatencyMs =
      totalAttempts > 0
        ? allAttempts.reduce((sum, a) => sum + a.latencyMs, 0) / totalAttempts
        : 0;

    // Count successes per provider
    const providerSuccesses = new Map<ProviderId, number>();
    const providerFailures = new Map<ProviderId, number>();

    for (const attempt of allAttempts) {
      if (attempt.success) {
        providerSuccesses.set(
          attempt.provider,
          (providerSuccesses.get(attempt.provider) || 0) + 1
        );
      } else {
        providerFailures.set(
          attempt.provider,
          (providerFailures.get(attempt.provider) || 0) + 1
        );
      }
    }

    // Find most reliable provider
    let mostReliableProvider: ProviderId | null = null;
    let maxSuccesses = 0;

    for (const [provider, successes] of providerSuccesses) {
      if (successes > maxSuccesses) {
        maxSuccesses = successes;
        mostReliableProvider = provider;
      }
    }

    return {
      totalAttempts,
      successRate,
      avgLatencyMs,
      mostReliableProvider,
      failurePatterns: providerFailures,
    };
  }

  /**
   * Updates the fallback configuration
   *
   * @param config - New configuration (partial)
   */
  updateConfig(config: Partial<FallbackChainConfig>): void {
    this.config = { ...this.config, ...config };
    this.emit('config.updated', this.config);
  }

  /**
   * Gets the current configuration
   *
   * @returns Current fallback chain configuration
   */
  getConfig(): FallbackChainConfig {
    return { ...this.config };
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let globalFallbackManager: FallbackChainManager | null = null;

/**
 * Gets the global FallbackChainManager instance
 *
 * @returns Global FallbackChainManager
 */
export function getGlobalFallbackManager(): FallbackChainManager {
  if (!globalFallbackManager) {
    globalFallbackManager = new FallbackChainManager();
  }
  return globalFallbackManager;
}

/**
 * Resets the global FallbackChainManager (for testing)
 */
export function resetGlobalFallbackManager(): void {
  globalFallbackManager = null;
}

// Default export
export default FallbackChainManager;
