/**
 * PostgreSQL Storage Module
 * 
 * PostgreSQL persistence layer with connection pooling,
 * retry logic, and repository pattern.
 * 
 * Optimized for 50+ concurrent agents with:
 * - Extended timeouts for stability
 * - Connection health monitoring
 * - Advanced retry with exponential backoff
 */

// Core pool management
export { PostgresPool, getPool, resetPool } from './pool';
export type { PostgresPoolConfig } from './pool';

// Configuration
export { getPostgresConfig, getConnectionString, optimizedPoolConfig } from './config';
export type { PostgresConfig } from './config';

// Health monitoring
export { PoolHealthMonitor, createHealthMonitor } from './health';
export type { PoolHealth, PoolMetrics, HealthCheckResult } from './health';

// Retry logic
export { 
  withRetry, 
  tryWithRetry, 
  withRetryWrapper,
  isTransientError, 
  isPermanentError,
  calculateDelay,
  CircuitBreaker,
  defaultRetryOptions,
  TRANSIENT_ERROR_CODES,
} from './retry';
export type { RetryOptions, RetryContext, RetryResult } from './retry';
