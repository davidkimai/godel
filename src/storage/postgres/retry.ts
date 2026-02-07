/**
 * PostgreSQL Retry Logic
 * 
 * Advanced retry mechanisms for database operations with:
 * - Exponential backoff with jitter
 * - Circuit breaker pattern
 * - Retry classification for transient vs permanent errors
 */

import { logger } from '../../utils/logger';

export interface RetryOptions {
  /** Maximum number of retry attempts */
  maxRetries: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Backoff multiplier (default: 2 for exponential) */
  backoffMultiplier: number;
  /** Add random jitter to prevent thundering herd (0-1) */
  jitterFactor: number;
}

export interface RetryContext {
  attempt: number;
  lastError?: Error;
  startTime: number;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTimeMs: number;
}

/**
 * Default retry options optimized for database operations
 */
export const defaultRetryOptions: RetryOptions = {
  maxRetries: 5,
  initialDelayMs: 100,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
};

/**
 * PostgreSQL error codes that indicate transient (retryable) failures
 */
export const TRANSIENT_ERROR_CODES = new Set([
  // Connection errors
  'ECONNRESET',      // Connection reset by peer
  'ETIMEDOUT',       // Connection timed out
  'ECONNREFUSED',    // Connection refused
  'ENOTFOUND',       // DNS lookup failed
  'EPIPE',           // Broken pipe
  
  // PostgreSQL specific codes
  '08000',           // connection_exception
  '08003',           // connection_does_not_exist
  '08006',           // connection_failure
  '08001',           // sqlclient_unable_to_establish_sqlconnection
  '08004',           // sqlserver_rejected_establishment_of_sqlconnection
  
  // Transaction/lock errors
  '40001',           // serialization_failure
  '40P01',           // deadlock_detected
  '55P03',           // lock_not_available
  
  // Resource errors
  '53000',           // insufficient_resources
  '53100',           // disk_full
  '53200',           // out_of_memory
  '53300',           // too_many_connections
  
  // System errors
  'XX000',           // internal_error
  'XX001',           // data_corrupted
  'XX002',           // index_corrupted
]);

/**
 * Check if an error is transient (retryable)
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  // Check error code
  const code = (error as { code?: string }).code;
  if (code && TRANSIENT_ERROR_CODES.has(code)) {
    return true;
  }

  // Check error message for transient indicators
  const message = error.message.toLowerCase();
  const transientIndicators = [
    'connection',
    'timeout',
    'refused',
    'reset',
    'busy',
    'retry',
    'temporarily',
    'unavailable',
    'deadlock',
    'lock timeout',
  ];

  return transientIndicators.some(indicator => message.includes(indicator));
}

/**
 * Check if an error is permanent (should not retry)
 */
export function isPermanentError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const PERMANENT_ERROR_CODES = new Set([
    // Syntax/constraint errors
    '42601',           // syntax_error
    '42501',           // insufficient_privilege
    '28P01',           // invalid_password
    '28000',           // invalid_authorization_specification
    
    // Data errors
    '22001',           // string_data_right_truncation
    '22003',           // numeric_value_out_of_range
    '22007',           // invalid_datetime_format
    '22012',           // division_by_zero
    '23502',           // not_null_violation
    '23503',           // foreign_key_violation
    '23505',           // unique_violation
    '23514',           // check_violation
    
    // Not found errors
    '42P01',           // undefined_table
    '42P02',           // undefined_parameter
    '42703',           // undefined_column
  ]);

  const code = (error as { code?: string }).code;
  if (code && PERMANENT_ERROR_CODES.has(code)) {
    return true;
  }

  return false;
}

/**
 * Calculate delay with exponential backoff and jitter
 */
export function calculateDelay(
  attempt: number,
  options: RetryOptions
): number {
  // Calculate exponential delay
  const exponentialDelay = options.initialDelayMs * 
    Math.pow(options.backoffMultiplier, attempt);
  
  // Cap at max delay
  const cappedDelay = Math.min(exponentialDelay, options.maxDelayMs);
  
  // Add jitter to prevent thundering herd
  const jitter = cappedDelay * options.jitterFactor * (Math.random() * 2 - 1);
  
  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute an operation with retry logic
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      // Log successful retry
      if (attempt > 0) {
        logger.debug(`Operation succeeded after ${attempt + 1} attempts`);
      }
      
      return result;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      // Don't retry permanent errors
      if (isPermanentError(error)) {
        logger.debug('Permanent error detected, not retrying:', lastError.message);
        throw lastError;
      }
      
      // Check if we should retry
      if (!isTransientError(error) || attempt >= opts.maxRetries) {
        throw lastError;
      }

      // Calculate and apply delay
      const delayMs = calculateDelay(attempt, opts);
      
      logger.warn(
        `Operation failed (attempt ${attempt + 1}/${opts.maxRetries + 1}), ` +
        `retrying in ${delayMs}ms: ${lastError.message}`
      );
      
      await sleep(delayMs);
    }
  }

  throw lastError || new Error('Operation failed after max retries');
}

/**
 * Execute an operation with retry and return detailed result
 */
export async function tryWithRetry<T>(
  operation: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<RetryResult<T>> {
  const opts = { ...defaultRetryOptions, ...options };
  const startTime = Date.now();
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      const result = await operation();
      
      return {
        success: true,
        result,
        attempts: attempt + 1,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (isPermanentError(error) || !isTransientError(error) || attempt >= opts.maxRetries) {
        return {
          success: false,
          error: lastError,
          attempts: attempt + 1,
          totalTimeMs: Date.now() - startTime,
        };
      }

      const delayMs = calculateDelay(attempt, opts);
      await sleep(delayMs);
    }
  }

  return {
    success: false,
    error: lastError,
    attempts: opts.maxRetries + 1,
    totalTimeMs: Date.now() - startTime,
  };
}

/**
 * Create a retry wrapper for a function
 */
export function withRetryWrapper<T extends (...args: unknown[]) => Promise<unknown>>(
  fn: T,
  options: Partial<RetryOptions> = {}
): (...args: Parameters<T>) => Promise<Awaited<ReturnType<T>>> {
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    return withRetry(() => fn(...args), options) as Promise<Awaited<ReturnType<T>>>;
  };
}

/**
 * Circuit breaker pattern for database operations
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime: number | null = null;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private readonly failureThreshold = 5,
    private readonly resetTimeoutMs = 30000
  ) {}

  /**
   * Execute an operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - (this.lastFailureTime || 0) > this.resetTimeoutMs) {
        this.state = 'half-open';
        logger.info('Circuit breaker entering half-open state');
      } else {
        throw new Error('Circuit breaker is open - too many failures');
      }
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    if (this.state === 'half-open') {
      this.state = 'closed';
      logger.info('Circuit breaker closed - service recovered');
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.failureThreshold) {
      this.state = 'open';
      logger.error(`Circuit breaker opened after ${this.failures} failures`);
    }
  }

  getState(): string {
    return this.state;
  }
}

export default {
  withRetry,
  tryWithRetry,
  withRetryWrapper,
  isTransientError,
  isPermanentError,
  calculateDelay,
  CircuitBreaker,
  defaultRetryOptions,
  TRANSIENT_ERROR_CODES,
};
