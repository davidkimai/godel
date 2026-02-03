/**
 * Metrics Module for Dash
 * 
 * Exports Prometheus metrics and health check functionality.
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

export type {
  HealthStatus,
  HealthCheckResult,
  HealthReport,
  HealthCheckConfig,
  HealthCheckFunction,
} from './health';

export type {
  AgentMetricLabels,
  SwarmMetricLabels,
  EventMetricLabels,
  ApiMetricLabels,
  ErrorMetricLabels,
} from './prometheus';
