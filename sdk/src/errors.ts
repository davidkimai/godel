/**
 * @dash/client SDK - Error Classes
 * 
 * Comprehensive error handling with typed error classes for different failure modes.
 */

/**
 * Base error class for all Dash SDK errors.
 * Provides additional context about API errors including status codes,
 * error codes, and request details for debugging.
 */
export class DashError extends Error {
  /** HTTP status code (if applicable) */
  public readonly statusCode?: number;
  
  /** Error code from the API */
  public readonly code?: string;
  
  /** Request ID for tracing */
  public readonly requestId?: string;
  
  /** Original error that caused this error */
  public readonly cause?: Error;
  
  /** Additional error details */
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    options?: {
      statusCode?: number;
      code?: string;
      requestId?: string;
      cause?: Error;
      details?: Record<string, unknown>;
    }
  ) {
    super(message);
    this.name = 'DashError';
    
    // Maintain proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DashError);
    }
    
    this.statusCode = options?.statusCode;
    this.code = options?.code;
    this.requestId = options?.requestId;
    this.cause = options?.cause;
    this.details = options?.details;
  }

  /**
   * Check if this error represents a client-side (4xx) error
   */
  isClientError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 400 && this.statusCode < 500;
  }

  /**
   * Check if this error represents a server-side (5xx) error
   */
  isServerError(): boolean {
    return this.statusCode !== undefined && this.statusCode >= 500;
  }

  /**
   * Check if this error is retryable
   */
  isRetryable(): boolean {
    if (this.statusCode === undefined) return true;
    // Retry on 429 (rate limit), 502, 503, 504
    return [429, 502, 503, 504].includes(this.statusCode);
  }

  /**
   * Convert error to a plain object for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      code: this.code,
      requestId: this.requestId,
      details: this.details,
      stack: this.stack,
      cause: this.cause ? {
        name: this.cause.name,
        message: this.cause.message,
      } : undefined,
    };
  }
}

/**
 * Error thrown when authentication fails or credentials are invalid/expired.
 * Maps to HTTP 401 Unauthorized responses.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.list();
 * } catch (error) {
 *   if (error instanceof AuthenticationError) {
 *     console.log('Please check your API key');
 *   }
 * }
 * ```
 */
export class AuthenticationError extends DashError {
  constructor(
    message: string = 'Authentication failed. Please check your API key.',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'>
  ) {
    super(message, { ...options, statusCode: 401 });
    this.name = 'AuthenticationError';
  }
}

/**
 * Error thrown when a requested resource is not found.
 * Maps to HTTP 404 Not Found responses.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.get('non-existent-id');
 * } catch (error) {
 *   if (error instanceof NotFoundError) {
 *     console.log(`Swarm ${error.details?.resourceId} not found`);
 *   }
 * }
 * ```
 */
export class NotFoundError extends DashError {
  public readonly resourceType?: string;
  public readonly resourceId?: string;

  constructor(
    message: string = 'Resource not found',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'> & {
      resourceType?: string;
      resourceId?: string;
    }
  ) {
    super(message, { ...options, statusCode: 404 });
    this.name = 'NotFoundError';
    this.resourceType = options?.resourceType;
    this.resourceId = options?.resourceId;
  }
}

/**
 * Error thrown when rate limits are exceeded.
 * Maps to HTTP 429 Too Many Requests responses.
 * Includes retry-after information when available.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.create(config);
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     console.log(`Retry after ${error.retryAfter} seconds`);
 *     await sleep(error.retryAfter * 1000);
 *   }
 * }
 * ```
 */
export class RateLimitError extends DashError {
  /** Number of seconds to wait before retrying */
  public readonly retryAfter: number;
  
  /** Rate limit ceiling */
  public readonly limit?: number;
  
  /** Remaining requests in current window */
  public readonly remaining?: number;
  
  /** When the current rate limit window resets */
  public readonly resetAt?: string;

  constructor(
    message: string = 'Rate limit exceeded',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'> & {
      retryAfter?: number;
      limit?: number;
      remaining?: number;
      resetAt?: string;
    }
  ) {
    super(message, { ...options, statusCode: 429 });
    this.name = 'RateLimitError';
    this.retryAfter = options?.retryAfter ?? 60;
    this.limit = options?.limit;
    this.remaining = options?.remaining;
    this.resetAt = options?.resetAt;
  }
}

/**
 * Error thrown when request validation fails.
 * Maps to HTTP 400 Bad Request and 422 Unprocessable Entity responses.
 * Includes detailed validation error information.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.create({ name: '' }); // Invalid: empty name
 * } catch (error) {
 *   if (error instanceof ValidationError) {
 *     console.log('Validation errors:', error.validationErrors);
 *   }
 * }
 * ```
 */
export class ValidationError extends DashError {
  /** Field-specific validation errors */
  public readonly validationErrors?: Array<{
    field: string;
    message: string;
    code: string;
  }>;

  constructor(
    message: string = 'Validation failed',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'> & {
      validationErrors?: Array<{ field: string; message: string; code: string }>;
    }
  ) {
    super(message, { ...options, statusCode: 400 });
    this.name = 'ValidationError';
    this.validationErrors = options?.validationErrors;
  }
}

/**
 * Error thrown when a server error occurs.
 * Maps to HTTP 5xx responses.
 * These errors are typically retryable.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.list();
 * } catch (error) {
 *   if (error instanceof ServerError) {
 *     console.log('Server error, retrying...');
 *     // Retry logic here
 *   }
 * }
 * ```
 */
export class ServerError extends DashError {
  constructor(
    message: string = 'Internal server error',
    options?: ConstructorParameters<typeof DashError>[1] & { statusCode?: number }
  ) {
    const statusCode = options?.statusCode ?? 500;
    super(message, { ...options, statusCode });
    this.name = 'ServerError';
  }
}

/**
 * Error thrown when a network request fails (timeout, DNS failure, etc).
 * This is distinct from ServerError - it indicates the request never reached the server.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.list();
 * } catch (error) {
 *   if (error instanceof NetworkError) {
 *     console.log('Network issue, check your connection');
 *   }
 * }
 * ```
 */
export class NetworkError extends DashError {
  constructor(
    message: string = 'Network error',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'>
  ) {
    super(message, { ...options });
    this.name = 'NetworkError';
  }
}

/**
 * Error thrown when a request times out.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.create(config, { timeout: 5000 });
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     console.log('Request timed out, operation may still be in progress');
 *   }
 * }
 * ```
 */
export class TimeoutError extends DashError {
  /** Timeout duration in milliseconds */
  public readonly timeoutMs: number;

  constructor(
    message: string = 'Request timeout',
    options?: ConstructorParameters<typeof DashError>[1] & {
      timeoutMs?: number;
    }
  ) {
    super(message, options);
    this.name = 'TimeoutError';
    this.timeoutMs = options?.timeoutMs ?? 0;
  }
}

/**
 * Error thrown when there is a conflict with the current state.
 * Maps to HTTP 409 Conflict responses.
 * Typically occurs when trying to create a resource that already exists
 * or modify a resource in an incompatible state.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.create({ name: 'existing-swarm' });
 * } catch (error) {
 *   if (error instanceof ConflictError) {
 *     console.log('Swarm with this name already exists');
 *   }
 * }
 * ```
 */
export class ConflictError extends DashError {
  constructor(
    message: string = 'Conflict with current state',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'>
  ) {
    super(message, { ...options, statusCode: 409 });
    this.name = 'ConflictError';
  }
}

/**
 * Error thrown when the authenticated user lacks permission for an action.
 * Maps to HTTP 403 Forbidden responses.
 * 
 * @example
 * ```typescript
 * try {
 *   await client.swarms.delete(protectedSwarmId);
 * } catch (error) {
 *   if (error instanceof PermissionError) {
 *     console.log('You do not have permission to delete this swarm');
 *   }
 * }
 * ```
 */
export class PermissionError extends DashError {
  /** Required permission that was missing */
  public readonly requiredPermission?: string;

  constructor(
    message: string = 'Permission denied',
    options?: Omit<ConstructorParameters<typeof DashError>[1], 'statusCode'> & {
      requiredPermission?: string;
    }
  ) {
    super(message, { ...options, statusCode: 403 });
    this.name = 'PermissionError';
    this.requiredPermission = options?.requiredPermission;
  }
}

/**
 * Helper function to create appropriate error from HTTP response
 */
export function createErrorFromResponse(
  statusCode: number,
  responseBody: Record<string, unknown>,
  requestId?: string
): DashError {
  const message = (responseBody.message as string) || (responseBody.error as string) || 'Unknown error';
  const code = (responseBody.code as string) || undefined;
  const details = responseBody.details as Record<string, unknown> | undefined;

  const options = {
    statusCode,
    code,
    requestId,
    details,
  };

  switch (statusCode) {
    case 400:
      return new ValidationError(message, {
        ...options,
        validationErrors: responseBody.validationErrors as Array<{ field: string; message: string; code: string }>,
      });
    case 401:
      return new AuthenticationError(message, options);
    case 403:
      return new PermissionError(message, {
        ...options,
        requiredPermission: responseBody.requiredPermission as string,
      });
    case 404:
      return new NotFoundError(message, {
        ...options,
        resourceType: responseBody.resourceType as string,
        resourceId: responseBody.resourceId as string,
      });
    case 409:
      return new ConflictError(message, options);
    case 429:
      return new RateLimitError(message, {
        ...options,
        retryAfter: responseBody.retryAfter as number ?? parseInt(responseBody['retry-after'] as string) ?? 60,
        limit: responseBody.limit as number,
        remaining: responseBody.remaining as number,
        resetAt: responseBody.resetAt as string,
      });
    case 500:
    case 502:
    case 503:
    case 504:
      return new ServerError(message, options);
    default:
      return new DashError(message, options);
  }
}
