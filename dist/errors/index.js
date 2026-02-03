"use strict";
/**
 * Dash Error Handling System
 *
 * Centralized error handling for the Dash platform.
 *
 * @example
 * ```typescript
 * import {
 *   ApplicationError,
 *   AgentNotFoundError,
 *   ValidationError,
 *   handleCLIError,
 *   withRetry
 * } from './errors';
 *
 * // Throw structured errors
 * throw new AgentNotFoundError(agentId);
 *
 * // Handle CLI errors
 * try {
 *   await command.execute();
 * } catch (error) {
 *   handleCLIError(error, { verbose: true });
 * }
 *
 * // Retry with exponential backoff
 * const result = await withRetry(async () => {
 *   return await fetchData();
 * }, { maxRetries: 3 });
 * ```
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorRecoveryStrategies = exports.DashErrorCode = exports.createCircuitBreaker = exports.shouldReportError = exports.withRetry = exports.handleBackgroundError = exports.handleCLIError = exports.resetErrorMetrics = exports.getErrorMetrics = exports.errorHandler = exports.isRateLimitError = exports.isValidationError = exports.isNotFoundError = exports.isOperationalError = exports.isApplicationError = exports.ErrorCode = exports.PathTraversalError = exports.QuotaExceededError = exports.SandboxError = exports.LockTimeoutError = exports.ConcurrencyConflictError = exports.NotImplementedError = exports.SystemError = exports.ConfigurationError = exports.NetworkError = exports.DatabaseError = exports.LLMServiceError = exports.ExternalServiceError = exports.CostLimitError = exports.TokenLimitError = exports.BudgetExhaustedError = exports.RateLimitError = exports.SwarmExecutionError = exports.AgentTimeoutError = exports.AgentExecutionError = exports.InvalidApiKeyError = exports.AuthorizationError = exports.AuthenticationError = exports.AlreadyExistsError = exports.TaskNotFoundError = exports.SwarmNotFoundError = exports.AgentNotFoundError = exports.NotFoundError = exports.SchemaValidationError = exports.ValidationError = exports.ApplicationError = void 0;
exports.getRecoveryStrategy = getRecoveryStrategy;
exports.executeRecovery = executeRecovery;
exports.withErrorHandling = withErrorHandling;
exports.safeExecute = safeExecute;
exports.assert = assert;
exports.assertExists = assertExists;
exports.assertNotNull = assertNotNull;
exports.upgradeError = upgradeError;
exports.createDashError = createDashError;
// =============================================================================
// ERROR CLASSES - Re-export everything from custom
// =============================================================================
var custom_1 = require("./custom");
// Base class
Object.defineProperty(exports, "ApplicationError", { enumerable: true, get: function () { return custom_1.ApplicationError; } });
// Domain errors (4xx)
Object.defineProperty(exports, "ValidationError", { enumerable: true, get: function () { return custom_1.ValidationError; } });
Object.defineProperty(exports, "SchemaValidationError", { enumerable: true, get: function () { return custom_1.SchemaValidationError; } });
Object.defineProperty(exports, "NotFoundError", { enumerable: true, get: function () { return custom_1.NotFoundError; } });
Object.defineProperty(exports, "AgentNotFoundError", { enumerable: true, get: function () { return custom_1.AgentNotFoundError; } });
Object.defineProperty(exports, "SwarmNotFoundError", { enumerable: true, get: function () { return custom_1.SwarmNotFoundError; } });
Object.defineProperty(exports, "TaskNotFoundError", { enumerable: true, get: function () { return custom_1.TaskNotFoundError; } });
Object.defineProperty(exports, "AlreadyExistsError", { enumerable: true, get: function () { return custom_1.AlreadyExistsError; } });
// Auth errors (401/403)
Object.defineProperty(exports, "AuthenticationError", { enumerable: true, get: function () { return custom_1.AuthenticationError; } });
Object.defineProperty(exports, "AuthorizationError", { enumerable: true, get: function () { return custom_1.AuthorizationError; } });
Object.defineProperty(exports, "InvalidApiKeyError", { enumerable: true, get: function () { return custom_1.InvalidApiKeyError; } });
// Execution errors (5xx)
Object.defineProperty(exports, "AgentExecutionError", { enumerable: true, get: function () { return custom_1.AgentExecutionError; } });
Object.defineProperty(exports, "AgentTimeoutError", { enumerable: true, get: function () { return custom_1.AgentTimeoutError; } });
Object.defineProperty(exports, "SwarmExecutionError", { enumerable: true, get: function () { return custom_1.SwarmExecutionError; } });
// Resource limit errors (429)
Object.defineProperty(exports, "RateLimitError", { enumerable: true, get: function () { return custom_1.RateLimitError; } });
Object.defineProperty(exports, "BudgetExhaustedError", { enumerable: true, get: function () { return custom_1.BudgetExhaustedError; } });
Object.defineProperty(exports, "TokenLimitError", { enumerable: true, get: function () { return custom_1.TokenLimitError; } });
Object.defineProperty(exports, "CostLimitError", { enumerable: true, get: function () { return custom_1.CostLimitError; } });
// External service errors (502/503)
Object.defineProperty(exports, "ExternalServiceError", { enumerable: true, get: function () { return custom_1.ExternalServiceError; } });
Object.defineProperty(exports, "LLMServiceError", { enumerable: true, get: function () { return custom_1.LLMServiceError; } });
Object.defineProperty(exports, "DatabaseError", { enumerable: true, get: function () { return custom_1.DatabaseError; } });
Object.defineProperty(exports, "NetworkError", { enumerable: true, get: function () { return custom_1.NetworkError; } });
// Configuration & system errors
Object.defineProperty(exports, "ConfigurationError", { enumerable: true, get: function () { return custom_1.ConfigurationError; } });
Object.defineProperty(exports, "SystemError", { enumerable: true, get: function () { return custom_1.SystemError; } });
Object.defineProperty(exports, "NotImplementedError", { enumerable: true, get: function () { return custom_1.NotImplementedError; } });
// Concurrency errors
Object.defineProperty(exports, "ConcurrencyConflictError", { enumerable: true, get: function () { return custom_1.ConcurrencyConflictError; } });
Object.defineProperty(exports, "LockTimeoutError", { enumerable: true, get: function () { return custom_1.LockTimeoutError; } });
// Sandbox errors
Object.defineProperty(exports, "SandboxError", { enumerable: true, get: function () { return custom_1.SandboxError; } });
Object.defineProperty(exports, "QuotaExceededError", { enumerable: true, get: function () { return custom_1.QuotaExceededError; } });
Object.defineProperty(exports, "PathTraversalError", { enumerable: true, get: function () { return custom_1.PathTraversalError; } });
// Error codes
Object.defineProperty(exports, "ErrorCode", { enumerable: true, get: function () { return custom_1.ErrorCode; } });
// =============================================================================
// TYPE GUARDS
// =============================================================================
var custom_2 = require("./custom");
Object.defineProperty(exports, "isApplicationError", { enumerable: true, get: function () { return custom_2.isApplicationError; } });
Object.defineProperty(exports, "isOperationalError", { enumerable: true, get: function () { return custom_2.isOperationalError; } });
Object.defineProperty(exports, "isNotFoundError", { enumerable: true, get: function () { return custom_2.isNotFoundError; } });
Object.defineProperty(exports, "isValidationError", { enumerable: true, get: function () { return custom_2.isValidationError; } });
Object.defineProperty(exports, "isRateLimitError", { enumerable: true, get: function () { return custom_2.isRateLimitError; } });
// =============================================================================
// ERROR HANDLERS
// =============================================================================
var handler_1 = require("./handler");
// Express handler
Object.defineProperty(exports, "errorHandler", { enumerable: true, get: function () { return handler_1.errorHandler; } });
Object.defineProperty(exports, "getErrorMetrics", { enumerable: true, get: function () { return handler_1.getErrorMetrics; } });
Object.defineProperty(exports, "resetErrorMetrics", { enumerable: true, get: function () { return handler_1.resetErrorMetrics; } });
// CLI handler
Object.defineProperty(exports, "handleCLIError", { enumerable: true, get: function () { return handler_1.handleCLIError; } });
// Background job handler
Object.defineProperty(exports, "handleBackgroundError", { enumerable: true, get: function () { return handler_1.handleBackgroundError; } });
// Retry utilities
Object.defineProperty(exports, "withRetry", { enumerable: true, get: function () { return handler_1.withRetry; } });
Object.defineProperty(exports, "shouldReportError", { enumerable: true, get: function () { return handler_1.shouldReportError; } });
// =============================================================================
// CIRCUIT BREAKER
// =============================================================================
var handler_2 = require("./handler");
Object.defineProperty(exports, "createCircuitBreaker", { enumerable: true, get: function () { return handler_2.createCircuitBreaker; } });
// =============================================================================
// DASH-SPECIFIC ERROR CODES (E-Codes)
// 
// Machine-readable error codes for programmatic handling.
// Format: E### where ### is a unique numeric identifier.
// =============================================================================
var DashErrorCode;
(function (DashErrorCode) {
    // Lifecycle Errors (E1xx)
    DashErrorCode["LIFECYCLE_NOT_STARTED"] = "E100";
    DashErrorCode["LIFECYCLE_ALREADY_STARTED"] = "E101";
    DashErrorCode["INVALID_STATE_TRANSITION"] = "E102";
    // Agent Errors (E2xx)
    DashErrorCode["AGENT_NOT_FOUND"] = "E200";
    DashErrorCode["AGENT_ALREADY_EXISTS"] = "E201";
    DashErrorCode["AGENT_SPAWN_FAILED"] = "E202";
    DashErrorCode["AGENT_START_FAILED"] = "E203";
    DashErrorCode["AGENT_PAUSE_FAILED"] = "E204";
    DashErrorCode["AGENT_RESUME_FAILED"] = "E205";
    DashErrorCode["AGENT_KILL_FAILED"] = "E206";
    DashErrorCode["AGENT_COMPLETE_FAILED"] = "E207";
    DashErrorCode["INVALID_AGENT_STATE"] = "E208";
    // Swarm Errors (E3xx)
    DashErrorCode["SWARM_NOT_FOUND"] = "E300";
    DashErrorCode["SWARM_ALREADY_EXISTS"] = "E301";
    DashErrorCode["SWARM_CREATE_FAILED"] = "E302";
    DashErrorCode["SWARM_DESTROY_FAILED"] = "E303";
    DashErrorCode["SWARM_SCALE_FAILED"] = "E304";
    DashErrorCode["INVALID_SWARM_STATE"] = "E305";
    DashErrorCode["MAX_AGENTS_EXCEEDED"] = "E306";
    // Context Errors (E4xx)
    DashErrorCode["CONTEXT_NOT_FOUND"] = "E400";
    DashErrorCode["INVALID_FILE_PATH"] = "E401";
    DashErrorCode["MAX_FILES_EXCEEDED"] = "E402";
    DashErrorCode["FILE_NOT_FOUND_IN_CONTEXT"] = "E403";
    DashErrorCode["CONTEXT_VALIDATION_FAILED"] = "E404";
    // OpenClaw Errors (E5xx)
    DashErrorCode["SESSION_NOT_FOUND"] = "E500";
    DashErrorCode["INVALID_SESSION_STATE"] = "E501";
    DashErrorCode["OPENCLAW_NOT_INITIALIZED"] = "E502";
    DashErrorCode["SESSION_SPAWN_FAILED"] = "E503";
    DashErrorCode["SESSION_PAUSE_FAILED"] = "E504";
    DashErrorCode["SESSION_RESUME_FAILED"] = "E505";
    DashErrorCode["SESSION_KILL_FAILED"] = "E506";
    // Budget Errors (E6xx)
    DashErrorCode["BUDGET_EXHAUSTED"] = "E600";
    DashErrorCode["BUDGET_NOT_FOUND"] = "E601";
    DashErrorCode["INVALID_BUDGET_CONFIG"] = "E602";
    // Dependency Errors (E7xx)
    DashErrorCode["CYCLIC_DEPENDENCY"] = "E700";
    DashErrorCode["DEPENDENCY_NOT_FOUND"] = "E701";
    DashErrorCode["TOPOLOGICAL_SORT_FAILED"] = "E702";
    // Configuration Errors (E8xx)
    DashErrorCode["CONFIG_NOT_FOUND"] = "E800";
    DashErrorCode["INVALID_CONFIG_VALUE"] = "E801";
    DashErrorCode["MISSING_REQUIRED_CONFIG"] = "E802";
    // System Errors (E9xx)
    DashErrorCode["INITIALIZATION_FAILED"] = "E900";
    DashErrorCode["INTERNAL_ERROR"] = "E901";
    DashErrorCode["NOT_IMPLEMENTED"] = "E902";
})(DashErrorCode || (exports.DashErrorCode = DashErrorCode = {}));
/**
 * Error recovery configuration for different error codes
 */
exports.ErrorRecoveryStrategies = {
    [DashErrorCode.AGENT_SPAWN_FAILED]: { type: 'retry', delayMs: 1000, maxAttempts: 3 },
    [DashErrorCode.SESSION_SPAWN_FAILED]: { type: 'retry', delayMs: 2000, maxAttempts: 3 },
    [DashErrorCode.LIFECYCLE_NOT_STARTED]: { type: 'abort' },
    [DashErrorCode.BUDGET_EXHAUSTED]: { type: 'escalate', toModel: 'cheaper-model' },
    [DashErrorCode.AGENT_NOT_FOUND]: { type: 'abort' },
    [DashErrorCode.SWARM_NOT_FOUND]: { type: 'abort' },
    [DashErrorCode.CONTEXT_NOT_FOUND]: { type: 'fallback', fallbackValue: { files: [] } },
    [DashErrorCode.INVALID_FILE_PATH]: { type: 'skip' },
    [DashErrorCode.FILE_NOT_FOUND_IN_CONTEXT]: { type: 'skip' },
    [DashErrorCode.CYCLIC_DEPENDENCY]: { type: 'abort' },
};
/**
 * Get recovery strategy for an error code
 */
function getRecoveryStrategy(errorCode) {
    return exports.ErrorRecoveryStrategies[errorCode];
}
/**
 * Execute error recovery strategy
 */
async function executeRecovery(errorCode, operation, attempt = 1) {
    const strategy = getRecoveryStrategy(errorCode);
    if (!strategy) {
        return null;
    }
    switch (strategy.type) {
        case 'retry':
            if (attempt <= strategy.maxAttempts) {
                await sleep(strategy.delayMs * attempt); // Exponential backoff
                return await operation();
            }
            return null;
        case 'fallback':
            return strategy.fallbackValue;
        case 'skip':
            return null;
        case 'abort':
        case 'escalate':
        default:
            return null;
    }
}
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
/**
 * Wrap a function with error handling and recovery
 */
function withErrorHandling(fn, options = {}) {
    return async (...args) => {
        try {
            return await fn(...args);
        }
        catch (error) {
            // Log error
            if (options.onError) {
                options.onError(error);
            }
            // Try recovery if enabled
            if (options.recovery && options.errorCode) {
                const recovered = await executeRecovery(options.errorCode, () => fn(...args));
                if (recovered !== null) {
                    return recovered;
                }
            }
            // Re-throw - context is read-only, cannot modify
            throw error;
        }
    };
}
/**
 * Safe execution wrapper that never throws
 */
async function safeExecute(fn, fallback, options = {}) {
    try {
        return await Promise.resolve(fn());
    }
    catch (error) {
        if (options.logError !== false) {
            console.error(`[${options.context || 'safeExecute'}] Error:`, error);
        }
        return fallback;
    }
}
// =============================================================================
// ASSERTION UTILITIES
// =============================================================================
// Import classes for internal use
const custom_3 = require("./custom");
/**
 * Assert that a condition is true, throw ValidationError otherwise
 */
function assert(condition, message, context) {
    if (!condition) {
        throw new custom_3.ValidationError(message, context);
    }
}
/**
 * Assert that a value exists (not null/undefined), throw NotFoundError otherwise
 */
function assertExists(value, resource, id, context) {
    if (value === null || value === undefined) {
        throw new custom_3.NotFoundError(resource, id, context);
    }
    return value;
}
/**
 * Assert that a value is not null/undefined
 */
function assertNotNull(value, message) {
    if (value === null || value === undefined) {
        throw new custom_3.ValidationError(message);
    }
    return value;
}
// =============================================================================
// LEGACY ERROR MIGRATION HELPERS
// =============================================================================
/**
 * Convert legacy Error to ApplicationError
 */
function upgradeError(error, defaultCode = DashErrorCode.INTERNAL_ERROR) {
    if (error instanceof custom_3.ApplicationError) {
        return error;
    }
    if (error instanceof Error) {
        return new custom_3.ApplicationError(error.message, defaultCode, 500, { originalError: error.message, stack: error.stack }, false);
    }
    return new custom_3.ApplicationError(String(error), defaultCode, 500, { originalError: error }, false);
}
/**
 * Create error from error code
 */
function createDashError(code, message, context) {
    const numericCode = parseInt(code.slice(1), 10);
    // Determine HTTP status code based on error category
    let statusCode = 500;
    if (numericCode >= 400 && numericCode < 500)
        statusCode = 400;
    else if (numericCode >= 500 && numericCode < 600)
        statusCode = 502;
    else if (numericCode >= 600 && numericCode < 700)
        statusCode = 429;
    else if (numericCode >= 800 && numericCode < 900)
        statusCode = 500;
    return new custom_3.ApplicationError(message, code, statusCode, context, true);
}
//# sourceMappingURL=index.js.map