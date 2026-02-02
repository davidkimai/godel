/**
 * Dash Retry Mechanisms - Exponential Backoff & Circuit Breaker
 * 
 * PRD Section 2.7: Race Condition Handling
 * 
 * Features:
 * - Exponential backoff with jitter
 * - Max retry attempts
 * - Retryable error detection
 * - Circuit breaker pattern
 */

import { EventEmitter } from 'events';

export interface RetryConfig {
  /** Maximum retry attempts */
  maxAttempts: number;
  /** Base delay in milliseconds */
  baseDelay: number;
  /** Maximum delay in milliseconds */
  maxDelay: number;
  /** Jitter factor (0-1) */
  jitterFactor: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Retry on these status codes */
  retryableStatuses: number[];
  /** Retry on these error types */
  retryableErrors: string[];
}

export interface CircuitBreakerConfig {
  /** Number of failures before opening circuit */
  failureThreshold: number;
  /** Success rate percentage to close circuit */
  successThreshold: number;
  /** Time window in milliseconds */
  timeWindow: number;
  /** Half-open max requests */
  halfOpenMaxRequests: number;
}

export interface CircuitState {
  state: 'closed' | 'open' | 'half-open';
  failureCount: number;
  successCount: number;
  lastFailureTime: Date | null;
  nextAttempt: Date | null;
}

export interface RetryResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
  finalAttempt: boolean;
}

export interface CircuitBreakerResult<T> {
  success: boolean;
  data?: T;
  error?: Error;
  circuitState: CircuitState;
  fromCache: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitterFactor: 0.3,
  backoffMultiplier: 2,
  retryableStatuses: [429, 500, 502, 503, 504],
  retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND']
};

export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 3,
  timeWindow: 60000,
  halfOpenMaxRequests: 3
};

/**
 * Retry with exponential backoff
 */
export async function retry<T>(
  operation: () => Promise<T>,
  config?: Partial<RetryConfig>
): Promise<RetryResult<T>> {
  const cfg = { ...DEFAULT_RETRY_CONFIG, ...config };
  const startTime = Date.now();
  let attempts = 0;
  let lastError: Error | undefined;

  while (attempts < cfg.maxAttempts) {
    attempts++;

    try {
      const data = await operation();
      return {
        success: true,
        data,
        attempts,
        totalTime: Date.now() - startTime,
        finalAttempt: attempts === cfg.maxAttempts
      };
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (!isRetryable(error, cfg)) {
        return {
          success: false,
          error,
          attempts,
          totalTime: Date.now() - startTime,
          finalAttempt: true
        };
      }

      // Check if last attempt
      if (attempts >= cfg.maxAttempts) {
        return {
          success: false,
          error,
          attempts,
          totalTime: Date.now() - startTime,
          finalAttempt: true
        };
      }

      // Calculate delay with jitter
      const delay = calculateDelay(attempts, cfg);
      await sleep(delay);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts,
    totalTime: Date.now() - startTime,
    finalAttempt: true
  };
}

/**
 * Circuit Breaker implementation
 */
export class CircuitBreaker extends EventEmitter {
  private config: CircuitBreakerConfig;
  private state: CircuitState;
  private requests: { timestamp: Date; success: boolean }[] = [];

  constructor(config?: Partial<CircuitBreakerConfig>) {
    super();
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
    this.state = {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      nextAttempt: null
    };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>
  ): Promise<CircuitBreakerResult<T>> {
    // Check if circuit is open
    if (this.state.state === 'open') {
      if (this.state.nextAttempt && Date.now() < this.state.nextAttempt.getTime()) {
        return {
          success: false,
          error: new Error('Circuit breaker is open'),
          circuitState: this.getState(),
          fromCache: false
        };
      }

      // Try half-open
      this.state.state = 'half-open';
      this.state.successCount = 0;
      this.emit('state_change', { from: 'open', to: 'half-open' });
    }

    // Check half-open request limit
    if (this.state.state === 'half-open') {
      const recentRequests = this.getRecentRequests();
      if (recentRequests.length >= this.config.halfOpenMaxRequests) {
        return {
          success: false,
          error: new Error('Circuit breaker half-open request limit reached'),
          circuitState: this.getState(),
          fromCache: false
        };
      }
    }

    try {
      const data = await operation();
      this.recordSuccess();
      return {
        success: true,
        data,
        circuitState: this.getState(),
        fromCache: false
      };
    } catch (error) {
      this.recordFailure();
      return {
        success: false,
        error,
        circuitState: this.getState(),
        fromCache: false
      };
    }
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return { ...this.state };
  }

  /**
   * Force circuit open
   */
  forceOpen(): void {
    this.state.state = 'open';
    this.state.nextAttempt = new Date(Date.now() + this.config.timeWindow);
    this.emit('state_change', { to: 'open', reason: 'forced' });
  }

  /**
   * Force circuit closed
   */
  forceClose(): void {
    this.state.state = 'closed';
    this.state.failureCount = 0;
    this.state.successCount = 0;
    this.state.nextAttempt = null;
    this.emit('state_change', { to: 'closed', reason: 'forced' });
  }

  /**
   * Reset circuit breaker
   */
  reset(): void {
    this.state = {
      state: 'closed',
      failureCount: 0,
      successCount: 0,
      lastFailureTime: null,
      nextAttempt: null
    };
    this.requests = [];
    this.emit('reset');
  }

  /**
   * Record success
   */
  private recordSuccess(): void {
    this.requests.push({ timestamp: new Date(), success: true });
    this.state.successCount++;

    if (this.state.state === 'half-open') {
      if (this.state.successCount >= this.config.successThreshold) {
        this.state.state = 'closed';
        this.state.failureCount = 0;
        this.state.nextAttempt = null;
        this.emit('state_change', { from: 'half-open', to: 'closed' });
      }
    }

    this.cleanupOldRequests();
  }

  /**
   * Record failure
   */
  private recordFailure(): void {
    this.requests.push({ timestamp: new Date(), success: false });
    this.state.failureCount++;
    this.state.lastFailureTime = new Date();

    if (this.state.state === 'closed') {
      if (this.state.failureCount >= this.config.failureThreshold) {
        this.state.state = 'open';
        this.state.nextAttempt = new Date(Date.now() + this.config.timeWindow);
        this.emit('state_change', { from: 'closed', to: 'open' });
      }
    } else if (this.state.state === 'half-open') {
      this.state.state = 'open';
      this.state.nextAttempt = new Date(Date.now() + this.config.timeWindow);
      this.emit('state_change', { from: 'half-open', to: 'open' });
    }

    this.cleanupOldRequests();
  }

  /**
   * Get recent requests within time window
   */
  private getRecentRequests(): { timestamp: Date; success: boolean }[] {
    const cutoff = new Date(Date.now() - this.config.timeWindow);
    return this.requests.filter((r) => r.timestamp > cutoff);
  }

  /**
   * Cleanup old requests
   */
  private cleanupOldRequests(): void {
    const cutoff = new Date(Date.now() - this.config.timeWindow);
    this.requests = this.requests.filter((r) => r.timestamp > cutoff);
  }
}

/**
 * Bulkhead pattern - limit concurrent operations
 */
export class Bulkhead extends EventEmitter {
  private maxConcurrent: number;
  private currentConcurrent: number = 0;
  private queue: (() => Promise<any>)[] = [];
  private processing: number = 0;

  constructor(maxConcurrent: number = 10) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Execute with bulkhead protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.currentConcurrent < this.maxConcurrent) {
      return this.runOperation(operation);
    }

    return new Promise((resolve, reject) => {
      this.queue.push(async () => {
        try {
          const result = await this.runOperation(operation);
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Run the actual operation
   */
  private async runOperation<T>(operation: () => Promise<T>): Promise<T> {
    this.currentConcurrent++;
    this.processing++;

    try {
      return await operation();
    } finally {
      this.currentConcurrent--;
      this.processing--;
      this.processQueue();
    }
  }

  /**
   * Process queued operations
   */
  private processQueue(): void {
    if (this.queue.length > 0 && this.currentConcurrent < this.maxConcurrent) {
      const next = this.queue.shift();
      if (next) {
        this.runOperation(next);
      }
    }
  }

  /**
   * Get metrics
   */
  getMetrics(): {
    maxConcurrent: number;
    currentConcurrent: number;
    queued: number;
    utilization: number;
  } {
    return {
      maxConcurrent: this.maxConcurrent,
      currentConcurrent: this.currentConcurrent,
      queued: this.queue.length,
      utilization: this.currentConcurrent / this.maxConcurrent
    };
  }
}

/**
 * Check if error is retryable
 */
function isRetryable(error: unknown, config: RetryConfig): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const err = error as Record<string, unknown>;

  // Check status code
  const status = err['status'];
  if (typeof status === 'number' && config.retryableStatuses.includes(status)) {
    return true;
  }

  // Check error code
  const code = err['code'];
  if (typeof code === 'string' && config.retryableErrors.includes(code)) {
    return true;
  }

  // Check error message
  const message = typeof err['message'] === 'string' ? err['message'] : '';
  if (message.includes('timeout') || message.includes('ECONN')) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig): number {
  const baseDelay = config.baseDelay * Math.pow(config.backoffMultiplier, attempt - 1);
  const jitter = baseDelay * config.jitterFactor * Math.random();
  return Math.min(baseDelay + jitter, config.maxDelay);
}

/**
 * Sleep helper
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Singleton circuit breaker for common use
 */
let defaultCircuitBreaker: CircuitBreaker | null = null;

export function getDefaultCircuitBreaker(): CircuitBreaker {
  if (!defaultCircuitBreaker) {
    defaultCircuitBreaker = new CircuitBreaker();
  }
  return defaultCircuitBreaker;
}
