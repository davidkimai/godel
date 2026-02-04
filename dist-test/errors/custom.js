"use strict";
// =============================================================================
// BASE ERROR CLASS
// =============================================================================
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCode = exports.PathTraversalError = exports.QuotaExceededError = exports.SandboxError = exports.LockTimeoutError = exports.ConcurrencyConflictError = exports.NotImplementedError = exports.SystemError = exports.ConfigurationError = exports.NetworkError = exports.DatabaseError = exports.LLMServiceError = exports.ExternalServiceError = exports.CostLimitError = exports.TokenLimitError = exports.BudgetExhaustedError = exports.RateLimitError = exports.SwarmExecutionError = exports.AgentTimeoutError = exports.AgentExecutionError = exports.InvalidApiKeyError = exports.AuthorizationError = exports.AuthenticationError = exports.AlreadyExistsError = exports.TaskNotFoundError = exports.SwarmNotFoundError = exports.AgentNotFoundError = exports.NotFoundError = exports.SchemaValidationError = exports.ValidationError = exports.ApplicationError = void 0;
exports.isApplicationError = isApplicationError;
exports.isOperationalError = isOperationalError;
exports.isNotFoundError = isNotFoundError;
exports.isValidationError = isValidationError;
exports.isRateLimitError = isRateLimitError;
class ApplicationError extends Error {
    constructor(message, code, statusCode = 500, context, isOperational = true) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.context = context;
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
    toCLI() {
        return `Error [${this.code}]: ${this.message}`;
    }
    toLogEntry() {
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
exports.ApplicationError = ApplicationError;
// =============================================================================
// DOMAIN ERRORS (4xx)
// =============================================================================
class ValidationError extends ApplicationError {
    constructor(message, context) {
        super(message, 'VALIDATION_ERROR', 400, context, true);
    }
}
exports.ValidationError = ValidationError;
class SchemaValidationError extends ApplicationError {
    constructor(message, issues, context) {
        super(message, 'SCHEMA_VALIDATION_ERROR', 400, { ...context, issues }, true);
        this.issues = issues;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            issues: this.issues,
        };
    }
}
exports.SchemaValidationError = SchemaValidationError;
class NotFoundError extends ApplicationError {
    constructor(resource, id, context) {
        super(`${resource} not found: ${id}`, 'NOT_FOUND', 404, { ...context, resource, id }, true);
        this.resource = resource;
        this.id = id;
    }
}
exports.NotFoundError = NotFoundError;
class AgentNotFoundError extends NotFoundError {
    constructor(agentId, context) {
        super('Agent', agentId, context);
        this.name = 'AgentNotFoundError';
    }
}
exports.AgentNotFoundError = AgentNotFoundError;
class SwarmNotFoundError extends NotFoundError {
    constructor(swarmId, context) {
        super('Swarm', swarmId, context);
        this.name = 'SwarmNotFoundError';
    }
}
exports.SwarmNotFoundError = SwarmNotFoundError;
class TaskNotFoundError extends NotFoundError {
    constructor(taskId, context) {
        super('Task', taskId, context);
        this.name = 'TaskNotFoundError';
    }
}
exports.TaskNotFoundError = TaskNotFoundError;
class AlreadyExistsError extends ApplicationError {
    constructor(resource, id, context) {
        super(`${resource} already exists: ${id}`, 'ALREADY_EXISTS', 409, { ...context, resource, id }, true);
        this.resource = resource;
        this.id = id;
    }
}
exports.AlreadyExistsError = AlreadyExistsError;
// =============================================================================
// AUTHENTICATION & AUTHORIZATION ERRORS (401/403)
// =============================================================================
class AuthenticationError extends ApplicationError {
    constructor(message = 'Authentication required', context) {
        super(message, 'AUTHENTICATION_ERROR', 401, context, true);
    }
}
exports.AuthenticationError = AuthenticationError;
class AuthorizationError extends ApplicationError {
    constructor(message = 'Insufficient permissions', context) {
        super(message, 'AUTHORIZATION_ERROR', 403, context, true);
    }
}
exports.AuthorizationError = AuthorizationError;
class InvalidApiKeyError extends AuthenticationError {
    constructor(context) {
        super('Invalid or missing API key', context);
        this.code = 'INVALID_API_KEY';
        this.name = 'InvalidApiKeyError';
    }
}
exports.InvalidApiKeyError = InvalidApiKeyError;
// =============================================================================
// EXECUTION ERRORS (5xx)
// =============================================================================
class AgentExecutionError extends ApplicationError {
    constructor(agentId, message, context) {
        super(message, 'AGENT_EXECUTION_FAILED', 500, { ...context, agentId }, false);
        this.agentId = agentId;
    }
}
exports.AgentExecutionError = AgentExecutionError;
class AgentTimeoutError extends ApplicationError {
    constructor(agentId, timeoutMs, context) {
        super(`Agent ${agentId} timed out after ${timeoutMs}ms`, 'AGENT_TIMEOUT', 504, { ...context, agentId, timeoutMs }, true);
        this.agentId = agentId;
        this.timeoutMs = timeoutMs;
    }
}
exports.AgentTimeoutError = AgentTimeoutError;
class SwarmExecutionError extends ApplicationError {
    constructor(swarmId, message, context) {
        super(message, 'SWARM_EXECUTION_FAILED', 500, { ...context, swarmId }, false);
        this.swarmId = swarmId;
    }
}
exports.SwarmExecutionError = SwarmExecutionError;
// =============================================================================
// RESOURCE LIMIT ERRORS (429)
// =============================================================================
class RateLimitError extends ApplicationError {
    constructor(limit, windowMs, context) {
        super(`Rate limit exceeded: ${limit} requests per ${windowMs}ms`, 'RATE_LIMIT_EXCEEDED', 429, { ...context, limit, windowMs, retryAfter: Math.ceil(windowMs / 1000) }, true);
        this.limit = limit;
        this.windowMs = windowMs;
    }
    toJSON() {
        return {
            ...super.toJSON(),
            retryAfter: Math.ceil(this.windowMs / 1000),
        };
    }
}
exports.RateLimitError = RateLimitError;
class BudgetExhaustedError extends ApplicationError {
    constructor(scopeType, scopeId, currentUsage, budgetLimit, context) {
        super(`Budget exhausted for ${scopeType} ${scopeId}: ${currentUsage}/${budgetLimit}`, 'BUDGET_EXHAUSTED', 429, { ...context, scopeType, scopeId, currentUsage, budgetLimit }, true);
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.currentUsage = currentUsage;
        this.budgetLimit = budgetLimit;
    }
}
exports.BudgetExhaustedError = BudgetExhaustedError;
class TokenLimitError extends ApplicationError {
    constructor(current, limit, context) {
        super(`Token limit reached: ${current}/${limit}`, 'TOKEN_LIMIT_REACHED', 429, { ...context, current, limit }, true);
        this.current = current;
        this.limit = limit;
    }
}
exports.TokenLimitError = TokenLimitError;
class CostLimitError extends ApplicationError {
    constructor(current, limit, context) {
        super(`Cost limit reached: $${current.toFixed(2)}/$${limit.toFixed(2)}`, 'COST_LIMIT_REACHED', 429, { ...context, current, limit }, true);
        this.current = current;
        this.limit = limit;
    }
}
exports.CostLimitError = CostLimitError;
// =============================================================================
// EXTERNAL SERVICE ERRORS (502/503)
// =============================================================================
class ExternalServiceError extends ApplicationError {
    constructor(service, message, context) {
        super(`External service error (${service}): ${message}`, 'EXTERNAL_SERVICE_ERROR', 502, { ...context, service }, true);
        this.service = service;
    }
}
exports.ExternalServiceError = ExternalServiceError;
class LLMServiceError extends ExternalServiceError {
    constructor(provider, message, context) {
        super(provider, message, context);
        this.provider = provider;
        this.code = 'LLM_SERVICE_ERROR';
        this.name = 'LLMServiceError';
    }
}
exports.LLMServiceError = LLMServiceError;
class DatabaseError extends ApplicationError {
    constructor(message, operation, context) {
        super(message, 'DATABASE_ERROR', 500, { ...context, operation }, false);
        this.operation = operation;
    }
}
exports.DatabaseError = DatabaseError;
class NetworkError extends ApplicationError {
    constructor(message, endpoint, context) {
        super(message, 'NETWORK_ERROR', 503, { ...context, endpoint }, true);
        this.endpoint = endpoint;
    }
}
exports.NetworkError = NetworkError;
// =============================================================================
// CONFIGURATION & SYSTEM ERRORS
// =============================================================================
class ConfigurationError extends ApplicationError {
    constructor(configKey, message, context) {
        super(`Configuration error [${configKey}]: ${message}`, 'CONFIGURATION_ERROR', 500, { ...context, configKey }, false);
        this.configKey = configKey;
    }
}
exports.ConfigurationError = ConfigurationError;
class SystemError extends ApplicationError {
    constructor(message, context) {
        super(message, 'SYSTEM_ERROR', 500, context, false);
    }
}
exports.SystemError = SystemError;
class NotImplementedError extends ApplicationError {
    constructor(feature, context) {
        super(`Feature not implemented: ${feature}`, 'NOT_IMPLEMENTED', 501, { ...context, feature }, true);
    }
}
exports.NotImplementedError = NotImplementedError;
// =============================================================================
// CONCURRENCY ERRORS
// =============================================================================
class ConcurrencyConflictError extends ApplicationError {
    constructor(resource, id, context) {
        super(`Concurrency conflict on ${resource} ${id}`, 'CONCURRENCY_CONFLICT', 409, { ...context, resource, id }, true);
        this.resource = resource;
        this.id = id;
    }
}
exports.ConcurrencyConflictError = ConcurrencyConflictError;
class LockTimeoutError extends ApplicationError {
    constructor(resource, timeoutMs, context) {
        super(`Lock timeout on ${resource} after ${timeoutMs}ms`, 'LOCK_TIMEOUT', 503, { ...context, resource, timeoutMs }, true);
        this.resource = resource;
        this.timeoutMs = timeoutMs;
    }
}
exports.LockTimeoutError = LockTimeoutError;
// =============================================================================
// SANDBOX ERRORS
// =============================================================================
class SandboxError extends ApplicationError {
    constructor(agentId, message, context) {
        super(message, 'SANDBOX_ERROR', 500, { ...context, agentId }, false);
        this.agentId = agentId;
    }
}
exports.SandboxError = SandboxError;
class QuotaExceededError extends ApplicationError {
    constructor(agentId, quotaType, current, limit, context) {
        const messages = {
            fileSize: `File size quota exceeded: ${current}/${limit} bytes`,
            totalSize: `Total storage quota exceeded: ${current}/${limit} bytes`,
            fileCount: `File count quota exceeded: ${current}/${limit} files`,
        };
        super(messages[quotaType], 'QUOTA_EXCEEDED', 429, { ...context, agentId, quotaType, current, limit }, true);
        this.agentId = agentId;
        this.quotaType = quotaType;
        this.current = current;
        this.limit = limit;
    }
}
exports.QuotaExceededError = QuotaExceededError;
class PathTraversalError extends ApplicationError {
    constructor(attemptedPath, context) {
        super(`Path traversal attempt detected: ${attemptedPath}`, 'PATH_TRAVERSAL', 400, { ...context, attemptedPath }, true);
        this.attemptedPath = attemptedPath;
    }
}
exports.PathTraversalError = PathTraversalError;
// =============================================================================
// TYPE GUARDS
// =============================================================================
function isApplicationError(error) {
    return error instanceof ApplicationError;
}
function isOperationalError(error) {
    return error instanceof ApplicationError && error.isOperational;
}
function isNotFoundError(error) {
    return error instanceof NotFoundError;
}
function isValidationError(error) {
    return error instanceof ValidationError;
}
function isRateLimitError(error) {
    return error instanceof RateLimitError;
}
// =============================================================================
// ERROR CODES ENUM
// =============================================================================
exports.ErrorCode = {
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
    SWARM_EXECUTION_FAILED: 'SWARM_EXECUTION_FAILED',
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
};
