/**
 * Load Testing Framework - Main Entry Point
 * 
 * Godel Phase 7: Production Hardening
 * 
 * Provides comprehensive load testing capabilities:
 * - 100+ concurrent agent simulation
 * - Multiple test scenarios
 * - Detailed metrics collection
 * - Report generation
 */

export { LoadGenerator, BuiltInScenarios } from './loader';
export type { 
  LoadTestConfig, 
  LoadTestResult, 
  LoadMetrics, 
  LoadScenario 
} from './loader';

export { Scenarios } from './scenarios';
export { generateReport, compareResults } from './reports/generator';
export type { ReportOptions, ComparisonResult } from './reports/generator';

// Convenience exports for common use cases
export {
  runHealthCheckLoadTest,
  runBaselineTest,
  runStressTest,
  runSoakTest,
  runSpikeTest,
} from './scenarios/health-check';

export {
  runAgentCreationLoadTest,
  runBurstAgentCreation,
  runSustainedAgentCreation,
} from './scenarios/agent-creation';

export {
  runTaskExecutionLoadTest,
  runComputeTaskTest,
  runIOTaskTest,
  runMixedWorkloadTest,
  runBackpressureTest,
} from './scenarios/task-execution';
