/**
 * Chaos Experiments Index
 * 
 * Export all chaos experiments for easy access.
 */

export { NetworkPartitionExperiment } from './network-partition';
export { PodFailureExperiment } from './pod-failure';
export { LatencyInjectionExperiment } from './latency-injection';
export { ResourceExhaustionExperiment } from './resource-exhaustion';

export type { NetworkPartitionConfig, NetworkPartitionResult } from './network-partition';
export type { PodFailureConfig, PodFailureResult } from './pod-failure';
export type { LatencyInjectionConfig, LatencyInjectionResult } from './latency-injection';
export type { ResourceExhaustionConfig, ResourceExhaustionResult, ResourceType } from './resource-exhaustion';

import { NetworkPartitionExperiment } from './network-partition';
import { PodFailureExperiment } from './pod-failure';
import { LatencyInjectionExperiment } from './latency-injection';
import { ResourceExhaustionExperiment } from './resource-exhaustion';

export const Experiments = {
  NetworkPartition: NetworkPartitionExperiment,
  PodFailure: PodFailureExperiment,
  LatencyInjection: LatencyInjectionExperiment,
  ResourceExhaustion: ResourceExhaustionExperiment,
};

export default Experiments;
