/**
 * Retry Utility with Exponential Backoff
 *
 * Provides resilient retry mechanisms for external calls with configurable
 * backoff strategies, jitter, and circuit breaker integration.
 *
 * @module core/reliability/retry
 */

import { EventEmitter } from 'events';

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Add random jitter to prevent thundering herd (default: true) */
  useJitter?: boolean;
  /** Maximum jitter percentage (0-1) (default: 0.1) */
  jitterFactor?: number;
  /** Retry only on specific error types */
  retryableErrorFilter?: (error: Error) => boolean;
  /** Callback before each retry attempt */
  onRetry?: (attempt: number, delay: number, error: Error) => void;
  /** Callback on final failure */
  onFailed?: (error: Error, attempts: number) => void;
}

export interface RetryStats {
  attempts: number;
  totalDelayMs: number;
  success: boolean;
  lastError?: Error;
}

export interface RetryContext {
  attempt: number;
  startTime: number;
  lastError?: Error;
}

/**
 * Default retryable error filter - retries on transient errors
 */
const defaultRetryableFilter = (error: Error): boolean => {
  const retryablePatterns = [
    /ECONNREFUSED/i,
    /ECONNRESET/i,
    /ETIMEDOUT/i,
    /ENOTFOUND/i,
    /EAI_AGAIN/i,
    /socket hang up/i,
    /network error/i,
    /timeout/i,
    /rate limit/i,
    /429/i,
    /503/i,
    /502/i,
    /504/i,
  ];

  const message = error.message || '';
  return retryablePatterns.some(pattern => pattern.test(message));
};

/**
 * Calculate delay with exponential backoff and optional jitter
 */
export function calculateBackoffDelay(
  attempt: number,
  options: Required<Pick<RetryOptions, 'initialDelayMs' | 'maxDelayMs' | 'backoffMultiplier' | 'useJitter' | 'jitterFactor'>>
): number {
  // Base exponential delay
  let delay = options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);
  
  // Cap at max delay
  delay = Math.min(delay, options.maxDelayMs);
  
  // Add jitter to prevent thundering herd
  if (options.useJitter) {
    const jitter = delay * options.jitterFactor * (Math.random() * 2 - 1);
    delay = Math.max(0, delay + jitter);
  }
  
  return Math.round(delay);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry manager for tracking and executing retries
 */
export class RetryManager extends EventEmitter {
  private options: Required<RetryOptions>;
  private stats: Map<string, RetryStats> = new Map();

  constructor(options: RetryOptions = {}) {
    super();
    this.options = {
      maxRetries: 3,
      initialDelayMs: 1000,
      maxDelayMs: 30000,
      backoffMultiplier: 2,
      useJitter: true,
      jitterFactor: 0.1,
      retryableErrorFilter: defaultRetryableFilter,
      onRetry: () => {},
      onFailed: () => {},
      ...options,
    };
  }

  /**
   * Execute a function with retry logic
   */
  async execute<T>(
    operation: (context: RetryContext) => Promise<T>,
    operationId?: string
  ): Promise<T> {
    const startTime = Date.now();
    const id = operationId || `retry-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
    const stats: RetryStats = {
      attempts: 0,
      totalDelayMs: 0,
      success: false,
    };

    for (let attempt = 0; attempt <= this.options.maxRetries; attempt++) {
      stats.attempts = attempt + 1;
      
      try {
        const context: RetryContext = {
          attempt,
          startTime,
          lastError: stats.lastError,
        };

        const result = await operation(context);
        
        stats.success = true;
        this.stats.set(id, stats);
        
        this.emit('success', { id, attempt, duration: Date.now() - startTime });
        
        return result;
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        stats.lastError = err;
        
        // Check if we should retry
        const isRetryable = this.options.retryableErrorFilter(err);
        const isLastAttempt = attempt >= this.options.maxRetries;
        
        if (!isRetryable || isLastAttempt) {
          stats.success = false;
          this.stats.set(id, stats);
          
          this.options.onFailed(err, stats.attempts);
          this.emit('failed', { id, error: err, attempts: stats.attempts });
          
          throw err;
        }

        // Calculate and apply backoff
        const delay = calculateBackoffDelay(attempt, this.options);
        stats.totalDelayMs += delay;
        
        this.options.onRetry(attempt + 1, delay, err);
        this.emit('retry', { id, attempt: attempt + 1, delay, error: err });
        
        await sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    throw stats.lastError || new Error('Retry exhausted');
  }

  /**
   * Get stats for a specific operation
   */
  getStats(operationId: string): RetryStats | undefined {
    return this.stats.get(operationId);
  }

  /**
   * Get all stats
   */
  getAllStats(): Map<string, RetryStats> {
    return new Map(this.stats);
  }

  /**
   * Clear stats
   */
  clearStats(): void {
    this.stats.clear();
  }
}

/**
 * Convenience function for one-off retries
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const manager = new RetryManager(options);
  return manager.execute(() => operation());
}

/**
 * Create a retryable wrapper for a function
 */
export function createRetryable<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  options?: RetryOptions
): (...args: TArgs) => Promise<TReturn> {
  const manager = new RetryManager(options);
  
  return async (...args: TArgs): Promise<TReturn> => {
    return manager.execute(() => fn(...args));
  };
}

/**
 * Retry policies for common scenarios
 */
export const RetryPolicies = {
  /**
   * Aggressive retry for critical operations
   */
  aggressive: (): RetryOptions => ({
    maxRetries: 5,
    initialDelayMs: 100,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
    useJitter: true,
  }),

  /**
   * Conservative retry for non-critical operations
   */
  conservative: (): RetryOptions => ({
    maxRetries: 2,
    initialDelayMs: 2000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
    useJitter: true,
  }),

  /**
   * Linear backoff for predictable services
   */
  linear: (): RetryOptions => ({
    maxRetries: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 1,
    useJitter: false,
  }),

  /**
   * Fast retry for low-latency operations
   */
  fast: (): RetryOptions => ({
    maxRetries: 3,
    initialDelayMs: 100,
    maxDelayMs: 1000,
    backoffMultiplier: 2,
    useJitter: true,
  }),

  /**
   * No retry - fail immediately
   */
  none: (): RetryOptions => ({
    maxRetries: 0,
  }),
};

export default {
  RetryManager,
  withRetry,
  createRetryable,
  calculateBackoffDelay,
  RetryPolicies,
};
