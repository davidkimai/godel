/**
 * API Response Wrapper
 * 
 * Standard format for all API responses: { success, data, error, meta, links }
 */

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

/** Success response type */
export type SuccessResponse<T> = {
  success: true;
  data: T;
  meta?: ResponseMeta;
  links?: ResponseLinks;
};

/** Error response type */
export type ErrorResponse<E = ApiError> = {
  success: false;
  error: E;
  meta?: ResponseMeta;
};

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
  TEAM_NOT_FOUND: 'TEAM_NOT_FOUND',
  TASK_NOT_FOUND: 'TASK_NOT_FOUND',
  
  // 409 - Conflict
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  DUPLICATE: 'DUPLICATE',
  STATE_CONFLICT: 'STATE_CONFLICT',
  
  // 429 - Rate Limit
  RATE_LIMITED: 'RATE_LIMITED',
  
  // 500 - Server Error
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
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
  [ErrorCodes.TEAM_NOT_FOUND]: 404,
  [ErrorCodes.TASK_NOT_FOUND]: 404,
  [ErrorCodes.ALREADY_EXISTS]: 409,
  [ErrorCodes.DUPLICATE]: 409,
  [ErrorCodes.STATE_CONFLICT]: 409,
  [ErrorCodes.RATE_LIMITED]: 429,
  [ErrorCodes.INTERNAL_ERROR]: 500,
  [ErrorCodes.DATABASE_ERROR]: 500,
  [ErrorCodes.SERVICE_UNAVAILABLE]: 503,
};

/**
 * Get HTTP status from error code
 */
export function getHttpStatus(errorCode: string): number {
  return ErrorCodeToStatus[errorCode] || 500;
}
