/**
 * Load Testing Framework - Index
 * 
 * Main exports for the load testing framework.
 */

// Core framework
export {
  LoadTestRunner,
  PredefinedTests,
  DEFAULT_CRITERIA,
  type LoadTest,
  type PassFailCriteria,
  type TestResult,
  type ScenarioResult,
  type AggregatedMetrics,
  type CheckResult,
  type Metric,
  type LoadTestRunnerOptions,
} from './framework';

// Metrics collection
export {
  MetricsRegistry,
  ResourceMonitor,
  ErrorTracker,
  LatencyDistributionTracker,
  Histogram,
  Counter,
  Gauge,
  globalRegistry,
  globalResourceMonitor,
  globalErrorTracker,
  PredefinedMetrics,
  type HistogramSnapshot,
  type CounterSnapshot,
  type GaugeSnapshot,
  type MetricSnapshot,
  type MetricLabels,
  type ResourceSnapshot,
  type ErrorRecord,
  type LatencyDistribution,
} from './metrics';

// Report generation
export {
  ReportGenerator,
  defaultGenerator,
  type ReportOptions,
  type ReportSummary,
} from './report';

// Scenarios
export { run10SessionTest, testConfig as testConfig10 } from './scenarios/10-sessions';
export { run25SessionTest, testConfig as testConfig25 } from './scenarios/25-sessions';
export { run50SessionTest, testConfig as testConfig50 } from './scenarios/50-sessions';

// Runner
export { runScale, runAllScales } from './run';
