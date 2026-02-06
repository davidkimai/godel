/**
 * Federation Module Exports
 */

// Export all types except StorageAdapter (defined elsewhere)
export type {
  HealthStatus,
  ProbeResult,
  OpenClawInstance,
  OpenClawInstanceInput,
  RoutingStrategyType,
  FederationRegistryConfig,
  RoutingContext,
  InstanceSelection,
  RegionCapacity,
  FederationCapacityReport,
  HealthCheckResult,
  HealthCheckHistory,
  HealthMonitorEvents,
  BackpressureStatus,
  FederationRegistryEvents,
  NoAvailableInstanceError,
  FederationCapacityError,
  InstanceNotFoundError
} from './types';
export {
  DEFAULT_REGISTRY_CONFIG
} from './types';
export { FederationRegistry } from './registry';
export { FederationRouter } from './router';
export { HealthMonitor } from './health-monitor';
