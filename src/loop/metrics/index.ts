/**
 * Metrics Module - Comprehensive metrics collection and storage
 * 
 * Provides:
 * - Counter, Gauge, Histogram metric types
 * - MetricsRegistry for organizing metrics
 * - TimeSeriesStorage for persistence
 * - SystemMetricsCollector for automatic collection
 * - Prometheus-compatible export
 * 
 * @example
 * ```typescript
 * import { MetricsRegistry, InMemoryTimeSeriesStorage, SystemMetricsCollector } from './metrics';
 * 
 * // Create registry and storage
 * const registry = new MetricsRegistry();
 * const storage = new InMemoryTimeSeriesStorage();
 * 
 * // Register metrics
 * registry.register({
 *   name: 'requests_total',
 *   type: 'counter',
 *   description: 'Total requests'
 * });
 * 
 * // Use metrics
 * registry.counter('requests_total').inc();
 * 
 * // Export to Prometheus
 * console.log(registry.toPrometheus());
 * ```
 */

// Core types
export {
  MetricType,
  MetricDefinition,
  MetricValue,
  Counter,
  Gauge,
  Histogram,
  Summary
} from './types.js';

// Registry
export {
  MetricsRegistry,
  MetricSnapshot,
  defaultRegistry,
  register,
  counter,
  gauge,
  histogram,
  summary,
  collect,
  toPrometheus
} from './registry.js';

// Storage
export {
  TimeSeriesStorage,
  QueryOptions,
  TimeSeriesPoint,
  AggregateOptions,
  AggregateResult,
  Database,
  PostgresTimeSeriesStorage,
  InMemoryTimeSeriesStorage,
  CREATE_METRICS_TABLE,
  CREATE_CONTINUOUS_AGGREGATES
} from './storage.js';

// System collector
export {
  SystemMetricsCollector,
  SystemMetricsCollectorOptions,
  EventBus,
  SystemEvent,
  AgentRegistry,
  TaskQueue,
  timer,
  timed,
  timedSync
} from './system-collector.js';
