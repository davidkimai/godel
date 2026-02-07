/**
 * Express Response Utilities
 * 
 * Standardized response helpers for Express routes to match Fastify format.
 * Ensures API consistency across all endpoints.
 */

import { Response } from 'express';

export interface ApiResponse<T> {
  /** Whether the request was successful */
  success: boolean;
  /** Response data (on success) */
  data?: T;
  /** Error details (on failure) */
  error?: ApiError;
  /** Metadata (pagination, etc) */
  meta?: ResponseMeta;
  /** HATEOAS links */
  links?: ResponseLinks;
}

export interface ApiError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Additional error details */
  details?: Record<string, unknown>;
  /** Stack trace (development only) */
  stack?: string;
}

export interface ResponseMeta {
  /** Current page (for pagination) */
  page?: number;
  /** Page size */
  pageSize?: number;
  /** Total number of items */
  total?: number;
  /** Whether more items exist */
  hasMore?: boolean;
  /** Cursor for next page (cursor-based pagination) */
  nextCursor?: string;
  /** Cursor for previous page */
  prevCursor?: string;
  /** Request timestamp */
  timestamp: string;
  /** Request ID for tracing */
  requestId?: string;
  /** API version */
  version: string;
}

export interface ResponseLinks {
  /** Self link */
  self: string;
  /** First page */
  first?: string;
  /** Last page */
  last?: string;
  /** Next page */
  next?: string;
  /** Previous page */
  prev?: string;
}

/**
 * Create a success response
 */
export function createSuccessResponse<T>(
  data: T,
  options: {
    meta?: Partial<ResponseMeta>;
    links?: ResponseLinks;
    requestId?: string;
  } = {}
): ApiResponse<T> {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      ...options.meta,
      requestId: options.requestId,
    },
    links: options.links,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  code: string,
  message: string,
  options: {
    details?: Record<string, unknown>;
    stack?: string;
    requestId?: string;
  } = {}
): ApiResponse<never> {
  return {
    success: false,
    error: {
      code,
      message,
      details: options.details,
      stack: options.stack,
    },
    meta: {
      timestamp: new Date().toISOString(),
      version: '2.0.0',
      requestId: options.requestId,
    },
  };
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // 400 - Bad Request
  INVALID_INPUT: 'INVALID_INPUT',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  MISSING_FIELD: 'MISSING_FIELD',
  INVALID_FORMAT: 'INVALID_FORMAT',
  
  // 401 - Unauthorized
  UNAUTHORIZED: 'UNAUTHORIZED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  
  // 403 - Forbidden
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // 404 - Not Found
  NOT_FOUND: 'NOT_FOUND',
  AGENT_NOT_FOUND: 'AGENT_NOT_FOUND',
  SWARM_NOT_FOUND: 'SWARM_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  ROLE_NOT_FOUND: 'ROLE_NOT_FOUND',
  WORKTREE_NOT_FOUND: 'WORKTREE_NOT_FOUND',
  INSTANCE_NOT_FOUND: 'INSTANCE_NOT_FOUND',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  
  // 409 - Conflict
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DUPLICATE: 'DUPLICATE',
  STATE_CONFLICT: 'STATE_CONFLICT',
  
  // 422 - Unprocessable Entity
  UNPROCESSABLE: 'UNPROCESSABLE',
  
  // 429 - Rate Limit
  RATE_LIMITED: 'RATE_LIMITED',
  
  // 500 - Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  
  // 503 - Service Unavailable
  REGISTRY_NOT_INITIALIZED: 'REGISTRY_NOT_INITIALIZED',
} as const;

/**
 * HTTP status code mapping
 */
export const ErrorCodeToStatus: Record<string, number> = {
  [ErrorCodes.INVALID_INPUT]: 400,
  [ErrorCodes.VALIDATION_ERROR]: 400,
  [ErrorCodes.MISSING_FIELD]: 400,
  [ErrorCodes.INVALID_FORMAT]: 400,
  [ErrorCodes.UNAUTHORIZED]: 401,
  [ErrorCodes.INVALID_TOKEN]: 401,
  [ErrorCodes.EXPIRED_TOKEN]: 401,
  [ErrorCodes.FORBIDDEN]: 403,
  [ErrorCodes.INSUFFICIENT_PERMISSIONS]: 403,
  [ErrorCodes.NOT_FOUND]: 404,
  [ErrorCodes.AGENT_NOT_FOUND]: 404,
  [ErrorCodes.SWARM_NOT_FOUND]: 404,
  [ErrorCodes.TASK_NOT_FOUND]: 404,
  [ErrorCodes.ROLE_NOT_FOUND]: 404,
  [ErrorCodes.WORKTREE_NOT_FOUND]: 404,
  [ErrorCodes.INSTANCE_NOT_FOUND]: 404,
  [ErrorCodes.SESSION_NOT_FOUND]: 404,
  [ErrorCodes.ALREADY_EXISTS]: 409,
  [ErrorCodes.DUPLICATE]: 409,
  [ErrorCodes.STATE_CONFLICT]: 409,
  [ErrorCodes.UNPROCESSABLE]: 422,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
  [ErrorCodes.REGISTRY_NOT_INITIALIZED]: 503,
};

/**
 * Get HTTP status from error code
 */
export function getHttpStatus(errorCode: string): number {
  return ErrorCodeToStatus[errorCode] || 500;
}

/**
 * Send a success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  options: {
    statusCode?: number;
    meta?: Partial<ResponseMeta>;
    links?: ResponseLinks;
    requestId?: string;
  } = {}
): void {
  const response = createSuccessResponse(data, {
    meta: options.meta,
    links: options.links,
    requestId: options.requestId || (res.req as any).id,
  });
  res.status(options.statusCode || 200).json(response);
}

/**
 * Send an error response
 */
export function sendError(
  res: Response,
  code: string,
  message: string,
  options: {
    statusCode?: number;
    details?: Record<string, unknown>;
  } = {}
): void {
  const statusCode = options.statusCode || getHttpStatus(code);
  const isDev = process.env['NODE_ENV'] === 'development';
  
  const response = createErrorResponse(code, message, {
    details: options.details,
    stack: isDev ? new Error().stack : undefined,
    requestId: (res.req as any).id,
  });
  
  res.status(statusCode).json(response);
}

/**
 * Send a validation error response
 */
export function sendValidationError(
  res: Response,
  errors: Array<{ field: string; message: string }>
): void {
  sendError(res, ErrorCodes.VALIDATION_ERROR, 'Validation failed', {
    statusCode: 400,
    details: { errors },
  });
}

/**
 * Send a not found error response
 */
export function sendNotFound(
  res: Response,
  resource: string,
  id: string
): void {
  const codeMap: Record<string, string> = {
    agent: ErrorCodes.AGENT_NOT_FOUND,
    team: ErrorCodes.SWARM_NOT_FOUND,
    task: ErrorCodes.TASK_NOT_FOUND,
    role: ErrorCodes.ROLE_NOT_FOUND,
    worktree: ErrorCodes.WORKTREE_NOT_FOUND,
    instance: ErrorCodes.INSTANCE_NOT_FOUND,
    session: ErrorCodes.SESSION_NOT_FOUND,
  };
  
  const code = codeMap[resource.toLowerCase()] || ErrorCodes.NOT_FOUND;
  sendError(res, code, `${resource} ${id} not found`, {
    statusCode: 404,
  });
}

/**
 * Wrap async route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: any, res: Response, next: any) => Promise<void>
) {
  return (req: any, res: Response, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
