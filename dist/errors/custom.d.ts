export interface ErrorContext {
    [key: string]: unknown;
}
export declare class ApplicationError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly context?: ErrorContext;
    readonly isOperational: boolean;
    readonly timestamp: Date;
    constructor(message: string, code: string, statusCode?: number, context?: ErrorContext, isOperational?: boolean);
    toJSON(): {
        context: ErrorContext;
        error: string;
        message: string;
        statusCode: number;
    };
    toCLI(): string;
    toLogEntry(): Record<string, unknown>;
}
export declare class ValidationError extends ApplicationError {
    constructor(message: string, context?: ErrorContext);
}
export declare class SchemaValidationError extends ApplicationError {
    readonly issues: Array<{
        path: string;
        message: string;
    }>;
    constructor(message: string, issues: Array<{
        path: string;
        message: string;
    }>, context?: ErrorContext);
    toJSON(): {
        issues: {
            path: string;
            message: string;
        }[];
        context: ErrorContext;
        error: string;
        message: string;
        statusCode: number;
    };
}
export declare class NotFoundError extends ApplicationError {
    readonly resource: string;
    readonly id: string;
    constructor(resource: string, id: string, context?: ErrorContext);
}
export declare class AgentNotFoundError extends NotFoundError {
    constructor(agentId: string, context?: ErrorContext);
}
export declare class SwarmNotFoundError extends NotFoundError {
    constructor(swarmId: string, context?: ErrorContext);
}
export declare class TaskNotFoundError extends NotFoundError {
    constructor(taskId: string, context?: ErrorContext);
}
export declare class AlreadyExistsError extends ApplicationError {
    readonly resource: string;
    readonly id: string;
    constructor(resource: string, id: string, context?: ErrorContext);
}
export declare class AuthenticationError extends ApplicationError {
    constructor(message?: string, context?: ErrorContext);
}
export declare class AuthorizationError extends ApplicationError {
    constructor(message?: string, context?: ErrorContext);
}
export declare class InvalidApiKeyError extends AuthenticationError {
    constructor(context?: ErrorContext);
}
export declare class AgentExecutionError extends ApplicationError {
    readonly agentId: string;
    constructor(agentId: string, message: string, context?: ErrorContext);
}
export declare class AgentTimeoutError extends ApplicationError {
    readonly agentId: string;
    readonly timeoutMs: number;
    constructor(agentId: string, timeoutMs: number, context?: ErrorContext);
}
export declare class SwarmExecutionError extends ApplicationError {
    readonly swarmId: string;
    constructor(swarmId: string, message: string, context?: ErrorContext);
}
export declare class RateLimitError extends ApplicationError {
    readonly limit: number;
    readonly windowMs: number;
    constructor(limit: number, windowMs: number, context?: ErrorContext);
    toJSON(): {
        retryAfter: number;
        context: ErrorContext;
        error: string;
        message: string;
        statusCode: number;
    };
}
export declare class BudgetExhaustedError extends ApplicationError {
    readonly scopeType: string;
    readonly scopeId: string;
    readonly currentUsage: number;
    readonly budgetLimit: number;
    constructor(scopeType: string, scopeId: string, currentUsage: number, budgetLimit: number, context?: ErrorContext);
}
export declare class TokenLimitError extends ApplicationError {
    readonly current: number;
    readonly limit: number;
    constructor(current: number, limit: number, context?: ErrorContext);
}
export declare class CostLimitError extends ApplicationError {
    readonly current: number;
    readonly limit: number;
    constructor(current: number, limit: number, context?: ErrorContext);
}
export declare class ExternalServiceError extends ApplicationError {
    readonly service: string;
    constructor(service: string, message: string, context?: ErrorContext);
}
export declare class LLMServiceError extends ExternalServiceError {
    readonly provider: string;
    constructor(provider: string, message: string, context?: ErrorContext);
}
export declare class DatabaseError extends ApplicationError {
    readonly operation?: string;
    constructor(message: string, operation?: string, context?: ErrorContext);
}
export declare class NetworkError extends ApplicationError {
    readonly endpoint?: string;
    constructor(message: string, endpoint?: string, context?: ErrorContext);
}
export declare class ConfigurationError extends ApplicationError {
    readonly configKey: string;
    constructor(configKey: string, message: string, context?: ErrorContext);
}
export declare class SystemError extends ApplicationError {
    constructor(message: string, context?: ErrorContext);
}
export declare class NotImplementedError extends ApplicationError {
    constructor(feature: string, context?: ErrorContext);
}
export declare class ConcurrencyConflictError extends ApplicationError {
    readonly resource: string;
    readonly id: string;
    constructor(resource: string, id: string, context?: ErrorContext);
}
export declare class LockTimeoutError extends ApplicationError {
    readonly resource: string;
    readonly timeoutMs: number;
    constructor(resource: string, timeoutMs: number, context?: ErrorContext);
}
export declare class SandboxError extends ApplicationError {
    readonly agentId: string;
    constructor(agentId: string, message: string, context?: ErrorContext);
}
export declare class QuotaExceededError extends ApplicationError {
    readonly agentId: string;
    readonly quotaType: 'fileSize' | 'totalSize' | 'fileCount';
    readonly current: number;
    readonly limit: number;
    constructor(agentId: string, quotaType: 'fileSize' | 'totalSize' | 'fileCount', current: number, limit: number, context?: ErrorContext);
}
export declare class PathTraversalError extends ApplicationError {
    readonly attemptedPath: string;
    constructor(attemptedPath: string, context?: ErrorContext);
}
export declare function isApplicationError(error: unknown): error is ApplicationError;
export declare function isOperationalError(error: unknown): boolean;
export declare function isNotFoundError(error: unknown): error is NotFoundError;
export declare function isValidationError(error: unknown): error is ValidationError;
export declare function isRateLimitError(error: unknown): error is RateLimitError;
export declare const ErrorCode: {
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly SCHEMA_VALIDATION_ERROR: "SCHEMA_VALIDATION_ERROR";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly ALREADY_EXISTS: "ALREADY_EXISTS";
    readonly AUTHENTICATION_ERROR: "AUTHENTICATION_ERROR";
    readonly AUTHORIZATION_ERROR: "AUTHORIZATION_ERROR";
    readonly INVALID_API_KEY: "INVALID_API_KEY";
    readonly AGENT_EXECUTION_FAILED: "AGENT_EXECUTION_FAILED";
    readonly AGENT_TIMEOUT: "AGENT_TIMEOUT";
    readonly SWARM_EXECUTION_FAILED: "SWARM_EXECUTION_FAILED";
    readonly RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED";
    readonly BUDGET_EXHAUSTED: "BUDGET_EXHAUSTED";
    readonly TOKEN_LIMIT_REACHED: "TOKEN_LIMIT_REACHED";
    readonly COST_LIMIT_REACHED: "COST_LIMIT_REACHED";
    readonly EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR";
    readonly LLM_SERVICE_ERROR: "LLM_SERVICE_ERROR";
    readonly DATABASE_ERROR: "DATABASE_ERROR";
    readonly NETWORK_ERROR: "NETWORK_ERROR";
    readonly CONFIGURATION_ERROR: "CONFIGURATION_ERROR";
    readonly SYSTEM_ERROR: "SYSTEM_ERROR";
    readonly NOT_IMPLEMENTED: "NOT_IMPLEMENTED";
    readonly CONCURRENCY_CONFLICT: "CONCURRENCY_CONFLICT";
    readonly LOCK_TIMEOUT: "LOCK_TIMEOUT";
    readonly SANDBOX_ERROR: "SANDBOX_ERROR";
    readonly QUOTA_EXCEEDED: "QUOTA_EXCEEDED";
    readonly PATH_TRAVERSAL: "PATH_TRAVERSAL";
};
export type ErrorCodeType = typeof ErrorCode[keyof typeof ErrorCode];
//# sourceMappingURL=custom.d.ts.map