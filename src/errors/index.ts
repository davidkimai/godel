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

// =============================================================================
// ERROR CLASSES - Re-export everything from custom
// =============================================================================

export {
  // Base class
  ApplicationError,
  type ErrorContext,
  
  // Domain errors (4xx)
  ValidationError,
  SchemaValidationError,
  NotFoundError,
  AgentNotFoundError,
  SwarmNotFoundError,
  TaskNotFoundError,
  AlreadyExistsError,
  
  // Auth errors (401/403)
  AuthenticationError,
  AuthorizationError,
  InvalidApiKeyError,
  
  // Execution errors (5xx)
  AgentExecutionError,
  AgentTimeoutError,
  SwarmExecutionError,
  
  // Resource limit errors (429)
  RateLimitError,
  BudgetExhaustedError,
  TokenLimitError,
  CostLimitError,
  
  // External service errors (502/503)
  ExternalServiceError,
  LLMServiceError,
  DatabaseError,
  NetworkError,
  
  // Configuration & system errors
  ConfigurationError,
  SystemError,
  NotImplementedError,
  
  // Concurrency errors
  ConcurrencyConflictError,
  LockTimeoutError,
  
  // Sandbox errors
  SandboxError,
  QuotaExceededError,
  PathTraversalError,
  
  // Error codes
  ErrorCode,
  type ErrorCodeType,
} from './custom';

// =============================================================================
// TYPE GUARDS
// =============================================================================

export {
  isApplicationError,
  isOperationalError,
  isNotFoundError,
  isValidationError,
  isRateLimitError,
} from './custom';

// =============================================================================
// ERROR HANDLERS
// =============================================================================

export {
  // Express handler
  errorHandler,
  type ErrorHandlerOptions,
  getErrorMetrics,
  resetErrorMetrics,
  
  // CLI handler
  handleCLIError,
  type CLIOptions,
  
  // Background job handler
  handleBackgroundError,
  type BackgroundJobContext,
  
  // Retry utilities
  withRetry,
  type RetryOptions,
  shouldReportError,
} from './handler';

// =============================================================================
// CIRCUIT BREAKER
// =============================================================================

export {
  createCircuitBreaker,
  type CircuitBreakerOptions,
} from './handler';

// =============================================================================
// DASH-SPECIFIC ERROR CODES (E-Codes)
// 
// Machine-readable error codes for programmatic handling.
// Format: E### where ### is a unique numeric identifier.
// =============================================================================

export enum DashErrorCode {
  // Lifecycle Errors (E1xx)
  LIFECYCLE_NOT_STARTED = 'E100',
  LIFECYCLE_ALREADY_STARTED = 'E101',
  INVALID_STATE_TRANSITION = 'E102',
  
  // Agent Errors (E2xx)
  AGENT_NOT_FOUND = 'E200',
  AGENT_ALREADY_EXISTS = 'E201',
  AGENT_SPAWN_FAILED = 'E202',
  AGENT_START_FAILED = 'E203',
  AGENT_PAUSE_FAILED = 'E204',
  AGENT_RESUME_FAILED = 'E205',
  AGENT_KILL_FAILED = 'E206',
  AGENT_COMPLETE_FAILED = 'E207',
  INVALID_AGENT_STATE = 'E208',
  
  // Swarm Errors (E3xx)
  SWARM_NOT_FOUND = 'E300',
  SWARM_ALREADY_EXISTS = 'E301',
  SWARM_CREATE_FAILED = 'E302',
  SWARM_DESTROY_FAILED = 'E303',
  SWARM_SCALE_FAILED = 'E304',
  INVALID_SWARM_STATE = 'E305',
  MAX_AGENTS_EXCEEDED = 'E306',
  
  // Context Errors (E4xx)
  CONTEXT_NOT_FOUND = 'E400',
  INVALID_FILE_PATH = 'E401',
  MAX_FILES_EXCEEDED = 'E402',
  FILE_NOT_FOUND_IN_CONTEXT = 'E403',
  CONTEXT_VALIDATION_FAILED = 'E404',
  
  // OpenClaw Errors (E5xx)
  SESSION_NOT_FOUND = 'E500',
  INVALID_SESSION_STATE = 'E501',
  OPENCLAW_NOT_INITIALIZED = 'E502',
  SESSION_SPAWN_FAILED = 'E503',
  SESSION_PAUSE_FAILED = 'E504',
  SESSION_RESUME_FAILED = 'E505',
  SESSION_KILL_FAILED = 'E506',
  
  // Budget Errors (E6xx)
  BUDGET_EXHAUSTED = 'E600',
  BUDGET_NOT_FOUND = 'E601',
  INVALID_BUDGET_CONFIG = 'E602',
  
  // Dependency Errors (E7xx)
  CYCLIC_DEPENDENCY = 'E700',
  DEPENDENCY_NOT_FOUND = 'E701',
  TOPOLOGICAL_SORT_FAILED = 'E702',
  
  // Configuration Errors (E8xx)
  CONFIG_NOT_FOUND = 'E800',
  INVALID_CONFIG_VALUE = 'E801',
  MISSING_REQUIRED_CONFIG = 'E802',
  
  // System Errors (E9xx)
  INITIALIZATION_FAILED = 'E900',
  INTERNAL_ERROR = 'E901',
  NOT_IMPLEMENTED = 'E902',
}

// =============================================================================
// ERROR RECOVERY STRATEGIES
// =============================================================================

/**
 * Recovery action types for error handling
 */
export type RecoveryAction = 
  | { type: 'retry'; delayMs: number; maxAttempts: number }
  | { type: 'fallback'; fallbackValue: unknown }
  | { type: 'escalate'; toModel: string }
  | { type: 'skip' }
  | { type: 'abort' };

/**
 * Error recovery configuration for different error codes
 */
export const ErrorRecoveryStrategies: Record<string, RecoveryAction> = {
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
export function getRecoveryStrategy(errorCode: string): RecoveryAction | undefined {
  return ErrorRecoveryStrategies[errorCode];
}

/**
 * Execute error recovery strategy
 */
export async function executeRecovery<T>(
  errorCode: string,
  operation: () => Promise<T>,
  attempt: number = 1
): Promise<T | null> {
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
      return strategy.fallbackValue as T;
      
    case 'skip':
      return null;
      
    case 'abort':
    case 'escalate':
    default:
      return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// =============================================================================
// ERROR WRAPPER
// =============================================================================

// Import types for internal use (after all exports to avoid conflicts)
import { logger } from '../utils/logger';
import type { ApplicationError, ValidationError, NotFoundError } from './custom';

/**
 * Wrap a function with error handling and recovery
 */
export function withErrorHandling<T, Args extends unknown[]>(
  fn: (...args: Args) => Promise<T>,
  options: {
    errorCode?: string;
    context?: Record<string, unknown>;
    onError?: (error: unknown) => void;
    recovery?: boolean;
  } = {}
): (...args: Args) => Promise<T> {
  return async (...args: Args): Promise<T> => {
    try {
      return await fn(...args);
    } catch (error) {
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
export async function safeExecute<T>(
  fn: () => T | Promise<T>,
  fallback: T,
  options: {
    logError?: boolean;
    context?: string;
  } = {}
): Promise<T> {
  try {
    return await Promise.resolve(fn());
  } catch (error) {
    if (options.logError !== false) {
      logger.error(`[${options.context || 'safeExecute'}] Error:`, error);
    }
    return fallback;
  }
}

// =============================================================================
// ASSERTION UTILITIES
// =============================================================================

// Import classes for internal use
import { 
  ApplicationError as AppError,
  ValidationError as ValError, 
  NotFoundError as NFError 
} from './custom';

/**
 * Assert that a condition is true, throw ValidationError otherwise
 */
export function assert(condition: unknown, message: string, context?: Record<string, unknown>): asserts condition {
  if (!condition) {
    throw new ValError(message, context);
  }
}

/**
 * Assert that a value exists (not null/undefined), throw NotFoundError otherwise
 */
export function assertExists<T>(
  value: T | null | undefined,
  resource: string,
  id: string,
  context?: Record<string, unknown>
): T {
  if (value === null || value === undefined) {
    throw new NFError(resource, id, context);
  }
  return value;
}

/**
 * Assert that a value is not null/undefined
 */
export function assertNotNull<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new ValError(message);
  }
  return value;
}

// =============================================================================
// LEGACY ERROR MIGRATION HELPERS
// =============================================================================

/**
 * Convert legacy Error to ApplicationError
 */
export function upgradeError(
  error: unknown,
  defaultCode: string = DashErrorCode.INTERNAL_ERROR
): AppError {
  if (error instanceof AppError) {
    return error;
  }
  
  if (error instanceof Error) {
    return new AppError(
      error.message,
      defaultCode,
      500,
      { originalError: error.message, stack: error.stack },
      false
    );
  }
  
  return new AppError(
    String(error),
    defaultCode,
    500,
    { originalError: error },
    false
  );
}

/**
 * Create error from error code
 */
export function createDashError(
  code: DashErrorCode,
  message: string,
  context?: Record<string, unknown>
): AppError {
  const numericCode = parseInt(code.slice(1), 10);
  
  // Determine HTTP status code based on error category
  let statusCode = 500;
  if (numericCode >= 400 && numericCode < 500) statusCode = 400;
  else if (numericCode >= 500 && numericCode < 600) statusCode = 502;
  else if (numericCode >= 600 && numericCode < 700) statusCode = 429;
  else if (numericCode >= 800 && numericCode < 900) statusCode = 500;
  
  return new AppError(message, code, statusCode, context, true);
}
