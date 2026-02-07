/**
 * Observability Module for Godel
 * 
 * Unified observability stack providing:
 * - Health checks (/health, /health/ready, /health/live)
 * - Prometheus metrics collection
 * - OpenTelemetry distributed tracing
 * - Structured logging with log levels
 * 
 * This module serves as the single entry point for all observability concerns
 * in the Godel orchestration platform.
 * 
 * @example
 * ```typescript
 * import { 
 *   initializeObservability,
 *   createHealthRouter,
 *   getGlobalMetricsCollector,
 *   getGlobalTracer,
 * } from './observability';
 * 
 * // Initialize observability
 * initializeObservability({
 *   serviceName: 'godel-orchestrator',
 *   version: '2.0.0',
 * });
 * 
 * // Use health router in Express app
 * app.use(createHealthRouter({ version: '2.0.0' }));
 * 
 * // Record metrics
 * const metrics = getGlobalMetricsCollector();
 * metrics.recordHttpRequest('GET', '/api/teams', 200, 45);
 * 
 * // Create spans
 * const result = await withSpan('process-task', async (span) => {
 *   return await processTask();
 * });
 * ```
 */

// ============================================================================
// Health Checks
// ============================================================================

export {
  // Classes
  HealthCheckManager,
  
  // Functions
  createHealthRouter,
  getGlobalHealthManager,
  resetGlobalHealthManager,
} from './health-checks';

export type {
  // Types
  HealthStatus,
  HealthCheckResult,
  HealthReport,
  HealthCheckConfig,
  HealthCheckFunction,
} from './health-checks';

// ============================================================================
// Metrics
// ============================================================================

export {
  // Classes
  MetricsCollector,
  
  // Functions
  getGlobalMetricsCollector,
  resetGlobalMetricsCollector,
  register,
} from './metrics';

export type {
  // Types
  AgentMetricLabels,
  TeamMetricLabels,
  TaskMetricLabels,
  ApiMetricLabels,
  ErrorMetricLabels,
} from './metrics';

// ============================================================================
// Tracing
// ============================================================================

export {
  // Initialization
  initializeTracing,
  shutdownTracing,
  isTracingInitialized,
  getTracingConfig,
  
  // Tracer
  getTracer,
  
  // Span creation
  createSpan,
  withSpan,
  withSpanSync,
  
  // Context propagation
  extractContext,
  injectContext,
  getCurrentTraceId,
  getCurrentSpanId,
  serializeContext,
  deserializeContext,
  
  // Baggage
  setBaggage,
  getBaggage,
  createContextWithBaggage,
  
  // Lifecycle hooks
  hookTeamLifecycle,
  hookTaskExecution,
  
  // Re-exports from @opentelemetry/api
  trace,
  context,
  SpanStatusCode,
  SpanKind,
} from './tracing';

export type {
  TracingConfig,
  SpanOptions,
  EventContext,
  Span,
  Context as OtelContext,
  Tracer,
} from './tracing';

// ============================================================================
// Logger
// ============================================================================

export { logger } from '../integrations/utils/logger';

// ============================================================================
// Unified Initialization
// ============================================================================

import { logger } from '../integrations/utils/logger';
import { initializeTracing, shutdownTracing, type TracingConfig } from './tracing';
import { getGlobalMetricsCollector } from './metrics';

export interface ObservabilityConfig {
  /** Service name for identification */
  serviceName: string;
  /** Service version */
  version: string;
  /** Deployment environment */
  environment?: string;
  /** Enable debug mode */
  debug?: boolean;
  /** Tracing sampling ratio (0.0 - 1.0) */
  samplingRatio?: number;
}

/**
 * Initialize the complete observability stack
 * 
 * This function initializes all observability components:
 * - Tracing (OpenTelemetry with Jaeger)
 * - Metrics (Prometheus)
 * - Logging (structured logging)
 * 
 * @param config - Observability configuration
 * 
 * @example
 * ```typescript
 * initializeObservability({
 *   serviceName: 'godel-api',
 *   version: '2.0.0',
 *   environment: 'production',
 *   samplingRatio: 0.1,
 * });
 * ```
 */
export function initializeObservability(config: ObservabilityConfig): void {
  logger.info(`[Observability] Initializing observability stack for ${config.serviceName} v${config.version}`);

  // Initialize tracing
  const tracingConfig: Partial<TracingConfig> = {
    serviceName: config.serviceName,
    serviceVersion: config.version,
    environment: config.environment || 'development',
    debug: config.debug || false,
    samplingRatio: config.samplingRatio || 0.01,
  };
  
  initializeTracing(tracingConfig);

  // Initialize metrics collector (singleton)
  getGlobalMetricsCollector();

  logger.info('[Observability] Observability stack initialized successfully');
}

/**
 * Shutdown observability gracefully
 * 
 * Should be called during application shutdown to ensure all data is exported.
 */
export async function shutdownObservability(): Promise<void> {
  logger.info('[Observability] Shutting down observability stack');
  await shutdownTracing();
  logger.info('[Observability] Observability stack shutdown complete');
}

// ============================================================================
// Version
// ============================================================================

export const OBSERVABILITY_VERSION = '1.0.0';
