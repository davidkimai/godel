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
export { ApplicationError, type ErrorContext, ValidationError, SchemaValidationError, NotFoundError, AgentNotFoundError, SwarmNotFoundError, TaskNotFoundError, AlreadyExistsError, AuthenticationError, AuthorizationError, InvalidApiKeyError, AgentExecutionError, AgentTimeoutError, SwarmExecutionError, RateLimitError, BudgetExhaustedError, TokenLimitError, CostLimitError, ExternalServiceError, LLMServiceError, DatabaseError, NetworkError, ConfigurationError, SystemError, NotImplementedError, ConcurrencyConflictError, LockTimeoutError, SandboxError, QuotaExceededError, PathTraversalError, ErrorCode, type ErrorCodeType, } from './custom';
export { isApplicationError, isOperationalError, isNotFoundError, isValidationError, isRateLimitError, } from './custom';
export { errorHandler, type ErrorHandlerOptions, getErrorMetrics, resetErrorMetrics, handleCLIError, type CLIOptions, handleBackgroundError, type BackgroundJobContext, withRetry, type RetryOptions, shouldReportError, } from './handler';
export { createCircuitBreaker, type CircuitBreakerOptions, } from './handler';
export declare enum DashErrorCode {
    LIFECYCLE_NOT_STARTED = "E100",
    LIFECYCLE_ALREADY_STARTED = "E101",
    INVALID_STATE_TRANSITION = "E102",
    AGENT_NOT_FOUND = "E200",
    AGENT_ALREADY_EXISTS = "E201",
    AGENT_SPAWN_FAILED = "E202",
    AGENT_START_FAILED = "E203",
    AGENT_PAUSE_FAILED = "E204",
    AGENT_RESUME_FAILED = "E205",
    AGENT_KILL_FAILED = "E206",
    AGENT_COMPLETE_FAILED = "E207",
    INVALID_AGENT_STATE = "E208",
    SWARM_NOT_FOUND = "E300",
    SWARM_ALREADY_EXISTS = "E301",
    SWARM_CREATE_FAILED = "E302",
    SWARM_DESTROY_FAILED = "E303",
    SWARM_SCALE_FAILED = "E304",
    INVALID_SWARM_STATE = "E305",
    MAX_AGENTS_EXCEEDED = "E306",
    CONTEXT_NOT_FOUND = "E400",
    INVALID_FILE_PATH = "E401",
    MAX_FILES_EXCEEDED = "E402",
    FILE_NOT_FOUND_IN_CONTEXT = "E403",
    CONTEXT_VALIDATION_FAILED = "E404",
    SESSION_NOT_FOUND = "E500",
    INVALID_SESSION_STATE = "E501",
    OPENCLAW_NOT_INITIALIZED = "E502",
    SESSION_SPAWN_FAILED = "E503",
    SESSION_PAUSE_FAILED = "E504",
    SESSION_RESUME_FAILED = "E505",
    SESSION_KILL_FAILED = "E506",
    BUDGET_EXHAUSTED = "E600",
    BUDGET_NOT_FOUND = "E601",
    INVALID_BUDGET_CONFIG = "E602",
    CYCLIC_DEPENDENCY = "E700",
    DEPENDENCY_NOT_FOUND = "E701",
    TOPOLOGICAL_SORT_FAILED = "E702",
    CONFIG_NOT_FOUND = "E800",
    INVALID_CONFIG_VALUE = "E801",
    MISSING_REQUIRED_CONFIG = "E802",
    INITIALIZATION_FAILED = "E900",
    INTERNAL_ERROR = "E901",
    NOT_IMPLEMENTED = "E902"
}
/**
 * Recovery action types for error handling
 */
export type RecoveryAction = {
    type: 'retry';
    delayMs: number;
    maxAttempts: number;
} | {
    type: 'fallback';
    fallbackValue: unknown;
} | {
    type: 'escalate';
    toModel: string;
} | {
    type: 'skip';
} | {
    type: 'abort';
};
/**
 * Error recovery configuration for different error codes
 */
export declare const ErrorRecoveryStrategies: Record<string, RecoveryAction>;
/**
 * Get recovery strategy for an error code
 */
export declare function getRecoveryStrategy(errorCode: string): RecoveryAction | undefined;
/**
 * Execute error recovery strategy
 */
export declare function executeRecovery<T>(errorCode: string, operation: () => Promise<T>, attempt?: number): Promise<T | null>;
/**
 * Wrap a function with error handling and recovery
 */
export declare function withErrorHandling<T, Args extends unknown[]>(fn: (...args: Args) => Promise<T>, options?: {
    errorCode?: string;
    context?: Record<string, unknown>;
    onError?: (error: unknown) => void;
    recovery?: boolean;
}): (...args: Args) => Promise<T>;
/**
 * Safe execution wrapper that never throws
 */
export declare function safeExecute<T>(fn: () => T | Promise<T>, fallback: T, options?: {
    logError?: boolean;
    context?: string;
}): Promise<T>;
import { ApplicationError as AppError } from './custom';
/**
 * Assert that a condition is true, throw ValidationError otherwise
 */
export declare function assert(condition: unknown, message: string, context?: Record<string, unknown>): asserts condition;
/**
 * Assert that a value exists (not null/undefined), throw NotFoundError otherwise
 */
export declare function assertExists<T>(value: T | null | undefined, resource: string, id: string, context?: Record<string, unknown>): T;
/**
 * Assert that a value is not null/undefined
 */
export declare function assertNotNull<T>(value: T | null | undefined, message: string): T;
/**
 * Convert legacy Error to ApplicationError
 */
export declare function upgradeError(error: unknown, defaultCode?: string): AppError;
/**
 * Create error from error code
 */
export declare function createDashError(code: DashErrorCode, message: string, context?: Record<string, unknown>): AppError;
//# sourceMappingURL=index.d.ts.map