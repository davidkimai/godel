/**
 * Performance Testing Suite for Godel
 * 
 * This module provides load testing and benchmarking capabilities for Godel.
 * 
 * Usage:
 *   import { runLoadTest, BenchmarkRunner, TestScenarios } from './tests/performance';
 *   
 *   // Run a single load test
 *   const result = await runLoadTest(TestScenarios.moderate20());
 *   
 *   // Run full benchmark suite
 *   const runner = new BenchmarkRunner();
 *   const results = await runner.run();
 */

// Load Test
export {
  LoadTestGenerator,
  LoadTestConfig,
  LoadTestResult,
  LatencyMetrics,
  ThroughputMetrics,
  MemoryMetrics,
  EventBusMetrics,
  TestScenarios,
  runLoadTest,
} from './load-test';

// Benchmark Runner
export {
  BenchmarkRunner,
  BenchmarkConfig,
  BenchmarkRun,
  BenchmarkScenarioResult,
  AggregatedMetrics,
  PerformanceThresholds,
} from './benchmark';

// Default export
export { LoadTestGenerator as default } from './load-test';
