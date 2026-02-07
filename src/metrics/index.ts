/**
 * Metrics Module for Godel
 * 
 * Exports Prometheus metrics, health checks, and performance tracking.
 */

export {
  PrometheusMetrics,
  getGlobalPrometheusMetrics,
  resetGlobalPrometheusMetrics,
  register,
} from './prometheus';

export {
  HealthCheckManager,
  createHealthRouter,
  getGlobalHealthManager,
  resetGlobalHealthManager,
} from './health';

export {
  PerformanceTracker,
  getPerformanceTracker,
  resetPerformanceTracker,
  timeAsync,
  timeSync,
  performanceMiddleware,
} from './performance';

export type {
  HealthStatus,
  HealthCheckResult,
  HealthReport,
  HealthCheckConfig,
  HealthCheckFunction,
} from './health';

export type {
  AgentMetricLabels,
  TeamMetricLabels,
  EventMetricLabels,
  ApiMetricLabels,
  ErrorMetricLabels,
} from './prometheus';

export type {
  LatencyMetrics,
  ThroughputMetrics,
  ResourceMetrics,
  DatabaseMetrics,
  CacheMetrics,
  PerformanceSnapshot,
  PerformanceAlert,
} from './performance';
