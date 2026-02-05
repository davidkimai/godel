import { logger } from '../utils/logger';
/**
 * Dash Logging Module
 * 
 * Provides structured logging, log aggregation, and error pattern detection
 * for the Dash orchestration platform.
 * 
 * @example
 * ```typescript
 * import { getLogger, createAgentLogger, LogLevel } from './logging';
 * 
 * // Get global logger
 * const logger = getLogger({ level: LogLevel.INFO });
 * 
 * // Create agent-specific logger
 * const agentLogger = createAgentLogger('agent-123', 'swarm-456');
 * agentLogger.info('Agent started', { task: 'data-processing' });
 * 
 * // With context
 * await withContext({ traceId: 'trace-123' }, async (logger) => {
 *   logger.info('Processing task');
 *   // ... do work
 * });
 * ```
 */

export {
  // Main logger class
  StructuredLogger,
  
  // Log levels
  LogLevel,
  LogLevelNames,
  
  // Types
  type LogContext,
  type LogEntry,
  type LoggerConfig,
  type LoggerOptions,
  type RequestWithContext,
  
  // Logger factory functions
  getLogger,
  setGlobalLogger,
  createAgentLogger,
  createRequestLogger,
  createWorkflowLogger,
  withContext,
  
  // Middleware
  requestLoggerMiddleware,
  
  // Error pattern detection
  ErrorPatternDetector,
  DEFAULT_ERROR_PATTERNS,
  type ErrorPattern,
  
  // Metrics
  LogMetricsCollector,
  type LogMetrics
} from './structured';

// Default export for convenience
export { getLogger as default } from './structured';
