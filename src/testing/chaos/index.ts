/**
 * Chaos Engineering Module
 * 
 * Godel Phase 7: Production Hardening
 * 
 * Provides chaos engineering capabilities for testing
 * system resilience under failure conditions.
 */

export { ChaosRunner, createDefaultContext, runGameDay } from './runner';
export type {
  ChaosExperiment,
  ChaosResult,
  ChaosContext,
  HealthStatus,
  ConsistencyStatus,
  SafetyConfig,
  ExperimentSchedule,
  ScheduledExperiment,
  ChaosEngineeringReport,
} from './runner';

export {
  NetworkPartitionExperiment,
  PodFailureExperiment,
  LatencyInjectionExperiment,
  ResourceExhaustionExperiment,
} from './experiments';

export type {
  NetworkPartitionConfig,
  NetworkPartitionResult,
  PodFailureConfig,
  PodFailureResult,
  LatencyInjectionConfig,
  LatencyInjectionResult,
  ResourceExhaustionConfig,
  ResourceExhaustionResult,
  ResourceType,
} from './experiments';

// Convenience functions for common experiments
export {
  partitionServices,
  degradeNetwork,
} from './experiments/network-partition';

export {
  terminatePods,
  cascadingFailure,
} from './experiments/pod-failure';

export {
  injectLatency,
  latencyRampUp,
} from './experiments/latency-injection';

export {
  exhaustCPU,
  exhaustMemory,
} from './experiments/resource-exhaustion';
