// =============================================================================
// BASE ERROR CLASS
// =============================================================================

export interface ErrorContext {
  [key: string]: unknown;
}

export class ApplicationError extends Error {
  public readonly isOperational: boolean;
  public readonly timestamp: Date;

  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500,
    public readonly context?: ErrorContext,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.isOperational = isOperational;
    this.timestamp = new Date();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      ...(this.context && { context: this.context }),
    };
  }

  toCLI(): string {
    return `Error [${this.code}]: ${this.message}`;
  }

  toLogEntry(): Record<string, unknown> {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      stack: this.stack,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

// =============================================================================
// DOMAIN ERRORS (4xx)
// =============================================================================

export class ValidationError extends ApplicationError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'VALIDATION_ERROR', 400, context, true);
  }
}

export class SchemaValidationError extends ApplicationError {
  constructor(
    message: string,
    public readonly issues: Array<{ path: string; message: string }>,
    context?: ErrorContext
  ) {
    super(message, 'SCHEMA_VALIDATION_ERROR', 400, { ...context, issues }, true);
  }

  toJSON() {
    return {
      ...super.toJSON(),
      issues: this.issues,
    };
  }
}

export class NotFoundError extends ApplicationError {
  constructor(
    public readonly resource: string,
    public readonly id: string,
    context?: ErrorContext
  ) {
    super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { ...context, resource, id }, true);
  }
}

export class AgentNotFoundError extends NotFoundError {
  constructor(agentId: string, context?: ErrorContext) {
    super('Agent', agentId, context);
    this.name = 'AgentNotFoundError';
  }
}

export class TeamNotFoundError extends NotFoundError {
  constructor(teamId: string, context?: ErrorContext) {
    super('Team', teamId, context);
    this.name = 'TeamNotFoundError';
  }
}

export class TaskNotFoundError extends NotFoundError {
  constructor(taskId: string, context?: ErrorContext) {
    super('Task', taskId, context);
    this.name = 'TaskNotFoundError';
  }
}

export class AlreadyExistsError extends ApplicationError {
  constructor(
    public readonly resource: string,
    public readonly id: string,
    context?: ErrorContext
  ) {
    super(`${resource} already exists: ${id}`, 'ALREADY_EXISTS', 409, { ...context, resource, id }, true);
  }
}

// =============================================================================
// AUTHENTICATION & AUTHORIZATION ERRORS (401/403)
// =============================================================================

export class AuthenticationError extends ApplicationError {
  constructor(message: string = 'Authentication required', context?: ErrorContext) {
    super(message, 'AUTHENTICATION_ERROR', 401, context, true);
  }
}

export class AuthorizationError extends ApplicationError {
  constructor(message: string = 'Insufficient permissions', context?: ErrorContext) {
    super(message, 'AUTHORIZATION_ERROR', 403, context, true);
  }
}

export class InvalidApiKeyError extends AuthenticationError {
  public readonly code = 'INVALID_API_KEY';
  constructor(context?: ErrorContext) {
    super('Invalid or missing API key', context);
    this.name = 'InvalidApiKeyError';
  }
}

// =============================================================================
// EXECUTION ERRORS (5xx)
// =============================================================================

export class AgentExecutionError extends ApplicationError {
  constructor(
    public readonly agentId: string,
    message: string,
    context?: ErrorContext
  ) {
    super(message, 'AGENT_EXECUTION_FAILED', 500, { ...context, agentId }, false);
  }
}

export class AgentTimeoutError extends ApplicationError {
  constructor(
    public readonly agentId: string,
    public readonly timeoutMs: number,
    context?: ErrorContext
  ) {
    super(
      `Agent ${agentId} timed out after ${timeoutMs}ms`,
      'AGENT_TIMEOUT',
      504,
      { ...context, agentId, timeoutMs },
      true
    );
  }
}

export class TeamExecutionError extends ApplicationError {
  constructor(
    public readonly teamId: string,
    message: string,
    context?: ErrorContext
  ) {
    super(message, 'TEAM_EXECUTION_FAILED', 500, { ...context, teamId }, false);
  }
}

// =============================================================================
// RESOURCE LIMIT ERRORS (429)
// =============================================================================

export class RateLimitError extends ApplicationError {
  constructor(
    public readonly limit: number,
    public readonly windowMs: number,
    context?: ErrorContext
  ) {
    super(
      `Rate limit exceeded: ${limit} requests per ${windowMs}ms`,
      'RATE_LIMIT_EXCEEDED',
      429,
      { ...context, limit, windowMs, retryAfter: Math.ceil(windowMs / 1000) },
      true
    );
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: Math.ceil(this.windowMs / 1000),
    };
  }
}

export class BudgetExhaustedError extends ApplicationError {
  constructor(
    public readonly scopeType: string,
    public readonly scopeId: string,
    public readonly currentUsage: number,
    public readonly budgetLimit: number,
    context?: ErrorContext
  ) {
    super(
      `Budget exhausted for ${scopeType} ${scopeId}: ${currentUsage}/${budgetLimit}`,
      'BUDGET_EXHAUSTED',
      429,
      { ...context, scopeType, scopeId, currentUsage, budgetLimit },
      true
    );
  }
}

export class TokenLimitError extends ApplicationError {
  constructor(
    public readonly current: number,
    public readonly limit: number,
    context?: ErrorContext
  ) {
    super(
      `Token limit reached: ${current}/${limit}`,
      'TOKEN_LIMIT_REACHED',
      429,
      { ...context, current, limit },
      true
    );
  }
}

export class CostLimitError extends ApplicationError {
  constructor(
    public readonly current: number,
    public readonly limit: number,
    context?: ErrorContext
  ) {
    super(
      `Cost limit reached: $${current.toFixed(2)}/$${limit.toFixed(2)}`,
      'COST_LIMIT_REACHED',
      429,
      { ...context, current, limit },
      true
    );
  }
}

// =============================================================================
// EXTERNAL SERVICE ERRORS (502/503)
// =============================================================================

export class ExternalServiceError extends ApplicationError {
  constructor(
    public readonly service: string,
    message: string,
    context?: ErrorContext
  ) {
    super(
      `External service error (${service}): ${message}`,
      'EXTERNAL_SERVICE_ERROR',
      502,
      { ...context, service },
      true
    );
  }
}

export class LLMServiceError extends ExternalServiceError {
  public readonly code = 'LLM_SERVICE_ERROR';
  constructor(
    public readonly provider: string,
    message: string,
    context?: ErrorContext
  ) {
    super(provider, message, context);
    this.name = 'LLMServiceError';
  }
}

export class DatabaseError extends ApplicationError {
  constructor(
    message: string,
    public readonly operation?: string,
    context?: ErrorContext
  ) {
    super(message, 'DATABASE_ERROR', 500, { ...context, operation }, false);
  }
}

export class NetworkError extends ApplicationError {
  constructor(
    message: string,
    public readonly endpoint?: string,
    context?: ErrorContext
  ) {
    super(message, 'NETWORK_ERROR', 503, { ...context, endpoint }, true);
  }
}

// =============================================================================
// CONFIGURATION & SYSTEM ERRORS
// =============================================================================

export class ConfigurationError extends ApplicationError {
  constructor(
    public readonly configKey: string,
    message: string,
    context?: ErrorContext
  ) {
    super(`Configuration error [${configKey}]: ${message}`, 'CONFIGURATION_ERROR', 500, { ...context, configKey }, false);
  }
}

export class SystemError extends ApplicationError {
  constructor(message: string, context?: ErrorContext) {
    super(message, 'SYSTEM_ERROR', 500, context, false);
  }
}

export class NotImplementedError extends ApplicationError {
  constructor(feature: string, context?: ErrorContext) {
    super(`Feature not implemented: ${feature}`, 'NOT_IMPLEMENTED', 501, { ...context, feature }, true);
  }
}

// =============================================================================
// CONCURRENCY ERRORS
// =============================================================================

export class ConcurrencyConflictError extends ApplicationError {
  constructor(
    public readonly resource: string,
    public readonly id: string,
    context?: ErrorContext
  ) {
    super(
      `Concurrency conflict on ${resource} ${id}`,
      'CONCURRENCY_CONFLICT',
      409,
      { ...context, resource, id },
      true
    );
  }
}

export class LockTimeoutError extends ApplicationError {
  constructor(
    public readonly resource: string,
    public readonly timeoutMs: number,
    context?: ErrorContext
  ) {
    super(
      `Lock timeout on ${resource} after ${timeoutMs}ms`,
      'LOCK_TIMEOUT',
      503,
      { ...context, resource, timeoutMs },
      true
    );
  }
}

// =============================================================================
// SANDBOX ERRORS
// =============================================================================

export class SandboxError extends ApplicationError {
  constructor(
    public readonly agentId: string,
    message: string,
    context?: ErrorContext
  ) {
    super(message, 'SANDBOX_ERROR', 500, { ...context, agentId }, false);
  }
}

export class QuotaExceededError extends ApplicationError {
  constructor(
    public readonly agentId: string,
    public readonly quotaType: 'fileSize' | 'totalSize' | 'fileCount',
    public readonly current: number,
    public readonly limit: number,
    context?: ErrorContext
  ) {
    const messages: Record<typeof quotaType, string> = {
      fileSize: `File size quota exceeded: ${current}/${limit} bytes`,
      totalSize: `Total storage quota exceeded: ${current}/${limit} bytes`,
      fileCount: `File count quota exceeded: ${current}/${limit} files`,
    };
    super(messages[quotaType], 'QUOTA_EXCEEDED', 429, { ...context, agentId, quotaType, current, limit }, true);
  }
}

export class PathTraversalError extends ApplicationError {
  constructor(
    public readonly attemptedPath: string,
    context?: ErrorContext
  ) {
    super(`Path traversal attempt detected: ${attemptedPath}`, 'PATH_TRAVERSAL', 400, { ...context, attemptedPath }, true);
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

export function isApplicationError(error: unknown): error is ApplicationError {
  return error instanceof ApplicationError;
}

export function isOperationalError(error: unknown): boolean {
  return error instanceof ApplicationError && error.isOperational;
}

export function isNotFoundError(error: unknown): error is NotFoundError {
  return error instanceof NotFoundError;
}

export function isValidationError(error: unknown): error is ValidationError {
  return error instanceof ValidationError;
}

export function isRateLimitError(error: unknown): error is RateLimitError {
  return error instanceof RateLimitError;
}

// =============================================================================
// ERROR CODES ENUM
// =============================================================================

export const ErrorCode = {
  // Domain Errors
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  SCHEMA_VALIDATION_ERROR: 'SCHEMA_VALIDATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  
  // Auth Errors
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  INVALID_API_KEY: 'INVALID_API_KEY',
  
  // Execution Errors
  AGENT_EXECUTION_FAILED: 'AGENT_EXECUTION_FAILED',
  AGENT_TIMEOUT: 'AGENT_TIMEOUT',
  TEAM_EXECUTION_FAILED: 'TEAM_EXECUTION_FAILED',
  
  // Resource Errors
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  BUDGET_EXHAUSTED: 'BUDGET_EXHAUSTED',
  TOKEN_LIMIT_REACHED: 'TOKEN_LIMIT_REACHED',
  COST_LIMIT_REACHED: 'COST_LIMIT_REACHED',
  
  // External Errors
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  LLM_SERVICE_ERROR: 'LLM_SERVICE_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  
  // System Errors
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
  SYSTEM_ERROR: 'SYSTEM_ERROR',
  NOT_IMPLEMENTED: 'NOT_IMPLEMENTED',
  
  // Concurrency
  CONCURRENCY_CONFLICT: 'CONCURRENCY_CONFLICT',
  LOCK_TIMEOUT: 'LOCK_TIMEOUT',
  
  // Sandbox
  SANDBOX_ERROR: 'SANDBOX_ERROR',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL',
} as const;

export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];
