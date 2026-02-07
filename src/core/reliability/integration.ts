/**
 * Reliability Integration Layer
 *
 * Combines circuit breakers, retry logic, and correlation context for
 * resilient external service calls.
 *
 * @module core/reliability/integration
 */

import { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerError } from '../../recovery/circuit-breaker';
import { RetryManager, RetryPolicies, type RetryOptions } from './retry';
import { getCorrelationContext } from './correlation-context';
import { logger } from './logger';

export { CircuitBreaker, CircuitBreakerRegistry, CircuitBreakerError };

export interface ResilientCallOptions {
  /** Circuit breaker name */
  circuitBreakerName?: string;
  /** Circuit breaker configuration */
  circuitBreakerConfig?: Parameters<CircuitBreakerRegistry['getOrCreate']>[0];
  /** Retry options */
  retryOptions?: RetryOptions;
  /** Enable/disable retry (default: true) */
  enableRetry?: boolean;
  /** Enable/disable circuit breaker (default: true) */
  enableCircuitBreaker?: boolean;
  /** Fallback function if circuit is open or all retries fail */
  fallback?: () => unknown;
  /** Operation name for logging */
  operationName?: string;
}

/**
 * Global circuit breaker registry
 */
let globalCircuitBreakerRegistry: CircuitBreakerRegistry | null = null;

/**
 * Get or create the global circuit breaker registry
 */
export function getGlobalCircuitBreakerRegistry(): CircuitBreakerRegistry {
  if (!globalCircuitBreakerRegistry) {
    globalCircuitBreakerRegistry = new CircuitBreakerRegistry();
  }
  return globalCircuitBreakerRegistry;
}

/**
 * Reset global registry (for testing)
 */
export function resetGlobalCircuitBreakerRegistry(): void {
  globalCircuitBreakerRegistry = null;
}

/**
 * Execute a function with circuit breaker protection
 */
export async function withCircuitBreaker<T>(
  name: string,
  operation: () => Promise<T>,
  config?: Parameters<CircuitBreakerRegistry['getOrCreate']>[0],
  fallback?: () => T
): Promise<T> {
  const registry = getGlobalCircuitBreakerRegistry();
  const breaker = registry.getOrCreate({
    name,
    ...config,
  });

  const correlationId = getCorrelationContext()?.correlationId;

  try {
    logger.debug(`Executing with circuit breaker: ${name}`, {
      circuitBreaker: name,
      correlationId,
      state: breaker.getState(),
    });

    return await breaker.execute(operation, fallback);
  } catch (error) {
    logger.error(`Circuit breaker execution failed: ${name}`, error, {
      circuitBreaker: name,
      correlationId,
    });
    throw error;
  }
}

/**
 * Execute a function with retry logic
 */
export async function withRetryLogic<T>(
  operation: () => Promise<T>,
  options?: RetryOptions,
  operationName?: string
): Promise<T> {
  const retryManager = new RetryManager(options);
  const correlationId = getCorrelationContext()?.correlationId;
  const name = operationName || `retry-${Date.now()}`;

  logger.debug(`Executing with retry: ${name}`, {
    operation: name,
    correlationId,
    maxRetries: options?.maxRetries || 3,
  });

  try {
    return await retryManager.execute(operation, name);
  } catch (error) {
    logger.error(`Retry exhausted for: ${name}`, error, {
      operation: name,
      correlationId,
    });
    throw error;
  }
}

/**
 * Execute a function with both circuit breaker and retry
 */
export async function withResilience<T>(
  operation: () => Promise<T>,
  options: ResilientCallOptions = {}
): Promise<T> {
  const {
    circuitBreakerName = `resilient-${Date.now()}`,
    circuitBreakerConfig,
    retryOptions,
    enableRetry = true,
    enableCircuitBreaker = true,
    fallback,
    operationName,
  } = options;

  const name = operationName || circuitBreakerName;
  const correlationId = getCorrelationContext()?.correlationId;

  logger.debug(`Executing resilient operation: ${name}`, {
    operation: name,
    correlationId,
    enableRetry,
    enableCircuitBreaker,
  });

  // Wrap with retry first, then circuit breaker
  const executeWithRetry = enableRetry
    ? () => withRetryLogic(operation, retryOptions, name)
    : operation;

  if (enableCircuitBreaker) {
    return withCircuitBreaker(
      circuitBreakerName,
      executeWithRetry,
      circuitBreakerConfig,
      fallback as (() => T) | undefined
    );
  }

  return executeWithRetry();
}

/**
 * Create a resilient wrapper for an external service client
 */
export function createResilientClient<T extends Record<string, (...args: unknown[]) => Promise<unknown>>>(
  clientName: string,
  client: T,
  defaultOptions?: Partial<ResilientCallOptions>
): T {
  const wrapped = {} as T;

  for (const [key, method] of Object.entries(client)) {
    if (typeof method === 'function') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (wrapped as any)[key] = async (...args: unknown[]) => {
        return withResilience(
          () => method.apply(client, args),
          {
            circuitBreakerName: `${clientName}:${key}`,
            operationName: `${clientName}.${key}`,
            ...defaultOptions,
          }
        );
      };
    }
  }

  return wrapped;
}

/**
 * Pre-configured resilience patterns for common scenarios
 */
export const ResiliencePatterns = {
  /**
   * For LLM API calls - aggressive retry, medium circuit breaker
   */
  llmCall: (): ResilientCallOptions => ({
    retryOptions: {
      ...RetryPolicies.aggressive(),
      maxRetries: 3,
      initialDelayMs: 500,
    },
    circuitBreakerConfig: {
      name: 'llm-call',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxCalls: 1,
    },
  }),

  /**
   * For database operations - conservative retry, tolerant circuit breaker
   */
  databaseCall: (): ResilientCallOptions => ({
    retryOptions: {
      ...RetryPolicies.conservative(),
      maxRetries: 2,
      initialDelayMs: 100,
    },
    circuitBreakerConfig: {
      name: 'database-call',
      failureThreshold: 10,
      resetTimeoutMs: 60000,
      halfOpenMaxCalls: 3,
    },
  }),

  /**
   * For external HTTP APIs - balanced retry and circuit breaker
   */
  externalApiCall: (): ResilientCallOptions => ({
    retryOptions: RetryPolicies.aggressive(),
    circuitBreakerConfig: {
      name: 'external-api',
      failureThreshold: 5,
      resetTimeoutMs: 30000,
      halfOpenMaxCalls: 2,
    },
  }),

  /**
   * For message queue operations - fast retry, quick circuit breaker
   */
  queueOperation: (): ResilientCallOptions => ({
    retryOptions: RetryPolicies.fast(),
    circuitBreakerConfig: {
      name: 'queue-op',
      failureThreshold: 3,
      resetTimeoutMs: 10000,
      halfOpenMaxCalls: 1,
    },
  }),

  /**
   * For critical operations - maximum resilience
   */
  critical: (): ResilientCallOptions => ({
    retryOptions: {
      maxRetries: 5,
      initialDelayMs: 100,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
    },
    circuitBreakerConfig: {
      name: 'critical-op',
      failureThreshold: 3,
      resetTimeoutMs: 60000,
      halfOpenMaxCalls: 3,
      autoRecovery: true,
    },
  }),
};

/**
 * Health check for all circuit breakers
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getCircuitBreakerHealth(): any[] {
  const registry = getGlobalCircuitBreakerRegistry();
  return registry.getAll().map(cb => ({
    name: cb.getConfig().name,
    state: cb.getState(),
    metrics: cb.getMetrics(),
  }));
}

/**
 * Check if any circuit breakers are open
 */
export function hasOpenCircuitBreakers(): boolean {
  const registry = getGlobalCircuitBreakerRegistry();
  return registry.getByState('open').length > 0;
}

/**
 * Force open all circuit breakers (emergency stop)
 */
export function emergencyStop(): void {
  const registry = getGlobalCircuitBreakerRegistry();
  registry.forceOpenAll();
  logger.fatal('Emergency stop activated - all circuit breakers forced open');
}

export default {
  withCircuitBreaker,
  withRetryLogic,
  withResilience,
  createResilientClient,
  getGlobalCircuitBreakerRegistry,
  resetGlobalCircuitBreakerRegistry,
  ResiliencePatterns,
  getCircuitBreakerHealth,
  hasOpenCircuitBreakers,
  emergencyStop,
};
