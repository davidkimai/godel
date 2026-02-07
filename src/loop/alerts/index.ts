/**
 * Alerting System - Proactive monitoring with rules and anomaly detection
 * 
 * Provides:
 * - Threshold-based alert rules with multiple severity levels
 * - Statistical and seasonal anomaly detection
 * - Multiple notification channels (log, webhook, slack, pagerduty)
 * - Rate limiting and cooldown periods
 * 
 * @example
 * ```typescript
 * import { AlertManager, AlertRule } from './alerts';
 * 
 * const manager = new AlertManager(eventBus);
 * 
 * // Add a custom rule
 * manager.addRule({
 *   id: 'high-error-rate',
 *   name: 'High Error Rate',
 *   severity: 'critical',
 *   metric: 'error_rate',
 *   operator: '>',
 *   threshold: 0.1,
 *   for: 300,
 *   actions: [{ type: 'log', config: {} }],
 *   cooldown: 600
 * });
 * 
 * // Start monitoring
 * manager.start();
 * 
 * // Record metrics
 * await manager.recordMetric('error_rate', 0.05);
 * ```
 */

// Rules engine
export {
  AlertRuleEngine,
  InMemoryTimeSeriesStorage,
  type ComparisonOperator,
  type AlertSeverity,
  type AlertActionType,
  type AlertAction,
  type AlertRule,
  type AlertInstance,
  type TimeSeriesQuery
} from './rules.js';

// Anomaly detection
export {
  AnomalyDetectionService,
  StatisticalAnomalyDetector,
  SeasonalAnomalyDetector,
  ExponentialSmoothingDetector,
  MADAnomalyDetector,
  CompositeAnomalyDetector,
  type AnomalyResult,
  type AnomalyDetector,
  type SeasonalityType
} from './anomaly-detection.js';

// Storage
export {
  InMemoryTimeSeriesStorage as InMemoryStorage,
  MetricsRegistryAdapter,
  type TimeSeriesPoint,
  type TimeSeriesQuery as StorageQuery,
  type TimeSeriesStorage
} from './storage.js';

// Manager
export {
  AlertManager,
  type AlertManagerOptions,
  type AlertStats
} from './manager.js';
