import { FastifyInstance, FastifyReply, FastifyError } from 'fastify';

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
    timestamp: string;
    path?: string;
    correlationId?: string;
  };
}

interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

interface AppError extends Error {
  code?: string;
  statusCode?: number;
  details?: Record<string, any>;
  isOperational?: boolean;
}

function formatError(error: FastifyError | AppError, path?: string, correlationId?: string): ErrorResponse {
  return {
    success: false,
    error: {
      code: (error as AppError).code || 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
      details: (error as AppError).details,
      timestamp: new Date().toISOString(),
      path,
      correlationId,
    },
  };
}

function formatValidationError(validationErrors: ValidationError[], path?: string, correlationId?: string): ErrorResponse {
  return {
    success: false,
    error: {
      code: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      details: { validationErrors },
      timestamp: new Date().toISOString(),
      path,
      correlationId,
    },
  };
}

export class ErrorFormatter {
  static badRequest(message: string = 'Bad Request', details?: Record<string, any>): AppError {
    const error = new Error(message) as AppError;
    error.code = 'BAD_REQUEST';
    error.statusCode = 400;
    error.details = details;
    error.isOperational = true;
    return error;
  }

  static unauthorized(message: string = 'Unauthorized'): AppError {
    const error = new Error(message) as AppError;
    error.code = 'UNAUTHORIZED';
    error.statusCode = 401;
    error.isOperational = true;
    return error;
  }

  static forbidden(message: string = 'Forbidden'): AppError {
    const error = new Error(message) as AppError;
    error.code = 'FORBIDDEN';
    error.statusCode = 403;
    error.isOperational = true;
    return error;
  }

  static notFound(message: string = 'Resource not found'): AppError {
    const error = new Error(message) as AppError;
    error.code = 'NOT_FOUND';
    error.statusCode = 404;
    error.isOperational = true;
    return error;
  }

  static conflict(message: string = 'Conflict'): AppError {
    const error = new Error(message) as AppError;
    error.code = 'CONFLICT';
    error.statusCode = 409;
    error.isOperational = true;
    return error;
  }

  static internal(message: string = 'Internal server error', details?: Record<string, any>): AppError {
    const error = new Error(message) as AppError;
    error.code = 'INTERNAL_ERROR';
    error.statusCode = 500;
    error.details = details;
    error.isOperational = false;
    return error;
  }

  static serviceUnavailable(message: string = 'Service unavailable'): AppError {
    const error = new Error(message) as AppError;
    error.code = 'SERVICE_UNAVAILABLE';
    error.statusCode = 503;
    error.isOperational = true;
    return error;
  }

  static validationFailed(validationErrors: ValidationError[], message: string = 'Validation failed'): AppError {
    const error = new Error(message) as AppError;
    error.code = 'VALIDATION_ERROR';
    error.statusCode = 422;
    error.details = { validationErrors };
    error.isOperational = true;
    return error;
  }

  static tooManyRequests(message: string = 'Too many requests', retryAfter?: number): AppError {
    const error = new Error(message) as AppError;
    error.code = 'TOO_MANY_REQUESTS';
    error.statusCode = 429;
    error.details = retryAfter ? { retryAfter } : undefined;
    error.isOperational = true;
    return error;
  }
}

export function setupErrorHandler(fastify: FastifyInstance): void {
  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    const correlationId = (request as any).correlationId;
    const path = request.url;

    if (error.validation) {
      const validationErrors: ValidationError[] = error.validation.map((ve: any) => ({
        field: ve.instancePath || ve.params?.["missingProperty"] || 'unknown',
        message: ve.message || 'Invalid value',
        value: ve.data,
      }));
      const response = formatValidationError(validationErrors, path, correlationId);
      return reply.status(422).send(response);
    }

    const appError = error as AppError;
    const statusCode = appError.statusCode || error.statusCode || 500;
    const response = formatError(appError, path, correlationId);

    if (!appError.isOperational && statusCode >= 500) {
      fastify.log.error({ err: error, correlationId, path }, 'Unhandled operational error');
    } else {
      fastify.log.warn({ err: error, correlationId, path }, 'Handled error');
    }

    return reply.status(statusCode).send(response);
  });

  fastify.setNotFoundHandler((request, reply) => {
    const correlationId = (request as any).correlationId;
    const response: ErrorResponse = {
      success: false,
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
        timestamp: new Date().toISOString(),
        path: request.url,
        correlationId,
      },
    };
    reply.status(404).send(response);
  });
}

export function createSuccessResponse<T>(data: T, meta?: { page?: number; limit?: number; total?: number }): { success: true; data: T; meta?: { page?: number; limit?: number; total?: number } } {
  return {
    success: true,
    data,
    ...(meta && { meta }),
  };
}

export function createPaginatedResponse<T>(
  items: T[],
  page: number,
  limit: number,
  total: number
): { success: true; data: T[]; meta: { page: number; limit: number; total: number; totalPages: number } } {
  return {
    success: true,
    data: items,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}
