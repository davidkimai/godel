/**
 * Error Handling Middleware
 * 
 * Centralized error handling for API routes.
 * Sanitizes error messages in production to prevent information leakage.
 */

import { Request, Response, NextFunction } from 'express';

/**
 * Custom API Error class
 */
export class APIError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'APIError';
  }
}

/**
 * Known error types that can be exposed to clients
 */
const SAFE_ERROR_CODES = new Set([
  'BAD_REQUEST',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'RATE_LIMIT_EXCEEDED',
  'VALIDATION_ERROR',
  'CONFLICT',
  'UNPROCESSABLE_ENTITY',
]);

/**
 * Map HTTP status codes to safe error messages
 */
const SAFE_ERROR_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Authentication required',
  403: 'Access denied',
  404: 'Resource not found',
  409: 'Conflict',
  422: 'Unprocessable entity',
  429: 'Too many requests',
  500: 'Internal server error',
  502: 'Service unavailable',
  503: 'Service temporarily unavailable',
};

/**
 * Check if an error is safe to expose to clients
 */
function isSafeError(error: Error): boolean {
  if (error instanceof APIError) {
    return SAFE_ERROR_CODES.has(error.code || '') || error.statusCode < 500;
  }
  return false;
}

/**
 * Sanitize error for production
 */
function sanitizeError(error: Error, isDev: boolean): {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
  stack?: string;
} {
  // In development, show full error details
  if (isDev) {
    return {
      message: error.message,
      code: error instanceof APIError ? error.code : undefined,
      details: error instanceof APIError ? error.details : undefined,
      stack: error.stack,
    };
  }

  // In production, sanitize the error
  if (error instanceof APIError) {
    // APIErrors with safe codes can show their message
    if (SAFE_ERROR_CODES.has(error.code || '')) {
      return {
        message: error.message,
        code: error.code,
        // Only include safe details
        details: error.details ? sanitizeDetails(error.details) : undefined,
      };
    }
  }

  // For all other errors, use generic message
  const statusCode = error instanceof APIError ? error.statusCode : 500;
  return {
    message: SAFE_ERROR_MESSAGES[statusCode] || SAFE_ERROR_MESSAGES[500],
    code: 'INTERNAL_ERROR',
  };
}

/**
 * Sanitize error details to prevent information leakage
 */
function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(details)) {
    // Skip sensitive fields
    if (isSensitiveField(key)) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeDetails(value as Record<string, unknown>);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Check if a field name is sensitive
 */
function isSensitiveField(field: string): boolean {
  const sensitivePatterns = [
    /password/i,
    /secret/i,
    /token/i,
    /key/i,
    /auth/i,
    /credential/i,
    /session/i,
    /cookie/i,
    /private/i,
    /ssn/i,
    /social/i,
    /credit/i,
    /card/i,
    /cvv/i,
    /pin/i,
  ];
  
  return sensitivePatterns.some(pattern => pattern.test(field));
}

/**
 * Log error securely (avoid logging sensitive data)
 */
function logError(error: Error, req: Request): void {
  const isDev = process.env.NODE_ENV === 'development';
  
  // In production, only log essential information
  const logEntry: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    statusCode: error instanceof APIError ? error.statusCode : 500,
    errorType: error.name,
  };

  if (isDev) {
    logEntry.message = error.message;
    logEntry.stack = error.stack;
  } else {
    // In production, only log that an error occurred
    logEntry.errorCode = error instanceof APIError ? error.code : 'UNKNOWN';
  }

  console.error('[API Error]', JSON.stringify(logEntry));
}

/**
 * Main error handler middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Log the error
  logError(err, req);

  const isDev = process.env.NODE_ENV === 'development';
  
  // Determine status code
  const statusCode = err instanceof APIError ? err.statusCode : 500;
  
  // Sanitize error response
  const sanitized = sanitizeError(err, isDev);

  // Send response
  res.status(statusCode).json({
    error: sanitized.message,
    ...(sanitized.code && { code: sanitized.code }),
    ...(sanitized.details && { details: sanitized.details }),
    ...(isDev && sanitized.stack && { stack: sanitized.stack }),
    // Include request ID for tracking (would be set by request ID middleware)
    ...(req.headers['x-request-id'] && { requestId: req.headers['x-request-id'] }),
  });
}

/**
 * Async handler wrapper to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Resource not found',
    code: 'NOT_FOUND',
    path: req.path,
  });
}

/**
 * Validation error handler
 */
export function validationErrorHandler(
  errors: Array<{ field: string; message: string }>,
  res: Response
): void {
  res.status(422).json({
    error: 'Validation failed',
    code: 'VALIDATION_ERROR',
    details: { errors },
  });
}

// APIError is already exported above
