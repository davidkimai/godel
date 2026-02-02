import type { Request, Response, NextFunction } from 'express';
import {
  ApplicationError,
  ValidationError,
  NotFoundError,
  RateLimitError,
  isApplicationError,
  isOperationalError,
} from './custom';

// =============================================================================
// ERROR HANDLER OPTIONS
// =============================================================================

export interface ErrorHandlerOptions {
  /** Include stack traces in responses (default: false in production) */
  includeStackTrace?: boolean;
  /** Log errors to console (default: true) */
  logErrors?: boolean;
  /** Custom logger function */
  logger?: (error: unknown, context?: Record<string, unknown>) => void;
  /** Callback for error metrics/alerts */
  onError?: (error: ApplicationError, req: Request) => void | Promise<void>;
}

// =============================================================================
// ERROR METRICS
// =============================================================================

interface ErrorMetrics {
  total: number;
  byCode: Record<string, number>;
  byStatus: Record<number, number>;
  operational: number;
  programming: number;
}

const metrics: ErrorMetrics = {
  total: 0,
  byCode: {},
  byStatus: {},
  operational: 0,
  programming: 0,
};

export function getErrorMetrics(): ErrorMetrics {
  return { ...metrics };
}

export function resetErrorMetrics(): void {
  metrics.total = 0;
  metrics.byCode = {};
  metrics.byStatus = {};
  metrics.operational = 0;
  metrics.programming = 0;
}

function recordMetric(error: ApplicationError): void {
  metrics.total++;
  metrics.byCode[error.code] = (metrics.byCode[error.code] || 0) + 1;
  metrics.byStatus[error.statusCode] = (metrics.byStatus[error.statusCode] || 0) + 1;
  
  if (error.isOperational) {
    metrics.operational++;
  } else {
    metrics.programming++;
  }
}

// =============================================================================
// EXPRESS ERROR HANDLER
// =============================================================================

export function errorHandler(options: ErrorHandlerOptions = {}) {
  const {
    includeStackTrace = process.env['NODE_ENV'] !== 'production',
    logErrors = true,
    logger = console.error,
    onError,
  } = options;

  return async (
    error: unknown,
    req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> => {
    // Handle ApplicationErrors
    if (error instanceof ApplicationError) {
      // Record metrics
      recordMetric(error);

      // Log error
      if (logErrors) {
        logger(error.toLogEntry(), {
          path: req.path,
          method: req.method,
          query: req.query,
          body: sanitizeBody(req.body),
        });
      }

      // Callback for alerts/metrics
      if (onError) {
        try {
          await onError(error, req);
        } catch (callbackError) {
          logger('Error in error callback:', callbackError);
        }
      }

      // Send response
      const response: Record<string, unknown> = {
        error: error.code,
        message: error.message,
      };

      if (includeStackTrace && error['stack']) {
        response['stack'] = error['stack'].split('\n');
      }

      if (error['context']) {
        response['context'] = error['context'];
      }

      res.status(error.statusCode).json(response);
      return;
    }

    // Handle validation errors from zod
    if (error instanceof ValidationError) {
      if (logErrors) {
        logger('Validation error:', error.message);
      }

      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: error.message,
        issues: (error as any).issues || [],
      });
      return;
    }

    // Handle unknown errors
    const message = error instanceof Error ? error['message'] : 'Unknown error';
    const stack = error instanceof Error ? error['stack'] : undefined;

    if (logErrors) {
      logger('Unhandled error:', error);
    }

    const response: Record<string, unknown> = {
      error: 'INTERNAL_ERROR',
      message: includeStackTrace ? message : 'Internal server error',
    };

    if (includeStackTrace && stack) {
      response['stack'] = stack.split('\n');
    }

    res.status(500).json(response);
  };
}

// =============================================================================
// CLI ERROR HANDLER
// =============================================================================

export interface CLIOptions {
  /** Exit process on error (default: true) */
  exitOnError?: boolean;
  /** Show verbose output (default: false) */
  verbose?: boolean;
  /** Custom exit code (default: 1) */
  exitCode?: number;
}

export function handleCLIError(error: unknown, options: CLIOptions = {}): void {
  const { exitOnError = true, verbose = false, exitCode = 1 } = options;

  if (error instanceof ApplicationError) {
    console.error(`\n❌  ${error.toCLI()}`);
    
    if (verbose && error.context) {
      console.error('\nContext:');
      for (const [key, value] of Object.entries(error.context)) {
        console.error(`  ${key}: ${JSON.stringify(value)}`);
      }
    }

    if (verbose && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  } else if (error instanceof Error) {
    console.error(`\n❌  Error: ${error.message}`);
    
    if (verbose && error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
  } else {
    console.error(`\n❌  Unknown error: ${String(error)}`);
  }

  if (exitOnError) {
    process.exit(exitCode);
  }
}

// =============================================================================
// BACKGROUND JOB ERROR HANDLER
// =============================================================================

export interface BackgroundJobContext {
  jobId: string;
  jobType: string;
  attempt: number;
  maxRetries?: number;
}

export async function handleBackgroundError(
  error: unknown,
  context: BackgroundJobContext,
  options: { logger?: (msg: string, meta?: unknown) => void } = {}
): Promise<{ retry: boolean; delay?: number }> {
  const { logger = console.error } = options;
  const { jobId, jobType, attempt, maxRetries = 3 } = context;

  logger(`Background job error:`, {
    jobId,
    jobType,
    attempt,
    error: error instanceof Error ? error.message : String(error),
  });

  // Determine if we should retry
  if (error instanceof ApplicationError) {
    // Don't retry operational errors (client's fault)
    if (error.isOperational) {
      return { retry: false };
    }

    // Retry programming errors with exponential backoff
    if (attempt < maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, attempt), 30000); // Max 30s
      return { retry: true, delay };
    }
  }

  // Unknown errors - retry once
  if (attempt === 1) {
    return { retry: true, delay: 5000 };
  }

  return { retry: false };
}

// =============================================================================
// UTILITIES
// =============================================================================

function sanitizeBody(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    // Redact sensitive fields
    if (['password', 'secret', 'token', 'apiKey', 'key'].some(s => 
      key.toLowerCase().includes(s.toLowerCase())
    )) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

export function shouldReportError(error: unknown): boolean {
  // Don't report operational errors (expected client errors)
  if (isOperationalError(error)) {
    return false;
  }

  // Report all programming errors
  if (isApplicationError(error)) {
    return true;
  }

  // Report unknown errors
  return true;
}

// =============================================================================
// RETRY UTILITIES
// =============================================================================

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  retryableErrors?: string[];
  onRetry?: (error: Error, attempt: number) => void;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    retryableErrors,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if we should retry
      if (attempt === maxRetries) break;

      // Check error code if specified
      if (retryableErrors && error instanceof ApplicationError) {
        if (!retryableErrors.includes(error.code)) {
          throw error;
        }
      }

      // Calculate delay
      const delay = Math.min(
        initialDelay * Math.pow(backoffMultiplier, attempt),
        maxDelay
      );

      if (onRetry) {
        onRetry(lastError, attempt + 1);
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  state: 'closed' | 'open' | 'half-open';
}

const circuitBreakers: Map<string, CircuitBreakerState> = new Map();

export interface CircuitBreakerOptions {
  failureThreshold?: number;
  resetTimeout?: number;
  halfOpenMaxCalls?: number;
}

export function createCircuitBreaker(
  name: string,
  options: CircuitBreakerOptions = {}
) {
  const {
    failureThreshold = 5,
    resetTimeout = 30000,
    halfOpenMaxCalls = 3,
  } = options;

  return {
    async execute<T>(fn: () => Promise<T>): Promise<T> {
      const state = circuitBreakers.get(name) || {
        failures: 0,
        lastFailure: 0,
        state: 'closed',
      };

      // Check if circuit is open
      if (state.state === 'open') {
        const timeSinceLastFailure = Date.now() - state.lastFailure;
        if (timeSinceLastFailure < resetTimeout) {
          throw new ApplicationError(
            `Circuit breaker open for ${name}`,
            'CIRCUIT_OPEN',
            503,
            { service: name, retryAfter: Math.ceil((resetTimeout - timeSinceLastFailure) / 1000) }
          );
        }
        // Transition to half-open
        state.state = 'half-open';
      }

      try {
        const result = await fn();
        // Success - reset if in half-open
        if (state.state === 'half-open') {
          state.failures = 0;
          state.state = 'closed';
        }
        circuitBreakers.set(name, state);
        return result;
      } catch (error) {
        state.failures++;
        state.lastFailure = Date.now();
        
        if (state.failures >= failureThreshold) {
          state.state = 'open';
        }
        
        circuitBreakers.set(name, state);
        throw error;
      }
    },

    getState(): CircuitBreakerState | undefined {
      return circuitBreakers.get(name);
    },

    reset(): void {
      circuitBreakers.delete(name);
    },
  };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export * from './custom';
