import { logger as oldLogger } from '../integrations/utils/logger';
import { EventEmitter } from 'events';
import {
  withResilience,
  ResiliencePatterns,
  type ResilientCallOptions,
} from '../core/reliability/integration';

// opossum doesn't have TypeScript types, use require
// eslint-disable-next-line @typescript-eslint/no-require-imports
const CircuitBreaker = require('opossum');

export interface CircuitBreakerOptions {
  errorThresholdPercentage?: number;
  resetTimeout?: number;
  timeout?: number;
  errorFilter?: (error: Error) => boolean;
}

export interface CircuitBreakerState {
  name: string;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  successes: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type CircuitBreakerInstance = any;

/**
 * Enhanced Circuit Breaker Manager with resilience integration
 * 
 * This class wraps opossum circuit breakers and integrates them with
 * the core reliability module for retry logic and correlation context.
 */
export class CircuitBreakerManager extends EventEmitter {
  private breakers: Map<string, CircuitBreakerInstance> = new Map();
  private options: CircuitBreakerOptions;
  private useResilience: boolean;

  constructor(options: CircuitBreakerOptions & { useResilience?: boolean } = {}) {
    super();
    this.options = {
      errorThresholdPercentage: 50,
      resetTimeout: 30000,
      timeout: 10000,
      ...options
    };
    this.useResilience = options.useResilience ?? true;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  createBreaker(name: string, asyncFunction: (...args: any[]) => Promise<any>, options?: CircuitBreakerOptions): CircuitBreakerInstance {
    const opts = { ...this.options, ...options };
    
    const breaker = new CircuitBreaker(asyncFunction, {
      errorThresholdPercentage: opts.errorThresholdPercentage,
      resetTimeout: opts.resetTimeout,
      timeout: opts.timeout,
      errorFilter: opts.errorFilter,
      name
    });

    breaker.on('open', () => {
      oldLogger.warn(`Circuit breaker '${name}' opened`);
      this.emit('open', { name, state: breaker.opened });
    });

    breaker.on('halfOpen', () => {
      oldLogger.info(`Circuit breaker '${name}' half-open`);
      this.emit('halfOpen', { name });
    });

    breaker.on('close', () => {
      oldLogger.info(`Circuit breaker '${name}' closed`);
      this.emit('close', { name });
    });

    breaker.on('fallback', (result: unknown) => {
      oldLogger.warn(`Circuit breaker '${name}' fallback executed`, { result });
      this.emit('fallback', { name, result });
    });

    this.breakers.set(name, breaker);
    return breaker;
  }

  /**
   * Execute a function with circuit breaker and optional retry logic
   * 
   * This method integrates with the core reliability module to provide
   * both circuit breaker protection and exponential backoff retry.
   */
  async execute<T>(
    name: string,
    operation: () => Promise<T>,
    options?: {
      retry?: boolean;
      fallback?: () => T;
      pattern?: 'llm' | 'database' | 'external' | 'queue' | 'critical';
    }
  ): Promise<T> {
    const breaker = this.getBreaker(name);
    
    if (!breaker) {
      throw new Error(`Circuit breaker '${name}' not found`);
    }

    // Use new resilience integration if enabled
    if (this.useResilience && options?.retry) {
      let resilienceOptions: ResilientCallOptions;

      switch (options.pattern) {
        case 'llm':
          resilienceOptions = ResiliencePatterns.llmCall();
          break;
        case 'database':
          resilienceOptions = ResiliencePatterns.databaseCall();
          break;
        case 'external':
          resilienceOptions = ResiliencePatterns.externalApiCall();
          break;
        case 'queue':
          resilienceOptions = ResiliencePatterns.queueOperation();
          break;
        case 'critical':
          resilienceOptions = ResiliencePatterns.critical();
          break;
        default:
          resilienceOptions = {
            retryOptions: { maxRetries: 3 },
          };
      }

      return withResilience(operation, {
        ...resilienceOptions,
        circuitBreakerName: name,
        fallback: options.fallback,
      });
    }

    // Fall back to basic circuit breaker execution
    return breaker.fire() as Promise<T>;
  }

  getBreaker(name: string): CircuitBreakerInstance | undefined {
    return this.breakers.get(name);
  }

  getState(name: string): CircuitBreakerState | undefined {
    const breaker = this.breakers.get(name);
    if (!breaker) return undefined;

    return {
      name,
      state: breaker.opened ? 'OPEN' : breaker.halfOpen ? 'HALF_OPEN' : 'CLOSED',
      failures: breaker.stats?.failures || 0,
      successes: breaker.stats?.successes || 0
    };
  }

  getAllStates(): CircuitBreakerState[] {
    return Array.from(this.breakers.keys()).map(name => this.getState(name)!).filter(Boolean);
  }

  async shutdown(): Promise<void> {
    for (const [name, breaker] of this.breakers) {
      breaker.shutdown();
      oldLogger.info(`Circuit breaker '${name}' shutdown`);
    }
    this.breakers.clear();
  }
}

// Re-export resilience patterns for convenience
export { ResiliencePatterns } from '../core/reliability/integration';
