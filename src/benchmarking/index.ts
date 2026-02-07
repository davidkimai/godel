/**
 * Benchmarking Module
 * 
 * Godel Phase 7: Production Hardening
 * 
 * Comprehensive benchmarking for:
 * - Performance measurement
 * - Throughput testing
 * - Resource monitoring
 * - Regression detection
 */

export { PerformanceBenchmark, benchmarkAgentCreation, benchmarkTaskExecution } from './performance';
export type { BenchmarkConfig, BenchmarkResult, BenchmarkFunction } from './performance';

export { measureThroughput, findMaxThroughput } from './throughput';
export type { ThroughputConfig, ThroughputResult } from './throughput';

export { ResourceMonitor, profileResources, detectMemoryLeak } from './resource-usage';
export type { ResourceSnapshot, ResourceMetrics } from './resource-usage';

// Convenience re-exports
export { default } from './performance';
