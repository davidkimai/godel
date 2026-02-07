/**
 * Core Reliability Module
 *
 * Provides reliability engineering foundations including circuit breakers,
 * retry logic, graceful shutdown, correlation context, and structured logging.
 *
 * @module core/reliability
 */

// Retry logic
export {
  RetryManager,
  withRetry,
  createRetryable,
  calculateBackoffDelay,
  RetryPolicies,
  type RetryOptions,
  type RetryStats,
  type RetryContext,
} from './retry';

// Correlation context
export {
  generateCorrelationId,
  generateSpanId,
  generateTraceId,
  createCorrelationContext,
  getCorrelationContext,
  getCorrelationId,
  getTraceId,
  runWithContext,
  runWithNewContext,
  runWithChildContext,
  correlationMiddleware,
  CorrelationContextManager,
  contextFromHeaders,
  contextToHeaders,
  type CorrelationContext,
} from './correlation-context';

// Graceful shutdown
export {
  GracefulShutdown,
  getGlobalShutdown,
  resetGlobalShutdown,
  type ShutdownHandler,
  type GracefulShutdownOptions,
  type ShutdownState,
} from './graceful-shutdown';

// Structured logging
export {
  createLogger,
  Logger,
  logger,
  createChildLogger,
  type LogLevel,
  type LogEntry,
  type LoggerOptions,
} from './logger';

// Re-export from recovery module for convenience
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerError,
  type CircuitState as CircuitBreakerState,
  type CircuitBreakerConfig,
  type CircuitBreakerStats,
} from '../../recovery/circuit-breaker';
